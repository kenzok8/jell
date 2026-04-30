# Copyright (C) 2020 Gyj1109
# 适配 OpenWrt 25.12 修改版

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-syncthing

LUCI_TITLE:=LuCI support for Syncthing
LUCI_PKGARCH:=all
# 适配 25.12：确保安装了 syncthing 后，LuCI 界面能正确拉起
LUCI_DEPENDS:=+syncthing

include $(TOPDIR)/feeds/luci/luci.mk

# 明确定义配置文件的归属，这对 25.12 的 apk 管理器非常重要
define Package/$(PKG_NAME)/conffiles
/etc/config/syncthing
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
