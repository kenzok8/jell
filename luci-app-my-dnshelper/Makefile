#
# [K] 2022
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-my-dnshelper

PKG_LICENSE:=GPLv2
LUCI_URL:=https://github.com/kongfl888/openwrt-my-dnshelper
LUCI_TITLE:=LuCI App for my-dnshelper.
LUCI_DESCRIPTION:=LuCI App for my-dnshelper which is your helper of setting dns server of your openwrt.
LUCI_MAINTAINER:=K
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+my-dnshelper

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
