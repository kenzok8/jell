use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use hickory_proto::op::{Message, Query, ResponseCode, update_message};
use hickory_proto::rr::{Name, RData, RecordSet, RecordType, TSigner};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

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
pub(crate) struct DnsUpdater {
    server_addr: SocketAddr,
    zone: Name,
    signer: TSigner,
}

impl DnsUpdater {
    pub fn new(server_addr: SocketAddr, zone: Name, signer: TSigner) -> Self {
        Self { server_addr, zone, signer }
    }

    /// Create or append a AAAA record.
    pub async fn upsert_aaaa(
        &self,
        hostname: &str,
        addr: Ipv6Addr,
        ttl: u32,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let name = Name::from_ascii(hostname)?.append_domain(&self.zone)?;
        let mut rrset = RecordSet::with_ttl(name.clone(), RecordType::AAAA, ttl);
        rrset.add_rdata(RData::AAAA(addr.into()));

        let msg = update_message::create(rrset, self.zone.clone(), false);
        let response = self.send_tcp(msg).await?;
        if response.metadata.response_code == ResponseCode::YXRRSet {
            let mut rrset = RecordSet::with_ttl(name, RecordType::AAAA, ttl);
            rrset.add_rdata(RData::AAAA(addr.into()));
            let msg = update_message::append(rrset, self.zone.clone(), false, false);
            let response = self.send_tcp(msg).await?;
            check_response(&response, &[])?;
        } else {
            check_response(&response, &[])?;
        }
        Ok(())
    }

    /// Create or append an A record.
    pub async fn upsert_a(
        &self,
        hostname: &str,
        addr: Ipv4Addr,
        ttl: u32,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let name = Name::from_ascii(hostname)?.append_domain(&self.zone)?;
        let mut rrset = RecordSet::with_ttl(name.clone(), RecordType::A, ttl);
        rrset.add_rdata(RData::A(addr.into()));

        let msg = update_message::create(rrset, self.zone.clone(), false);
        let response = self.send_tcp(msg).await?;
        if response.metadata.response_code == ResponseCode::YXRRSet {
            let mut rrset = RecordSet::with_ttl(name, RecordType::A, ttl);
            rrset.add_rdata(RData::A(addr.into()));
            let msg = update_message::append(rrset, self.zone.clone(), false, false);
            let response = self.send_tcp(msg).await?;
            check_response(&response, &[])?;
        } else {
            check_response(&response, &[])?;
        }
        Ok(())
    }

    /// Delete a specific AAAA record.
    pub async fn delete_aaaa(
        &self,
        hostname: &str,
        addr: Ipv6Addr,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let name = Name::from_ascii(hostname)?.append_domain(&self.zone)?;
        let mut rrset = RecordSet::new(name, RecordType::AAAA, 0);
        rrset.add_rdata(RData::AAAA(addr.into()));
        let msg = update_message::delete_by_rdata(rrset, self.zone.clone(), false);
        let response = self.send_tcp(msg).await?;
        check_response(&response, &[])?;
        Ok(())
    }

    /// Delete a specific A record.
    pub async fn delete_a(
        &self,
        hostname: &str,
        addr: Ipv4Addr,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let name = Name::from_ascii(hostname)?.append_domain(&self.zone)?;
        let mut rrset = RecordSet::new(name, RecordType::A, 0);
        rrset.add_rdata(RData::A(addr.into()));
        let msg = update_message::delete_by_rdata(rrset, self.zone.clone(), false);
        let response = self.send_tcp(msg).await?;
        check_response(&response, &[])?;
        Ok(())
    }

    /// Send a DNS message over TCP (2-byte length prefix + message bytes) and read the response.
    async fn send_tcp(&self, mut msg: Message) -> Result<Message, Box<dyn std::error::Error>> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        msg.finalize(&self.signer, now)?;

        let bytes = msg.to_vec()?;
        let len = u16::try_from(bytes.len())?;

        let result = timeout(TCP_TIMEOUT, async {
            let mut stream = TcpStream::connect(self.server_addr).await?;
            stream.write_all(&len.to_be_bytes()).await?;
            stream.write_all(&bytes).await?;
            stream.flush().await?;

            let resp_len = stream.read_u16().await? as usize;
            let mut resp_buf = vec![0u8; resp_len];
            stream.read_exact(&mut resp_buf).await?;

            Ok::<_, Box<dyn std::error::Error>>(Message::from_vec(&resp_buf)?)
        })
        .await
        .map_err(|_| -> Box<dyn std::error::Error> {
            format!("DNS TCP timeout after {}s connecting to {}", TCP_TIMEOUT.as_secs(), self.server_addr).into()
        })??;

        Ok(result)
    }

    /// Fetch all A and AAAA records in the zone via AXFR (RFC 5936).
    ///
    /// Returns a list of `(hostname_label, IpAddr)` pairs — only records whose owner
    /// name is directly under the zone apex (e.g. `foo.lan.` → `"foo"`).
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

/// Extract the single label that precedes the zone apex from a fully-qualified record name.
///
/// e.g. `"foo.lan."` with zone `"lan."` → `Some("foo")`.
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
