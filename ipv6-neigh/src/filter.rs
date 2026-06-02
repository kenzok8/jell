use std::net::{Ipv4Addr, Ipv6Addr};
use crate::types::LanPrefix;

/// Returns true if `addr` is link-local (fe80::/10).
/// Centralised here so every module uses the same check.
pub(crate) fn is_link_local_ipv6(addr: &Ipv6Addr) -> bool {
    (addr.segments()[0] & 0xffc0) == 0xfe80
}

/// Returns true if `addr` is ULA (fc00::/7).
pub(crate) fn if_ipv6_in_private_subnet(ip: &Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

/// Returns true if `addr` is a Global Unicast Address (2000::/3).
pub(crate) fn is_gua_ipv6(addr: &Ipv6Addr) -> bool {
    (addr.segments()[0] & 0xe000) == 0x2000
}

/// Returns true if this IPv6 address should be skipped for LAN purposes.
/// Skips link-local always; skips non-ULA when `private_subnet_v6` is set.
pub(crate) fn should_skip_v6(addr: &Ipv6Addr, private_subnet_v6: bool) -> bool {
    if is_link_local_ipv6(addr) {
        return true;
    }
    if private_subnet_v6 && !if_ipv6_in_private_subnet(addr) {
        return true;
    }
    false
}

pub(crate) fn if_ipv4_in_private_subnet(ip: &Ipv4Addr) -> bool {
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
pub(crate) fn ipv6_in_prefix(addr: Ipv6Addr, prefix: &LanPrefix) -> bool {
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
pub(crate) fn ipv6_passes_active_prefix(addr: Ipv6Addr, active_prefixes: &[LanPrefix]) -> bool {
    active_prefixes.is_empty() || active_prefixes.iter().any(|p| ipv6_in_prefix(addr, p))
}
