

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for nextcloud
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +luci-lib-taskd

define Package/luci-app-nextcloud/conffiles
/etc/config/nextcloud
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
