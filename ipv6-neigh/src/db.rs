use std::cell::RefCell;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use hickory_proto::op::{Message, Query, ResponseCode, update_message};
use hickory_proto::rr::{Name, RData, Record, RecordSet, RecordType, TSigner};
use hickory_proto::rr::rdata::PTR as PtrRData;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::filter::if_ipv6_in_private_subnet;

const TCP_TIMEOUT: Duration = Duration::from_secs(5);

fn check_response(response: &Message, allowed: &[ResponseCode]) -> Result<(), Box<dyn std::error::Error>> {
    let code = response.metadata.response_code;
    if code == ResponseCode::NoError || allowed.contains(&code) {
        Ok(())
    } else {
        Err(format!("DNS server returned {code:?}").into())
    }
}

/// DNS dynamic update client that sends RFC 2136 updates over TCP to the hickory-dns server.
/// TCP connections are reused across calls to reduce syscall overhead.
///
/// Uses `RefCell` for interior mutability — safe because the entire program runs on a
/// single-threaded tokio runtime (`current_thread`).
pub(crate) struct DnsUpdater {
    server_addr: SocketAddr,
    zone: Name,
    signer: TSigner,
    /// (network as u32, prefix_len, reverse zone name) for IPv4 PTR
    ipv4_ptr_zones: Vec<(u32, u8, Name)>,
    /// Reverse zone for ULA IPv6 (d.f.ip6.arpa)
    ula_ptr_zone: Option<Name>,
    /// Reusable TCP connection (lazy connect + auto-reconnect on failure).
    conn: RefCell<Option<TcpStream>>,
}

impl DnsUpdater {
    pub fn new(server_addr: SocketAddr, zone: Name, signer: TSigner) -> Self {
        Self {
            server_addr,
            zone,
            signer,
            ipv4_ptr_zones: vec![],
            ula_ptr_zone: None,
            conn: RefCell::new(None),
        }
    }

    /// Configure reverse PTR zones.
    /// `ipv4_subnets`: list of (network_addr, prefix_len); /8, /16, /24 boundaries supported.
    /// `ula`: if true, enables ULA PTR via `d.f.ip6.arpa`.
    pub fn with_ptr_zones(mut self, ipv4_subnets: &[(Ipv4Addr, u8)], ula: bool) -> Self {
        self.ipv4_ptr_zones = ipv4_subnets
            .iter()
            .map(|(net, prefix_len)| (u32::from(*net), *prefix_len, ipv4_zone_name(*net, *prefix_len)))
            .collect();
        if ula {
            self.ula_ptr_zone = Some(Name::from_ascii("d.f.ip6.arpa.").expect("always valid"));
        }
        self
    }

    // -- generic helpers (eliminates upsert_a/upsert_aaaa and delete_a/delete_aaaa duplication) --

    /// Create-or-append a record (A or AAAA).  Tries CREATE first; on YXRRSet
    /// (name already exists) falls back to APPEND so multiple addresses per host work.
    async fn upsert_record(
        &self,
        hostname: &str,
        rtype: RecordType,
        rdata: RData,
        ttl: u32,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let name = Name::from_ascii(hostname)?.append_domain(&self.zone)?;
        let mut rrset = RecordSet::with_ttl(name.clone(), rtype, ttl);
        rrset.add_rdata(rdata.clone());
        let msg = update_message::create(rrset, self.zone.clone(), false);
        let response = self.send_tcp(msg).await?;
        if response.metadata.response_code == ResponseCode::YXRRSet {
            let mut rrset = RecordSet::with_ttl(name, rtype, ttl);
            rrset.add_rdata(rdata);
            let msg = update_message::append(rrset, self.zone.clone(), false, false);
            let response = self.send_tcp(msg).await?;
            check_response(&response, &[])?;
        } else {
            check_response(&response, &[])?;
        }
        Ok(())
    }

    /// Delete a single record by rdata (A or AAAA).
    async fn delete_record(
        &self,
        hostname: &str,
        rtype: RecordType,
        rdata: RData,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let name = Name::from_ascii(hostname)?.append_domain(&self.zone)?;
        let mut rrset = RecordSet::new(name, rtype, 0);
        rrset.add_rdata(rdata);
        let msg = update_message::delete_by_rdata(rrset, self.zone.clone(), false);
        let response = self.send_tcp(msg).await?;
        check_response(&response, &[])?;
        Ok(())
    }

    // -- public A / AAAA wrappers --

    /// Create or append a AAAA record.
    pub async fn upsert_aaaa(&self, hostname: &str, addr: Ipv6Addr, ttl: u32) -> Result<(), Box<dyn std::error::Error>> {
        self.upsert_record(hostname, RecordType::AAAA, RData::AAAA(addr.into()), ttl).await
    }

    /// Create or append an A record.
    pub async fn upsert_a(&self, hostname: &str, addr: Ipv4Addr, ttl: u32) -> Result<(), Box<dyn std::error::Error>> {
        self.upsert_record(hostname, RecordType::A, RData::A(addr.into()), ttl).await
    }

    /// Delete a specific AAAA record.
    pub async fn delete_aaaa(&self, hostname: &str, addr: Ipv6Addr) -> Result<(), Box<dyn std::error::Error>> {
        self.delete_record(hostname, RecordType::AAAA, RData::AAAA(addr.into())).await
    }

    /// Delete a specific A record.
    pub async fn delete_a(&self, hostname: &str, addr: Ipv4Addr) -> Result<(), Box<dyn std::error::Error>> {
        self.delete_record(hostname, RecordType::A, RData::A(addr.into())).await
    }

    // -- PTR --

    /// Upsert a PTR record. Silently skips IPs with no configured reverse zone.
    pub async fn upsert_ptr(
        &self,
        addr: IpAddr,
        hostname: &str,
        ttl: u32,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (ptr_name, rev_zone) = match addr {
            IpAddr::V4(ip) => {
                let Some(zone) = self.find_ipv4_ptr_zone(ip).cloned() else { return Ok(()) };
                (ipv4_ptr_name(ip), zone)
            }
            IpAddr::V6(ip) if if_ipv6_in_private_subnet(&ip) => {
                let Some(zone) = self.ula_ptr_zone.clone() else { return Ok(()) };
                (ipv6_ptr_name(ip), zone)
            }
            _ => return Ok(()),
        };
        let target = Name::from_ascii(hostname)?.append_domain(&self.zone)?;
        // Delete any existing PTR rrset first (replace semantics: one PTR per IP).
        let del_record = Record::update0(ptr_name.clone(), 0, RecordType::PTR);
        let del_msg = update_message::delete_rrset(del_record, rev_zone.clone(), false);
        let del_resp = self.send_tcp(del_msg).await?;
        check_response(&del_resp, &[])?;
        // Add the new PTR.
        let mut rrset = RecordSet::with_ttl(ptr_name, RecordType::PTR, ttl);
        rrset.add_rdata(RData::PTR(PtrRData(target)));
        let msg = update_message::append(rrset, rev_zone, false, false);
        let response = self.send_tcp(msg).await?;
        check_response(&response, &[])?;
        Ok(())
    }

    /// Delete a PTR record. Silently skips IPs with no configured reverse zone.
    pub async fn delete_ptr(
        &self,
        addr: IpAddr,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (ptr_name, rev_zone) = match addr {
            IpAddr::V4(ip) => {
                let Some(zone) = self.find_ipv4_ptr_zone(ip).cloned() else { return Ok(()) };
                (ipv4_ptr_name(ip), zone)
            }
            IpAddr::V6(ip) if if_ipv6_in_private_subnet(&ip) => {
                let Some(zone) = self.ula_ptr_zone.clone() else { return Ok(()) };
                (ipv6_ptr_name(ip), zone)
            }
            _ => return Ok(()),
        };
        let record = Record::update0(ptr_name, 0, RecordType::PTR);
        let msg = update_message::delete_rrset(record, rev_zone, false);
        let response = self.send_tcp(msg).await?;
        check_response(&response, &[])?;
        Ok(())
    }

