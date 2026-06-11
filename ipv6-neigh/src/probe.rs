use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr};
use std::num::NonZeroU32;
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::{Duration, Instant};

use socket2::{Domain, Protocol, SockAddr, Socket, Type};

use crate::types::GuaKeepaliveEntry;

/// Maximum registered (ULA/DNS-published) probes per 1-second tick.
pub(crate) const MAX_REGISTERED_PROBES_PER_TICK: usize = 1;
/// Maximum GUA keepalive probes per 1-second tick.
pub(crate) const MAX_GUA_PROBES_PER_TICK: usize = 1;

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
/// Uses a process-specific ICMP id and an atomic sequence counter
/// so that Echo Replies can be correlated back to this daemon if reply-matching
/// is added in the future.
///
/// **Serial-use only.**  `send_icmpv6_echo` / `send_icmpv4_echo` mutate the
/// socket's bound-device state via `bind_device_by_index_*()` before each
/// `send_to()`.  Concurrent sends from multiple tasks would race on this shared
/// socket state.  The current single-threaded `select!` loop honours this
/// constraint; if the daemon is ever parallelized, wrap `Prober` in a `Mutex`
/// or switch to per-ifindex sockets.
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
        // Sizing up the receive buffer reduces the chance of dropping echo replies
        // during probe bursts.  Best-effort: capped by net.core.rmem_max on Linux.
        let _ = v6.set_recv_buffer_size(1024 * 1024);

        let v4 = Socket::new(Domain::IPV4, Type::RAW, Some(Protocol::ICMPV4))?;
        v4.set_nonblocking(true)?;
        let _ = v4.set_recv_buffer_size(1024 * 1024);

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

    /// Drain pending ICMP Echo Replies from the raw socket receive queues.
    /// Call this periodically (e.g. on each scheduler tick) to prevent kernel
    /// receive-buffer accumulation from unread replies.
    pub fn drain_replies(&self, max: usize) {
        // 2048-byte buffer is large enough for any ICMP payload plus possible IP headers.
        let mut buf = [std::mem::MaybeUninit::<u8>::uninit(); 2048];
        for _ in 0..max {
            match self.v6.recv_from(&mut buf) {
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
        for _ in 0..max {
            match self.v4.recv_from(&mut buf) {
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
    }
}

/// Run one tick of the per-IP stable-jitter probe scheduler.
///
/// Iterates both registered (ULA/DNS-published) and GUA-keepalive entries,
/// sending at most `MAX_REGISTERED_PROBES_PER_TICK` and `MAX_GUA_PROBES_PER_TICK`
/// probes respectively to entries whose `next_probe_due` has elapsed.
/// After sending, `next_probe_due` is advanced by the entry's interval
/// (preserving the stable phase where possible).
///
/// Returns the total number of probes sent (registered + GUA).
pub(crate) fn run_probe_scheduler(
    prober: &Prober,
    registered: &mut HashMap<(String, String), crate::types::RegisteredEntry>,
    gua_keepalive: &mut HashMap<String, Vec<GuaKeepaliveEntry>>,
    probe_interval: u64,
    keepalive_interval: u64,
    keepalive_enabled: bool,
    keepalive_gua_per_host: usize,
) -> usize {
    let now = Instant::now();
    let mut sent_total = 0;

    // --- registered (ULA / DNS-published) entries ---
    // Sort due entries by next_probe_due so the most urgent are served
    // first, avoiding HashMap iteration-order starvation.
    if probe_interval > 0 {
        let mut due: Vec<_> = registered
            .iter_mut()
            .filter(|(_, e)| e.next_probe_due <= now)
            .collect();
        due.sort_by_key(|(_, e)| e.next_probe_due);
        for ((_hostname, ip_str), entry) in due.into_iter().take(MAX_REGISTERED_PROBES_PER_TICK) {
            let ok = match ip_str.parse::<Ipv6Addr>() {
                Ok(addr) => prober.send_icmpv6_echo(addr, entry.ifindex).is_ok(),
                Err(_) => match ip_str.parse::<Ipv4Addr>() {
                    Ok(addr) => prober.send_icmpv4_echo(addr, entry.ifindex).is_ok(),
                    Err(_) => false,
                },
            };
            if ok {
                entry.last_probe_sent = now;
                // Preserve stable phase: advance from original due time.
                // If the entry is severely overdue (e.g. daemon blocked),
                // reset to now to avoid a long catch-up while loop.
                let interval = Duration::from_secs(probe_interval);
                if now.duration_since(entry.next_probe_due) > interval.saturating_mul(4) {
                    entry.next_probe_due = now + interval;
                } else {
                    while entry.next_probe_due <= now {
                        entry.next_probe_due += interval;
                    }
                }
                sent_total += 1;
            } else {
                // Send failed — back off briefly so one unreachable entry
                // doesn't burn a probe slot every tick.
                entry.next_probe_due = now + Duration::from_secs(5);
            }
        }
    }

    // --- GUA keepalive entries ---
    // Collect due entries across hosts, sort by urgency to avoid starvation.
    if keepalive_enabled && keepalive_interval > 0 {
        let mut due_gua: Vec<(String, usize, Instant)> = Vec::new();
        for (mac, entries) in gua_keepalive.iter() {
            for (i, entry) in entries.iter().enumerate().take(keepalive_gua_per_host) {
                if entry.next_probe_due <= now {
                    due_gua.push((mac.clone(), i, entry.next_probe_due));
                }
            }
        }
        due_gua.sort_by_key(|(_, _, t)| *t);
        due_gua.truncate(MAX_GUA_PROBES_PER_TICK);

        for (mac, idx, _) in &due_gua {
            if let Some(entries) = gua_keepalive.get_mut(mac.as_str()) {
                if let Some(entry) = entries.get_mut(*idx) {
                    if prober.send_icmpv6_echo(entry.addr, entry.ifindex).is_ok() {
                        entry.last_probe_sent = now;
                        let interval = Duration::from_secs(keepalive_interval);
                        if now.duration_since(entry.next_probe_due) > interval.saturating_mul(4) {
                            entry.next_probe_due = now + interval;
                        } else {
                            while entry.next_probe_due <= now {
                                entry.next_probe_due += interval;
                            }
                        }
                        sent_total += 1;
                    } else {
                        // Send failed — back off briefly.
                        entry.next_probe_due = now + Duration::from_secs(5);
                    }
                }
            }
        }
    }

    sent_total
}

/// Remove GUA keepalive entries that haven't been confirmed REACHABLE within 3x the
/// keepalive interval, and drop excess entries beyond `per_host` (oldest first).
///
/// This runs on a timer tick, not the per-IP probe scheduler — it does batch cleanup
/// across all hosts at once.
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
        // Keep only the newest `per_host` entries (first_seen desc; maintained by insert order).
        if entries.len() > per_host {
            entries.truncate(per_host);
        }
        !entries.is_empty()
    });
}
