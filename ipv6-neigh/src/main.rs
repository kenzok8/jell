use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr as StdSocketAddr};

use futures::stream::StreamExt;
use futures::stream::TryStreamExt;
use netlink_packet_core::NetlinkPayload;
use netlink_packet_route::RouteNetlinkMessage;
use netlink_packet_route::neighbour::NeighbourMessage;
use netlink_packet_route::neighbour::{NeighbourAddress, NeighbourAttribute, NeighbourState};
use netlink_packet_route::route::RouteType;
use rtnetlink::{Error, Handle, new_connection};

use clap::Parser;
use hickory_proto::rr::Name;
use hickory_proto::rr::TSigner;
use hickory_proto::rr::rdata::tsig::TsigAlgorithm;
use netlink_sys::{AsyncSocket, SocketAddr};
mod db;
mod op;
const RTNLGRP_NEIGH: u32 = 3;

const DEFAULT_TTL: u32 = 60;

const fn nl_mgrp(group: u32) -> u32 {
    if group > 31 {
        panic!("use netlink_sys::Socket::add_membership() for this group");
    }
    if group == 0 { 0 } else { 1 << (group - 1) }
}

#[derive(Debug, Parser)]
#[clap()]
struct Cli {
    #[clap(short, long)]
    iface: Option<String>,
    #[clap(short, long)]
    private_subnet: bool,
    /// hickory-dns server address for DNS updates (e.g. "[::1]:5335")
    #[clap(short, long, default_value = "[::1]:5335")]
    dns_server: StdSocketAddr,
    /// DNS zone to update (e.g. "lan")
    #[clap(short, long, default_value = "lan")]
    zone: String,
    /// Path to TSIG key file (raw HMAC secret)
    #[clap(short, long, default_value = "/etc/hickory-dns/update.key")]
    key_file: std::path::PathBuf,
    /// TSIG key name
    #[clap(short = 'n', long, default_value = "update-key.")]
    key_name: String,
}

#[derive(Debug)]
struct Neigh {
    ifindex: u32,
    state: NeighbourState,
    kind: RouteType,
    inet: NeighbourAddress,
    mac: String,
}

fn if_ipv6_in_private_subnet(ip: &Ipv6Addr) -> bool {
    // Check if address is ULA (fc00::/7)
    let is_ula = (ip.segments()[0] & 0xfe00) == 0xfc00;

    // Check if address is link-local (fe80::/10)
    let is_link_local = (ip.segments()[0] & 0xffc0) == 0xfe80;

    is_ula || is_link_local
}

fn if_ipv4_in_private_subnet(ip: &Ipv4Addr) -> bool {
    // Check for private network ranges
    let octets = ip.octets();

    // 10.0.0.0/8
    if octets[0] == 10 {
        return true;
    }

    // 172.16.0.0/12
    if octets[0] == 172 && (octets[1] >= 16 && octets[1] <= 31) {
        return true;
    }

    // 192.168.0.0/16
    if octets[0] == 192 && octets[1] == 168 {
        return true;
    }

    // 127.0.0.0/8 (loopback)
    if octets[0] == 127 {
        return true;
    }

    false
}

async fn process_new_neigh(neigh: &Neigh, updater: &db::DnsUpdater, leases: &HashMap<String, String>) {
    let Some(hostname) = leases.get(&neigh.mac) else {
        eprintln!("no lease for mac {}, skipping DNS update", neigh.mac);
        return;
    };
    let result = match &neigh.inet {
        NeighbourAddress::Inet6(addr) => updater.upsert_aaaa(hostname, *addr, DEFAULT_TTL).await,
        NeighbourAddress::Inet(addr) => updater.upsert_a(hostname, *addr, DEFAULT_TTL).await,
        _ => return,
    };
    match result {
        Ok(()) => println!("DNS update: added {} -> {:?}", hostname, neigh.inet),
        Err(e) => eprintln!("DNS update failed for {}: {}", hostname, e),
    }
}

async fn process_del_neigh(neigh: &Neigh, updater: &db::DnsUpdater, leases: &HashMap<String, String>) {
    let Some(hostname) = leases.get(&neigh.mac) else {
        return;
    };
    let result = match &neigh.inet {
        NeighbourAddress::Inet6(addr) => updater.delete_aaaa(hostname, *addr).await,
        NeighbourAddress::Inet(addr) => updater.delete_a(hostname, *addr).await,
        _ => return,
    };
    match result {
        Ok(()) => println!("DNS update: removed {} -> {:?}", hostname, neigh.inet),
        Err(e) => eprintln!("DNS delete failed for {}: {}", hostname, e),
    }
}

fn is_multicast_or_broadcast_route_type(route_type: RouteType) -> bool {
    match route_type {
        RouteType::Multicast => true,
        RouteType::Broadcast => true,
        _ => false,
    }
}

fn is_multicast_or_broadcast(neigh: &Neigh) -> bool {
    return is_multicast_or_broadcast_route_type(neigh.kind);
}