    fn find_ipv4_ptr_zone(&self, addr: Ipv4Addr) -> Option<&Name> {
        let addr_u32 = u32::from(addr);
        self.ipv4_ptr_zones
            .iter()
            .filter(|(net, prefix_len, _)| {
                if *prefix_len == 0 { return true; }
                let shift = 32u8.saturating_sub(*prefix_len);
                (addr_u32 >> shift) == (net >> shift)
            })
            .max_by_key(|(_, prefix_len, _)| *prefix_len)
            .map(|(_, _, name)| name)
    }

    // -- TCP transport (connection-reusing) --

    /// Send a DNS message over TCP and read the response.
    /// Reuses an existing connection when possible; reconnects automatically on failure.
    async fn send_tcp(&self, mut msg: Message) -> Result<Message, Box<dyn std::error::Error>> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        msg.finalize(&self.signer, now)?;
        let bytes = msg.to_vec()?;
        let len_bytes = u16::try_from(bytes.len())?.to_be_bytes();

        // Try the existing connection first.
        // Take it out of the RefCell so we don't hold the borrow across await.
        let existing = self.conn.borrow_mut().take();
        if let Some(mut stream) = existing {
            match Self::do_send_recv(&mut stream, &len_bytes, &bytes, self.server_addr).await {
                Ok(resp) => {
                    // Put the connection back for reuse.
                    *self.conn.borrow_mut() = Some(stream);
                    return Ok(resp);
                }
                Err(_) => {
                    // Connection broken — will reconnect below.
                }
            }
        }

        // Establish a new connection.
        let mut stream = timeout(TCP_TIMEOUT, TcpStream::connect(self.server_addr))
            .await
            .map_err(|_| -> Box<dyn std::error::Error> {
                format!("DNS TCP connect timeout after {}s to {}", TCP_TIMEOUT.as_secs(), self.server_addr).into()
            })??;

        let resp = Self::do_send_recv(&mut stream, &len_bytes, &bytes, self.server_addr).await?;
        *self.conn.borrow_mut() = Some(stream);
        Ok(resp)
    }

    /// Write a length-prefixed DNS message and read the response on an existing stream.
    async fn do_send_recv(
        stream: &mut TcpStream,
        len_bytes: &[u8],
        msg_bytes: &[u8],
        server_addr: SocketAddr,
    ) -> Result<Message, Box<dyn std::error::Error>> {
        timeout(TCP_TIMEOUT, async {
            stream.write_all(len_bytes).await?;
            stream.write_all(msg_bytes).await?;
            stream.flush().await?;
            let resp_len = stream.read_u16().await? as usize;
            let mut resp_buf = vec![0u8; resp_len];
            stream.read_exact(&mut resp_buf).await?;
            Ok::<_, Box<dyn std::error::Error>>(Message::from_vec(&resp_buf)?)
        })
        .await
        .map_err(|_| -> Box<dyn std::error::Error> {
            format!("DNS TCP timeout after {}s to {}", TCP_TIMEOUT.as_secs(), server_addr).into()
        })?
    }

    // -- AXFR (uses its own connection -- streaming protocol) --

    /// Fetch all A and AAAA records in the zone via AXFR (RFC 5936).
    ///
    /// Returns a list of `(hostname_label, IpAddr)` pairs -- only records whose owner
    /// name is directly under the zone apex (e.g. `foo.lan.` -> `"foo"`).
    /// SOA, NS, and apex records are excluded.
    ///
    /// Requires `axfr_policy = "AllowAll"` (or `"AllowSigned"`) in the server config.
    pub async fn axfr_records(&self) -> Result<Vec<(String, IpAddr)>, Box<dyn std::error::Error>> {
        const AXFR_TIMEOUT: Duration = Duration::from_secs(10);

        let query = Query::new(self.zone.clone(), RecordType::AXFR);
        let mut msg = Message::query();
        msg.add_query(query);
        let bytes = msg.to_vec()?;
        let len = u16::try_from(bytes.len())?;

        let zone = self.zone.clone();
        let addr = self.server_addr;

        let records = timeout(AXFR_TIMEOUT, async move {
            let mut stream = TcpStream::connect(addr).await?;
            stream.write_all(&len.to_be_bytes()).await?;
            stream.write_all(&bytes).await?;
            stream.flush().await?;

            let mut records: Vec<(String, IpAddr)> = Vec::new();
            let mut soa_count = 0u32;

            loop {
                let resp_len = stream.read_u16().await? as usize;
                if resp_len == 0 {
                    break;
                }
                let mut buf = vec![0u8; resp_len];
                stream.read_exact(&mut buf).await?;
                let response = Message::from_vec(&buf)?;
                if response.metadata.response_code != ResponseCode::NoError {
                    return Err(format!("AXFR error: {:?}", response.metadata.response_code).into());
                }
                for record in &response.answers {
                    match &record.data {
                        RData::SOA(_) => {
                            soa_count += 1;
                        }
                        RData::A(a) => {
                            if let Some(host) = extract_hostname(&record.name, &zone) {
                                records.push((host, IpAddr::V4(a.0)));
                            }
                        }
                        RData::AAAA(aaaa) => {
                            if let Some(host) = extract_hostname(&record.name, &zone) {
                                records.push((host, IpAddr::V6(aaaa.0)));
                            }
                        }
                        _ => {}
                    }
                }
                if soa_count >= 2 {
                    break;
                }
            }
            Ok::<_, Box<dyn std::error::Error>>(records)
        })
        .await
        .map_err(|_| -> Box<dyn std::error::Error> {
            format!("AXFR timeout after {}s connecting to {}", AXFR_TIMEOUT.as_secs(), self.server_addr).into()
        })??;
        Ok(records)
    }
}

