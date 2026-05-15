use std::net::{IpAddr, SocketAddr};

use futures::stream::TryStreamExt;
use log::{info, warn};
use netlink_packet_route::address::{AddressAttribute, AddressFlags, AddressHeaderFlags, AddressMessage};
use rtnetlink::Handle;
use tokio::time::{self, Duration};

use crate::db::DnsUpdater;
use crate::types::{DEFAULT_TTL, LanPrefix};

/// Check whether an address message is deprecated (preferred lifetime expired).
pub(crate) fn is_addr_deprecated(msg: &AddressMessage) -> bool {
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
pub(crate) async fn get_active_lan_prefixes(
    handle: Handle,
    iface: &str,
    private_subnet_v6: bool,
) -> Vec<LanPrefix> {
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
pub(crate) async fn register_router_addresses(
    handle: Handle,
    iface: &str,
    hostname: &str,
    extra_alias: Option<&str>,
    updater: &DnsUpdater,
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
pub(crate) async fn wait_for_dns_server(addr: SocketAddr) {
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
