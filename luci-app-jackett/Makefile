

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for jackett
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +luci-lib-taskd

define Package/luci-app-jackett/conffiles
/etc/config/jackett
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

