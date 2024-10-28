

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for mfun
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +luci-lib-taskd

define Package/luci-app-mfun/conffiles
/etc/config/mfun
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
