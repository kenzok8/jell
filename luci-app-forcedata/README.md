[简体中文](README.md) | [English](README.en.md)

# luci-app-forcedata

OpenWrt / iStoreOS 平台的「原力云（Forcedata）」边缘计算客户端 LuCI 管理插件。

![Platform](https://img.shields.io/badge/platform-OpenWrt%20%7C%20iStoreOS-blue)
![Arch](https://img.shields.io/badge/arch-x86__64%20%7C%20aarch64-green)
![UI](https://img.shields.io/badge/LuCI-Lua-yellow)

## 📖 项目介绍

原力云是一个边缘计算 / 共享带宽平台：在自家设备上运行它的客户端，在线共享闲置带宽，每月可获取一定的现金回报。本插件把整套部署流程搬进 LuCI：安装后自动下载并拉起 forcecloud 客户端，分钟级保活与自更新，并在路由器管理页提供运行状态与扫码绑定入口。

适合已经刷了 OpenWrt / iStoreOS 的软路由、盒子玩家，不敲命令行即可挂机跑原力云。插件基于 iStore 应用框架（`luci-lib-taskd` + istorec 管理脚本）开发，与 iStoreOS 上其他应用的使用方式一致。

## ✨ 功能特性

- LuCI 图形界面：菜单位置「服务 → Forcedata（原力云）」，实时展示服务运行状态
- 首次使用自动生成 18 位数字 UID，保存在 `/etc/config/forcedata`（请勿修改，否则影响部署）
- 一键安装 / 升级 forcecloud 客户端，自动区分 x86_64 / aarch64 架构，下载包做 MD5 校验
- 通过 crontab 每分钟自检：进程掉线自动拉起，根分区使用率 100% 时自动跳过更新
- 客户端异常重启、同一主机重复启动探针时，通过钉钉机器人推送报警
- 状态页可生成绑定二维码，用「原力云」微信小程序扫码绑定设备
- 管理脚本支持 install / upgrade / rm / start / stop / restart / status 子命令

## 🛠 技术栈

- LuCI（Lua）+ iStore/taskd 应用框架，依赖 `luci-lib-taskd`，包架构 all
- busybox ash Shell 管理脚本
- 页面二维码基于 qrcode.min.js 生成

## 🚀 快速开始

1. 编译安装：把本仓库放进 OpenWrt/LeDE 源码的 `package/` 目录，`make menuconfig` 选中 `LuCI → Applications → luci-app-forcedata`，编译出 ipk 后安装到路由器；
2. 首次安装时 uci-defaults 会自动注册每分钟执行一次的 crontab 保活任务；
3. 登录 LuCI 进入「服务 → Forcedata」，确认 UID 后等待状态变为 Running；
4. 点击「Running, click to show QR」生成二维码，用「原力云」微信小程序扫码绑定设备，详见[官方教程](https://docs.qq.com/doc/DZXNFWWtKbHN4UHFD)。

也可以在 SSH 里手动管理：

```sh
sh /usr/libexec/istorec/forcedata.sh install   # 安装 / 拉起客户端
sh /usr/libexec/istorec/forcedata.sh status    # 查看运行状态
sh /usr/libexec/istorec/forcedata.sh rm        # 停止进程并清理 /usr/local/forcecloud
```

## 📁 目录结构

```
luci-app-forcedata/
├── luasrc/                                  # LuCI 控制器、CBI 配置页、状态视图
├── po/zh-cn/                                # 简体中文语言包
├── root/
│   ├── etc/config/forcedata                 # UCI 配置（uid）
│   ├── etc/uci-defaults/luci-app-forcedata  # 首次安装注册 crontab
│   ├── usr/libexec/istorec/forcedata.sh     # 安装 / 保活 / 更新脚本
│   └── www/luci-static/forcedata/           # 二维码 JS 与小程序码图片
└── Makefile
```

## 🔗 相关链接

- [原力云官网](http://www.forcedata.cn)
- [小程序扫码绑定教程](https://docs.qq.com/doc/DZXNFWWtKbHN4UHFD)

## 📄 License

本仓库未附带 LICENSE 文件（Makefile 中标注维护者为 forcedata），仅供学习研究。