/// Build the PTR owner name for an IPv4 address.
/// e.g. 192.168.3.5 -> `5.3.168.192.in-addr.arpa.`
fn ipv4_ptr_name(addr: Ipv4Addr) -> Name {
    let o = addr.octets();
    Name::from_ascii(&format!("{}.{}.{}.{}.in-addr.arpa.", o[3], o[2], o[1], o[0]))
        .expect("always valid")
}

/// Build the PTR owner name for an IPv6 address (nibble-reversed).
fn ipv6_ptr_name(addr: Ipv6Addr) -> Name {
    let nibbles: String = addr
        .octets()
        .iter()
        .rev()
        .flat_map(|b| {
            let lo = char::from_digit((b & 0x0f) as u32, 16).unwrap();
            let hi = char::from_digit((b >> 4) as u32, 16).unwrap();
            [lo, '.', hi, '.']
        })
        .collect();
    Name::from_ascii(&format!("{}ip6.arpa.", nibbles)).expect("always valid")
}

/// Derive the reverse zone name for an IPv4 subnet (only /8, /16, /24 boundaries).
fn ipv4_zone_name(net: Ipv4Addr, prefix_len: u8) -> Name {
    let o = net.octets();
    let s = match prefix_len {
        24..=32 => format!("{}.{}.{}.in-addr.arpa.", o[2], o[1], o[0]),
        16..=23 => format!("{}.{}.in-addr.arpa.", o[1], o[0]),
        8..=15  => format!("{}.in-addr.arpa.", o[0]),
        _       => "in-addr.arpa.".to_string(),
    };
    Name::from_ascii(&s).expect("always valid")
}

/// Extract the single label that precedes the zone apex from a fully-qualified record name.
///
/// e.g. `"foo.lan."` with zone `"lan."` -> `Some("foo")`.
/// Returns `None` for the apex itself or for names not directly under the zone.
fn extract_hostname(name: &Name, zone: &Name) -> Option<String> {
    let n = name.to_ascii().to_lowercase();
    let z = zone.to_ascii().to_lowercase();
    let n = n.trim_end_matches('.');
    let z = z.trim_end_matches('.');
    if n == z {
        return None; // apex record
    }
    let suffix = format!(".{z}");
    n.strip_suffix(&suffix).map(|s| s.to_string())
}
