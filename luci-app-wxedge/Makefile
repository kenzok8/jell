

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for wxedge
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +luci-app-dockerman

define Package/luci-app-wxedge/conffiles
/etc/config/wxedge
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

