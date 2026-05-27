use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr};
use std::num::NonZeroU32;
use std::time::Instant;

use log::debug;
use socket2::{Domain, Protocol, SockAddr, Socket, Type};
use tokio::time::Duration;

use crate::types::{GuaKeepaliveEntry, RegisteredEntry};

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

pub(crate) fn send_icmpv6_echo(addr: Ipv6Addr, ifindex: u32) -> std::io::Result<()> {
    let socket = Socket::new(Domain::IPV6, Type::RAW, Some(Protocol::ICMPV6))?;
    socket.set_nonblocking(true)?;
    // Bind outgoing packet to the specific interface via IPV6_UNICAST_IF so the
    // kernel NUD state machine updates the correct neighbour entry.
    set_ipv6_unicast_if(&socket, ifindex)?;
    // ICMPv6 Echo Request: type=128, code=0, checksum=0 (kernel computes for RAW ICMPV6), id=0, seq=1
    let packet: [u8; 8] = [128, 0, 0, 0, 0, 0, 0, 1];
    let dest = SockAddr::from(std::net::SocketAddrV6::new(addr, 0, 0, 0));
    socket.send_to(&packet, &dest)?;
    Ok(())
}

pub(crate) fn send_icmpv4_echo(addr: Ipv4Addr, ifindex: u32) -> std::io::Result<()> {
    let socket = Socket::new(Domain::IPV4, Type::RAW, Some(Protocol::ICMPV4))?;
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

/// Send ICMPv6/ICMPv4 Echo Requests to all registered neighbours that haven't been
/// confirmed recently.  This forces the kernel NUD state machine to verify reachability,
/// generating NewNeighbour events with the resulting state (Reachable or Failed).
pub(crate) async fn probe_registered_neighbours(
    registered: &HashMap<(String, String), RegisteredEntry>,
) {
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

/// Send ICMPv6 Echo Requests to the newest GUA addresses per host for NUD keepalive.
/// Only the top `per_host` addresses (by most-recently-seen) are probed per MAC.
/// This does NOT publish any records to DNS.
pub(crate) fn probe_gua_keepalive(
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
pub(crate) fn prune_gua_keepalive(
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
