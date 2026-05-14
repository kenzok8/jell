use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr as StdSocketAddr};
use std::time::Instant;

use futures::stream::StreamExt;
use futures::stream::TryStreamExt;
use log::{debug, error, info, warn};
use netlink_packet_core::NetlinkPayload;
use netlink_packet_route::RouteNetlinkMessage;
use netlink_packet_route::address::{AddressAttribute, AddressFlags, AddressHeaderFlags, AddressMessage};
use netlink_packet_route::neighbour::NeighbourMessage;
use netlink_packet_route::neighbour::{NeighbourAddress, NeighbourAttribute, NeighbourState};
use netlink_packet_route::route::RouteType;
use rtnetlink::{Error, Handle, new_connection};
use socket2::{Domain, Protocol, SockAddr, Socket, Type};
use std::num::NonZeroU32;
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
    /// Restrict IPv4 neighbours to private subnets only (10/8, 172.16/12, 192.168/16, 127/8)
    #[clap(long)]
    private_subnet_v4: bool,
    /// Also publish GUA (Global Unicast Address) AAAA records; by default only ULA (fc00::/7) is published
    #[clap(long)]
    publish_gua: bool,
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
    #[clap(long, default_value = "75")]
    probe_interval: u64,
    /// Network interface to read the router's own addresses from
    #[clap(long, default_value = "br-lan")]
    router_iface: String,
    /// Additional DNS name to register router addresses under (e.g. "router" → "router.lan")
    #[clap(long)]
    router_alias: Option<String>,
    /// Periodically probe the newest GUA per host to maintain NUD/Wi-Fi reachability (without publishing to DNS)
    #[clap(long)]
    keepalive_gua: bool,
    /// Probe interval in seconds for GUA keepalive (only used with --keepalive-gua)
    #[clap(long, default_value = "120")]
    keepalive_gua_interval: u64,
    /// Maximum number of GUA addresses to keepalive-probe per host
    #[clap(long, default_value = "1")]
    keepalive_gua_per_host: usize,
    /// Maximum number of ULA AAAA records to publish per host (oldest pruned first)
    #[clap(long, default_value = "2")]
    max_ula_per_host: usize,
}

#[derive(Debug)]
struct Neigh {
    ifindex: u32,
    state: NeighbourState,
    kind: RouteType,
    inet: NeighbourAddress,
    mac: String,
}

/// An IPv6 prefix (address + length) representing an active LAN prefix on the router interface.
struct LanPrefix {
    addr: Ipv6Addr,
    prefix_len: u8,
}

/// State tracked for each (mac, ip) pair that has been successfully registered in DNS.
struct RegisteredEntry {
    hostname: String,
    last_confirmed: Instant,
    ifindex: u32,
}

/// A GUA address tracked for keepalive probing only (not published to DNS).
struct GuaKeepaliveEntry {
    hostname: String,
    addr: Ipv6Addr,
    ifindex: u32,
    /// When this GUA was first observed — used to select the "newest" address per host.
    first_seen: Instant,
    /// Last time this address was confirmed REACHABLE by the kernel.
    last_confirmed: Instant,
}

