
include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for Hermes
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +dockerd +luci-lib-taskd

define Package/luci-app-hermes/conffiles
/etc/config/hermes
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
