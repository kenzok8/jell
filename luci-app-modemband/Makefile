#
# Copyright 2022 Rafał Wabik - IceG - From eko.one.pl forum
# MIT License
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-modemband
LUCI_TITLE:=LuCI Support for modemband application
LUCI_DESCRIPTION:=LuCI interface for the modemband. The package allows set LTE bands for selected 4G modems.
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+sms-tool +modemband

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
