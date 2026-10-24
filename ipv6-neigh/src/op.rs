use serde_json::Value;
use std::collections::HashMap;
use std::net::Ipv6Addr;
use std::path::Path;

use log::warn;

use crate::filter::if_ipv6_in_private_subnet;

pub fn call_ubus(obj_path: &str, method: &str) -> Result<Value, Box<dyn std::error::Error>> {
    let socket = Path::new("/var/run/ubus/ubus.sock");
    let mut connection = ubus::Connection::connect(socket)?;
    let json = connection.call(obj_path, method, "")?;
    let parsed: Value = serde_json::from_str(&json)?;
    Ok(parsed)
}

/// DHCP lease data used by the daemon.
///
/// hostnames is the legacy MAC -> DNS-label map (IPv4 leases first, IPv6
/// leases fill gaps).  preferred_v6 records the DHCPv6-assigned ULA per MAC;
/// it is only a tie-breaker for AAAA selection and never publishes an address
/// that has not been seen in the neighbour table.
#[derive(Default)]
pub struct Leases {
    pub hostnames: HashMap<String, String>,
    pub preferred_v6: HashMap<String, Ipv6Addr>,
}

/// Decode a hex string (e.g. "020000000003") to raw bytes and format via
/// the shared types::format_mac, producing "02:00:00:00:00:03".
fn hex_to_mac(hex: &str) -> String {
    let bytes: Vec<u8> = hex
        .as_bytes()
        .chunks(2)
        .filter_map(|c| u8::from_str_radix(std::str::from_utf8(c).ok()?, 16).ok())
        .collect();
    crate::types::format_mac(&bytes)
}

/// Sanitize a DHCP hostname into a valid DNS label.
/// Replaces invalid characters with '-', collapses consecutive hyphens,
/// strips leading/trailing hyphens, and truncates to 63 chars.
fn sanitize_hostname(raw: &str) -> String {
    let sanitized: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    // Collapse consecutive hyphens and strip leading/trailing
    let collapsed: String = sanitized
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("-");
    // Truncate to 63 chars (max DNS label length), then strip a trailing '-'.
    let truncated: String = collapsed.chars().take(63).collect();
    truncated.trim_end_matches('-').to_owned()
}

/// Extract a MAC address from a DHCPv6 DUID string.
/// Supports DUID-LLT (type 1) and DUID-LL (type 3) with any hardware type.
/// Returns the colon-separated MAC, e.g. "02:00:00:00:00:02".
fn mac_from_duid(duid: &str) -> Option<String> {
    // All chars must be hex digits
    if !duid.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    let duid_type = u16::from_str_radix(duid.get(0..4)?, 16).ok()?;

    // DUID-LLT (1): type(4) + hw_type(4) + time(8) = 16 hex chars before MAC
    // DUID-LL  (3): type(4) + hw_type(4)            =  8 hex chars before MAC
    let mac_offset = match duid_type {
        1 => 16,
        3 => 8,
        _ => return None,
    };

    let mac_hex = duid.get(mac_offset..mac_offset + 12)?;
    Some(hex_to_mac(mac_hex))
}

fn parse_ipv4_leases(leases: &Value) -> Result<HashMap<String, String>, String> {
    let devices = leases["device"]
        .as_object()
        .ok_or("missing 'device' in ipv4leases response")?;

    let mut result = HashMap::new();

    for (_device, leases) in devices {
        let leases = leases["leases"]
            .as_array()
            .ok_or("missing 'leases' array in device")?;
        for lease in leases {
            let Some(raw_mac) = lease["mac"].as_str() else {
                continue;
            };
            let Some(hostname) = lease["hostname"].as_str() else {
                continue;
            };
            let mac = hex_to_mac(raw_mac);
            let hostname = sanitize_hostname(hostname);
            if hostname.is_empty() {
                continue;
            }
            // Store bare hostname only; the zone is appended by DnsUpdater
            result.insert(mac, hostname);
        }
    }

    Ok(result)
}

/// Merge DHCPv6 lease data: fill missing hostnames and record the assigned ULA
/// (preferred address) per MAC.  IPv4 mappings take precedence.
fn merge_ipv6_leases(leases: &mut Leases, v6leases: &Value) {
    let Some(devices) = v6leases["device"].as_object() else {
        return;
    };

    for (_device, device_data) in devices {
        let Some(items) = device_data["leases"].as_array() else {
            continue;
        };
        for lease in items {
            let Some(duid) = lease["duid"].as_str() else {
                continue;
            };
            let Some(mac) = mac_from_duid(duid) else {
                continue;
            };

            // Prefer the first ULA address in the lease; GUA and PD entries are
            // ignored (PD is a prefix, not a host address).
            if let Some(addrs) = lease["ipv6-addr"].as_array() {
                for addr in addrs {
                    let Some(addr) = addr["address"]
                        .as_str()
                        .and_then(|s| s.parse::<Ipv6Addr>().ok())
                    else {
                        continue;
                    };
                    if if_ipv6_in_private_subnet(&addr) {
                        leases.preferred_v6.entry(mac.clone()).or_insert(addr);
                        break;
                    }
                }
            }

            let Some(hostname) = lease["hostname"].as_str() else {
                continue;
            };
            let hostname = sanitize_hostname(hostname);
            if hostname.is_empty() {
                continue;
            }
            // IPv4 mapping takes precedence
            leases.hostnames.entry(mac).or_insert(hostname);
        }
    }
}

