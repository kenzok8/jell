# - Copyright 2024
# - bobbyunknown <https://github.com/bobbyunknown>
#
# https://opensource.org/license/mit
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.


include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-insomclash
PKG_VERSION:=1.0.1
PKG_RELEASE:=3

PKG_MAINTAINER:=BobbyUnknown <bobbyun.known88@gmail.com>

LUCI_TITLE:=Luci Simple Tunnel Client for Mihomo
LUCI_DEPENDS:=+wget +curl +coreutils-base64 +coreutils-nohup +jq +yq +ip-full +iptables-mod-tproxy +firewall4 kmod-nft-tproxy +xtables-nft +kmod-tun +ca-bundle +mihomo
LUCI_PKGARCH:=all

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

RUN_DIR=/etc/insomclash

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=$(LUCI_TITLE)
  PKGARCH:=$(LUCI_PKGARCH)
  DEPENDS:=$(LUCI_DEPENDS)
  MAINTAINER:=$(PKG_MAINTAINER)
endef

define Package/$(PKG_NAME)/description
    Luci Simple Tunnel Client for Mihomo (Clash Meta Core). Provides transparent proxy with TUN/TPROXY mode.
endef

define Build/Prepare
    # No preparation steps required
endef

define Build/Compile
    # No compilation steps required
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/$(RUN_DIR)/config
	$(INSTALL_DATA) ./root/$(RUN_DIR)/config/* $(1)/$(RUN_DIR)/config/
	$(INSTALL_DIR) $(1)/$(RUN_DIR)/proxy_providers
	$(INSTALL_DATA) ./root/$(RUN_DIR)/proxy_providers/* $(1)/$(RUN_DIR)/proxy_providers/
	$(INSTALL_DIR) $(1)/$(RUN_DIR)/rule_providers
	$(INSTALL_DATA) ./root/$(RUN_DIR)/rule_providers/* $(1)/$(RUN_DIR)/rule_providers/

	$(INSTALL_DIR) $(1)/$(RUN_DIR)/ui
	$(CP) -R ./root/$(RUN_DIR)/ui/* $(1)/$(RUN_DIR)/ui/

	$(INSTALL_DIR) $(1)/usr/share/insomclash
	$(INSTALL_DIR) $(1)/usr/share/insomclash/rules_nft
	$(CP) -R ./root/usr/share/insomclash/rules_nft/* $(1)/usr/share/insomclash/rules_nft/
	$(INSTALL_BIN) ./root/usr/share/insomclash/insomclash $(1)/usr/share/insomclash/
	$(INSTALL_BIN) ./root/usr/share/insomclash/routing-tun $(1)/usr/share/insomclash/
	$(INSTALL_BIN) ./root/usr/share/insomclash/routing-tproxy $(1)/usr/share/insomclash/
	$(INSTALL_BIN) ./root/usr/share/insomclash/log_job $(1)/usr/share/insomclash/

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/insomclash $(1)/etc/init.d/insomclash

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/insomclash $(1)/etc/config/insomclash

	$(INSTALL_DIR) $(1)/www/luci-static/resources/insomclash
	$(CP) -R ./htdocs/luci-static/resources/insomclash/* $(1)/www/luci-static/resources/insomclash/

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) ./luasrc/controller/insomclash.lua $(1)/usr/lib/lua/luci/controller/

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/cbi/insomclash
	$(INSTALL_DATA) ./luasrc/model/cbi/insomclash/config.lua $(1)/usr/lib/lua/luci/model/cbi/insomclash/

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/insomclash
	$(INSTALL_DATA) ./luasrc/view/insomclash/* $(1)/usr/lib/lua/luci/view/insomclash/
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] || {
	/etc/init.d/insomclash enable
	/etc/init.d/insomclash start
	sleep 5
	/etc/init.d/insomclash stop
	/etc/init.d/insomclash disable
}
endef

define Package/$(PKG_NAME)/prerm
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] || {
	/etc/init.d/insomclash stop
	/etc/init.d/insomclash disable
	echo "Insomclash uninstalled"
	echo "Thank you for using this app"
}
endef

$(eval $(call BuildPackage,$(PKG_NAME)))

