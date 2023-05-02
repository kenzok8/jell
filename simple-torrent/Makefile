# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=simple-torrent
PKG_VERSION:=1.3.9
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/boypt/simple-torrent/tar.gz/$(PKG_VERSION)?
PKG_HASH:=skip

PKG_LICENSE:=AGPL-3.0
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=Tianling Shen <cnsztl@immortalwrt.org>

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/boypt/simple-torrent
GO_PKG_LDFLAGS_X:=main.VERSION=$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/simple-torrent
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=BitTorrent
  TITLE:=A self-hosted remote torrent client
  URL:=https://github.com/boypt/simple-torrent
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle +libstdcpp
endef

define Package/simple-torrent/description
  SimpleTorrent is a a self-hosted remote torrent client, written in Go (golang).
  Started torrents remotely, download sets of files on the local disk of the server,
  which are then retrievable or streamable via HTTP.
endef

$(eval $(call GoBinPackage,simple-torrent))
$(eval $(call BuildPackage,simple-torrent))
