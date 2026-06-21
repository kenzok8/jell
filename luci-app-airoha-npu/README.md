# luci-app-airoha-npu

Real-time monitoring and management dashboard for the Airoha AN7581 SoC on OpenWrt. Covers NPU offload, CPU frequency, WiFi band health, Frame Engine internals, and PPE flow tables.

**[Download](https://github.com/rchen14b/luci-app-airoha-npu/releases/latest)**

![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)
![OpenWrt](https://img.shields.io/badge/OpenWrt-24.10%2B-brightgreen.svg)
![Version](https://img.shields.io/badge/version-1.0.1-orange.svg)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/rchen14b)

## Screenshots

### CPU Frequency & Overclock
![CPU Frequency](screenshots/cpu-frequency.png)

### NPU & Offload Engine
![NPU & Offload Engine](screenshots/npu-offload-engine.png)

### PPE Flow Offload Table
![PPE Flow Table](screenshots/ppe-flow-table.png)

## Features

### CPU Frequency Management
- Current frequency display with visual bar graph
- Governor selection (performance, ondemand, schedutil, etc.)
- Max frequency selection from available OPP entries
- Direct PLL overclock control (500-1600 MHz) with hardware register programming
- Overclock detection and warning for unstable frequencies

### NPU & Offload Engine
- NPU firmware version (TLB format), clock frequency, core count
- NPU load status (active/inactive) and reserved memory regions
- WiFi token pool health indicator with in-flight count
- PPE flow offload summary (bound / total entries)
- Per-band WiFi status cards (2.4 GHz, 5 GHz, 6 GHz):
  - Client count and link health indicator (Good / Fair / Poor)
  - NPU vs DMA path badge
  - TX retry rate percentage with color-coded thresholds

### Frame Engine Visualization
- **PSE Shared Buffer** usage bar (congestion indicator)
- **GDM port cards** with live TX/RX packet counters and drop counts:
  - GDM1: Internal Switch (1G LAN3/4)
  - GDM2: WAN (USXGMII 10G)
  - GDM4: LAN2 (USXGMII 10G)
- **CDM offload ratio** bars — HW-forwarded (PPE) vs CPU-path packets
- **PSE Port Queue Status** grid (P0-P9) with IQ/OQ queue depths and drop counts

### PPE Flow Offload Table
- First 100 PPE entries with state (BND/UNB), type (IPv4/IPv6/L2B), 5-tuple, and MAC addresses
- Auto-refreshes every 5 seconds

### Theme Support
- Auto-detects dark/light mode by sampling page background luminance at runtime
- Works with Glass, Bootstrap, Bootstrap-dark, and any LuCI theme
- No hardcoded colors — uses CSS custom properties throughout

## Requirements

- OpenWrt with LuCI (24.10+)
- Airoha AN7581 target (`@TARGET_airoha`)
- PPE debugfs (`/sys/kernel/debug/ppe/entries`)
- **`devmem`** busybox applet — required for Frame Engine register access and CPU overclock (`CONFIG_BUSYBOX_DEFAULT_DEVMEM=y`)
- WiFi token_info debugfs for per-band WiFi stats (`/sys/kernel/debug/ieee80211/phy0/mt76/token_info`)
- Optional: [air_tools](https://github.com/merbanan/air_tools) scripts for additional Frame Engine debugging

## Installation

### From OpenWrt build

```sh
# Add to your build tree
git clone https://github.com/rchen14b/luci-app-airoha-npu.git package/luci-app-airoha-npu

# Enable in menuconfig
make menuconfig
# Navigate to: LuCI -> Applications -> luci-app-airoha-npu

# Build
make package/luci-app-airoha-npu/compile V=s
```

### Manual install (dev)

```sh
# Copy files to router
scp root/usr/libexec/rpcd/luci.airoha_npu root@router:/usr/libexec/rpcd/
scp root/usr/share/luci/menu.d/luci-app-airoha-npu.json root@router:/usr/share/luci/menu.d/
scp root/usr/share/rpcd/acl.d/luci-app-airoha-npu.json root@router:/usr/share/rpcd/acl.d/
scp htdocs/luci-static/resources/view/airoha_npu/status.js root@router:/www/luci-static/resources/view/airoha_npu/

# Set permissions and restart
ssh root@router 'chmod +x /usr/libexec/rpcd/luci.airoha_npu && /etc/init.d/rpcd restart'
```

## Data Sources

| Data | Source | Required |
|------|--------|----------|
| NPU status | `/sys/bus/platform/drivers/airoha-npu/`, `dmesg` | Yes |
| CPU frequency | `/sys/devices/system/cpu/cpufreq/policy0/` | Yes |
| Overclock PLL | `devmem` registers (0x1fa202b4, 0x1fa202b8) | devmem |
| PPE entries | `/sys/kernel/debug/ppe/{entries,bind}` | Yes |
| WiFi token pool | `/sys/kernel/debug/ieee80211/phy0/mt76/token_info` | Optional |
| WiFi station stats | `iw dev <iface> station dump` | Optional |
| Frame Engine (GDM/CDM/PSE) | `devmem` registers (0x1fb50xxx-0x1fb53xxx) | devmem |

## Project Structure

```
luci-app-airoha-npu/
├── Makefile                                          # OpenWrt package build
├── htdocs/
│   └── luci-static/resources/view/airoha_npu/
│       └── status.js                                 # LuCI JavaScript view
├── root/
│   └── usr/
│       ├── libexec/rpcd/
│       │   └── luci.airoha_npu                       # RPC backend (shell)
│       └── share/
│           ├── luci/menu.d/
│           │   └── luci-app-airoha-npu.json          # Menu config
│           └── rpcd/acl.d/
│               └── luci-app-airoha-npu.json          # ACL permissions
└── screenshots/
```

## RPC Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| `getStatus` | NPU, CPU, PPE summary | — |
| `getPpeEntries` | PPE flow table (first 100) | — |
| `getTokenInfo` | WiFi token pool & station stats | — |
| `getFrameEngine` | PSE/GDM/CDM register counters | — |
| `setGovernor` | Change CPU governor | `governor` |
| `setMaxFreq` | Set CPU max frequency | `freq` (kHz) |
| `setOverclock` | Direct PLL frequency set | `freq_mhz` |

## Version History

### v1.0.1
- Unified Frame Engine diagram with architectural layout matching AN7581 data paths
- WiFi band cards moved into CDM4/WDMA section (reflects actual WiFi DMA path)
- Added NPU and PPE Engine cards with live status and flow counts
- Token pool and PPE flows removed from summary table (now in Frame Engine view)
- Fixed GDM4 register addresses (0x2500, not 0x3500)
- Improved compact WiFi band chip styling

### v1.0.0
- CPU frequency management with governor and overclock controls
- NPU & Offload Engine monitoring with WiFi band cards
- Frame Engine visualization (GDM ports, CDM offload ratio, PSE queues)
- PPE flow offload table with auto-refresh
- Theme-adaptive dark/light mode detection

## License

Apache-2.0

## Author

Ryan Chen — Created for W1700K router (Airoha AN7581 + MT7996 BE19000)
