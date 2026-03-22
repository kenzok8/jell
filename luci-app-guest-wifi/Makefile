include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-guest-wifi
PKG_MAINTAINER:=kenzok8 <https://github.com/kenzok78>

LUCI_TITLE:=LuCI support for guest-wifi
LUCI_DEPENDS:=+luci-base +luci-compat
LUCI_PKGARCH:=all
LUCI_DESCRIPTION:=Simple guest WiFi configuration interface for LuCI

define Package/$(PKG_NAME)/conffiles
/etc/config/wireless
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
