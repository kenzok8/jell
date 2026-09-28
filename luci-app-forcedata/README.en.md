[简体中文](README.md) | [English](README.en.md)

# luci-app-forcedata

A LuCI management plugin for the "ForceData (原力云)" edge-computing client on OpenWrt / iStoreOS.

![Platform](https://img.shields.io/badge/platform-OpenWrt%20%7C%20iStoreOS-blue)
![Arch](https://img.shields.io/badge/arch-x86__64%20%7C%20aarch64-green)
![UI](https://img.shields.io/badge/LuCI-Lua-yellow)

## 📖 Introduction

ForceData (YuanLiYun) is an edge-computing / bandwidth-sharing platform: you run its client on your own device and share idle bandwidth online for a certain monthly cash reward. This plugin moves the whole deployment into LuCI: after installation it automatically downloads and starts the forcecloud client, keeps it alive with minute-level checks and self-updates, and provides a service status page with a QR-code binding entry in the router admin UI.

It targets owners of OpenWrt / iStoreOS soft routers and TV boxes who want to run ForceData without touching the command line. The plugin is built on the iStore app framework (`luci-lib-taskd` + istorec management script), so it behaves like other iStoreOS apps.

## ✨ Features

- LuCI web UI under "Services → Forcedata", showing live service status
- Automatically generates an 18-digit numeric UID on first use, stored in `/etc/config/forcedata` (do not change it, or deployment breaks)
- One-click install / upgrade of the forcecloud client, auto-selecting x86_64 / aarch64 builds with MD5 verification
- crontab-based self-check every minute: restarts the process when it dies, and skips updates when the root partition is 100% full
- Pushes DingTalk robot alerts when the client restarts unexpectedly or multiple probes start on one host
- The status page renders a binding QR code to link the device via the "ForceData" WeChat mini program
- The management script supports install / upgrade / rm / start / stop / restart / status sub-commands

## 🛠 Tech Stack

- LuCI (Lua) + iStore/taskd app framework, depends on `luci-lib-taskd`, package arch `all`
- busybox ash shell management script
- Page QR code rendered with qrcode.min.js

## 🚀 Quick Start

1. Build: copy this repo into the `package/` directory of an OpenWrt/LeDE source tree, select `LuCI → Applications → luci-app-forcedata` in `make menuconfig`, then build the ipk and install it on the router.
2. On first installation, uci-defaults registers a crontab keep-alive job that runs every minute.
3. Log in to LuCI, open "Services → Forcedata", confirm the UID, and wait for the status to become Running.
4. Click "Running, click to show QR" to render the QR code, then scan it with the "ForceData" WeChat mini program to bind the device. See the [official guide](https://docs.qq.com/doc/DZXNFWWtKbHN4UHFD) (Chinese).

You can also manage it over SSH:

```sh
sh /usr/libexec/istorec/forcedata.sh install   # Install / start the client
sh /usr/libexec/istorec/forcedata.sh status    # Show running status
sh /usr/libexec/istorec/forcedata.sh rm        # Stop the process and clean /usr/local/forcecloud
```

## 📁 Directory Structure

```
luci-app-forcedata/
├── luasrc/                                  # LuCI controller, CBI config page, status view
├── po/zh-cn/                                # Simplified Chinese language pack
├── root/
│   ├── etc/config/forcedata                 # UCI config (uid)
│   ├── etc/uci-defaults/luci-app-forcedata  # Registers crontab on first install
│   ├── usr/libexec/istorec/forcedata.sh     # Install / keep-alive / update script
│   └── www/luci-static/forcedata/           # QR-code JS and mini-program image
└── Makefile
```

## 🔗 Links

- [ForceData official site](http://www.forcedata.cn) (Chinese)
- [Mini-program binding guide](https://docs.qq.com/doc/DZXNFWWtKbHN4UHFD) (Chinese)

## 📄 License

No LICENSE file is included in this repo (the Makefile lists the maintainer as forcedata). For learning and research only.