fn if_ipv6_in_private_subnet(ip: &Ipv6Addr) -> bool {
    // Check if address is ULA (fc00::/7)
    // Note: link-local is always filtered earlier by is_link_local_ipv6()
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

/// Returns true if `addr` is a Global Unicast Address (2000::/3).
fn is_gua_ipv6(addr: &Ipv6Addr) -> bool {
    (addr.segments()[0] & 0xe000) == 0x2000
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

/// Returns true if `addr` falls within the given IPv6 prefix.
fn ipv6_in_prefix(addr: Ipv6Addr, prefix: &LanPrefix) -> bool {
    let mask: u128 = if prefix.prefix_len == 0 {
        0
    } else if prefix.prefix_len >= 128 {
        u128::MAX
    } else {
        !0u128 << (128 - prefix.prefix_len)
    };
    (u128::from(addr) & mask) == (u128::from(prefix.addr) & mask)
}

/// Returns true if `addr` is within any active LAN prefix, or if the prefix list is empty
/// (in which case prefix-based filtering is disabled).
fn ipv6_passes_active_prefix(addr: Ipv6Addr, active_prefixes: &[LanPrefix]) -> bool {
    active_prefixes.is_empty() || active_prefixes.iter().any(|p| ipv6_in_prefix(addr, p))
}

async fn process_new_neigh(neigh: &Neigh, updater: &db::DnsUpdater, leases: &HashMap<String, String>, private_subnet_v6: bool) -> bool {
    let Some(hostname) = leases.get(&neigh.mac) else {
        debug!("no lease for mac {}, skipping DNS update", neigh.mac);
        return false;
    };
    // Guard: never publish GUA to DNS when private_subnet_v6 is set.
    if let NeighbourAddress::Inet6(addr) = &neigh.inet {
        if private_subnet_v6 && is_gua_ipv6(addr) {
            debug!("skipping GUA DNS publish for {} (private_subnet_v6)", hostname);
            return false;
        }
    }
    let result = match &neigh.inet {
        NeighbourAddress::Inet6(addr) => updater.upsert_aaaa(hostname, *addr, DEFAULT_TTL).await,
        NeighbourAddress::Inet(addr) => updater.upsert_a(hostname, *addr, DEFAULT_TTL).await,
        _ => return false,
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

/// Delete a specific DNS record directly by hostname and address.
async fn do_delete_dns(hostname: &str, inet: &NeighbourAddress, updater: &db::DnsUpdater) -> bool {
    let result = match inet {
        NeighbourAddress::Inet6(addr) => updater.delete_aaaa(hostname, *addr).await,
        NeighbourAddress::Inet(addr) => updater.delete_a(hostname, *addr).await,
        _ => return true,
    };
    match result {
        Ok(()) => {
            info!("DNS update: removed {} -> {:?}", hostname, inet);
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

/// Whether this NUD state indicates the neighbour is definitely gone (remove from DNS).
fn is_failed_state(state: NeighbourState) -> bool {
    matches!(state, NeighbourState::Failed)
}

/// Enforce the per-host ULA AAAA limit.  If `mac` already has `max` or more ULA AAAA
/// records in `registered`, remove the oldest (by `last_confirmed`) and delete from DNS.
/// Returns the number of existing ULA AAAA records for this MAC (after pruning).
async fn prune_ula_for_mac(
    mac: &str,
    max: usize,
    registered: &mut HashMap<(String, String), RegisteredEntry>,
    updater: &db::DnsUpdater,
) -> usize {
    // Collect existing ULA AAAA keys for this MAC.
    let mut ula_keys: Vec<((String, String), Instant)> = registered
        .iter()
        .filter(|((m, ip_str), _)| {
            m == mac && ip_str.parse::<Ipv6Addr>().map_or(false, |a| if_ipv6_in_private_subnet(&a))
        })
        .map(|(k, e)| (k.clone(), e.last_confirmed))
        .collect();

    if ula_keys.len() < max {
        return ula_keys.len();
    }

    // Sort oldest first (by last_confirmed asc).
    ula_keys.sort_by_key(|(_, ts)| *ts);

    // Remove excess (keep the newest `max - 1` so there's room for the new one).
    let to_remove = ula_keys.len() - (max.saturating_sub(1));
    for (key, _) in ula_keys.into_iter().take(to_remove) {
        if let Some(entry) = registered.remove(&key) {
            let addr: Ipv6Addr = key.1.parse().unwrap();
            let inet = NeighbourAddress::Inet6(addr);
            do_delete_dns(&entry.hostname, &inet, updater).await;
            info!("ULA pruning: removed oldest {} -> {} for mac {}", entry.hostname, key.1, mac);
        }
    }

    // Return count after pruning.
    registered
        .iter()
        .filter(|((m, ip_str), _)| {
            m == mac && ip_str.parse::<Ipv6Addr>().map_or(false, |a| if_ipv6_in_private_subnet(&a))
        })
        .count()
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
        // Suppress spurious warnings from netlink_packet_route when the kernel
        // provides more NLA data than the crate version expects (newer kernel).
        .filter_module("netlink_packet_route", log::LevelFilter::Error)
        .format_timestamp_secs()
        .init();

    let private_subnet_v4 = args.private_subnet_v4;
    let private_subnet_v6 = !args.publish_gua;
    let keepalive_gua = args.keepalive_gua;
    let keepalive_gua_interval = args.keepalive_gua_interval;
    let keepalive_gua_per_host = args.keepalive_gua_per_host;
    let max_ula_per_host = args.max_ula_per_host;
    let zone = Name::from_ascii(&args.zone).expect("invalid zone name");

    let key_data = std::fs::read(&args.key_file)
        .unwrap_or_else(|e| panic!("failed to read TSIG key file {:?}: {e}", args.key_file));
    let key_name = Name::from_ascii(&args.key_name).expect("invalid TSIG key name");
    let signer = TSigner::new(key_data, TsigAlgorithm::HmacSha256, key_name, 300)
        .expect("invalid TSIG key");

    let updater = db::DnsUpdater::new(args.dns_server, zone, signer);

    // Wait for the DNS server to become available before sending any updates.
    wait_for_dns_server(args.dns_server).await;

    let (connection, handle, _) = new_connection().unwrap();
    tokio::spawn(connection);

    // Register router's own addresses in DNS
    let router_hostname = std::fs::read_to_string("/proc/sys/kernel/hostname")
        .unwrap_or_default()
        .trim()
        .to_owned();
    if router_hostname.is_empty() {
        warn!("could not read router hostname from /proc/sys/kernel/hostname");
    } else {
        let router_alias = args.router_alias.as_deref().filter(|a| *a != router_hostname);
        register_router_addresses(
            handle.clone(),
            &args.router_iface,
            &router_hostname,
            router_alias,
            &updater,
            private_subnet_v6,
        )
        .await;
    }

    // Load DHCP leases (mac -> hostname) from ubus
    let mut leases = op::get_lease().unwrap_or_default();
    info!("loaded {} DHCP leases", leases.len());

    // State cache: tracks (mac, ip_string) -> registered entry (hostname, last confirmed time, ifindex)
    let mut registered: HashMap<(String, String), RegisteredEntry> = HashMap::new();

    // GUA keepalive: tracks GUA addresses per MAC for periodic probing (not published to DNS).
    // Key = MAC address, value = list of GUA entries for that host.
    let mut gua_keepalive: HashMap<String, Vec<GuaKeepaliveEntry>> = HashMap::new();

    // Get active LAN prefixes to filter out neighbours from expired/old prefixes.
    // If prefix detection fails we log a warning but continue without filtering.
    // When keepalive_gua is enabled, also include GUA prefixes so we can filter
    // keepalive targets against active prefixes (pass private_subnet_v6=false).
    let prefix_filter_v6 = if keepalive_gua { false } else { private_subnet_v6 };
    let active_prefixes = get_active_lan_prefixes(handle.clone(), &args.router_iface, prefix_filter_v6).await;
    if active_prefixes.is_empty() {
        warn!("no active IPv6 prefixes found on {}, neighbour prefix-filtering disabled", args.router_iface);
    } else {
        info!(
            "active LAN IPv6 prefixes: {}",
            active_prefixes
                .iter()
                .map(|p| format!("{}/{}", p.addr, p.prefix_len))
                .collect::<Vec<_>>()
                .join(", ")
        );
    }

    // Dump existing neighbours:
    // - Skip entries whose IP is not within any active LAN prefix (old-prefix residuals).
    // - Route GUA addresses to keepalive map (if enabled) instead of DNS.
    // - Register REACHABLE entries immediately.
    // - Send a probe to STALE/DELAY/PROBE entries; the event loop will register them
    //   once the kernel confirms they are REACHABLE.
    // - Ignore FAILED and other states.
    debug!("dumping neighbours");
    if let Ok(neighbours) = dump_neighbours(handle.clone(), private_subnet_v4).await {
        for neigh in &neighbours {
            debug!("{:?}", neigh);
            if should_skip_neigh(neigh) {
                continue;
            }
            // Drop IPv6 neighbours that are not within any active LAN prefix.
            if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                if !active_prefixes.is_empty() && !active_prefixes.iter().any(|p| ipv6_in_prefix(*addr, p)) {
                    debug!("init dump: skipping {} — not in any active LAN prefix", addr);
                    continue;
                }
            }

            // Route GUA addresses to keepalive map instead of DNS.
            if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                if is_gua_ipv6(addr) {
                    if keepalive_gua {
                        if neigh.state == NeighbourState::Reachable {
                            if let Some(hostname) = leases.get(&neigh.mac) {
                                let entries = gua_keepalive.entry(neigh.mac.clone()).or_default();
                                if !entries.iter().any(|e| e.addr == *addr) {
                                    let now = Instant::now();
                                    entries.push(GuaKeepaliveEntry {
                                        hostname: hostname.clone(),
                                        addr: *addr,
                                        ifindex: neigh.ifindex,
                                        first_seen: now,
                                        last_confirmed: now,
                                    });
                                    debug!("init dump: GUA keepalive tracked {} -> {}", hostname, addr);
                                }
                            }
                        } else if matches!(neigh.state, NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe) {
                            // Probe stale GUA so the kernel NUD state machine can confirm
                            // reachability; the event loop will add it to gua_keepalive on REACHABLE.
                            match send_icmpv6_echo(*addr, neigh.ifindex) {
                                Ok(()) => debug!("init dump: probing stale GUA {}", addr),
                                Err(e) => debug!("init GUA probe failed for {}: {}", addr, e),
                            }
                        }
                    }
                    // GUA addresses are never published to DNS (unless --publish-gua)
                    if private_subnet_v6 {
                        continue;
                    }
                }
            }

            let key = (neigh.mac.clone(), inet_to_string(&neigh.inet));
            match neigh.state {
                NeighbourState::Reachable => {
                    // Confirmed online — register in DNS immediately.
                    if !registered.contains_key(&key) {
                        if let Some(hostname) = leases.get(&neigh.mac) {
                            // Enforce per-host ULA limit before adding a new one.
                            if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                                if if_ipv6_in_private_subnet(addr) {
                                    prune_ula_for_mac(&neigh.mac, max_ula_per_host, &mut registered, &updater).await;
                                }
                            }
                            let result = match &neigh.inet {
                                NeighbourAddress::Inet6(addr) => updater.upsert_aaaa(hostname, *addr, DEFAULT_TTL).await,
                                NeighbourAddress::Inet(addr) => updater.upsert_a(hostname, *addr, DEFAULT_TTL).await,
                                _ => Ok(()),
                            };
                            match result {
                                Ok(()) => {
                                    info!("DNS update: added {} -> {:?}", hostname, neigh.inet);
                                    registered.insert(key, RegisteredEntry {
                                        hostname: hostname.clone(),
                                        last_confirmed: Instant::now(),
                                        ifindex: neigh.ifindex,
                                    });
                                }
                                Err(e) => error!("DNS update failed for {}: {}", hostname, e),
                            }
                        } else {
                            debug!("no lease for mac {}, skipping DNS update", neigh.mac);
                        }
                    }
                }
                NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe => {
                    // Uncertain — probe to trigger NUD verification. If the device
                    // is online, the kernel will emit a REACHABLE NewNeighbour event
                    // which the event loop will pick up and register in DNS.
                    match &neigh.inet {
                        NeighbourAddress::Inet6(addr) => {
                            match send_icmpv6_echo(*addr, neigh.ifindex) {
                                Ok(()) => debug!("init dump: probing stale neighbour {}", addr),
                                Err(e) => debug!("init probe failed for {}: {}", addr, e),
                            }
                        }
                        NeighbourAddress::Inet(addr) => {
                            if let Err(e) = send_icmpv4_echo(*addr, neigh.ifindex) {
                                debug!("init probe failed for {}: {}", addr, e);
                            }
                        }
                        _ => {}
                    }
                }
                _ => {
                    // FAILED and others — skip.
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

    // GUA keepalive timer (separate cadence from DNS probe timer)
    let mut gua_keepalive_timer = if keepalive_gua && keepalive_gua_interval > 0 {
        time::interval(Duration::from_secs(keepalive_gua_interval))
    } else {
        time::interval(Duration::from_secs(u64::MAX / 2))
    };
    gua_keepalive_timer.tick().await; // consume the immediate first tick

    let mut lease_refresh_timer = time::interval(Duration::from_secs(60));
    lease_refresh_timer.tick().await; // consume the immediate first tick

    loop {
        tokio::select! {
            msg_opt = messages.next() => {
                let Some((message, _)) = msg_opt else {
                    break;
                };

                let payload = message.payload;
                if let NetlinkPayload::InnerMessage(msg) = payload {
                    match msg {
                        RouteNetlinkMessage::NewNeighbour(new_neigh) => {
                            let Some(neigh) = parse_neighbour_message(new_neigh, private_subnet_v4) else {
                                continue;
                            };
                            if should_skip_neigh(&neigh) {
                                continue;
                            }
                            // Drop IPv6 events for addresses not in any active LAN prefix.
                            if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                                if !ipv6_passes_active_prefix(*addr, &active_prefixes) {
                                    debug!("event: skipping {} — not in any active LAN prefix", addr);
                                    let key = (neigh.mac.clone(), inet_to_string(&neigh.inet));
                                    if let Some(entry) = registered.remove(&key) {
                                        do_delete_dns(&entry.hostname, &neigh.inet, &updater).await;
                                    }
                                    // Also remove from GUA keepalive if present
                                    if let Some(entries) = gua_keepalive.get_mut(&neigh.mac) {
                                        entries.retain(|e| e.addr != *addr);
                                    }
                                    continue;
                                }
                            }

                            // Route GUA addresses to keepalive map instead of DNS.
                            if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                                if is_gua_ipv6(addr) && private_subnet_v6 {
                                    // GUA not published to DNS — handle keepalive tracking only
                                    if keepalive_gua {
                                        if is_failed_state(neigh.state) {
                                            if let Some(entries) = gua_keepalive.get_mut(&neigh.mac) {
                                                entries.retain(|e| e.addr != *addr);
                                                debug!("GUA keepalive: removed failed {} for mac {}", addr, neigh.mac);
                                            }
                                        } else if neigh.state == NeighbourState::Reachable {
                                            if let Some(hostname) = leases.get(&neigh.mac) {
                                                let entries = gua_keepalive.entry(neigh.mac.clone()).or_default();
                                                if let Some(e) = entries.iter_mut().find(|e| e.addr == *addr) {
                                                    e.last_confirmed = Instant::now();
                                                    e.ifindex = neigh.ifindex;
                                                } else {
                                                    let now = Instant::now();
                                                    entries.push(GuaKeepaliveEntry {
                                                        hostname: hostname.clone(),
                                                        addr: *addr,
                                                        ifindex: neigh.ifindex,
                                                        first_seen: now,
                                                        last_confirmed: now,
                                                    });
                                                    debug!("GUA keepalive: tracking {} -> {}", hostname, addr);
                                                }
                                            }
                                        } else if matches!(neigh.state, NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe) {
                                            // Update ifindex only
                                            if let Some(entries) = gua_keepalive.get_mut(&neigh.mac) {
                                                if let Some(e) = entries.iter_mut().find(|e| e.addr == *addr) {
                                                    e.ifindex = neigh.ifindex;
                                                }
                                            }
                                        }
                                    }
                                    continue;
                                }
                            }

                            let key = (neigh.mac.clone(), inet_to_string(&neigh.inet));
                            if is_failed_state(neigh.state) {
                                // Neighbour confirmed unreachable — remove DNS record
                                if let Some(entry) = registered.remove(&key) {
                                    debug!("Neighbour failed: {:?}", neigh);
                                    if !do_delete_dns(&entry.hostname, &neigh.inet, &updater).await {
                                        // DNS delete failed, put back so we retry
                                        registered.insert(key, entry);
                                    }
                                }
                            } else if neigh.state == NeighbourState::Reachable {
                                if let Some(entry) = registered.get_mut(&key) {
                                    // Already registered, just update timestamp and ifindex
                                    entry.last_confirmed = Instant::now();
                                    entry.ifindex = neigh.ifindex;
                                } else {
                                    // New reachable neighbour — register in DNS
                                    debug!("New neighbour: {:?}", neigh);
                                    if let Some(hostname) = leases.get(&neigh.mac) {
                                        // Enforce per-host ULA limit before adding.
                                        if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                                            if if_ipv6_in_private_subnet(addr) {
                                                prune_ula_for_mac(&neigh.mac, max_ula_per_host, &mut registered, &updater).await;
                                            }
                                        }
                                        if process_new_neigh(&neigh, &updater, &leases, private_subnet_v6).await {
                                            registered.insert(key, RegisteredEntry {
                                                hostname: hostname.clone(),
                                                last_confirmed: Instant::now(),
                                                ifindex: neigh.ifindex,
                                            });
                                        }
                                    } else {
                                        debug!("no lease for mac {}, skipping DNS update", neigh.mac);
                                    }
                                }
                            } else if matches!(neigh.state, NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe) {
                                // Uncertain state: update ifindex only so the next probe uses
                                // the right interface, but do NOT refresh last_confirmed —
                                // STALE/DELAY/PROBE is not confirmed reachable and refreshing
                                // the timestamp would suppress the periodic probe.
                                if let Some(entry) = registered.get_mut(&key) {
                                    entry.ifindex = neigh.ifindex;
                                }
                            }
                        }
                        RouteNetlinkMessage::DelNeighbour(del_neigh) => {
                            let Some(neigh) = parse_neighbour_message(del_neigh, private_subnet_v4) else {
                                continue;
                            };
                            if should_skip_neigh(&neigh) {
                                continue;
                            }
                            // Remove from GUA keepalive if applicable
                            if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                                if is_gua_ipv6(addr) && keepalive_gua {
                                    if let Some(entries) = gua_keepalive.get_mut(&neigh.mac) {
                                        entries.retain(|e| e.addr != *addr);
                                        debug!("GUA keepalive: removed deleted {} for mac {}", addr, neigh.mac);
                                    }
                                    if private_subnet_v6 {
                                        continue;
                                    }
                                }
                            }
                            let key = (neigh.mac.clone(), inet_to_string(&neigh.inet));
                            let stored_hostname = registered.remove(&key).map(|e| e.hostname);
                            debug!("Del neighbour: {:?}", neigh);
                            // Use stored hostname if available, fall back to leases for records
                            // that survived a program restart (not in registered).
                            let hostname_opt = stored_hostname
                                .or_else(|| leases.get(&neigh.mac).cloned());
                            if let Some(ref hostname) = hostname_opt {
                                do_delete_dns(hostname, &neigh.inet, &updater).await;
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
                reconcile_dns(
                    &updater,
                    &mut registered,
                    &leases,
                    &active_prefixes,
                    private_subnet_v4,
                    private_subnet_v6,
                )
                .await;
            }
            _ = gua_keepalive_timer.tick() => {
                if !keepalive_gua || keepalive_gua_interval == 0 {
                    continue;
                }
                probe_gua_keepalive(&gua_keepalive, keepalive_gua_per_host);
                prune_gua_keepalive(&mut gua_keepalive, keepalive_gua_interval, keepalive_gua_per_host);
            }
            _ = lease_refresh_timer.tick() => {
                match tokio::task::spawn_blocking(|| op::get_lease().map_err(|e| e.to_string())).await {
                    Ok(Ok(new_leases)) => {
                        leases = new_leases;
                        debug!("refreshed {} DHCP leases", leases.len());
                    }
                    Ok(Err(e)) => warn!("failed to refresh DHCP leases from ubus: {}", e),
                    Err(e) => warn!("DHCP lease refresh task panicked: {}", e),
                }
            }
        }
    }
    Ok(())
}

/// Reconcile the in-memory `registered` map against the live DNS zone obtained via AXFR.
///
/// Two corrections are made on each call:
/// 1. **DNS orphans** – records present in DNS but absent from `registered`.
///    These are either stale leftovers from a previous run or records from a prefix that
///    is no longer active.  Records that fail prefix/subnet filtering are deleted from DNS
///    immediately; records that pass filtering are probed with ICMP so the kernel NUD
///    state machine can confirm reachability and re-populate `registered` via the event loop.
/// 2. **Registered orphans** – entries in `registered` that are missing from DNS (e.g.
///    because hickory-dns restarted and lost its in-memory state).  These are re-pushed
///    via DNS UPDATE so the zone stays consistent.
async fn reconcile_dns(
    updater: &db::DnsUpdater,
    registered: &mut HashMap<(String, String), RegisteredEntry>,
    leases: &HashMap<String, String>,
    active_prefixes: &[LanPrefix],
    private_subnet_v4: bool,
    private_subnet_v6: bool,
) {
    use std::collections::{HashMap as Map, HashSet};
    use std::net::IpAddr;

    let dns_records = match updater.axfr_records().await {
        Ok(r) => r,
        Err(e) => {
            warn!("AXFR reconciliation failed: {}", e);
            return;
        }
    };

    // Only consider records whose hostname appears in the lease table; this avoids
    // accidentally touching manually-added records or the router's own addresses.
    let lease_hostnames: HashSet<&str> = leases.values().map(String::as_str).collect();

    // Map: ip_string -> hostname, for DNS records that pass all filters.
    // Records that fail filtering are deleted from DNS here.
    let mut dns_ips: Map<String, String> = Map::new();

    for (hostname, ip) in &dns_records {
        if !lease_hostnames.contains(hostname.as_str()) {
            continue;
        }
        let passes = match ip {
            IpAddr::V6(addr) => {
                let subnet_ok = !private_subnet_v6 || if_ipv6_in_private_subnet(addr);
                let prefix_ok = active_prefixes.is_empty()
                    || active_prefixes.iter().any(|p| ipv6_in_prefix(*addr, p));
                subnet_ok && prefix_ok
            }
            IpAddr::V4(addr) => !private_subnet_v4 || if_ipv4_in_private_subnet(addr),
        };

        if passes {
            dns_ips.insert(ip.to_string(), hostname.clone());
        } else {
            // Stale record (wrong prefix / subnet) — remove from DNS.
            let result = match ip {
                IpAddr::V6(addr) => updater.delete_aaaa(hostname, *addr).await,
                IpAddr::V4(addr) => updater.delete_a(hostname, *addr).await,
            };
            match result {
                Ok(()) => info!("reconcile: deleted stale DNS {} -> {}", hostname, ip),
                Err(e) => warn!("reconcile: failed to delete stale DNS {} {}: {}", hostname, ip, e),
            }
        }
    }

    // Registered ip set for quick lookup.
    let registered_ips: HashSet<&str> =
        registered.keys().map(|(_, ip)| ip.as_str()).collect();

    // --- DNS orphans (in DNS but not in registered) ---
    // Delete the orphan immediately — DNS TTL only controls resolver caches, not
    // authoritative record lifetime, so records do NOT auto-expire.
    // After deletion we probe the address: if the device is still alive the kernel
    // will emit a REACHABLE NewNeighbour event which re-registers it in DNS.
    for (ip_str, hostname) in &dns_ips {
        if registered_ips.contains(ip_str.as_str()) {
            continue;
        }
        info!("reconcile: DNS orphan {} -> {}, deleting and probing", hostname, ip_str);
        let del_result = match ip_str.parse::<IpAddr>() {
            Ok(IpAddr::V6(addr)) => updater.delete_aaaa(hostname, addr).await,
            Ok(IpAddr::V4(addr)) => updater.delete_a(hostname, addr).await,
            _ => continue,
        };
        match del_result {
            Ok(()) => info!("reconcile: deleted orphan DNS {} -> {}", hostname, ip_str),
            Err(e) => warn!("reconcile: failed to delete orphan {} {}: {}", hostname, ip_str, e),
        }
        // Probe so alive devices trigger a REACHABLE event and re-register.
        match ip_str.parse::<IpAddr>() {
            Ok(IpAddr::V6(addr)) => {
                if let Err(e) = send_icmpv6_echo(addr, 0) {
                    debug!("reconcile: probe failed for {}: {}", addr, e);
                }
            }
            Ok(IpAddr::V4(addr)) => {
                if let Err(e) = send_icmpv4_echo(addr, 0) {
                    debug!("reconcile: probe failed for {}: {}", addr, e);
                }
            }
            _ => {}
        }
    }

    // --- Registered orphans (in registered but not in DNS) ---
    // hickory-dns may have restarted and lost its journal; re-push the record.
    // Use the hostname stored in the entry — independent of the current lease table.
    for ((_, ip_str), entry) in registered.iter_mut() {
        if dns_ips.contains_key(ip_str.as_str()) {
            continue;
        }
        let hostname = &entry.hostname;
        debug!("reconcile: registered orphan {} -> {}, re-pushing", hostname, ip_str);
        let result = match ip_str.parse::<IpAddr>() {
            Ok(IpAddr::V6(addr)) => updater.upsert_aaaa(hostname, addr, DEFAULT_TTL).await,
            Ok(IpAddr::V4(addr)) => updater.upsert_a(hostname, addr, DEFAULT_TTL).await,
            _ => continue,
        };
        match result {
            Ok(()) => {
                info!("reconcile: re-pushed {} -> {}", hostname, ip_str);
                entry.last_confirmed = Instant::now();
            }
            Err(e) => warn!("reconcile: failed to re-push {} {}: {}", hostname, ip_str, e),
        }
    }
}

/// Send ICMPv6 Echo Request / ICMPv4 Echo Request to all registered neighbours.
/// This forces the kernel NUD state machine to verify reachability, generating
/// NewNeighbour events with the resulting state (Reachable or Failed).
async fn probe_registered_neighbours(registered: &HashMap<(String, String), RegisteredEntry>) {
    let now = Instant::now();
    for ((_, ip_str), entry) in registered.iter() {
        // Only probe entries not confirmed recently (older than 30s)
        if now.duration_since(entry.last_confirmed) < Duration::from_secs(30) {
            continue;
        }
        if let Ok(addr) = ip_str.parse::<Ipv6Addr>() {
            if let Err(e) = send_icmpv6_echo(addr, entry.ifindex) {
                debug!("probe failed for {}: {}", ip_str, e);
            }
        } else if let Ok(addr) = ip_str.parse::<Ipv4Addr>() {
            if let Err(e) = send_icmpv4_echo(addr, entry.ifindex) {
                debug!("probe failed for {}: {}", ip_str, e);
            }
        }
    }
}

/// Send ICMPv6 Echo Request to the newest GUA addresses per host for NUD keepalive.
/// Only the top `per_host` addresses (by most-recently-seen) are probed per MAC.
/// This does NOT publish any records to DNS.
fn probe_gua_keepalive(
    gua_keepalive: &HashMap<String, Vec<GuaKeepaliveEntry>>,
    per_host: usize,
) {
    let now = Instant::now();
    for (mac, entries) in gua_keepalive.iter() {
        // Sort indices by first_seen descending to pick the newest GUAs.
        let mut indices: Vec<usize> = (0..entries.len()).collect();
        indices.sort_by(|a, b| entries[*b].first_seen.cmp(&entries[*a].first_seen));

        for &idx in indices.iter().take(per_host) {
            let e = &entries[idx];
            // Skip entries confirmed recently (within 30s)
            if now.duration_since(e.last_confirmed) < Duration::from_secs(30) {
                continue;
            }
            match send_icmpv6_echo(e.addr, e.ifindex) {
                Ok(()) => debug!("GUA keepalive probe: {} ({}) -> {}", e.hostname, mac, e.addr),
                Err(err) => debug!("GUA keepalive probe failed for {}: {}", e.addr, err),
            }
        }
    }
}

/// Remove GUA keepalive entries that haven't been confirmed REACHABLE within 3× the
/// keepalive interval, and drop excess entries beyond `per_host` (oldest first).
fn prune_gua_keepalive(
    gua_keepalive: &mut HashMap<String, Vec<GuaKeepaliveEntry>>,
    keepalive_interval: u64,
    per_host: usize,
) {
    let timeout = Duration::from_secs(keepalive_interval.saturating_mul(3));
    let now = Instant::now();
    gua_keepalive.retain(|_, entries| {
        // Remove timed-out entries first.
        entries.retain(|e| now.duration_since(e.last_confirmed) < timeout);
        // Then keep only the newest `per_host` entries (by first_seen desc).
        if entries.len() > per_host {
            entries.sort_by(|a, b| b.first_seen.cmp(&a.first_seen));
            entries.truncate(per_host);
        }
        !entries.is_empty()
    });
}

fn set_ipv6_unicast_if(socket: &Socket, ifindex: u32) -> std::io::Result<()> {
    socket.bind_device_by_index_v6(NonZeroU32::new(ifindex))
}

fn set_ip_unicast_if(socket: &Socket, ifindex: u32) -> std::io::Result<()> {
    socket.bind_device_by_index_v4(NonZeroU32::new(ifindex))
}

fn compute_icmpv4_checksum(packet: &mut [u8]) {
    packet[2] = 0;
    packet[3] = 0;
    let mut sum = 0u32;
    for chunk in packet.chunks(2) {
        let word = u16::from_be_bytes([chunk[0], *chunk.get(1).unwrap_or(&0)]);
        sum = sum.wrapping_add(word as u32);
    }
    while (sum >> 16) > 0 {
        sum = (sum & 0xffff) + (sum >> 16);
    }
    let checksum = !(sum as u16);
    packet[2..4].copy_from_slice(&checksum.to_be_bytes());
}

fn send_icmpv6_echo(addr: Ipv6Addr, ifindex: u32) -> std::io::Result<()> {
    let socket = Socket::new(Domain::IPV6, Type::DGRAM, Some(Protocol::ICMPV6))?;
    socket.set_nonblocking(true)?;
    // Bind outgoing packet to the specific interface via IPV6_UNICAST_IF so the
    // kernel NUD state machine updates the correct neighbour entry.
    set_ipv6_unicast_if(&socket, ifindex)?;
    // ICMPv6 Echo Request: type=128, code=0, checksum=0 (kernel computes), id=0, seq=1
    let packet: [u8; 8] = [128, 0, 0, 0, 0, 0, 0, 1];
    let dest = SockAddr::from(std::net::SocketAddrV6::new(addr, 0, 0, 0));
    socket.send_to(&packet, &dest)?;
    Ok(())
}

fn send_icmpv4_echo(addr: Ipv4Addr, ifindex: u32) -> std::io::Result<()> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::ICMPV4))?;
    socket.set_nonblocking(true)?;
    // Bind outgoing packet to the specific interface via IP_UNICAST_IF.
    set_ip_unicast_if(&socket, ifindex)?;
    // ICMPv4 Echo Request: type=8, code=0, checksum (computed), id=0, seq=1
    let mut packet: [u8; 8] = [8, 0, 0, 0, 0, 0, 0, 1];
    compute_icmpv4_checksum(&mut packet);
    let dest = SockAddr::from(std::net::SocketAddrV4::new(addr, 0));
    socket.send_to(&packet, &dest)?;
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

fn parse_neighbour_message(neigh: NeighbourMessage, private_subnet_v4: bool) -> Option<Neigh> {
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
    // IPv4 private-subnet filter stays here (no keepalive concept for IPv4 GUA)
    if let NeighbourAddress::Inet(ipv4) = &addr {
        if private_subnet_v4 && !if_ipv4_in_private_subnet(ipv4) {
            return None;
        }
    }
    let kind = neigh.header.kind;
    let ifindex = neigh.header.ifindex;
    let mac = neigh.attributes.iter().find_map(|attr| match attr {
        NeighbourAttribute::LinkLayerAddress(mac) => Some(mac.to_owned()),
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

async fn dump_neighbours(handle: Handle, private_subnet_v4: bool) -> Result<Vec<Neigh>, Error> {
    let mut neighbours = handle.neighbours().get().execute();
    let mut vec: Vec<Neigh> = Vec::new();
    while let Some(route) = neighbours.try_next().await? {
        if let Some(neigh) = parse_neighbour_message(route, private_subnet_v4) {
            if !should_skip_neigh(&neigh) {
                vec.push(neigh);
            }
        }
    }
    Ok(vec)
}

/// Check whether an address message is deprecated (preferred lifetime expired).
fn is_addr_deprecated(msg: &AddressMessage) -> bool {
    if msg.header.flags.contains(AddressHeaderFlags::Deprecated) {
        return true;
    }
    for attr in &msg.attributes {
        match attr {
            AddressAttribute::Flags(f) if f.contains(AddressFlags::Deprecated) => return true,
            AddressAttribute::CacheInfo(ci) if ci.ifa_preferred == 0 => return true,
            _ => {}
        }
    }
    false
}

/// Enumerate non-link-local IPv6 prefixes currently assigned to `iface`.
/// Used during startup to filter out neighbour entries from expired/old prefixes.
async fn get_active_lan_prefixes(handle: Handle, iface: &str, private_subnet_v6: bool) -> Vec<LanPrefix> {
    let mut links = handle.link().get().match_name(iface.to_owned()).execute();
    let link = match links.try_next().await {
        Ok(Some(l)) => l,
        _ => return vec![],
    };
    let ifindex = link.header.index;
    let mut addresses = handle.address().get().set_link_index_filter(ifindex).execute();
    let mut prefixes = Vec::new();
    while let Ok(Some(msg)) = addresses.try_next().await {
        let prefix_len = msg.header.prefix_len;
        // Skip deprecated addresses; they are no longer used for new connections
        // and should not be treated as active LAN prefixes.
        if is_addr_deprecated(&msg) {
            continue;
        }
        for attr in &msg.attributes {
            if let AddressAttribute::Address(IpAddr::V6(addr)) = attr {
                // Skip link-local
                if (addr.segments()[0] & 0xffc0) == 0xfe80 {
                    continue;
                }
                let is_ula = (addr.segments()[0] & 0xfe00) == 0xfc00;
                if private_subnet_v6 && !is_ula {
                    continue;
                }
                prefixes.push(LanPrefix { addr: *addr, prefix_len });
            }
        }
    }
    prefixes
}

/// Enumerate addresses on `iface`, register A/AAAA records for the router itself.
async fn register_router_addresses(
    handle: Handle,
    iface: &str,
    hostname: &str,
    extra_alias: Option<&str>,
    updater: &db::DnsUpdater,
    private_subnet_v6: bool,
) {
    let mut links = handle.link().get().match_name(iface.to_owned()).execute();
    let link = match links.try_next().await {
        Ok(Some(l)) => l,
        Ok(None) => {
            warn!("interface {} not found, skipping router address registration", iface);
            return;
        }
        Err(e) => {
            warn!("failed to find interface {}: {}", iface, e);
            return;
        }
    };
    let ifindex = link.header.index;
    let mut addresses = handle.address().get().set_link_index_filter(ifindex).execute();
    while let Ok(Some(msg)) = addresses.try_next().await {
        if is_addr_deprecated(&msg) {
            continue;
        }
        for attr in &msg.attributes {
            let ip = match attr {
                AddressAttribute::Address(ip) => ip,
                _ => continue,
            };
            match ip {
                IpAddr::V6(addr) => {
                    // Always skip link-local
                    if (addr.segments()[0] & 0xffc0) == 0xfe80 {
                        continue;
                    }
                    // Restrict to ULA only when private_subnet_v6 is set
                    let is_ula = (addr.segments()[0] & 0xfe00) == 0xfc00;
                    if private_subnet_v6 && !is_ula {
                        continue;
                    }
                    for name in std::iter::once(hostname).chain(extra_alias) {
                        match updater.upsert_aaaa(name, *addr, DEFAULT_TTL).await {
                            Ok(()) => info!("registered router {} AAAA {}", name, addr),
                            Err(e) => warn!("failed to register router AAAA {} for {}: {}", addr, name, e),
                        }
                    }
                }
                IpAddr::V4(addr) => {
                    for name in std::iter::once(hostname).chain(extra_alias) {
                        match updater.upsert_a(name, *addr, DEFAULT_TTL).await {
                            Ok(()) => info!("registered router {} A {}", name, addr),
                            Err(e) => warn!("failed to register router A {} for {}: {}", addr, name, e),
                        }
                    }
                }
            }
        }
    }
}

/// Block until a TCP connection to `addr` succeeds, retrying every 2 seconds.
/// This ensures the DNS server is ready before we attempt any dynamic updates.
async fn wait_for_dns_server(addr: StdSocketAddr) {
    use tokio::net::TcpStream;
    loop {
        match TcpStream::connect(addr).await {
            Ok(_) => {
                info!("DNS server at {} is reachable, proceeding", addr);
                return;
            }
            Err(e) => {
                warn!("DNS server at {} not ready ({}), retrying in 2s...", addr, e);
                time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}
