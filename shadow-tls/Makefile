# SPDX-License-Identifier: GPL-2.0-only

include $(TOPDIR)/rules.mk
include $(INCLUDE_DIR)/package.mk

PKG_NAME:=shadow-tls
PKG_VERSION:=0.2.25
PKG_RELEASE:=3

RELEASE_HEAD:=$(PKG_NAME)
RELEASE_FOOT:=unknown-linux-musl
ifeq ($(ARCH),aarch64)
    PKG_ARCH:=$(RELEASE_HEAD)-aarch64-$(RELEASE_FOOT)
    PKG_HASH:=skip
else ifeq ($(ARCH),arm)
    ifeq ($(CONFIG_CPU_TYPE),cortex-a7)
        PKG_ARCH:=$(RELEASE_HEAD)-armv7-$(RELEASE_FOOT)eabihf
        PKG_HASH:=skip
    else ifeq ($(CONFIG_CPU_TYPE),cortex-a9)
        PKG_ARCH:=$(RELEASE_HEAD)-armv7-$(RELEASE_FOOT)eabihf
        PKG_HASH:=skip
    else
        PKG_ARCH:=$(RELEASE_HEAD)-arm-$(RELEASE_FOOT)eabi
        PKG_HASH:=skip
    endif
else ifeq ($(ARCH),x86_64)
    PKG_ARCH:=$(RELEASE_HEAD)-x86_64-$(RELEASE_FOOT)
    PKG_HASH:=skip
else
    PKG_SOURCE:=dummy
    PKG_HASH:=skip
endif

PKG_LICENSE:=GPL-3.0
PKG_LICENSE_FILE:=LICENSE
PKG_MAINTAINER:=Tianling Shen <cnsztl@immortalwrt.org>

define Download/shadow-tls
	URL:=https://github.com/ihciah/shadow-tls/releases/download/v$(PKG_VERSION)
	URL_FILE:=$(PKG_ARCH)
	FILE:=$(PKG_ARCH)
	HASH:=skip
endef

define Package/shadow-tls
	SECTION:=net
	CATEGORY:=Network
	SUBMENU:=Web Servers/Proxies
	TITLE:=A proxy to expose real tls handshake to the firewall.
	URL:=https://github.com/ihciah/shadow-tls
	DEPENDS:=@USE_MUSL @(aarch64||arm||x86_64) @!(TARGET_x86_geode||TARGET_x86_legacy)
endef

define Build/Prepare
	$(call Build/Prepare/Default)
ifneq ($(CONFIG_PACKAGE_shadow-tls),)
	$(call Download,shadow-tls)
endif
endef

define Build/Compile
endef

define Package/shadow-tls/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(DL_DIR)/$(PKG_ARCH) $(1)/usr/bin/shadow-tls
endef

$(eval $(call BuildPackage,shadow-tls))