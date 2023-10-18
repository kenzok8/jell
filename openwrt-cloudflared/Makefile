include $(TOPDIR)/rules.mk

PKG_NAME:=openwrt-cloudflared
PKG_VERSION:=2023.8.2
PKG_RELEASE:=39

PKG_LICENSE:=MPLv2
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=yichya <mail@yichya.dev>

PKG_SOURCE:=cloudflared-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/cloudflare/cloudflared/tar.gz/${PKG_VERSION}?
PKG_HASH:=skip
PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1

GO_PKG:=github.com/cloudflare/cloudflared

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/../feeds/packages/lang/golang/golang-package.mk

define Package/$(PKG_NAME)
	SECTION:=Custom
	CATEGORY:=Extra packages
	TITLE:=cloudflared
	DEPENDS:=$(GO_ARCH_DEPENDS)
endef

define Package/$(PKG_NAME)/description
	Argo tunnel client
endef

define Package/$(PKG_NAME)/config
menu "openwrt-cloudflared Configuration"
        depends on PACKAGE_$(PKG_NAME)

config PACKAGE_OPENWRT_CLOUDFLARED_USE_EXTERNAL_GO_TOOLCHAIN
	bool "Use external go toolchain"
	default n

config PACKAGE_OPENWRT_CLOUDFLARED_EXTERNAL_GO_TOOLCHAIN
	depends on PACKAGE_OPENWRT_CLOUDFLARED_USE_EXTERNAL_GO_TOOLCHAIN
	string "External go toolchain executable"
	default ""

config PACKAGE_OPENWRT_CLOUDFLARED_RUN_AS_NETWORK
        bool "Run as user network"
        default n

endmenu
endef

MAKE_PATH:=$(GO_PKG_WORK_DIR_NAME)/build/src/$(GO_PKG)
MAKE_VARS+=$(GO_PKG_VARS)

define Build/Patch
	$(CP) $(PKG_BUILD_DIR)/../cloudflared-$(PKG_VERSION)/* $(PKG_BUILD_DIR)
endef

DATE:=$(shell date -u '+%Y-%m-%d-%H%M UTC')
VERSION_FLAGS:=-X "main.Version=$(PKG_VERSION)" -X "main.BuildTime=$(DATE)"

ifdef CONFIG_PACKAGE_OPENWRT_CLOUDFLARED_USE_EXTERNAL_GO_TOOLCHAIN
	GO_TOOLCHAIN_EXECUTABLE:=$(CONFIG_PACKAGE_OPENWRT_CLOUDFLARED_EXTERNAL_GO_TOOLCHAIN)
else
	GO_TOOLCHAIN_EXECUTABLE:=go
endif

define Build/Compile
	cd $(PKG_BUILD_DIR); $(GO_PKG_VARS) CGO_ENABLED=0 $(GO_TOOLCHAIN_EXECUTABLE) build -trimpath -ldflags '-s -w $(VERSION_FLAGS)' -o $(PKG_INSTALL_DIR)/bin/cloudflared ./cmd/cloudflared;
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/etc/init.d
ifdef CONFIG_PACKAGE_OPENWRT_CLOUDFLARED_RUN_AS_NETWORK
	$(INSTALL_BIN) ./cloudflared.network $(1)/etc/init.d/cloudflared
else
	$(INSTALL_BIN) ./cloudflared.init $(1)/etc/init.d/cloudflared
endif
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/bin/cloudflared $(1)/usr/bin/cloudflared
	$(INSTALL_DIR) $(1)/lib/upgrade/keep.d
	$(INSTALL_DATA) ./cloudflared.upgrade $(1)/lib/upgrade/keep.d/cloudflared
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
