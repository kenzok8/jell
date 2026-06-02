use std::collections::HashMap;
use std::net::{IpAddr, Ipv6Addr};
use std::time::Instant;

use log::{debug, error, info, warn};
use netlink_packet_route::neighbour::NeighbourAddress;

use crate::db::DnsUpdater;
use crate::filter::{if_ipv4_in_private_subnet, if_ipv6_in_private_subnet, ipv6_in_prefix, is_gua_ipv6};
use crate::probe::Prober;
use crate::types::{LanPrefix, Neigh, RegisteredEntry, DEFAULT_TTL};

pub(crate) async fn process_new_neigh(
    neigh: &Neigh,
    updater: &DnsUpdater,
    leases: &HashMap<String, String>,
    private_subnet_v6: bool,
) -> bool {
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
            let ip = match &neigh.inet {
                NeighbourAddress::Inet6(addr) => IpAddr::V6(*addr),
                NeighbourAddress::Inet(addr)  => IpAddr::V4(*addr),
                _ => return true,
            };
            if let Err(e) = updater.upsert_ptr(ip, hostname, DEFAULT_TTL).await {
                warn!("PTR update failed for {} ({}): {}", hostname, ip, e);
            }
            true
        }
        Err(e) => {
            error!("DNS update failed for {}: {}", hostname, e);
            false
        }
    }
}

/// Delete a specific DNS record directly by hostname and address.
pub(crate) async fn do_delete_dns(
    hostname: &str,
    inet: &NeighbourAddress,
    updater: &DnsUpdater,
) -> bool {
    let result = match inet {
        NeighbourAddress::Inet6(addr) => updater.delete_aaaa(hostname, *addr).await,
        NeighbourAddress::Inet(addr) => updater.delete_a(hostname, *addr).await,
        _ => return true,
    };

    match result {
        Ok(()) => {
            info!("DNS update: removed {} -> {:?}", hostname, inet);
            let ip = match inet {
                NeighbourAddress::Inet6(addr) => IpAddr::V6(*addr),
                NeighbourAddress::Inet(addr)  => IpAddr::V4(*addr),
                _ => return true,
            };
            if let Err(e) = updater.delete_ptr(ip).await {
                warn!("PTR delete failed for {} ({}): {}", hostname, ip, e);
            }
            true
        }
        Err(e) => {
            error!("DNS delete failed for {}: {}", hostname, e);
            false
        }
    }
}

/// Enforce the per-host ULA AAAA limit.  If `host` already has `max` or more ULA AAAA
/// records in `registered`, remove the oldest (by `last_confirmed`) and delete from DNS.
/// Returns the number of existing ULA AAAA records for this host (after pruning).
pub(crate) async fn prune_ula_for_host(
    host: &str,
    max: usize,
    registered: &mut HashMap<(String, String), RegisteredEntry>,
    updater: &DnsUpdater,
) -> usize {
    // Collect existing ULA AAAA keys for this host.
    let mut ula_keys: Vec<((String, String), Instant)> = registered
        .iter()
        .filter(|((h, ip_str), _)| {
            h == host && ip_str.parse::<Ipv6Addr>().map_or(false, |a| if_ipv6_in_private_subnet(&a))
        })
        .map(|(k, e)| (k.clone(), e.last_confirmed))
        .collect();

    let initial_count = ula_keys.len();
    if initial_count < max {
        return initial_count;
    }

    // Sort oldest first (by last_confirmed asc).
    ula_keys.sort_by_key(|(_, ts)| *ts);

    // Remove excess (keep the newest `max - 1` so there's room for the new one).
    let to_remove = initial_count - (max.saturating_sub(1));
    let mut actually_removed = 0;
    for (key, _) in ula_keys.into_iter().take(to_remove) {
        if let Some(entry) = registered.remove(&key) {
            let addr: Ipv6Addr = key.1.parse().unwrap();
            let inet = NeighbourAddress::Inet6(addr);
            do_delete_dns(&entry.hostname, &inet, updater).await;
            info!("ULA pruning: removed oldest {} -> {} for host {}", entry.hostname, key.1, host);
            actually_removed += 1;
        }
    }

    // Return count after pruning (computed, no second scan needed).
    initial_count - actually_removed
}

