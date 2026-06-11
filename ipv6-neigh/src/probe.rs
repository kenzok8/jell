use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr};
use std::num::NonZeroU32;
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::{Duration, Instant};

use socket2::{Domain, Protocol, SockAddr, Socket, Type};

use crate::types::GuaKeepaliveEntry;

/// Maximum ICMP probes the scheduler may send per 1-second tick.
pub(crate) const MAX_PROBES_PER_TICK: usize = 2;

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

/// Reusable ICMP probe sockets.  Created once at startup and shared across all
/// probe call-sites, avoiding the overhead of creating and destroying a raw
/// socket for every single probe packet.
///
/// Uses a process-specific ICMP id and an atomic sequence counter (suggestion #6)
/// so that Echo Replies can be correlated back to this daemon if reply-matching
/// is added in the future.
pub(crate) struct Prober {
    v6: Socket,
    v4: Socket,
    icmp_id: u16,
    icmp_seq: AtomicU16,
}

impl Prober {
    pub fn new() -> std::io::Result<Self> {
        let v6 = Socket::new(Domain::IPV6, Type::RAW, Some(Protocol::ICMPV6))?;
        v6.set_nonblocking(true)?;

        let v4 = Socket::new(Domain::IPV4, Type::RAW, Some(Protocol::ICMPV4))?;
        v4.set_nonblocking(true)?;

        let icmp_id = (std::process::id() & 0xFFFF) as u16;

        Ok(Self {
            v6,
            v4,
            icmp_id,
            icmp_seq: AtomicU16::new(1),
        })
    }

    /// Send an ICMPv6 Echo Request. Returns the sequence number used.
    pub fn send_icmpv6_echo(&self, addr: Ipv6Addr, ifindex: u32) -> std::io::Result<u16> {
        // Re-bind outgoing interface before each send (lightweight setsockopt).
        self.v6.bind_device_by_index_v6(NonZeroU32::new(ifindex))?;

        let seq = self.icmp_seq.fetch_add(1, Ordering::Relaxed);
        let id_bytes = self.icmp_id.to_be_bytes();
        let seq_bytes = seq.to_be_bytes();

        // ICMPv6 Echo Request: type=128, code=0, checksum=0 (kernel computes)
        let packet: [u8; 8] = [
            128,
            0,
            0,
            0,
            id_bytes[0],
            id_bytes[1],
            seq_bytes[0],
            seq_bytes[1],
        ];
        let dest = SockAddr::from(std::net::SocketAddrV6::new(addr, 0, 0, 0));
        self.v6.send_to(&packet, &dest)?;
        Ok(seq)
    }

    /// Send an ICMPv4 Echo Request. Returns the sequence number used.
    pub fn send_icmpv4_echo(&self, addr: Ipv4Addr, ifindex: u32) -> std::io::Result<u16> {
        // Re-bind outgoing interface before each send (lightweight setsockopt).
        self.v4.bind_device_by_index_v4(NonZeroU32::new(ifindex))?;

        let seq = self.icmp_seq.fetch_add(1, Ordering::Relaxed);
        let id_bytes = self.icmp_id.to_be_bytes();
        let seq_bytes = seq.to_be_bytes();

        // ICMPv4 Echo Request: type=8, code=0
        let mut packet: [u8; 8] = [
            8,
            0,
            0,
            0,
            id_bytes[0],
            id_bytes[1],
            seq_bytes[0],
            seq_bytes[1],
        ];
        compute_icmpv4_checksum(&mut packet);
        let dest = SockAddr::from(std::net::SocketAddrV4::new(addr, 0));
        self.v4.send_to(&packet, &dest)?;
        Ok(seq)
    }

    /// Drain pending ICMP Echo Replies from the raw socket receive queues
    /// (suggestion #5).  Call this periodically (e.g. on each scheduler tick)
    /// to prevent kernel receive-buffer accumulation from unread replies.
    pub fn drain_replies(&self, max: usize) {
        use std::mem::MaybeUninit;
        // SAFETY: we never read from buf; recv_from writes into it and we
        // discard the contents.  The uninit array is sound here.
        let mut buf: [MaybeUninit<u8>; 256] = unsafe { MaybeUninit::uninit().assume_init() };
        for _ in 0..max {
            match self.v6.recv_from(&mut buf) {
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(_) => break,
            }
        }
        for _ in 0..max {
            match self.v4.recv_from(&mut buf) {
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(_) => break,
            }
        }
    }
}

// ---- scheduler ----

/// Run one tick of the per-IP stable-jitter probe scheduler.
///
/// Iterates both registered (ULA/DNS-published) and GUA-keepalive entries,
/// sending at most `MAX_PROBES_PER_TICK` probes to entries whose
/// `next_probe_due` has elapsed.  After sending, `next_probe_due` is advanced
/// by the entry's interval to preserve the stable phase.
///
/// Returns the number of probes actually sent.
pub(crate) fn run_probe_scheduler(
    prober: &Prober,
    registered: &mut HashMap<(String, String), crate::types::RegisteredEntry>,
    gua_keepalive: &mut HashMap<String, Vec<GuaKeepaliveEntry>>,
    probe_interval: u64,
    keepalive_interval: u64,
    keepalive_enabled: bool,
) -> usize {
    let now = Instant::now();
    let mut sent = 0;

    // --- registered (ULA / DNS-published) entries ---
    if probe_interval > 0 {
        for ((_hostname, ip_str), entry) in registered.iter_mut() {
            if sent >= MAX_PROBES_PER_TICK {
                break;
            }
            if entry.next_probe_due > now {
                continue;
            }
            let ok = match ip_str.parse::<Ipv6Addr>() {
                Ok(addr) => prober.send_icmpv6_echo(addr, entry.ifindex).is_ok(),
                Err(_) => match ip_str.parse::<Ipv4Addr>() {
                    Ok(addr) => prober.send_icmpv4_echo(addr, entry.ifindex).is_ok(),
                    Err(_) => false,
                },
            };
            if ok {
                entry.last_probe_sent = now;
                entry.next_probe_due = now + Duration::from_secs(probe_interval);
                sent += 1;
            } else {
                // Send failed — back off briefly so one unreachable entry
                // doesn't burn a probe slot every tick.
                entry.next_probe_due = now + Duration::from_secs(5);
            }
        }
    }

    // --- GUA keepalive entries ---
    if keepalive_enabled && keepalive_interval > 0 {
        for (_mac, entries) in gua_keepalive.iter_mut() {
            if sent >= MAX_PROBES_PER_TICK {
                break;
            }
            for entry in entries.iter_mut() {
                if sent >= MAX_PROBES_PER_TICK {
                    break;
                }
                if entry.next_probe_due > now {
                    continue;
                }
                if prober.send_icmpv6_echo(entry.addr, entry.ifindex).is_ok() {
                    entry.last_probe_sent = now;
                    entry.next_probe_due = now + Duration::from_secs(keepalive_interval);
                    sent += 1;
                } else {
                    // Send failed — back off briefly.
                    entry.next_probe_due = now + Duration::from_secs(5);
                }
            }
        }
    }

    sent
}

// ---- pruning (still timer-driven, not scheduler-driven) ----

/// Remove GUA keepalive entries that haven't been confirmed REACHABLE within 3x the
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
            entries.sort_by_key(|b| std::cmp::Reverse(b.first_seen));
            entries.truncate(per_host);
        }
        !entries.is_empty()
    });
}
