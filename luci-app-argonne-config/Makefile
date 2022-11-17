include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-argonne-config

PKG_MAINTAINER:=jerrykuku <jerrykuku@qq.com>

LUCI_TITLE:=LuCI page for Argonne Config
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-compat +luci-theme-argonne

define Package/$(PKG_NAME)/conffiles
/etc/config/argonne
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