// get mac to hostname mapping and DHCPv6 preferred ULA mapping
pub fn get_lease() -> Result<Leases, String> {
    let mut leases = Leases::default();

    let v4 = call_ubus("dhcp", "ipv4leases")
        .map_err(|e| format!("ipv4leases: {e}"))
        .and_then(|v| parse_ipv4_leases(&v));
    let v6 = call_ubus("dhcp", "ipv6leases").map_err(|e| format!("ipv6leases: {e}"));

    match (v4, v6) {
        (Ok(v4), Ok(v6)) => {
            leases.hostnames = v4;
            merge_ipv6_leases(&mut leases, &v6);
            Ok(leases)
        }
        (Ok(v4), Err(e)) => {
            warn!("{e}; continuing with IPv4 leases only");
            leases.hostnames = v4;
            Ok(leases)
        }
        (Err(e), Ok(v6)) => {
            warn!("{e}; continuing with IPv6 leases only");
            merge_ipv6_leases(&mut leases, &v6);
            Ok(leases)
        }
        (Err(e4), Err(e6)) => Err(format!("{e4}; {e6}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sanitize_hostname_lowercases_and_replaces() {
        assert_eq!(sanitize_hostname("Example-Host-A"), "example-host-a");
        assert_eq!(
            sanitize_hostname("Example-Lamp_MIBT0001"),
            "example-lamp-mibt0001"
        );
        assert_eq!(sanitize_hostname("a__b"), "a-b");
        assert_eq!(sanitize_hostname("-a--b-"), "a-b");
        assert_eq!(sanitize_hostname(""), "");
    }

    #[test]
    fn sanitize_hostname_truncates_without_trailing_hyphen() {
        let long = format!("{}-x", "a".repeat(62));
        let out = sanitize_hostname(&long);
        assert_eq!(out.len(), 62);
        assert!(!out.ends_with('-'));
    }

    #[test]
    fn mac_from_duid_llt_and_ll() {
        // DUID-LLT: type 1, hw 1, time 00314241ba, mac 020000000002
        assert_eq!(
            mac_from_duid("00010100314241ba020000000002").as_deref(),
            Some("02:00:00:00:00:02")
        );
        // DUID-LL: type 3, hw 1, mac 001132123456
        assert_eq!(
            mac_from_duid("00030001001132123456").as_deref(),
            Some("00:11:32:12:34:56")
        );
        assert_eq!(mac_from_duid("000200010011"), None);
        assert_eq!(mac_from_duid("zzzz"), None);
    }

    #[test]
    fn parse_ipv4_leases_skips_empty_hostnames() {
        let v = json!({
            "device": {
                "br-lan": {
                    "leases": [
                        {"mac": "020000000001", "hostname": "Example-Host-A"},
                        {"mac": "dca3a21fbabb", "hostname": ""},
                        {"mac": "e4fe4394229a"}
                    ]
                }
            }
        });
        let leases = parse_ipv4_leases(&v).unwrap();
        assert_eq!(leases.len(), 1);
        assert_eq!(leases.get("02:00:00:00:00:01").unwrap(), "example-host-a");
    }

    #[test]
    fn merge_ipv6_leases_prefers_ula_and_keeps_v4_name() {
        let v = json!({
            "device": {
                "br-lan": {
                    "leases": [
                        {
                            "duid": "00010100314241ba020000000002",
                            "hostname": "EXAMPLE-DESKTOP",
                            "ipv6-addr": [
                                {"address": "2001:db8:1:2::ff3"},
                                {"address": "fd12:3456:789a::ff3"}
                            ]
                        },
                        {
                            "duid": "00030001020000000001",
                            "hostname": "",
                            "ipv6-prefix": [
                                {"address": "fd12:3456:789a:1::", "prefix-length": 64}
                            ]
                        }
                    ]
                }
            }
        });
        let mut leases = Leases::default();
        leases
            .hostnames
            .insert("02:00:00:00:00:02".to_string(), "v4name".to_string());
        merge_ipv6_leases(&mut leases, &v);

        assert_eq!(leases.hostnames.get("02:00:00:00:00:02").unwrap(), "v4name");
        assert_eq!(
            leases.preferred_v6.get("02:00:00:00:00:02"),
            Some(&"fd12:3456:789a::ff3".parse::<Ipv6Addr>().unwrap())
        );
        assert!(!leases.preferred_v6.contains_key("02:00:00:00:00:01"));
    }
}
