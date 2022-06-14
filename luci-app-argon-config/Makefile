include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-argon-config

PKG_MAINTAINER:=jerrykuku <jerrykuku@qq.com>

LUCI_TITLE:=LuCI page for Argon Config
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-compat +luci-theme-argon

define Package/$(PKG_NAME)/conffiles
/etc/config/argon
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
