

include $(TOPDIR)/rules.mk


LUCI_TITLE:=LuCI support for Excalidraw
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+docker +luci-lib-taskd +luci-lib-docker

define Package/luci-app-excalidraw/conffiles
/etc/config/excalidraw
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
