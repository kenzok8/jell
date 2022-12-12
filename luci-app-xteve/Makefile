

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for Xteve
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +luci-lib-taskd +luci-lib-docker

define Package/luci-app-xteve/conffiles
/etc/config/xteve
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
