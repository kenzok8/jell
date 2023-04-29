# Copyright (C) 2020 Openwrt.org
#
# This is a free software, use it under GNU General Public License v3.0.
#
# Created By ImmortalWrt
# https://github.com/project-openwrt

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-naiveproxy
LUCI_TITLE:=LuCI support for NaiveProxy
LUCI_DEPENDS:=+naiveproxy
LUCI_PKGARCH:=all

PKG_MAINTAINER:=CN_SZTL <cnsztl@immortalwrt.org>

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature