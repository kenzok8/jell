

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for ubuntu
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +luci-app-dockerman

define Package/luci-app-ubuntu/conffiles
/etc/config/ubuntu
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

