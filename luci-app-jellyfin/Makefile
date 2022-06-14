

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for jellyfin
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +luci-app-dockerman

define Package/luci-app-jellyfin/conffiles
/etc/config/jellyfin
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

