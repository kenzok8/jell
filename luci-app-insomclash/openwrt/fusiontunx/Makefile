include $(TOPDIR)/rules.mk

PKG_NAME:=fusiontunx
PKG_VERSION:=1.0.3
PKG_RELEASE:=2

PKG_MAINTAINER:=BobbyUnknown
PKG_LICENSE:=MIT

# Mihomo version for download
MIHOMO_VERSION:=v1.19.17

include $(INCLUDE_DIR)/package.mk

# Architecture mapping for fusiontunx binary
ifeq ($(ARCH),x86_64)
  FUSIONTUNX_ARCH:=amd64
  MIHOMO_ARCH:=amd64-v1
else ifeq ($(ARCH),i386)
  FUSIONTUNX_ARCH:=386
  MIHOMO_ARCH:=386
else ifeq ($(ARCH),aarch64)
  FUSIONTUNX_ARCH:=arm64
  MIHOMO_ARCH:=arm64
else ifeq ($(ARCH),arm)
  FUSIONTUNX_ARCH:=armv7
  MIHOMO_ARCH:=armv7
else ifeq ($(ARCH),mips)
  FUSIONTUNX_ARCH:=mips
  MIHOMO_ARCH:=mips-softfloat
else ifeq ($(ARCH),mipsel)
  FUSIONTUNX_ARCH:=mipsle
  MIHOMO_ARCH:=mipsle-softfloat
else ifeq ($(ARCH),mips64)
  FUSIONTUNX_ARCH:=mips64
  MIHOMO_ARCH:=mips64
else ifeq ($(ARCH),mips64el)
  FUSIONTUNX_ARCH:=mips64le
  MIHOMO_ARCH:=mips64le
else ifeq ($(ARCH),riscv64)
  FUSIONTUNX_ARCH:=riscv64
  MIHOMO_ARCH:=riscv64
else
  FUSIONTUNX_ARCH:=amd64
  MIHOMO_ARCH:=amd64-v1
endif

# Source directories (relative to package root, not openwrt/fusiontunx)
PKG_SOURCE_DIR:=$(CURDIR)/../..

define Package/fusiontunx
  SECTION:=net
  CATEGORY:=Network
  TITLE:=FusionTunX Core + Mihomo
  URL:=https://github.com/bobbyunknown/FusionTunX
  DEPENDS:=+ca-bundle +ip-full +kmod-tun +kmod-nft-core +kmod-nft-nat +kmod-nft-tproxy +kmod-nft-socket
endef

define Package/fusiontunx/description
  FusionTunX + Mihomo Core Binary
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	
	@echo "Copying fusiontunx binary for $(ARCH) ($(FUSIONTUNX_ARCH))..."
	$(CP) $(PKG_SOURCE_DIR)/core/fusiontunx-linux-$(FUSIONTUNX_ARCH) $(PKG_BUILD_DIR)/fusiontunx
	chmod +x $(PKG_BUILD_DIR)/fusiontunx
	
	@echo "Downloading Mihomo $(MIHOMO_VERSION) for $(MIHOMO_ARCH)..."
	wget -q -O $(PKG_BUILD_DIR)/mihomo.gz "https://github.com/MetaCubeX/mihomo/releases/download/$(MIHOMO_VERSION)/mihomo-linux-$(MIHOMO_ARCH)-$(MIHOMO_VERSION).gz"
	gunzip -f $(PKG_BUILD_DIR)/mihomo.gz
	chmod +x $(PKG_BUILD_DIR)/mihomo
	
	$(CP) -r $(PKG_SOURCE_DIR)/files/* $(PKG_BUILD_DIR)/

	@echo "Downloading GeoIP assets..."
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

define Package/fusiontunx/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_DIR) $(1)/usr/share/fusiontunx
	$(INSTALL_DIR) $(1)/etc/fusiontunx/configs
	$(INSTALL_DIR) $(1)/etc/fusiontunx/proxy_providers
	$(INSTALL_DIR) $(1)/etc/fusiontunx/rule_providers
	$(INSTALL_DIR) $(1)/etc/fusiontunx/ui

	$(INSTALL_BIN) $(PKG_BUILD_DIR)/fusiontunx $(1)/usr/share/fusiontunx/fusiontunx
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/mihomo $(1)/usr/bin/mihomo

	$(INSTALL_DATA) $(PKG_BUILD_DIR)/app.yaml $(1)/etc/fusiontunx/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/country.mmdb $(1)/etc/fusiontunx/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geoip.dat $(1)/etc/fusiontunx/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geosite.dat $(1)/etc/fusiontunx/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geoip.metadb $(1)/etc/fusiontunx/

	$(INSTALL_DATA) $(PKG_BUILD_DIR)/configs/* $(1)/etc/fusiontunx/configs/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/proxy_providers/* $(1)/etc/fusiontunx/proxy_providers/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/rule_providers/* $(1)/etc/fusiontunx/rule_providers/

	$(CP) -r $(PKG_BUILD_DIR)/ui/* $(1)/etc/fusiontunx/ui/
endef

define Package/fusiontunx/conffiles
/etc/fusiontunx/app.yaml
/etc/fusiontunx/configs/config.yaml
/etc/fusiontunx/proxy_providers/proxy.yaml
/etc/fusiontunx/rule_providers/rule.yaml
endef

$(eval $(call BuildPackage,fusiontunx))
