include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for DockerGo
LUCI_DEPENDS:=@(aarch64||arm||x86_64) \
	+luci-lib-taskd \
	+curl \
	+ca-bundle \
	+docker +dockerd \
	+dockerd
LUCI_PKGARCH:=all
LUCI_MINIFY_JS:=0
LUCI_MINIFY_CSS:=0

PKG_LICENSE:=GPL-2.0-or-later
PKG_MAINTAINER:=DockerGo

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
