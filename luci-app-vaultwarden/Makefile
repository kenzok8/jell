

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for Vaultwarden
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +luci-lib-taskd

define Package/luci-app-vaultwarden/conffiles
/etc/config/vaultwarden
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
