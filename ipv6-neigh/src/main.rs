use std::collections::HashMap;
use std::net::SocketAddr as StdSocketAddr;
use std::time::Instant;

use futures::stream::StreamExt;
use futures::stream::TryStreamExt;
use log::{debug, error, info, warn};
use netlink_packet_core::NetlinkPayload;
use netlink_packet_route::RouteNetlinkMessage;
use netlink_packet_route::neighbour::NeighbourMessage;
use netlink_packet_route::neighbour::{NeighbourAddress, NeighbourAttribute, NeighbourState};
use netlink_packet_route::route::RouteType;
use rtnetlink::{Error, Handle, new_connection};
use tokio::time::{self, Duration};

use clap::Parser;
use hickory_proto::rr::Name;
use hickory_proto::rr::TSigner;
use hickory_proto::rr::rdata::tsig::TsigAlgorithm;
use netlink_sys::{AsyncSocket, SocketAddr};

mod db;
mod filter;
mod iface;
mod op;
mod probe;
mod reconcile;
mod types;

use filter::{if_ipv4_in_private_subnet, if_ipv6_in_private_subnet, ipv6_in_prefix, ipv6_passes_active_prefix, is_gua_ipv6};
use iface::{get_active_lan_prefixes, register_router_addresses, wait_for_dns_server};
use probe::{probe_gua_keepalive, probe_registered_neighbours, prune_gua_keepalive, send_icmpv4_echo, send_icmpv6_echo};
use reconcile::{do_delete_dns, process_new_neigh, prune_ula_for_host, reconcile_dns};
use types::{
    DEFAULT_TTL, RTNLGRP_NEIGH, GuaKeepaliveEntry, Neigh, RegisteredEntry, nl_mgrp,
};

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
    #[clap(long, default_value = "2")]
    keepalive_gua_per_host: usize,
    /// Maximum number of ULA AAAA records to publish per host (oldest pruned first)
    #[clap(long, default_value = "2")]
    max_ula_per_host: usize,
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

