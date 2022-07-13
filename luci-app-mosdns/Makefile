include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-mosdns

LUCI_TITLE:=LuCI Support for mosdns
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+mosdns +jsonfilter +bash +luci-compat +v2ray-geoip +v2ray-geosite

define Package/$(PKG_NAME)/conffiles
/etc/mosdns/cus_config.yaml
/etc/config/mosdns
/etc/mosdns/rule
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
