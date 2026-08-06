#
# Copyright (C) 2015-2016 OpenWrt.org
# Copyright (C) 2020 jjm2473@gmail.com
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_ARCH_LINKEASE:=$(ARCH)

PKG_NAME:=linkease-common-bin
# use PKG_SOURCE_DATE instead of PKG_VERSION for compitable
PKG_SOURCE_DATE:=1.7.5
PKG_RELEASE:=3

ARCH_HEXCODE:=
ifeq ($(ARCH),x86_64)
ARCH_HEXCODE=8664
PKG_HASH:=skip
else ifeq ($(ARCH),aarch64)
ARCH_HEXCODE=aa64
PKG_HASH:=skip
else ifeq ($(ARCH),arm)
ARCH_HEXCODE=aa32
PKG_HASH:=skip
else ifeq ($(ARCH),mipsel)
ARCH_HEXCODE=1b0c
endif

PKG_SOURCE_VERSION:=8895348606dc6cab9b25a75576e5142f553dfa82
PKG_SOURCE:=linkease-common-bin-$(PKG_SOURCE_DATE)-linux-$(PKG_ARCH_LINKEASE).tar.gz
PKG_SOURCE_URL:=https://github.com/istoreos/istoreos-app-hub/releases/download/linkease-runtime-v$(PKG_SOURCE_DATE)/
PKG_BUILD_DIR:=$(BUILD_DIR)/linkease-common-bin-$(PKG_SOURCE_DATE)-linux-$(PKG_ARCH_LINKEASE)

PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=net
	CATEGORY:=Network
	SUBMENU:=Web Servers/Proxies
	TITLE:=LinkEase common binary tools
	DEPENDS:=@(arm||x86_64||aarch64)
	PKGARCH:=all
	URL:=https://www.linkease.com/
endef

define Package/$(PKG_NAME)/description
  Common LinkEase binary tools shared by LinkEase editions.
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/heif-converter $(1)/usr/sbin/heif-converter
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/linkease-media $(1)/usr/sbin/linkease-media
	$(INSTALL_BIN) ./files/linkease-config.sh $(1)/usr/sbin/linkease-config.sh
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
