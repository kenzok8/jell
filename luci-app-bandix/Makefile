# See /LICENSE for more information.
# This is free software, licensed under the GNU General Public License v2.

include $(TOPDIR)/rules.mk

PKG_LICENSE:=Apache-2.0

LUCI_TITLE:=LuCI Bandix app for network traffic monitoring
LUCI_DEPENDS:=+luci-base +luci-lib-jsonc +curl +bandix +jsonfilter +jshn

PKG_MAINTAINER:=timsaya


include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature 