use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};

use hickory_proto::op::{Message, ResponseCode, update_message};
use hickory_proto::rr::{Name, RData, RecordSet, RecordType};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// DNS dynamic update client that sends RFC 2136 updates over TCP to the hickory-dns server.
pub(crate) struct DnsUpdater {
    server_addr: SocketAddr,
    zone: Name,
}

impl DnsUpdater {
    pub fn new(server_addr: SocketAddr, zone: Name) -> Self {
        Self { server_addr, zone }
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
            self.send_tcp(msg).await?;
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
            self.send_tcp(msg).await?;
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
        self.send_tcp(msg).await?;
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
        self.send_tcp(msg).await?;
        Ok(())
    }

    /// Send a DNS message over TCP (2-byte length prefix + message bytes) and read the response.
    async fn send_tcp(&self, msg: Message) -> Result<Message, Box<dyn std::error::Error>> {
        let bytes = msg.to_vec()?;
        let len = u16::try_from(bytes.len())?;

        let mut stream = TcpStream::connect(self.server_addr).await?;
        stream.write_all(&len.to_be_bytes()).await?;
        stream.write_all(&bytes).await?;
        stream.flush().await?;

        let resp_len = stream.read_u16().await? as usize;
        let mut resp_buf = vec![0u8; resp_len];
        stream.read_exact(&mut resp_buf).await?;

        Ok(Message::from_vec(&resp_buf)?)
    }
}
