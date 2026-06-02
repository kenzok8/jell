use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

pub fn call_ubus(obj_path: &str, method: &str) -> Result<Value, Box<dyn std::error::Error>> {
    let socket = Path::new("/var/run/ubus/ubus.sock");
    let mut connection = ubus::Connection::connect(&socket)?;
    let json = connection.call(obj_path, method, "")?;
    let parsed: Value = serde_json::from_str(&json)?;
    Ok(parsed)
}

/// Decode a hex string (e.g. "44237cdcb75b") to raw bytes and format via
/// the shared `types::format_mac`, producing "44:23:7c:dc:b7:5b".
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
    // Truncate to 63 chars (max DNS label length)
    collapsed.chars().take(63).collect()
}

/// Extract a MAC address from a DHCPv6 DUID string.
/// Supports DUID-LLT (type 1) and DUID-LL (type 3) with any hardware type.
/// Returns the colon-separated MAC, e.g. "30:c5:99:7d:d5:ae".
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

// get mac to hostname mapping
pub fn get_lease() -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
    // dhcpv6 does not use mac address, so we only need to get ipv4 leases
    let leases = call_ubus("dhcp", "ipv4leases")?;
    let devices = leases["device"].as_object()
        .ok_or("missing 'device' in ipv4leases response")?;

    let mut result = HashMap::new();

    for (_device, leases) in devices {
        let leases = leases["leases"].as_array()
            .ok_or("missing 'leases' array in device")?;
        for lease in leases {
            let Some(raw_mac) = lease["mac"].as_str() else { continue };
            let Some(hostname) = lease["hostname"].as_str() else { continue };
            let mac = hex_to_mac(raw_mac);
            let hostname = sanitize_hostname(hostname);
            if hostname.is_empty() {
                continue;
            }
            // Store bare hostname only; the zone is appended by DnsUpdater
            result.insert(mac, hostname);
        }
    }

    // Supplement with IPv6 leases: extract MAC from DUID when available.
    // IPv4 entries take precedence; only fill in missing MACs here.
    if let Ok(v6leases) = call_ubus("dhcp", "ipv6leases") {
        if let Some(devices) = v6leases["device"].as_object() {
            for (_device, device_data) in devices {
                let Some(leases) = device_data["leases"].as_array() else { continue };
                for lease in leases {
                    let Some(duid) = lease["duid"].as_str() else { continue };
                    let Some(hostname) = lease["hostname"].as_str() else { continue };
                    let hostname = sanitize_hostname(hostname);
                    if hostname.is_empty() {
                        continue;
                    }
                    let Some(mac) = mac_from_duid(duid) else { continue };
                    // IPv4 mapping takes precedence
                    result.entry(mac).or_insert(hostname);
                }
            }
        }
    }

    Ok(result)
}
