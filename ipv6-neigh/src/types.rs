use std::fmt::Write;
use std::net::Ipv6Addr;
use std::time::Instant;
use netlink_packet_route::neighbour::{NeighbourAddress, NeighbourState};
use netlink_packet_route::route::RouteType;

pub(crate) const RTNLGRP_NEIGH: u32 = 3;
pub(crate) const DEFAULT_TTL: u32 = 60;

pub(crate) const fn nl_mgrp(group: u32) -> u32 {
    if group > 31 {
        panic!("use netlink_sys::Socket::add_membership() for this group");
    }
    if group == 0 { 0 } else { 1 << (group - 1) }
}

/// Format raw MAC bytes as colon-separated hex string, e.g. "44:23:7c:dc:b7:5b".
/// Shared across modules to avoid duplicate formatting logic.
pub(crate) fn format_mac(mac: &[u8]) -> String {
    let mut s = String::with_capacity(mac.len() * 3);
    for (i, byte) in mac.iter().enumerate() {
        if i > 0 { s.push(':'); }
        write!(s, "{:02x}", byte).unwrap();
    }
    s
}

#[derive(Debug)]
pub(crate) struct Neigh {
    pub(crate) ifindex: u32,
    pub(crate) state: NeighbourState,
    pub(crate) kind: RouteType,
    pub(crate) inet: NeighbourAddress,
    pub(crate) mac: String,
}

/// An IPv6 prefix (address + length) representing an active LAN prefix on the router interface.
pub(crate) struct LanPrefix {
    pub(crate) addr: Ipv6Addr,
    pub(crate) prefix_len: u8,
}

/// State tracked for each (mac, ip) pair that has been successfully registered in DNS.
pub(crate) struct RegisteredEntry {
    pub(crate) hostname: String,
    pub(crate) last_confirmed: Instant,
    pub(crate) ifindex: u32,
}

/// A GUA address tracked for keepalive probing only (not published to DNS).
pub(crate) struct GuaKeepaliveEntry {
    pub(crate) hostname: String,
    pub(crate) addr: Ipv6Addr,
    pub(crate) ifindex: u32,
    /// When this GUA was first observed -- used to select the "newest" address per host.
    pub(crate) first_seen: Instant,
    /// Last time this address was confirmed REACHABLE by the kernel.
    pub(crate) last_confirmed: Instant,
}
