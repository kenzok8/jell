use std::collections::{HashMap, HashSet};
use std::net::{Ipv4Addr, SocketAddr as StdSocketAddr};
use std::time::{Duration, Instant};

use futures::stream::StreamExt;
use futures::stream::TryStreamExt;
use log::{debug, info, trace, warn};
use netlink_packet_core::NetlinkPayload;
use netlink_packet_route::RouteNetlinkMessage;
use netlink_packet_route::neighbour::NeighbourMessage;
use netlink_packet_route::neighbour::{NeighbourAddress, NeighbourAttribute, NeighbourState};
use netlink_packet_route::route::RouteType;
use rtnetlink::{Error, Handle, new_connection};
use tokio::time::{self};

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

use filter::{
    if_ipv4_in_private_subnet, if_ipv6_in_private_subnet, ipv6_in_prefix,
    ipv6_passes_active_prefix, is_gua_ipv6,
};
use iface::{
    get_active_lan_prefixes, get_iface_index, register_router_addresses, wait_for_dns_server,
};
use probe::{Prober, prune_gua_keepalive, run_probe_scheduler};
use reconcile::{do_delete_dns, process_new_neigh, prune_ula_for_host, reconcile_dns};
use types::{
    GuaKeepaliveEntry, Neigh, RTNLGRP_NEIGH, RegisteredEntry, format_mac, nl_mgrp,
    stable_jitter_offset,
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

    /// hickory-dns server address for DNS updates (e.g. "[::1]:53")
    #[clap(short, long, default_value = "[::1]:53")]
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
    #[clap(long, default_value = "15")]
    probe_interval: u64,

    /// Network interface to read the router's own addresses from
    #[clap(long, default_value = "br-lan")]
    router_iface: String,

    /// Additional DNS name to register router addresses under (e.g. "router" -> "router.lan")
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
    #[clap(long, default_value = "1")]
    max_ula_per_host: usize,

    /// IPv4 subnets for PTR reverse DNS (CIDR notation, e.g. "192.168.3.0/24", repeatable)
    #[clap(long, value_name = "SUBNET")]
    ptr_ipv4_subnet: Vec<String>,

    /// Enable PTR reverse DNS for ULA IPv6 addresses (fc00::/7) via d.f.ip6.arpa
    #[clap(long)]
    ptr_ula: bool,
}

fn should_skip_route_type(route_type: RouteType) -> bool {
    matches!(
        route_type,
        RouteType::Multicast | RouteType::Broadcast | RouteType::Local
    )
}

fn should_skip_neigh(neigh: &Neigh) -> bool {
    should_skip_route_type(neigh.kind)
}

/// Whether this NUD state indicates the neighbour is definitely gone (remove from DNS).
fn is_failed_state(state: NeighbourState) -> bool {
    matches!(state, NeighbourState::Failed)
}

/// Parse an IPv4 CIDR string like "192.168.3.0/24" into (network_addr, prefix_len).
fn parse_ipv4_cidr(s: &str) -> (Ipv4Addr, u8) {
    let (addr_str, prefix_str) = s.split_once('/').unwrap_or_else(|| {
        panic!("invalid --ptr-ipv4-subnet \"{s}\": expected CIDR notation like \"192.168.3.0/24\"")
    });
    let addr: Ipv4Addr = addr_str.parse().unwrap_or_else(|_| {
        panic!("invalid --ptr-ipv4-subnet \"{s}\": \"{addr_str}\" is not a valid IPv4 address")
    });
    let prefix_len: u8 = prefix_str.parse().unwrap_or_else(|_| {
        panic!("invalid --ptr-ipv4-subnet \"{s}\": prefix length must be 0-32")
    });
    assert!(
        prefix_len <= 32,
        "invalid --ptr-ipv4-subnet \"{s}\": prefix length {prefix_len} > 32"
    );
    (addr, prefix_len)
}

/// Compute the initial `next_probe_due` for a (mac, ip) pair using a stable
/// jitter offset. When `interval` is 0 (probing disabled), returns a far-future
/// sentinel so the scheduler never reaches it.
fn initial_next_probe_due(now: Instant, mac: &str, ip: &str, interval: u64) -> Instant {
    if interval == 0 {
        return now + Duration::from_secs(365 * 24 * 3600);
    }
    now + stable_jitter_offset(mac, ip, interval)
}

/// Tick an optional interval timer; when `None`, await forever (branch disabled).
async fn option_tick(timer: &mut Option<time::Interval>) {
    match timer {
        Some(t) => {
            t.tick().await;
        }
        None => std::future::pending().await,
    }
}

