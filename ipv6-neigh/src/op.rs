use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

pub fn call_ubus(obj_path: &str, method: &str) -> Result<Value, Box<dyn std::error::Error>> {
    let socket = Path::new("/var/run/ubus/ubus.sock");

    let mut connection = match ubus::Connection::connect(&socket) {
        Ok(connection) => connection,
        Err(err) => {
            return Err(Box::new(err));
        }
    };

    let json = connection.call(obj_path, method, "").unwrap();
    let parsed: Value = serde_json::from_str(&json).unwrap();
    Ok(parsed)
}

// get mac to hostname mapping
pub fn get_lease() -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
    // dhcpv6 does not use mac address, so we only need to get ipv4 leases
    let ip4lease = call_ubus("dhcp", "ipv4leases");
    let leases = ip4lease.unwrap();
    let devices = leases["device"].as_object().unwrap();
    let mut result = HashMap::new();
    // hard code
    for (device, leases) in devices {
        let suffix = if device == "phy1-ap0" { ".iot" } else { ".lan" };
        let leases = leases["leases"].as_array().unwrap();
        for lease in leases {
            let mac = lease["mac"].as_str().unwrap().to_string();
            let hostname = lease["hostname"].as_str().unwrap().to_string() + suffix;
            result.insert(mac, hostname);
        }
    }

    Ok(result)
}
