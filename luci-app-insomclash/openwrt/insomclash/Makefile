include $(TOPDIR)/rules.mk

PKG_NAME:=insomclash
PKG_VERSION:=1.0.3
PKG_RELEASE:=1

PKG_MAINTAINER:=BobbyUnknown
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/insomclash
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Insomclash Core + Mihomo
  URL:=https://github.com/bobbyunknown/Insomclash
  DEPENDS:=+ca-bundle +ip-full +kmod-tun +kmod-nft-core +kmod-nft-nat +kmod-nft-tproxy +kmod-ipt-nat +iptables-nft +kmod-nft-socket +xtables-nft
endef

define Package/insomclash/description
  Insomclash + Mihomo Core Binary
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) $(CURDIR)/core/insomclash $(PKG_BUILD_DIR)/
	$(CP) $(CURDIR)/core/mihomo $(PKG_BUILD_DIR)/
	$(CP) -r $(CURDIR)/files/* $(PKG_BUILD_DIR)/
	chmod +x $(PKG_BUILD_DIR)/insomclash
	chmod +x $(PKG_BUILD_DIR)/mihomo

	wget -q -O $(PKG_BUILD_DIR)/country.mmdb https://github.com/rtaserver/meta-rules-dat/releases/latest/download/country.mmdb
	wget -q -O $(PKG_BUILD_DIR)/geoip.dat https://github.com/rtaserver/meta-rules-dat/releases/latest/download/geoip.dat
	wget -q -O $(PKG_BUILD_DIR)/geosite.dat https://github.com/rtaserver/meta-rules-dat/releases/latest/download/geosite.dat
	wget -q -O $(PKG_BUILD_DIR)/geoip.metadb https://github.com/rtaserver/meta-rules-dat/releases/download/latest/geoip.metadb

	@echo "Downloading Zashboard..."
	curl -sL -o $(PKG_BUILD_DIR)/zashboard.zip "https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip"
	mkdir -p $(PKG_BUILD_DIR)/ui/zashboard
	unzip -q $(PKG_BUILD_DIR)/zashboard.zip -d $(PKG_BUILD_DIR)/temp_zashboard
	mv $(PKG_BUILD_DIR)/temp_zashboard/dist/* $(PKG_BUILD_DIR)/ui/zashboard/
	rm -rf $(PKG_BUILD_DIR)/temp_zashboard $(PKG_BUILD_DIR)/zashboard.zip

	@echo "Downloading MetaCubeXD..."
	curl -sL -o $(PKG_BUILD_DIR)/metacubexd.tgz "https://github.com/MetaCubeX/metacubexd/releases/latest/download/compressed-dist.tgz"
	mkdir -p $(PKG_BUILD_DIR)/ui/metacubexd
	tar -xzf $(PKG_BUILD_DIR)/metacubexd.tgz -C $(PKG_BUILD_DIR)/ui/metacubexd
	rm $(PKG_BUILD_DIR)/metacubexd.tgz

	@echo "Downloading Yacd..."
	curl -sL -o $(PKG_BUILD_DIR)/yacd.zip "https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip"
	unzip -q $(PKG_BUILD_DIR)/yacd.zip -d $(PKG_BUILD_DIR)/temp_yacd
	mv $(PKG_BUILD_DIR)/temp_yacd/Yacd-meta-gh-pages $(PKG_BUILD_DIR)/ui/yacd
	rm -rf $(PKG_BUILD_DIR)/temp_yacd $(PKG_BUILD_DIR)/yacd.zip
endef

define Build/Compile
endef

define Package/insomclash/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_DIR) $(1)/usr/share/insomclash
	$(INSTALL_DIR) $(1)/etc/insomclash/configs
	$(INSTALL_DIR) $(1)/etc/insomclash/proxy_providers
	$(INSTALL_DIR) $(1)/etc/insomclash/rule_providers
	$(INSTALL_DIR) $(1)/etc/insomclash/ui

	$(INSTALL_BIN) $(PKG_BUILD_DIR)/insomclash $(1)/usr/share/insomclash/insomclash
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/mihomo $(1)/usr/bin/mihomo

	$(INSTALL_DATA) $(PKG_BUILD_DIR)/app.yaml $(1)/etc/insomclash/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/country.mmdb $(1)/etc/insomclash/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geoip.dat $(1)/etc/insomclash/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geosite.dat $(1)/etc/insomclash/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geoip.metadb $(1)/etc/insomclash/

	$(INSTALL_DATA) $(PKG_BUILD_DIR)/configs/* $(1)/etc/insomclash/configs/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/proxy_providers/* $(1)/etc/insomclash/proxy_providers/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/rule_providers/* $(1)/etc/insomclash/rule_providers/

	$(CP) -r $(PKG_BUILD_DIR)/ui/* $(1)/etc/insomclash/ui/
endef

define Package/insomclash/conffiles
/etc/insomclash/app.yaml
/etc/insomclash/configs/config.yaml
/etc/insomclash/proxy_providers/proxy.yaml
/etc/insomclash/rule_providers/rule.yaml
endef

$(eval $(call BuildPackage,insomclash))