#[tokio::main]
async fn main() -> Result<(), ()> {
    let args = Cli::parse();
    let private_subnet = args.private_subnet;
    let zone = Name::from_ascii(&args.zone).expect("invalid zone name");

    let key_data = std::fs::read(&args.key_file)
        .unwrap_or_else(|e| panic!("failed to read TSIG key file {:?}: {e}", args.key_file));
    let key_name = Name::from_ascii(&args.key_name).expect("invalid TSIG key name");
    let signer = TSigner::new(key_data, TsigAlgorithm::HmacSha256, key_name, 300)
        .expect("invalid TSIG key");

    let updater = db::DnsUpdater::new(args.dns_server, zone, signer);

    let (connection, handle, _) = new_connection().unwrap();
    tokio::spawn(connection);
    dump_addresses(handle.clone(), args.iface).await.unwrap();

    // Load DHCP leases (mac -> hostname) from ubus
    let mut leases = op::get_lease().unwrap_or_default();
    println!("loaded {} DHCP leases", leases.len());

    // Dump existing neighbours and register them
    println!("dumping neighbours");
    if let Ok(neighbours) = dump_neighbours(handle.clone(), private_subnet).await {
        for neigh in &neighbours {
            println!("{:?}", neigh);
            if !is_multicast_or_broadcast(neigh) {
                process_new_neigh(neigh, &updater, &leases).await;
            }
        }
    }
    println!();

    let (mut conn, mut _handle, mut messages) =
        new_connection().map_err(|e| format!("{e}")).unwrap();

    let groups = nl_mgrp(RTNLGRP_NEIGH);

    let addr = SocketAddr::new(0, groups);
    conn.socket_mut()
        .socket_mut()
        .bind(&addr)
        .expect("Failed to bind");

    tokio::spawn(conn);

    let mut event_count: u64 = 0;

    // Start receiving events through `messages` channel.
    while let Some((message, _)) = messages.next().await {
        // Refresh leases periodically (every 50 events)
        event_count += 1;
        if event_count % 50 == 0 {
            if let Ok(new_leases) = op::get_lease() {
                leases = new_leases;
                println!("refreshed {} DHCP leases", leases.len());
            }
        }

        let payload = message.payload;
        if let NetlinkPayload::InnerMessage(msg) = payload {
            match msg {
                RouteNetlinkMessage::NewNeighbour(new_neigh) => {
                    let Some(neigh) = parse_neighbour_message(new_neigh, private_subnet) else {
                        continue;
                    };
                    if is_multicast_or_broadcast(&neigh) {
                        continue;
                    }
                    println!("New neighbour: {:?}", neigh);
                    process_new_neigh(&neigh, &updater, &leases).await;
                }
                RouteNetlinkMessage::DelNeighbour(del_neigh) => {
                    let Some(neigh) = parse_neighbour_message(del_neigh, private_subnet) else {
                        continue;
                    };
                    if is_multicast_or_broadcast(&neigh) {
                        continue;
                    }
                    println!("Del neighbour: {:?}", neigh);
                    process_del_neigh(&neigh, &updater, &leases).await;
                }
                _ => {}
            }
        }
    }
    Ok(())
}

fn format_mac(mac: Vec<u8>) -> String {
    let mut mac_str = String::new();
    for byte in mac {
        mac_str.push_str(&format!("{:02x}:", byte));
    }
    mac_str.pop();
    mac_str
}

async fn dump_addresses(handle: Handle, link: Option<String>) -> Result<(), Error> {
    let mut request = handle.link().get();
    if let Some(link) = link {
        request = request.match_name(link);
    }

    let mut links = request.execute();
    if let Some(link) = links.try_next().await? {
        let mut addresses = handle
            .address()
            .get()
            .set_link_index_filter(link.header.index)
            .execute();
        while let Some(msg) = addresses.try_next().await? {
            println!("{msg:?}");
        }
        Ok(())
    } else {
        eprintln!("link not found");
        Ok(())
    }
}

fn parse_neighbour_message(neigh: NeighbourMessage, private_subnet: bool) -> Option<Neigh> {
    let state = neigh.header.state;
    if state == NeighbourState::Permanent {
        return None;
    }
    let addr: NeighbourAddress = neigh.attributes.iter().find_map(|attr| match attr {
        NeighbourAttribute::Destination(inet) => Some(inet.to_owned()),
        _ => None,
    })?;
    if private_subnet {
        match addr {
            NeighbourAddress::Inet(addr) => {
                if !if_ipv4_in_private_subnet(&addr) {
                    return None;
                }
            }
            NeighbourAddress::Inet6(addr) => {
                if !if_ipv6_in_private_subnet(&addr) {
                    return None;
                }
            }
            _ => {}
        }
    };
    let kind = neigh.header.kind;
    let ifindex = neigh.header.ifindex;
    let mac = neigh.attributes.iter().find_map(|attr| match attr {
        NeighbourAttribute::LinkLocalAddress(mac) => Some(mac.to_owned()),
        _ => None,
    })?;
    Some(Neigh {
        ifindex,
        state,
        kind,
        inet: addr,
        mac: format_mac(mac),
    })
}

async fn dump_neighbours(handle: Handle, private_subnet: bool) -> Result<Vec<Neigh>, Error> {
    let mut neighbours = handle.neighbours().get().execute();
    let mut vec: Vec<Neigh> = Vec::new();
    while let Some(route) = neighbours.try_next().await? {
        if let Some(neigh) = parse_neighbour_message(route, private_subnet) {
            if !is_multicast_or_broadcast(&neigh) {
                vec.push(neigh);
            }
        }
    }
    Ok(vec)
}
