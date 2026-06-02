use std::net::{IpAddr, SocketAddr};
use futures::stream::TryStreamExt;
use log::{info, warn};
use netlink_packet_route::address::{AddressAttribute, AddressFlags, AddressHeaderFlags, AddressMessage};
use rtnetlink::Handle;
use tokio::time::{self, Duration};

use crate::db::DnsUpdater;
use crate::filter::should_skip_v6;
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

/// Look up the interface index and collect all address messages for `iface`.
/// Shared between `get_active_lan_prefixes` and `register_router_addresses`
/// to avoid duplicating the link-lookup + address-enumeration boilerplate.
async fn get_iface_addresses(
    handle: Handle,
    iface: &str,
) -> Result<(u32, Vec<AddressMessage>), String> {
    let mut links = handle.link().get().match_name(iface.to_owned()).execute();
    let link = match links.try_next().await {
        Ok(Some(l)) => l,
        Ok(None) => return Err(format!("interface {} not found", iface)),
        Err(e) => return Err(format!("failed to find interface {}: {}", iface, e)),
    };
    let ifindex = link.header.index;
    let mut addr_stream = handle.address().get().set_link_index_filter(ifindex).execute();
    let mut msgs = Vec::new();
    while let Ok(Some(msg)) = addr_stream.try_next().await {
        msgs.push(msg);
    }
    Ok((ifindex, msgs))
}

/// Enumerate non-link-local IPv6 prefixes currently assigned to `iface`.
/// Used during startup to filter out neighbour entries from expired/old prefixes.
pub(crate) async fn get_active_lan_prefixes(
    handle: Handle,
    iface: &str,
    private_subnet_v6: bool,
) -> Vec<LanPrefix> {
    let (_ifindex, msgs) = match get_iface_addresses(handle, iface).await {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let mut prefixes = Vec::new();
    for msg in &msgs {
        let prefix_len = msg.header.prefix_len;
        if is_addr_deprecated(msg) {
            continue;
        }
        for attr in &msg.attributes {
            if let AddressAttribute::Address(IpAddr::V6(addr)) = attr {
                if should_skip_v6(addr, private_subnet_v6) {
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
    let (_ifindex, msgs) = match get_iface_addresses(handle, iface).await {
        Ok(v) => v,
        Err(e) => {
            warn!("{}, skipping router address registration", e);
            return;
        }
    };

    for msg in &msgs {
        if is_addr_deprecated(msg) {
            continue;
        }
        for attr in &msg.attributes {
            let ip = match attr {
                AddressAttribute::Address(ip) => ip,
                _ => continue,
            };
            match ip {
                IpAddr::V6(addr) => {
                    if should_skip_v6(addr, private_subnet_v6) {
                        continue;
                    }
                    for name in std::iter::once(hostname).chain(extra_alias) {
                        match updater.upsert_aaaa(name, *addr, DEFAULT_TTL).await {
                            Ok(()) => info!("registered router {} AAAA {}", name, addr),
                            Err(e) => warn!("failed to register router AAAA {} for {}: {}", addr, name, e),
                        }
                    }
                    if let Err(e) = updater.upsert_ptr(IpAddr::V6(*addr), hostname, DEFAULT_TTL).await {
                        warn!("failed to register router PTR for {}: {}", addr, e);
                    }
                }
                IpAddr::V4(addr) => {
                    for name in std::iter::once(hostname).chain(extra_alias) {
                        match updater.upsert_a(name, *addr, DEFAULT_TTL).await {
                            Ok(()) => info!("registered router {} A {}", name, addr),
                            Err(e) => warn!("failed to register router A {} for {}: {}", addr, name, e),
                        }
                    }
                    if let Err(e) = updater.upsert_ptr(IpAddr::V4(*addr), hostname, DEFAULT_TTL).await {
                        warn!("failed to register router PTR for {}: {}", addr, e);
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
