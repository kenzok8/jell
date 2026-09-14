# SPDX-License-Identifier: GPL-2.0-only
include $(TOPDIR)/rules.mk

PKG_LICENSE:=GPL-2.0-only AND CC0-1.0 AND MIT AND LicenseRef-Public-Domain AND LicenseRef-fnOS-Trademark
LUCI_MAINTAINER:=coolsnowwolf <coolsnowwolf@gmail.com>

LUCI_TITLE:=Local OUI vendor icons for DHCP leases
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

define Package/luci-app-oui/conffiles
/etc/config/oui
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
