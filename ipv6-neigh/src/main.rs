use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr as StdSocketAddr};
use std::time::Instant;

use futures::stream::StreamExt;
use futures::stream::TryStreamExt;
use log::{debug, error, info};
use netlink_packet_core::NetlinkPayload;
use netlink_packet_route::RouteNetlinkMessage;
use netlink_packet_route::neighbour::NeighbourMessage;
use netlink_packet_route::neighbour::{NeighbourAddress, NeighbourAttribute, NeighbourState};
use netlink_packet_route::route::RouteType;
use rtnetlink::{Error, Handle, new_connection};
use socket2::{Domain, Protocol, SockAddr, Socket, Type};
use tokio::time::{self, Duration};

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
    /// Log level (error, warn, info, debug, trace)
    #[clap(short = 'l', long, default_value = "info")]
    log_level: String,
    /// Probe interval in seconds for active reachability checks (0 to disable)
    #[clap(long, default_value = "120")]
    probe_interval: u64,
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

async fn process_new_neigh(neigh: &Neigh, updater: &db::DnsUpdater, leases: &HashMap<String, String>) -> bool {
    let Some(hostname) = leases.get(&neigh.mac) else {
        debug!("no lease for mac {}, skipping DNS update", neigh.mac);
        return true;
    };
    let result = match &neigh.inet {
        NeighbourAddress::Inet6(addr) => updater.upsert_aaaa(hostname, *addr, DEFAULT_TTL).await,
        NeighbourAddress::Inet(addr) => updater.upsert_a(hostname, *addr, DEFAULT_TTL).await,
        _ => return true,
    };
    match result {
        Ok(()) => {
            info!("DNS update: added {} -> {:?}", hostname, neigh.inet);
            true
        }
        Err(e) => {
            error!("DNS update failed for {}: {}", hostname, e);
            false
        }
    }
}

async fn process_del_neigh(neigh: &Neigh, updater: &db::DnsUpdater, leases: &HashMap<String, String>) -> bool {
    let Some(hostname) = leases.get(&neigh.mac) else {
        return true;
    };
    let result = match &neigh.inet {
        NeighbourAddress::Inet6(addr) => updater.delete_aaaa(hostname, *addr).await,
        NeighbourAddress::Inet(addr) => updater.delete_a(hostname, *addr).await,
        _ => return true,
    };
    match result {
        Ok(()) => {
            info!("DNS update: removed {} -> {:?}", hostname, neigh.inet);
            true
        }
        Err(e) => {
            error!("DNS delete failed for {}: {}", hostname, e);
            false
        }
    }
}

fn should_skip_route_type(route_type: RouteType) -> bool {
    matches!(route_type, RouteType::Multicast | RouteType::Broadcast | RouteType::Local)
}

fn should_skip_neigh(neigh: &Neigh) -> bool {
    should_skip_route_type(neigh.kind)
}

/// Whether this NUD state indicates the neighbour is likely reachable (register in DNS).
fn is_reachable_state(state: NeighbourState) -> bool {
    matches!(state, NeighbourState::Reachable | NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe)
}

/// Whether this NUD state indicates the neighbour is definitely gone (remove from DNS).
fn is_failed_state(state: NeighbourState) -> bool {
    matches!(state, NeighbourState::Failed)
}

