

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for ghttpd
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+ghttpd

define Package/luci-app-ghttpd/conffiles
/etc/config/ghttpd
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
