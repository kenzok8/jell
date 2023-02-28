

include $(TOPDIR)/rules.mk

PKG_VERSION:=1.1.1-20230108
PKG_RELEASE:=18

LUCI_TITLE:=LuCI support for homeassistant
LUCI_PKGARCH:=all
LUCI_DEPENDS:=@(aarch64||arm||x86_64) +luci-app-dockerman +luci-lib-taskd

define Package/luci-app-homeassistant/conffiles
/etc/config/homeassistant
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