#[tokio::main]
async fn main() -> Result<(), ()> {
    let args = Cli::parse();

    env_logger::Builder::new()
        .filter_level(
            args.log_level
                .parse()
                .expect("invalid log level (use: error, warn, info, debug, trace)"),
        )
        .format_timestamp_secs()
        .init();

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

    // Load DHCP leases (mac -> hostname) from ubus
    let mut leases = op::get_lease().unwrap_or_default();
    info!("loaded {} DHCP leases", leases.len());

    // State cache: tracks (mac, ip_string) -> last confirmed time
    let mut registered: HashMap<(String, String), Instant> = HashMap::new();

    // Dump existing neighbours and register only reachable/stale ones
    debug!("dumping neighbours");
    if let Ok(neighbours) = dump_neighbours(handle.clone(), private_subnet).await {
        for neigh in &neighbours {
            debug!("{:?}", neigh);
            if should_skip_neigh(neigh) || !is_reachable_state(neigh.state) {
                continue;
            }
            let key = (neigh.mac.clone(), inet_to_string(&neigh.inet));
            if !registered.contains_key(&key) {
                if process_new_neigh(neigh, &updater, &leases).await {
                    registered.insert(key, Instant::now());
                }
            }
        }
    }

    let (mut conn, mut _handle, mut messages) =
        new_connection().map_err(|e| format!("{e}")).unwrap();

    let groups = nl_mgrp(RTNLGRP_NEIGH);

    let addr = SocketAddr::new(0, groups);
    conn.socket_mut()
        .socket_mut()
        .bind(&addr)
        .expect("Failed to bind");

    tokio::spawn(conn);

    // Start periodic probing task
    let probe_interval = args.probe_interval;
    let mut probe_timer = if probe_interval > 0 {
        time::interval(Duration::from_secs(probe_interval))
    } else {
        // Create a very long interval that effectively disables probing
        time::interval(Duration::from_secs(u64::MAX / 2))
    };
    probe_timer.tick().await; // consume the immediate first tick

    let mut event_count: u64 = 0;

    loop {
        tokio::select! {
            msg_opt = messages.next() => {
                let Some((message, _)) = msg_opt else {
                    break;
                };

                // Refresh leases periodically (every 50 events)
                event_count += 1;
                if event_count % 50 == 0 {
                    if let Ok(new_leases) = op::get_lease() {
                        leases = new_leases;
                        debug!("refreshed {} DHCP leases", leases.len());
                    }
                }

                let payload = message.payload;
                if let NetlinkPayload::InnerMessage(msg) = payload {
                    match msg {
                        RouteNetlinkMessage::NewNeighbour(new_neigh) => {
                            let Some(neigh) = parse_neighbour_message(new_neigh, private_subnet) else {
                                continue;
                            };
                            if should_skip_neigh(&neigh) {
                                continue;
                            }
                            let key = (neigh.mac.clone(), inet_to_string(&neigh.inet));

                            if is_failed_state(neigh.state) {
                                // Neighbour confirmed unreachable — remove DNS record
                                if registered.remove(&key).is_some() {
                                    debug!("Neighbour failed: {:?}", neigh);
                                    if !process_del_neigh(&neigh, &updater, &leases).await {
                                        // DNS delete failed, put back so we retry
                                        registered.insert(key, Instant::now());
                                    }
                                }
                            } else if is_reachable_state(neigh.state) {
                                if registered.contains_key(&key) {
                                    // Already registered, just update timestamp
                                    registered.insert(key, Instant::now());
                                } else {
                                    // New reachable neighbour — register in DNS
                                    debug!("New neighbour: {:?}", neigh);
                                    if process_new_neigh(&neigh, &updater, &leases).await {
                                        registered.insert(key, Instant::now());
                                    }
                                }
                            }
                        }
                        RouteNetlinkMessage::DelNeighbour(del_neigh) => {
                            let Some(neigh) = parse_neighbour_message(del_neigh, private_subnet) else {
                                continue;
                            };
                            if should_skip_neigh(&neigh) {
                                continue;
                            }
                            let key = (neigh.mac.clone(), inet_to_string(&neigh.inet));
                            if registered.remove(&key).is_none() {
                                // Was not registered, skip
                                continue;
                            }
                            debug!("Del neighbour: {:?}", neigh);
                            if !process_del_neigh(&neigh, &updater, &leases).await {
                                // DNS delete failed, put back so we retry delete next time
                                registered.insert(key, Instant::now());
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ = probe_timer.tick() => {
                if probe_interval == 0 {
                    continue;
                }
                probe_registered_neighbours(&registered).await;
            }
        }
    }
    Ok(())
}

/// Send ICMPv6 Echo Request / ICMPv4 Echo Request to all registered neighbours.
/// This forces the kernel NUD state machine to verify reachability, generating
/// NewNeighbour events with the resulting state (Reachable or Failed).
async fn probe_registered_neighbours(registered: &HashMap<(String, String), Instant>) {
    let now = Instant::now();
    for ((_, ip_str), last_confirmed) in registered.iter() {
        // Only probe entries not confirmed recently (older than 30s)
        if now.duration_since(*last_confirmed) < Duration::from_secs(30) {
            continue;
        }
        if let Ok(addr) = ip_str.parse::<Ipv6Addr>() {
            if let Err(e) = send_icmpv6_echo(addr) {
                debug!("probe failed for {}: {}", ip_str, e);
            }
        } else if let Ok(addr) = ip_str.parse::<Ipv4Addr>() {
            if let Err(e) = send_icmpv4_echo(addr) {
                debug!("probe failed for {}: {}", ip_str, e);
            }
        }
    }
}

fn send_icmpv6_echo(addr: Ipv6Addr) -> std::io::Result<()> {
    let socket = Socket::new(Domain::IPV6, Type::DGRAM, Some(Protocol::ICMPV6))?;
    socket.set_nonblocking(true)?;
    // ICMPv6 Echo Request: type=128, code=0, checksum=0 (kernel computes), id=0, seq=1
    let packet: [u8; 8] = [128, 0, 0, 0, 0, 0, 0, 1];
    let dest = SockAddr::from(std::net::SocketAddrV6::new(addr, 0, 0, 0));
    let _ = socket.send_to(&packet, &dest);
    Ok(())
}

fn send_icmpv4_echo(addr: Ipv4Addr) -> std::io::Result<()> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::ICMPV4))?;
    socket.set_nonblocking(true)?;
    // ICMPv4 Echo Request: type=8, code=0, checksum (simple for 8 bytes), id=0, seq=1
    // Checksum for [08,00,00,00,00,00,00,01]: ~(0x0800 + 0x0001) = 0xf7fe
    let packet: [u8; 8] = [8, 0, 0xf7, 0xfe, 0, 0, 0, 1];
    let dest = SockAddr::from(std::net::SocketAddrV4::new(addr, 0));
    let _ = socket.send_to(&packet, &dest);
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

fn inet_to_string(addr: &NeighbourAddress) -> String {
    match addr {
        NeighbourAddress::Inet(ip) => ip.to_string(),
        NeighbourAddress::Inet6(ip) => ip.to_string(),
        other => format!("{other:?}"),
    }
}

fn is_link_local_ipv6(addr: &NeighbourAddress) -> bool {
    matches!(addr, NeighbourAddress::Inet6(ip) if (ip.segments()[0] & 0xffc0) == 0xfe80)
}

fn parse_neighbour_message(neigh: NeighbourMessage, private_subnet: bool) -> Option<Neigh> {
    let state = neigh.header.state;
    // Filter out static and incomplete entries
    if matches!(state, NeighbourState::Permanent | NeighbourState::Noarp) {
        return None;
    }
    let addr: NeighbourAddress = neigh.attributes.iter().find_map(|attr| match attr {
        NeighbourAttribute::Destination(inet) => Some(inet.to_owned()),
        _ => None,
    })?;
    // Link-local IPv6 addresses are interface-scoped and useless in DNS
    if is_link_local_ipv6(&addr) {
        return None;
    }
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
    let mac_str = format_mac(mac);
    // Filter out empty or all-zero MACs (router own addresses, incomplete entries)
    if mac_str.is_empty() || mac_str == "00:00:00:00:00:00" {
        return None;
    }
    Some(Neigh {
        ifindex,
        state,
        kind,
        inet: addr,
        mac: mac_str,
    })
}

async fn dump_neighbours(handle: Handle, private_subnet: bool) -> Result<Vec<Neigh>, Error> {
    let mut neighbours = handle.neighbours().get().execute();
    let mut vec: Vec<Neigh> = Vec::new();
    while let Some(route) = neighbours.try_next().await? {
        if let Some(neigh) = parse_neighbour_message(route, private_subnet) {
            if !should_skip_neigh(&neigh) {
                vec.push(neigh);
            }
        }
    }
    Ok(vec)
}
