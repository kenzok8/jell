# FusionTunX

[🇮🇩 Indonesia](README.md)

[![GitHub Downloads](https://img.shields.io/github/downloads/bobbyunknown/FusionTunX/total?style=flat-square)](https://github.com/bobbyunknown/FusionTunX)
[![GitHub Release](https://img.shields.io/github/v/release/bobbyunknown/FusionTunX?style=flat-square)](https://github.com/bobbyunknown/FusionTunX/releases)

**FusionTunX** is a controller and manager for Mihomo (Clash Meta) designed for OpenWrt and Linux Server. This application provides a modern web interface to manage proxies with advanced routing.

## Features

- **Core Management**: Full control of Mihomo (start/stop/restart, config management, log monitoring)
- **Routing Mode**: TUN, TProxy, Redirect, Mixed mode
- **OpenWrt Integration**: Firewall 4 (nftables), LuCI app, procd service
- **Web Dashboard**: React + Vite with embedded UI
- **RESTful API**: Complete API with Swagger documentation
- **Real-time Monitoring**: WebSocket for log streaming

### Dashboard Features

- Core control (start/stop/restart)
- File manager (edit config.yaml, providers, rules)
- Subscription converter
- Backup & restore
- Connection monitor
- Log viewer (real-time WebSocket)

## Installation

### OpenWrt

Download from [Releases](https://github.com/bobbyunknown/FusionTunX/releases), then install:

```bash
# OpenWrt 24.10 (IPK)
opkg update
opkg install fusiontunx_*.ipk luci-app-fusiontunx_*.ipk

# OpenWrt 25.12 (APK)
apk add fusiontunx-*.apk luci-app-fusiontunx-*.apk
```

Access via LuCI → Services → FusionTunX or `http://router-ip:8080`

### Debian/Ubuntu

```bash
sudo dpkg -i fusiontunx_*.deb
sudo apt-get install -f  # if dependency error
```

Service runs automatically. Access at `http://localhost:8080`

### Arch Linux

**Via AUR:**

```bash
# Using yay
yay -S fusiontunx

# Or using paru
paru -S fusiontunx
```

**Manual install:**

```bash
sudo pacman -U fusiontunx-*.pkg.tar.zst
```

Service runs automatically. Access at `http://localhost:8080`

### Standalone Binary

Download binary from [Releases](https://github.com/bobbyunknown/FusionTunX/releases):

```bash
chmod +x fusiontunx-linux-amd64
./fusiontunx-linux-amd64 -c /path/to/app.yaml
```

## Build from Source

### Build Debian/Arch/Binaries

```bash
git clone https://github.com/bobbyunknown/FusionTunX.git
cd FusionTunX

# Build all
make all

# Or specific
make build-deb      # Debian packages
make build-arch     # Arch packages  
make build-binaries # Standalone binaries
```

Output:
- Debian: `build/*.deb`
- Arch: `build/*.pkg.tar.zst`
- Binaries: `bin/fusiontunx-linux-*`

### Build for OpenWrt

**Method 1: Add to feeds**

```bash
# In OpenWrt build root
echo "src-git fusiontunx https://github.com/bobbyunknown/FusionTunX.git;main" >> feeds.conf.default
./scripts/feeds update fusiontunx
./scripts/feeds install -a -p fusiontunx

# Select package in menuconfig
make menuconfig
# Network -> fusiontunx
# LuCI -> Applications -> luci-app-fusiontunx

# Build
make package/fusiontunx/compile V=s
make package/luci-app-fusiontunx/compile V=s
```

**Method 2: Manual copy**

```bash
# Copy to package folder
cp -r openwrt/fusiontunx /path/to/openwrt/package/
cp -r openwrt/luci-app-fusiontunx /path/to/openwrt/package/feeds/luci/

# Build
cd /path/to/openwrt
make package/fusiontunx/compile V=s
make package/luci-app-fusiontunx/compile V=s
```

Packages will be in `bin/packages/your_arch/`

## Configuration

File: `/etc/fusiontunx/app.yaml`

```yaml
server:
  host: "0.0.0.0"
  port: "8080"
  mode: "release"

logging:
  level: "info"
  file: "/var/log/fusiontunx.log"

mihomo:
  binary: "/usr/bin/mihomo"
  config: "/etc/fusiontunx/configs/config.yaml"
  working_dir: "/etc/fusiontunx"

api:
  enable_swagger: false
```

## API

API documentation available at `/docs` (if `enable_swagger: true`)

Main endpoints:
- `GET /api/v1/mihomo/status` - Core status
- `POST /api/v1/mihomo/start` - Start core
- `POST /api/v1/mihomo/stop` - Stop core
- `GET /api/v1/config` - Get config
- `POST /api/v1/config` - Update config
- `WS /api/v1/logs` - Log streaming

## Contributing

Pull requests accepted on **dev** branch. Don't submit directly to main.

1. Fork repository
2. Create branch (`git checkout -b feature/feature-name`)
3. Commit (`git commit -m 'Add feature'`)
4. Push (`git push origin feature/feature-name`)
5. Create Pull Request to **dev** branch

## License

MIT License. See [LICENSE](LICENSE).

## Credits

- [Mihomo](https://github.com/MetaCubeX/mihomo) - Clash Meta core
- [Gin](https://github.com/gin-gonic/gin) - Web framework
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) - Frontend

## Support

- Issues: [GitHub Issues](https://github.com/bobbyunknown/FusionTunX/issues)
- Telegram: [SanTech Group](https://t.me/+TuLCASzJrVJmNzM1)
- Donate: [Sociabuzz](https://sociabuzz.com/bobbyunknown/tribe) | [Saweria](https://saweria.co/widgets/qr?streamKey=48ea6792454c7732924b663381c69521)
