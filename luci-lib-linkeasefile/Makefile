
include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for linkease file
LUCI_DEPENDS:=+linkease-common-bin
LUCI_PKGARCH:=all
# PKG_RELEASE MUST be empty for luci.mk
LUCI_MINIFY_CSS:=0
LUCI_MINIFY_JS:=0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