/// Reconcile the in-memory `registered` map against the live DNS zone obtained via AXFR.
///
/// Two corrections are made on each call:
/// 1. **DNS orphans** -- records present in DNS but absent from `registered`.
///    These are either stale leftovers from a previous run or records from a prefix that
///    is no longer active.  Records that fail prefix/subnet filtering are deleted from DNS
///    immediately; records that pass filtering are probed with ICMP so the kernel NUD
///    state machine can confirm reachability and re-populate `registered` via the event loop.
/// 2. **Registered orphans** -- entries in `registered` that are missing from DNS (e.g.
///    because hickory-dns restarted and lost its in-memory state).  These are re-pushed
///    via DNS UPDATE so the zone stays consistent.
pub(crate) async fn reconcile_dns(
    updater: &DnsUpdater,
    registered: &mut HashMap<(String, String), RegisteredEntry>,
    leases: &HashMap<String, String>,
    active_prefixes: &[LanPrefix],
    private_subnet_v4: bool,
    private_subnet_v6: bool,
    prober: &Prober,
) {
    use std::collections::{HashMap as Map, HashSet};

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
            // Stale record (wrong prefix / subnet) -- remove from DNS.
            let result = match ip {
                IpAddr::V6(addr) => updater.delete_aaaa(hostname, *addr).await,
                IpAddr::V4(addr) => updater.delete_a(hostname, *addr).await,
            };
            match result {
                Ok(()) => {
                    info!("reconcile: deleted stale DNS {} -> {}", hostname, ip);
                    if let Err(e) = updater.delete_ptr(*ip).await {
                        warn!("reconcile: PTR delete failed for stale {} {}: {}", hostname, ip, e);
                    }
                }
                Err(e) => warn!("reconcile: failed to delete stale DNS {} {}: {}", hostname, ip, e),
            }
        }
    }

    // Registered ip set for quick lookup.
    let registered_ips: HashSet<&str> =
        registered.keys().map(|(_, ip)| ip.as_str()).collect();

    // --- DNS orphans (in DNS but not in registered) ---
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
            Ok(()) => {
                info!("reconcile: deleted orphan DNS {} -> {}", hostname, ip_str);
                if let Ok(ip) = ip_str.parse::<IpAddr>() {
                    if let Err(e) = updater.delete_ptr(ip).await {
                        warn!("reconcile: PTR delete failed for orphan {} {}: {}", hostname, ip_str, e);
                    }
                }
            }
            Err(e) => warn!("reconcile: failed to delete orphan {} {}: {}", hostname, ip_str, e),
        }

        // Probe so alive devices trigger a REACHABLE event and re-register.
        match ip_str.parse::<IpAddr>() {
            Ok(IpAddr::V6(addr)) => {
                if let Err(e) = prober.send_icmpv6_echo(addr, 0) {
                    debug!("reconcile: probe failed for {}: {}", addr, e);
                }
            }
            Ok(IpAddr::V4(addr)) => {
                if let Err(e) = prober.send_icmpv4_echo(addr, 0) {
                    debug!("reconcile: probe failed for {}: {}", addr, e);
                }
            }
            _ => {}
        }
    }

    // --- Registered orphans (in registered but not in DNS) ---
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
                if let Ok(ip) = ip_str.parse::<IpAddr>() {
                    if let Err(e) = updater.upsert_ptr(ip, hostname, DEFAULT_TTL).await {
                        warn!("reconcile: PTR re-push failed for {} {}: {}", hostname, ip_str, e);
                    }
                }
                entry.last_confirmed = Instant::now();
            }
            Err(e) => warn!("reconcile: failed to re-push {} {}: {}", hostname, ip_str, e),
        }
    }
}