/// Register a new REACHABLE neighbour in DNS and add to the registered map.
/// Handles ULA pruning and delegates to `process_new_neigh` for the actual DNS update.
/// Caller must ensure the (hostname, ip) key is not already in `registered`.
async fn try_register_neigh(
    neigh: &Neigh,
    hostname: &str,
    ip_str: &str,
    registered: &mut HashMap<(String, String), RegisteredEntry>,
    leases: &HashMap<String, String>,
    updater: &db::DnsUpdater,
    max_ula_per_host: usize,
    private_subnet_v6: bool,
    probe_interval: u64,
) {
    // max_ula_per_host=0 means ULA publishing is entirely disabled.
    if max_ula_per_host == 0
        && let NeighbourAddress::Inet6(addr) = &neigh.inet
        && if_ipv6_in_private_subnet(addr)
    {
        trace!("ULA publish disabled (max_ula_per_host=0) for host {}", hostname);
        return;
    }

    // Enforce per-host ULA limit before adding.
    if let NeighbourAddress::Inet6(addr) = &neigh.inet
        && if_ipv6_in_private_subnet(addr) {
            prune_ula_for_host(hostname, max_ula_per_host, registered, updater).await;
        }
    if process_new_neigh(neigh, updater, leases, private_subnet_v6).await {
        let now = Instant::now();
        registered.insert(
            (hostname.to_owned(), ip_str.to_owned()),
            RegisteredEntry {
                hostname: hostname.to_owned(),
                last_confirmed: now,
                last_dns_synced: now,
                last_probe_sent: now,
                next_probe_due: initial_next_probe_due(now, &neigh.mac, ip_str, probe_interval),
                ifindex: neigh.ifindex,
            },
        );
    }
}

fn inet_to_string(addr: &NeighbourAddress) -> String {
    match addr {
        NeighbourAddress::Inet(ip) => ip.to_string(),
        NeighbourAddress::Inet6(ip) => ip.to_string(),
        other => format!("{other:?}"),
    }
}

