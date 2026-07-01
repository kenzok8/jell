#
# Copyright (C) 2026 KaiPlus Contributors
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=KaiPlus
LUCI_DEPENDS:=+kaiplus +luci-compat
LUCI_MINIFY_CSS:=0
LUCI_MINIFY_JS:=0

define Package/luci-app-kaiplus/conffiles
/etc/config/kaiplus
endef

define Package/luci-app-kaiplus/postrm
#!/bin/sh
rm -f /tmp/luci-indexcache
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