#[tokio::main(flavor = "current_thread")]
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

    let (mut connection, handle, mut messages) = new_connection().unwrap();
    // Subscribe to neighbour events on the same connection used for queries.
    // This avoids a second netlink socket and spawned task.
    connection
        .socket_mut()
        .socket_mut()
        .bind(&SocketAddr::new(0, nl_mgrp(RTNLGRP_NEIGH)))
        .expect("Failed to bind netlink multicast group");
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

    // Load DHCP leases (mac -> hostname) from ubus.
    // Use spawn_blocking: op::get_lease() makes a synchronous ubus call.
    let mut leases: HashMap<String, String> = tokio::task::spawn_blocking(|| {
        op::get_lease().unwrap_or_default()
    })
    .await
    .unwrap_or_default();
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

            let ip_str = inet_to_string(&neigh.inet);
            match neigh.state {
                NeighbourState::Reachable => {
                    // Confirmed online — register in DNS immediately.
                    if let Some(hostname) = leases.get(&neigh.mac) {
                        let key = (hostname.clone(), ip_str.clone());
                        if !registered.contains_key(&key) {
                            // Enforce per-host ULA limit before adding a new one.
                            if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                                if if_ipv6_in_private_subnet(addr) {
                                    prune_ula_for_host(hostname, max_ula_per_host, &mut registered, &updater).await;
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
                        }
                    } else {
                        debug!("no lease for mac {}, skipping DNS update", neigh.mac);
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

    // (netlink event socket already set up above — reuse the same connection)

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

                            let ip_str = inet_to_string(&neigh.inet);
                            if is_failed_state(neigh.state) {
                                // Neighbour confirmed unreachable — remove DNS record.
                                // Resolve key by hostname (handles MAC changes: new MAC in leases
                                // can now evict entries registered under an old MAC).
                                // Fall back to scanning registered by IP if MAC is no longer in leases.
                                let key_opt: Option<(String, String)> = leases
                                    .get(&neigh.mac)
                                    .map(|h| (h.clone(), ip_str.clone()))
                                    .or_else(|| registered.keys().find(|(_, ip)| ip == &ip_str).cloned());
                                if let Some(key) = key_opt {
                                    if let Some(entry) = registered.remove(&key) {
                                        debug!("Neighbour failed: {:?}", neigh);
                                        if !do_delete_dns(&entry.hostname, &neigh.inet, &updater).await {
                                            // DNS delete failed, put back so we retry
                                            registered.insert(key, entry);
                                        }
                                    }
                                }
                            } else if neigh.state == NeighbourState::Reachable {
                                if let Some(hostname) = leases.get(&neigh.mac) {
                                    let key = (hostname.clone(), ip_str.clone());
                                    if let Some(entry) = registered.get_mut(&key) {
                                        // Already registered, just update timestamp and ifindex
                                        entry.last_confirmed = Instant::now();
                                        entry.ifindex = neigh.ifindex;
                                    } else {
                                        // New reachable neighbour — register in DNS
                                        debug!("New neighbour: {:?}", neigh);
                                        // Enforce per-host ULA limit before adding.
                                        if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                                            if if_ipv6_in_private_subnet(addr) {
                                                prune_ula_for_host(hostname, max_ula_per_host, &mut registered, &updater).await;
                                            }
                                        }
                                        if process_new_neigh(&neigh, &updater, &leases, private_subnet_v6).await {
                                            registered.insert(key, RegisteredEntry {
                                                hostname: hostname.clone(),
                                                last_confirmed: Instant::now(),
                                                ifindex: neigh.ifindex,
                                            });
                                        }
                                    }
                                } else {
                                    debug!("no lease for mac {}, skipping DNS update", neigh.mac);
                                }
                            } else if matches!(neigh.state, NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe) {
                                // Uncertain state: update ifindex only so the next probe uses
                                // the right interface, but do NOT refresh last_confirmed —
                                // STALE/DELAY/PROBE is not confirmed reachable and refreshing
                                // the timestamp would suppress the periodic probe.
                                if let Some(hostname) = leases.get(&neigh.mac) {
                                    let key = (hostname.clone(), ip_str.clone());
                                    if let Some(entry) = registered.get_mut(&key) {
                                        entry.ifindex = neigh.ifindex;
                                    }
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
                            let ip_str = inet_to_string(&neigh.inet);
                            // Resolve key by hostname; fall back to scanning by IP if MAC gone from leases.
                            let key_opt: Option<(String, String)> = leases
                                .get(&neigh.mac)
                                .map(|h| (h.clone(), ip_str.clone()))
                                .or_else(|| registered.keys().find(|(_, ip)| ip == &ip_str).cloned());
                            debug!("Del neighbour: {:?}", neigh);
                            if let Some(key) = key_opt {
                                registered.remove(&key);
                                do_delete_dns(&key.0, &neigh.inet, &updater).await;
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
                // Recover kernel orphans: neighbours that are REACHABLE in the kernel
                // but absent from `registered` and DNS.  This happens when a netlink
                // NewNeighbour event is lost (receive-buffer overflow) or when a device
                // transitions to REACHABLE during the startup race window.
                // reconcile_dns's AXFR pass cannot catch these because the record is
                // also absent from DNS, so no probe is ever triggered for them.
                if let Ok(neighbours) = dump_neighbours(handle.clone(), private_subnet_v4).await {
                    // Build a set of IPs that are currently REACHABLE in the kernel,
                    // used below to detect registered entries the kernel has marked FAILED.
                    let reachable_ips: std::collections::HashSet<String> = neighbours
                        .iter()
                        .filter(|n| n.state == NeighbourState::Reachable)
                        .map(|n| inet_to_string(&n.inet))
                        .collect();

                    for neigh in &neighbours {
                        if should_skip_neigh(neigh) {
                            continue;
                        }

                        if is_failed_state(neigh.state) {
                            // Kernel confirms FAILED — remove from registered + DNS if present.
                            // Mirrors the real-time NewNeighbour(FAILED) handler but catches
                            // cases where that event was lost.
                            let ip_str = inet_to_string(&neigh.inet);
                            let key_opt: Option<(String, String)> = leases
                                .get(&neigh.mac)
                                .map(|h| (h.clone(), ip_str.clone()))
                                .or_else(|| {
                                    registered
                                        .keys()
                                        .find(|(_, ip)| ip == &ip_str)
                                        .cloned()
                                });
                            if let Some(key) = key_opt {
                                if let Some(entry) = registered.remove(&key) {
                                    debug!("reconcile neigh: kernel FAILED {} -> {:?}", entry.hostname, neigh.inet);
                                    if !do_delete_dns(&entry.hostname, &neigh.inet, &updater).await {
                                        registered.insert(key, entry);
                                    }
                                }
                            }
                            continue;
                        }

                        if neigh.state != NeighbourState::Reachable {
                            continue;
                        }
                        if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                            if !active_prefixes.is_empty()
                                && !active_prefixes.iter().any(|p| ipv6_in_prefix(*addr, p))
                            {
                                continue;
                            }
                            if is_gua_ipv6(addr) && private_subnet_v6 {
                                continue;
                            }
                        }
                        let ip_str = inet_to_string(&neigh.inet);
                        let Some(hostname) = leases.get(&neigh.mac) else {
                            continue;
                        };
                        let key = (hostname.clone(), ip_str);
                        if let Some(entry) = registered.get_mut(&key) {
                            // Already tracked — refresh to suppress spurious probes.
                            entry.last_confirmed = Instant::now();
                            entry.ifindex = neigh.ifindex;
                        } else {
                            debug!("reconcile neigh: kernel orphan {} -> {:?}", hostname, neigh.inet);
                            if let NeighbourAddress::Inet6(addr) = &neigh.inet {
                                if if_ipv6_in_private_subnet(addr) {
                                    prune_ula_for_host(
                                        hostname,
                                        max_ula_per_host,
                                        &mut registered,
                                        &updater,
                                    )
                                    .await;
                                }
                            }
                            if process_new_neigh(neigh, &updater, &leases, private_subnet_v6).await {
                                registered.insert(
                                    key,
                                    RegisteredEntry {
                                        hostname: hostname.clone(),
                                        last_confirmed: Instant::now(),
                                        ifindex: neigh.ifindex,
                                    },
                                );
                            }
                        }
                    }

                    // Sweep registered entries whose IP the kernel has evicted entirely
                    // (not present in the dump at all, not even as FAILED) AND that haven't
                    // been confirmed recently.  These are devices whose FAILED event was
                    // lost and which the kernel has since garbage-collected from its table.
                    // Only act if the entry is old enough (> 2× probe interval) to avoid
                    // racing with normal STALE→REACHABLE transitions.
                    let stale_cutoff = Duration::from_secs(probe_interval.saturating_mul(2));
                    let now = Instant::now();
                    let to_remove: Vec<(String, String)> = registered
                        .iter()
                        .filter(|((_hostname, ip_str), entry)| {
                            !reachable_ips.contains(ip_str.as_str())
                                && now.duration_since(entry.last_confirmed) > stale_cutoff
                        })
                        .map(|(k, _)| k.clone())
                        .collect();
                    for key in to_remove {
                        if let Some(entry) = registered.remove(&key) {
                            let ip_str = &key.1;
                            let inet = if let Ok(addr) = ip_str.parse::<std::net::Ipv6Addr>() {
                                NeighbourAddress::Inet6(addr)
                            } else if let Ok(addr) = ip_str.parse::<std::net::Ipv4Addr>() {
                                NeighbourAddress::Inet(addr)
                            } else {
                                registered.insert(key, entry);
                                continue;
                            };
                            debug!("reconcile neigh: evicted {} -> {}", entry.hostname, ip_str);
                            if !do_delete_dns(&entry.hostname, &inet, &updater).await {
                                registered.insert(key, entry);
                            }
                        }
                    }
                }
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
    let mac_bytes = neigh.attributes.iter().find_map(|attr| match attr {
        NeighbourAttribute::LinkLayerAddress(mac) => Some(mac.to_owned()),
        _ => None,
    });
    // FAILED events may arrive without a hardware address (e.g. when ARP/NDP never
    // succeeded, or the kernel cleared the lladdr on failure). Allow them through
    // with an empty MAC so the FAILED handler can fall back to IP-based lookup.
    let mac_str = match mac_bytes {
        Some(m) => format_mac(m),
        None if matches!(state, NeighbourState::Failed) => String::new(),
        None => return None,
    };
    // Filter out empty or all-zero MACs for non-FAILED states
    // (router own addresses, incomplete entries).
    if !matches!(state, NeighbourState::Failed) && (mac_str.is_empty() || mac_str == "00:00:00:00:00:00") {
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

