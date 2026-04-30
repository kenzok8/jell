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

/// Convert a hex MAC string like "44237cdcb75b" to colon-separated "44:23:7c:dc:b7:5b"
fn format_mac_from_hex(hex: &str) -> String {
    hex.as_bytes()
        .chunks(2)
        .map(|chunk| std::str::from_utf8(chunk).unwrap())
        .collect::<Vec<&str>>()
        .join(":")
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
            let mac = format_mac_from_hex(raw_mac);
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
