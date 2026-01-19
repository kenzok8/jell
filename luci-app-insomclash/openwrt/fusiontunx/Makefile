include $(TOPDIR)/rules.mk

PKG_NAME:=fusiontunx
PKG_VERSION:=1.0.3
PKG_RELEASE:=4

PKG_MAINTAINER:=BobbyUnknown
PKG_LICENSE:=MIT

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/bobbyunknown/FusionTunX.git
PKG_SOURCE_VERSION:=dev
PKG_HASH:=skip
#PKG_MIRROR_HASH:=f37155115e9e96661b5c5d41f7c33d0af6babaebe66dbe9017858292d6cb4589
PKG_SOURCE_SUBDIR:=$(PKG_NAME)-$(PKG_VERSION)
PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz

PKG_BUILD_DEPENDS:=node/host golang/host

MIHOMO_VERSION:=v1.19.18

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

GO_PKG:=github.com/bobbyunknown/FusionTunX

# Determine Mihomo arch suffix
MIHOMO_ARCH:=$(GO_ARCH)
ifeq ($(GO_ARCH),arm)
  MIHOMO_ARCH:=armv$(or $(GO_ARM),7)
else ifeq ($(findstring mips,$(GO_ARCH)),mips)
  MIHOMO_ARCH:=$(GO_ARCH)-$(or $(GO_MIPS),softfloat)
else ifeq ($(GO_ARCH),aarch64)
  MIHOMO_ARCH:=arm64
endif

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

define Build/Compile
	@echo "Building Vite dashboard..."
	cd $(PKG_BUILD_DIR)/src/dash && \
		npm install && \
		npm run build

	@echo "Preparing static files..."
	rm -rf $(PKG_BUILD_DIR)/src/internal/ui/dist
	cp -r $(PKG_BUILD_DIR)/src/dash/dist $(PKG_BUILD_DIR)/src/internal/ui/dist
	chmod -R 755 $(PKG_BUILD_DIR)/src/internal/ui/dist

	@echo "Installing dependencies and generating Swagger..."
	cd $(PKG_BUILD_DIR)/src && \
		go mod tidy && \
		go install github.com/swaggo/swag/cmd/swag@latest && \
		$(HOME)/go/bin/swag init -g cmd/server/main.go -o docs

	@echo "Compiling FusionTunX Go binary..."
	cd $(PKG_BUILD_DIR)/src && \
		GOOS=linux \
		GOARCH=$(GO_ARCH) \
		$(if $(findstring arm,$(GO_ARCH)),GOARM=$(or $(GO_ARM),7)) \
		$(if $(findstring mips,$(GO_ARCH)),GOMIPS=$(or $(GO_MIPS),softfloat)) \
		CGO_ENABLED=0 \
		go build -v -trimpath -ldflags="-s -w" -o $(PKG_BUILD_DIR)/fusiontunx ./cmd/server

	@echo "Downloading Mihomo $(MIHOMO_VERSION)..."
	wget -q -O $(PKG_BUILD_DIR)/mihomo.gz "https://github.com/MetaCubeX/mihomo/releases/download/$(MIHOMO_VERSION)/mihomo-linux-$(MIHOMO_ARCH)-$(MIHOMO_VERSION).gz"
	gunzip -f $(PKG_BUILD_DIR)/mihomo.gz
	chmod +x $(PKG_BUILD_DIR)/mihomo

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

define Package/fusiontunx/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_DIR) $(1)/usr/share/fusiontunx
	$(INSTALL_DIR) $(1)/etc/fusiontunx/configs
	$(INSTALL_DIR) $(1)/etc/fusiontunx/proxy_providers
	$(INSTALL_DIR) $(1)/etc/fusiontunx/rule_providers
	$(INSTALL_DIR) $(1)/etc/fusiontunx/ui

	$(INSTALL_BIN) $(PKG_BUILD_DIR)/fusiontunx $(1)/usr/share/fusiontunx/fusiontunx
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/mihomo $(1)/usr/bin/mihomo

	$(INSTALL_DATA) $(PKG_BUILD_DIR)/files/app.yaml $(1)/etc/fusiontunx/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/country.mmdb $(1)/etc/fusiontunx/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geoip.dat $(1)/etc/fusiontunx/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geosite.dat $(1)/etc/fusiontunx/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geoip.metadb $(1)/etc/fusiontunx/

	$(INSTALL_DATA) $(PKG_BUILD_DIR)/files/configs/* $(1)/etc/fusiontunx/configs/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/files/proxy_providers/* $(1)/etc/fusiontunx/proxy_providers/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/files/rule_providers/* $(1)/etc/fusiontunx/rule_providers/

	$(CP) -r $(PKG_BUILD_DIR)/ui/* $(1)/etc/fusiontunx/ui/
endef

define Package/fusiontunx/conffiles
/etc/fusiontunx/app.yaml
/etc/fusiontunx/configs/config.yaml
/etc/fusiontunx/proxy_providers/proxy.yaml
/etc/fusiontunx/rule_providers/rule.yaml
endef

$(eval $(call BuildPackage,fusiontunx))
