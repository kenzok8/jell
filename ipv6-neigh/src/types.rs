use netlink_packet_route::neighbour::{NeighbourAddress, NeighbourState};
use netlink_packet_route::route::RouteType;
use std::fmt::Write;
use std::net::Ipv6Addr;
use std::time::{Duration, Instant};

pub(crate) const RTNLGRP_NEIGH: u32 = 3;
pub(crate) const DEFAULT_TTL: u32 = 60;

pub(crate) const fn nl_mgrp(group: u32) -> u32 {
    if group > 31 {
        panic!("use netlink_sys::Socket::add_membership() for this group");
    }
    if group == 0 { 0 } else { 1 << (group - 1) }
}

/// Format raw MAC bytes as colon-separated hex string, e.g. "02:00:00:00:00:03".
/// Shared across modules to avoid duplicate formatting logic.
pub(crate) fn format_mac(mac: &[u8]) -> String {
    let mut s = String::with_capacity(mac.len() * 3);
    for (i, byte) in mac.iter().enumerate() {
        if i > 0 {
            s.push(':');
        }
        write!(s, "{:02x}", byte).unwrap();
    }
    s
}

/// Parse a colon-separated MAC address ("aa:bb:cc:dd:ee:ff", either case)
/// into its six raw bytes. Returns `None` for malformed input.
pub(crate) fn parse_mac(s: &str) -> Option<[u8; 6]> {
    let mut out = [0u8; 6];
    let mut parts = s.split(':');
    for byte in out.iter_mut() {
        let part = parts.next()?;
        if part.len() != 2 {
            return None;
        }
        *byte = u8::from_str_radix(part, 16).ok()?;
    }
    if parts.next().is_some() {
        return None;
    }
    Some(out)
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

/// State tracked for each (hostname, ip) pair that has been successfully registered in DNS.
///
/// Timestamp semantics:
/// - last_confirmed: updated only by netlink Reachable events (or the periodic
///   dump when the kernel reports Reachable) -- true reachability signal
/// - next_probe_due: computed by the scheduler; next time this entry should be probed
pub(crate) struct RegisteredEntry {
    pub(crate) hostname: String,
    /// MAC address from the neighbour entry; used to detect DHCP hostname renames.
    pub(crate) mac: String,
    pub(crate) last_confirmed: Instant,
    pub(crate) next_probe_due: Instant,
    pub(crate) ifindex: u32,
}

/// A GUA address tracked for keepalive probing only (not published to DNS).
pub(crate) struct GuaKeepaliveEntry {
    pub(crate) addr: Ipv6Addr,
    pub(crate) ifindex: u32,
    /// Last time this address was confirmed REACHABLE by the kernel or the
    /// periodic neighbour dump.
    pub(crate) last_confirmed: Instant,
    /// Next time this entry is due for probing (computed by scheduler).
    pub(crate) next_probe_due: Instant,
    /// Set once a failure has been logged for the current failure streak so
    /// the scheduler does not spam the log on every tick.
    pub(crate) warned: bool,
}

/// Compute a stable jitter offset for a (mac, ip) pair within the given interval window.
/// Uses a deterministic hash so the phase is preserved across daemon restarts.
///
/// interval_secs must be > 0; passing 0 will panic (the caller is expected to
/// guard this via initial_next_probe_due() which returns a far-future sentinel).
pub(crate) fn stable_jitter_offset(mac: &str, ip: &str, interval_secs: u64) -> Duration {
    assert!(
        interval_secs > 0,
        "stable_jitter_offset: interval_secs must be > 0"
    );
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    mac.hash(&mut hasher);
    ip.hash(&mut hasher);
    let offset_ms = hasher.finish() % interval_secs.saturating_mul(1000);
    Duration::from_millis(offset_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_mac_pads_and_joins() {
        assert_eq!(format_mac(&[0x02, 0x00, 0x00]), "02:00:00");
        assert_eq!(format_mac(&[0x00, 0x0a]), "00:0a");
        assert_eq!(format_mac(&[]), "");
    }

    #[test]
    fn parse_mac_lowercase() {
        assert_eq!(
            parse_mac("aa:bb:cc:dd:ee:ff"),
            Some([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff])
        );
    }

    #[test]
    fn parse_mac_uppercase() {
        assert_eq!(
            parse_mac("AA:BB:CC:DD:EE:FF"),
            Some([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff])
        );
        assert_eq!(
            parse_mac("02:00:00:00:00:03"),
            Some([0x02, 0x00, 0x00, 0x00, 0x00, 0x03])
        );
    }

    #[test]
    fn parse_mac_rejects_missing_segment() {
        assert_eq!(parse_mac("aa:bb:cc:dd:ee"), None);
        assert_eq!(parse_mac(""), None);
    }

    #[test]
    fn parse_mac_rejects_non_hex() {
        assert_eq!(parse_mac("aa:bb:cc:dd:ee:gg"), None);
        assert_eq!(parse_mac("aa:bb:cc:dd:ee:f"), None);
    }

    #[test]
    fn parse_mac_rejects_too_long() {
        assert_eq!(parse_mac("aa:bb:cc:dd:ee:ff:00"), None);
        assert_eq!(parse_mac("aa:bb:cc:dd:ee:fff"), None);
    }

    #[test]
    fn jitter_is_deterministic_and_in_range() {
        let a = stable_jitter_offset("aa:bb:cc:dd:ee:ff", "fd0f::1", 15);
        let b = stable_jitter_offset("aa:bb:cc:dd:ee:ff", "fd0f::1", 15);
        assert_eq!(a, b);
        assert!(a < Duration::from_secs(15));
    }

    #[test]
    fn jitter_differs_for_different_pairs() {
        let a = stable_jitter_offset("aa:bb:cc:dd:ee:ff", "fd0f::1", 3600);
        let b = stable_jitter_offset("aa:bb:cc:dd:ee:fe", "fd0f::1", 3600);
        assert_ne!(a, b);
    }
}
