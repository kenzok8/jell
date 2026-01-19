# FusionTunX

[🇺🇸 English](README-EN.md)

[![GitHub Downloads](https://img.shields.io/github/downloads/bobbyunknown/FusionTunX/total?style=flat-square)](https://github.com/bobbyunknown/FusionTunX)
[![GitHub Release](https://img.shields.io/github/v/release/bobbyunknown/FusionTunX?style=flat-square)](https://github.com/bobbyunknown/FusionTunX/releases)

**FusionTunX** adalah controller dan manager untuk Mihomo (Clash Meta) yang dirancang untuk OpenWrt dan Linux Server. Aplikasi ini menyediakan web interface modern untuk mengelola proxy dengan routing tingkat lanjut.

## Fitur

- **Core Management**: Kontrol penuh Mihomo (start/stop/restart, config management, log monitoring)
- **Routing Mode**: TUN, TProxy, Redirect, Mixed mode
- **OpenWrt Integration**: Firewall 4 (nftables), LuCI app, procd service
- **Web Dashboard**: React + Vite dengan embedded UI
- **RESTful API**: API lengkap dengan Swagger documentation
- **Real-time Monitoring**: WebSocket untuk log streaming

### Dashboard Features

- Core control (start/stop/restart)
- File manager (edit config.yaml, providers, rules)
- Subscription converter
- Backup & restore
- Connection monitor
- Log viewer (real-time WebSocket)

## Instalasi

### OpenWrt

Download dari [Releases](https://github.com/bobbyunknown/FusionTunX/releases), lalu install:

```bash
# OpenWrt 24.10 (IPK)
opkg update
opkg install fusiontunx_*.ipk luci-app-fusiontunx_*.ipk

# OpenWrt 25.12 (APK)
apk add fusiontunx-*.apk luci-app-fusiontunx-*.apk
```

Akses via LuCI → Services → FusionTunX atau `http://router-ip:8080`

### Debian/Ubuntu

```bash
sudo dpkg -i fusiontunx_*.deb
sudo apt-get install -f  # jika ada dependency error
```

Service otomatis berjalan. Akses di `http://localhost:8080`

### Arch Linux

**Via AUR:**

```bash
# Menggunakan yay
yay -S fusiontunx

# Atau menggunakan paru
paru -S fusiontunx
```

**Manual install:**

```bash
sudo pacman -U fusiontunx-*.pkg.tar.zst
```

Service otomatis berjalan. Akses di `http://localhost:8080`

### Standalone Binary

Download binary dari [Releases](https://github.com/bobbyunknown/FusionTunX/releases):

```bash
chmod +x fusiontunx-linux-amd64
./fusiontunx-linux-amd64 -c /path/to/app.yaml
```

## Build dari Source

### Build Debian/Arch/Binaries

```bash
git clone https://github.com/bobbyunknown/FusionTunX.git
cd FusionTunX

# Build semua
make all

# Atau specific
make build-deb      # Debian packages
make build-arch     # Arch packages  
make build-binaries # Standalone binaries
```

Output:
- Debian: `build/*.deb`
- Arch: `build/*.pkg.tar.zst`
- Binaries: `bin/fusiontunx-linux-*`

### Build untuk OpenWrt

**Method 1: Add to feeds**

```bash
# Di OpenWrt build root
echo "src-git fusiontunx https://github.com/bobbyunknown/FusionTunX.git;main" >> feeds.conf.default
./scripts/feeds update fusiontunx
./scripts/feeds install -a -p fusiontunx

# Pilih package di menuconfig
make menuconfig
# Network -> fusiontunx
# LuCI -> Applications -> luci-app-fusiontunx

# Build
make package/fusiontunx/compile V=s
make package/luci-app-fusiontunx/compile V=s
```

**Method 2: Manual copy**

```bash
# Copy ke package folder
cp -r openwrt/fusiontunx /path/to/openwrt/package/
cp -r openwrt/luci-app-fusiontunx /path/to/openwrt/package/feeds/luci/

# Build
cd /path/to/openwrt
make package/fusiontunx/compile V=s
make package/luci-app-fusiontunx/compile V=s
```

Package ada di `bin/packages/your_arch/`

## Konfigurasi

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

Dokumentasi API tersedia di `/docs` (jika `enable_swagger: true`)

Endpoint utama:
- `GET /api/v1/mihomo/status` - Status core
- `POST /api/v1/mihomo/start` - Start core
- `POST /api/v1/mihomo/stop` - Stop core
- `GET /api/v1/config` - Get config
- `POST /api/v1/config` - Update config
- `WS /api/v1/logs` - Log streaming

## Contributing

Pull request diterima di branch **dev**. Jangan langsung ke main.

1. Fork repository
2. Buat branch (`git checkout -b feature/nama-fitur`)
3. Commit (`git commit -m 'Tambah fitur'`)
4. Push (`git push origin feature/nama-fitur`)
5. Buat Pull Request ke branch **dev**

## License

MIT License. Lihat [LICENSE](LICENSE).

## Credits

- [Mihomo](https://github.com/MetaCubeX/mihomo) - Clash Meta core
- [Gin](https://github.com/gin-gonic/gin) - Web framework
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) - Frontend

## Support

- Issues: [GitHub Issues](https://github.com/bobbyunknown/FusionTunX/issues)
- Telegram: [SanTech Group](https://t.me/+TuLCASzJrVJmNzM1)
- Donate: [Sociabuzz](https://sociabuzz.com/bobbyunknown/tribe) | [Saweria](https://saweria.co/widgets/qr?streamKey=48ea6792454c7732924b663381c69521)