fn is_link_local_neigh_addr(addr: &NeighbourAddress) -> bool {
    matches!(addr, NeighbourAddress::Inet6(ip) if filter::is_link_local_ipv6(ip))
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
    if is_link_local_neigh_addr(&addr) {
        return None;
    }

    // IPv4 private-subnet filter stays here (no keepalive concept for IPv4 GUA)
    if let NeighbourAddress::Inet(ipv4) = &addr
        && private_subnet_v4 && !if_ipv4_in_private_subnet(ipv4) {
            return None;
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
        Some(m) => format_mac(&m),
        None if matches!(state, NeighbourState::Failed) => String::new(),
        None => return None,
    };

    // Filter out empty or all-zero MACs for non-FAILED states
    // (router own addresses, incomplete entries).
    if !matches!(state, NeighbourState::Failed)
        && (mac_str.is_empty() || mac_str == "00:00:00:00:00:00")
    {
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
        if let Some(neigh) = parse_neighbour_message(route, private_subnet_v4)
            && !should_skip_neigh(&neigh) {
                vec.push(neigh);
            }
    }
    Ok(vec)
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let args = Cli::parse();

    env_logger::Builder::new()
        .filter_level(
            args.log_level
                .parse()
                .expect("invalid log level (use: error, warn, info, debug, trace)"),
        )
        .filter_module("netlink_packet_route", log::LevelFilter::Error)
        .format_timestamp_secs()
        .init();

    let private_subnet_v4 = args.private_subnet_v4;
    let private_subnet_v6 = !args.publish_gua;
    let keepalive_gua = args.keepalive_gua;
    let keepalive_gua_interval = args.keepalive_gua_interval;
    let keepalive_gua_per_host = args.keepalive_gua_per_host;
    let max_ula_per_host = args.max_ula_per_host;
    let probe_interval = args.probe_interval;

    let zone = Name::from_ascii(&args.zone).expect("invalid zone name");
    let key_data = std::fs::read(&args.key_file)
        .unwrap_or_else(|e| panic!("failed to read TSIG key file {:?}: {e}", args.key_file));
    let key_name = Name::from_ascii(&args.key_name).expect("invalid TSIG key name");
    let signer =
        TSigner::new(key_data, TsigAlgorithm::HmacSha256, key_name, 300).expect("invalid TSIG key");

    let ipv4_ptr_subnets: Vec<(Ipv4Addr, u8)> = args
        .ptr_ipv4_subnet
        .iter()
        .map(|s| parse_ipv4_cidr(s))
        .collect();

    let updater = db::DnsUpdater::new(args.dns_server, zone, signer)
        .with_ptr_zones(&ipv4_ptr_subnets, args.ptr_ula);

    // Create reusable ICMP probe sockets once at startup.
    let prober = Prober::new()?;

    // Wait for the DNS server to become available before sending any updates.
    wait_for_dns_server(args.dns_server).await;

    let (mut connection, handle, mut messages) = new_connection()?;

    connection
        .socket_mut()
        .socket_mut()
        .bind(&SocketAddr::new(0, nl_mgrp(RTNLGRP_NEIGH)))
        .expect("Failed to bind netlink multicast group");

    tokio::spawn(connection);

    // Look up the router interface index for use as a fallback in DNS-orphan probes.
    let router_ifindex = get_iface_index(handle.clone(), &args.router_iface)
        .await
        .unwrap_or_else(|e| {
            warn!(
                "could not get ifindex for {}: {}, using 0 as fallback",
                args.router_iface, e
            );
            0
        });

    // Register router's own addresses in DNS
    let router_hostname = std::fs::read_to_string("/proc/sys/kernel/hostname")
        .unwrap_or_default()
        .trim()
        .to_owned();
    if router_hostname.is_empty() {
        warn!("could not read router hostname from /proc/sys/kernel/hostname");
    } else {
        let router_alias = args
            .router_alias
            .as_deref()
            .filter(|a| *a != router_hostname);
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
    let mut leases: HashMap<String, String> =
        tokio::task::spawn_blocking(|| op::get_lease().unwrap_or_default())
            .await
            .unwrap_or_default();
    info!("loaded {} DHCP leases", leases.len());

    let mut registered: HashMap<(String, String), RegisteredEntry> = HashMap::new();
    let mut gua_keepalive: HashMap<String, Vec<GuaKeepaliveEntry>> = HashMap::new();
    let mut dns_orphan_since: HashMap<(String, String), Instant> = HashMap::new();
    let mut last_axfr_hostnames: HashSet<String> = HashSet::new();

    let prefix_filter_v6 = if keepalive_gua {
        false
    } else {
        private_subnet_v6
    };
    let active_prefixes =
        get_active_lan_prefixes(handle.clone(), &args.router_iface, prefix_filter_v6).await;
    if active_prefixes.is_empty() {
        warn!(
            "no active IPv6 prefixes found on {}, neighbour prefix-filtering disabled",
            args.router_iface
        );
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

    // Dump existing neighbours
    trace!("dumping neighbours");
    if let Ok(neighbours) = dump_neighbours(handle.clone(), private_subnet_v4).await {
        for neigh in &neighbours {
            trace!("{:?}", neigh);
            if should_skip_neigh(neigh) {
                continue;
            }

            if let NeighbourAddress::Inet6(addr) = &neigh.inet
                && !active_prefixes.is_empty()
                    && !active_prefixes.iter().any(|p| ipv6_in_prefix(*addr, p))
                {
                    trace!(
                        "init dump: skipping {} -- not in any active LAN prefix",
                        addr
                    );
                    continue;
                }

            // Route GUA addresses to keepalive map instead of DNS.
            if let NeighbourAddress::Inet6(addr) = &neigh.inet
                && is_gua_ipv6(addr) {
                    if keepalive_gua {
                        if neigh.state == NeighbourState::Reachable {
                            if let Some(hostname) = leases.get(&neigh.mac) {
                                let entries = gua_keepalive.entry(neigh.mac.clone()).or_default();
                                if !entries.iter().any(|e| e.addr == *addr) {
                                    let now = Instant::now();
                                    // Instant is monotonic; now >= all existing first_seen,
                                    // so insert at position 0 maintains descending order.
                                    entries.insert(0, GuaKeepaliveEntry {
                                        addr: *addr,
                                        ifindex: neigh.ifindex,
                                        first_seen: now,
                                        last_confirmed: now,
                                        last_probe_sent: now,
                                        next_probe_due: initial_next_probe_due(
                                            now,
                                            &neigh.mac,
                                            &addr.to_string(),
                                            keepalive_gua_interval,
                                        ),
                                    });
                                    trace!(
                                        "init dump: GUA keepalive tracked {} -> {}",
                                        hostname, addr
                                    );
                                }
                            }
                        } else if matches!(
                            neigh.state,
                            NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe
                        ) {
                            match prober.send_icmpv6_echo(*addr, neigh.ifindex) {
                                Ok(_) => trace!("init dump: probing stale GUA {}", addr),
                                Err(e) => warn!("init GUA probe failed for {}: {}", addr, e),
                            }
                        }
                    }
                    if private_subnet_v6 {
                        continue;
                    }
                }

            let ip_str = inet_to_string(&neigh.inet);
            match neigh.state {
                NeighbourState::Reachable => {
                    if let Some(hostname) = leases.get(&neigh.mac) {
                        let key = (hostname.clone(), ip_str.clone());
                        if !registered.contains_key(&key) {
                            try_register_neigh(
                                neigh,
                                hostname,
                                &ip_str,
                                &mut registered,
                                &leases,
                                &updater,
                                max_ula_per_host,
                                private_subnet_v6,
                                probe_interval,
                            )
                            .await;
                        }
                    } else {
                        trace!("no lease for mac {}, skipping DNS update", neigh.mac);
                    }
                }
                NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe => {
                    match &neigh.inet {
                        NeighbourAddress::Inet6(addr) => {
                            match prober.send_icmpv6_echo(*addr, neigh.ifindex) {
                                Ok(_) => trace!("init dump: probing stale neighbour {}", addr),
                                Err(e) => warn!("init probe failed for {}: {}", addr, e),
                            }
                        }
                        NeighbourAddress::Inet(addr) => {
                            if let Err(e) = prober.send_icmpv4_echo(*addr, neigh.ifindex) {
                                warn!("init probe failed for {}: {}", addr, e);
                            }
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        }
    }

    // ---- timers ----

    // 1-second scheduler tick for per-IP stable-jitter probes + socket drain.
    let mut scheduler_tick = time::interval(Duration::from_secs(1));
    scheduler_tick.tick().await; // skip the immediate first tick (consistent with other timers)

    // Probe timer: now only runs reconcile_dns + dump_neighbours (no batch probes).
    // Uses Option<Interval> instead of a u64::MAX/2 sentinel to avoid relying on
    // tokio Instant overflow behaviour for far-future durations.
    let mut probe_timer: Option<time::Interval> = (probe_interval > 0)
        .then(|| time::interval(Duration::from_secs(probe_interval)));
    if let Some(ref mut t) = probe_timer {
        t.tick().await;
    }

    // GUA keepalive timer: now only runs pruning (probes are handled by the scheduler).
    let mut gua_keepalive_timer: Option<time::Interval> = (keepalive_gua && keepalive_gua_interval > 0)
        .then(|| time::interval(Duration::from_secs(keepalive_gua_interval)));
    if let Some(ref mut t) = gua_keepalive_timer {
        t.tick().await;
    }

    let mut lease_refresh_timer = time::interval(Duration::from_secs(60));
    lease_refresh_timer.tick().await;

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

                            let ip_str = inet_to_string(&neigh.inet);

                            if let NeighbourAddress::Inet6(addr) = &neigh.inet
                                && !ipv6_passes_active_prefix(*addr, &active_prefixes) {
                                    trace!("event: skipping {} -- not in any active LAN prefix", addr);
                                    let key_opt: Option<(String, String)> = leases
                                        .get(&neigh.mac)
                                        .map(|h| (h.clone(), ip_str.clone()))
                                        .or_else(|| registered.keys().find(|(_, ip)| ip == &ip_str).cloned());
                                    if let Some(key) = key_opt {
                                        if let Some(entry) = registered.remove(&key) {
                                            if !do_delete_dns(&entry.hostname, &neigh.inet, &updater).await {
                                                registered.insert(key, entry);
                                            }
                                        }
                                    }
                                    if let Some(entries) = gua_keepalive.get_mut(&neigh.mac) {
                                        entries.retain(|e| e.addr != *addr);
                                    }
                                    continue;
                                }

                            // Route GUA addresses to keepalive map instead of DNS.
                            if let NeighbourAddress::Inet6(addr) = &neigh.inet
                                && is_gua_ipv6(addr) && private_subnet_v6 {
                                    if keepalive_gua {
                                        if is_failed_state(neigh.state) {
                                            if let Some(entries) = gua_keepalive.get_mut(&neigh.mac) {
                                                entries.retain(|e| e.addr != *addr);
                                                trace!("GUA keepalive: removed failed {} for mac {}", addr, neigh.mac);
                                            }
                                        } else if neigh.state == NeighbourState::Reachable {
                                            if let Some(hostname) = leases.get(&neigh.mac) {
                                                let entries = gua_keepalive.entry(neigh.mac.clone()).or_default();
                                                if let Some(e) = entries.iter_mut().find(|e| e.addr == *addr) {
                                                    e.last_confirmed = Instant::now();
                                                    e.ifindex = neigh.ifindex;
                                                } else {
                                                    let now = Instant::now();
                                                    // Instant is monotonic; now >= all existing first_seen,
                                                    // so insert at position 0 maintains descending order.
                                                    entries.insert(0, GuaKeepaliveEntry {
                                                        addr: *addr,
                                                        ifindex: neigh.ifindex,
                                                        first_seen: now,
                                                        last_confirmed: now,
                                                        last_probe_sent: now,
                                                        next_probe_due: initial_next_probe_due(
                                                            now,
                                                            &neigh.mac,
                                                            &addr.to_string(),
                                                            keepalive_gua_interval,
                                                        ),
                                                    });
                                                    trace!("GUA keepalive: tracking {} -> {}", hostname, addr);
                                                }
                                            }
                                        } else if matches!(neigh.state, NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe)
                                            && let Some(entries) = gua_keepalive.get_mut(&neigh.mac)
                                                && let Some(e) = entries.iter_mut().find(|e| e.addr == *addr) {
                                                    e.ifindex = neigh.ifindex;
                                                }
                                    }
                                    continue;
                                }

                            if is_failed_state(neigh.state) {
                                // Look up hostname via MAC (preferred) or fall back to IP-based
                                // search in `registered` (handles FAILED events without lladdr).
                                let key_opt: Option<(String, String)> = leases
                                    .get(&neigh.mac)
                                    .map(|h| (h.clone(), ip_str.clone()))
                                    .or_else(|| {
                                        registered
                                            .keys()
                                            .find(|(_, ip)| ip == &ip_str)
                                            .cloned()
                                    });
                                if let Some(key) = key_opt
                                    && let Some(entry) = registered.remove(&key) {
                                        info!("FAILED: removing {} -> {:?}", entry.hostname, neigh.inet);
                                        if !do_delete_dns(&entry.hostname, &neigh.inet, &updater).await {
                                            registered.insert(key, entry);
                                        }
                                    }
                                continue;
                            }

                            if neigh.state == NeighbourState::Reachable {
                                if let Some(hostname) = leases.get(&neigh.mac) {
                                    let key = (hostname.clone(), ip_str.clone());
                                    if let Some(entry) = registered.get_mut(&key) {
                                        // Already registered — only update reachability timestamp.
                                        entry.last_confirmed = Instant::now();
                                        entry.ifindex = neigh.ifindex;
                                    } else {
                                        trace!("New neighbour: {:?}", neigh);
                                        try_register_neigh(&neigh, hostname, &ip_str, &mut registered, &leases, &updater, max_ula_per_host, private_subnet_v6, probe_interval).await;
                                    }
                                } else {
                                    trace!("no lease for mac {}, skipping DNS update", neigh.mac);
                                }
                            } else if matches!(neigh.state, NeighbourState::Stale | NeighbourState::Delay | NeighbourState::Probe)
                                && let Some(hostname) = leases.get(&neigh.mac) {
                                    let key = (hostname.clone(), ip_str.clone());
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

                            if let NeighbourAddress::Inet6(addr) = &neigh.inet
                                && is_gua_ipv6(addr) && keepalive_gua {
                                    if let Some(entries) = gua_keepalive.get_mut(&neigh.mac) {
                                        entries.retain(|e| e.addr != *addr);
                                        trace!("GUA keepalive: removed deleted {} for mac {}", addr, neigh.mac);
                                    }
                                    if private_subnet_v6 {
                                        continue;
                                    }
                                }

                            let ip_str = inet_to_string(&neigh.inet);
                            let key_opt: Option<(String, String)> = leases
                                .get(&neigh.mac)
                                .map(|h| (h.clone(), ip_str.clone()))
                                .or_else(|| registered.keys().find(|(_, ip)| ip == &ip_str).cloned());

                            trace!("Del neighbour: {:?}", neigh);
                            if let Some(key) = key_opt {
                                if let Some(entry) = registered.remove(&key) {
                                    if !do_delete_dns(&entry.hostname, &neigh.inet, &updater).await {
                                        registered.insert(key, entry);
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ = scheduler_tick.tick() => {
                prober.drain_replies(128);
                let sent = run_probe_scheduler(
                    &prober,
                    &mut registered,
                    &mut gua_keepalive,
                    probe_interval,
                    keepalive_gua_interval,
                    keepalive_gua,
                    keepalive_gua_per_host,
                );
                if sent > 0 {
                    trace!("scheduler: sent {} probes", sent);
                }
            }
            _ = option_tick(&mut probe_timer) => {
                let grace_period = Duration::from_secs(probe_interval.saturating_mul(2));
                reconcile_dns(
                    &updater,
                    &mut registered,
                    &leases,
                    &active_prefixes,
                    private_subnet_v4,
                    private_subnet_v6,
                    &prober,
                    router_ifindex,
                    &mut dns_orphan_since,
                    grace_period,
                    &mut last_axfr_hostnames,
                )
                .await;

                if let Ok(neighbours) = dump_neighbours(handle.clone(), private_subnet_v4).await {
                    let all_dump_ips: std::collections::HashSet<String> = neighbours
                        .iter()
                        .map(|n| inet_to_string(&n.inet))
                        .collect();

                    for neigh in &neighbours {
                        if should_skip_neigh(neigh) {
                            continue;
                        }
                        if is_failed_state(neigh.state) {
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
                            if let Some(key) = key_opt
                                && let Some(entry) = registered.remove(&key) {
                                    info!("reconcile neigh: kernel FAILED {} -> {:?}", entry.hostname, neigh.inet);
                                    if !do_delete_dns(&entry.hostname, &neigh.inet, &updater).await {
                                        registered.insert(key, entry);
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
                        let key = (hostname.clone(), ip_str.clone());
                        if let Some(entry) = registered.get_mut(&key) {
                            // Already registered — only update reachability timestamp.
                            entry.last_confirmed = Instant::now();
                            entry.ifindex = neigh.ifindex;
                        } else {
                            info!("reconcile neigh: kernel orphan {} -> {:?}", hostname, neigh.inet);
                            try_register_neigh(neigh, hostname, &ip_str, &mut registered, &leases, &updater, max_ula_per_host, private_subnet_v6, probe_interval).await;
                        }
                    }

                    let stale_cutoff = Duration::from_secs(probe_interval.saturating_mul(2));
                    let now = Instant::now();
                    let to_remove: Vec<(String, String)> = registered
                        .iter()
                        .filter(|((_hostname, ip_str), entry)| {
                            !all_dump_ips.contains(ip_str.as_str())
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
                            warn!("reconcile neigh: evicted {} -> {}", entry.hostname, ip_str);
                            if !do_delete_dns(&entry.hostname, &inet, &updater).await {
                                registered.insert(key, entry);
                            }
                        }
                    }
                }
            }
            _ = option_tick(&mut gua_keepalive_timer) => {
                prune_gua_keepalive(&mut gua_keepalive, keepalive_gua_interval, keepalive_gua_per_host);
            }
            _ = lease_refresh_timer.tick() => {
                match tokio::task::spawn_blocking(|| op::get_lease().map_err(|e| e.to_string())).await {
                    Ok(Ok(new_leases)) => {
                        if new_leases.is_empty() && !leases.is_empty() {
                            warn!("DHCP lease table is empty (server restart?); keeping previous {} leases", leases.len());
                        } else {
                            // Merge: new ubus entries overwrite matching MACs,
                            // old entries for MACs not yet re-leased are preserved.
                            // This avoids losing mappings when the DHCP server
                            // restarts and only some clients have renewed.
                            let old_count = leases.len();
                            let new_count = new_leases.len();
                            for (mac, hostname) in &new_leases {
                                leases.insert(mac.clone(), hostname.clone());
                            }
                            // Remove MACs absent from ubus, registered, and AXFR.
                            // Guarded by probe_interval > 0: AXFR must be running
                            // for the DNS cross-reference to be meaningful.
                            if !new_leases.is_empty() && probe_interval > 0 {
                                leases.retain(|mac, hostname| {
                                    new_leases.contains_key(mac)
                                        || registered.iter().any(|((h, _), _)| h == hostname)
                                        || last_axfr_hostnames.contains(hostname)
                                });
                            }
                            debug!("refreshed DHCP leases: {} from ubus, {} total (had {})",
                                new_count, leases.len(), old_count);
                        }
                    }
                    Ok(Err(e)) => warn!("failed to refresh DHCP leases from ubus: {}", e),
                    Err(e) => warn!("DHCP lease refresh task panicked: {}", e),
                }
            }
        }
    }
    Ok(())
}
