# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) kenzok8 <https://github.com/kenzok8>

include $(TOPDIR)/rules.mk

PKG_NAME:=upx-static
PKG_VERSION:=5.1.1
PKG_RELEASE:=161
PKG_SOURCE_VERSION:=6cc54699361b90d72488a6fbf1df9a590dfd0f3f

# Map OpenWrt $(ARCH) to UPX pre-built binary arch name.
# NOTE: OpenWrt uses "aarch64", UPX tarball uses "arm64".
ifeq ($(ARCH),x86_64)
  UPX_ARCH:=amd64
else ifeq ($(ARCH),i386)
  UPX_ARCH:=i386
else ifeq ($(ARCH),aarch64)
  UPX_ARCH:=arm64
else ifeq ($(ARCH),arm)
  UPX_ARCH:=arm
else ifeq ($(ARCH),armeb)
  UPX_ARCH:=armeb
else ifeq ($(ARCH),mipsel)
  UPX_ARCH:=mipsel
else ifeq ($(ARCH),mips)
  UPX_ARCH:=mips
else ifeq ($(ARCH),powerpc)
  UPX_ARCH:=powerpc
else ifeq ($(ARCH),powerpc64)
  UPX_ARCH:=powerpc64le
else ifeq ($(ARCH),riscv64)
  UPX_ARCH:=riscv64
endif

PKG_SOURCE:=upx-$(PKG_VERSION)-$(UPX_ARCH)_linux.tar.xz
PKG_SOURCE_URL:=https://github.com/upx/upx/releases/download/$(PKG_SOURCE_VERSION)

# AUTO-GENERATED HASHES BEGIN
ifeq ($(UPX_ARCH),amd64)
  PKG_HASH:=skip
else ifeq ($(UPX_ARCH),i386)
  PKG_HASH:=skip
else ifeq ($(UPX_ARCH),arm64)
  PKG_HASH:=skip
else ifeq ($(UPX_ARCH),arm)
  PKG_HASH:=skip
else ifeq ($(UPX_ARCH),armeb)
  PKG_HASH:=skip
else ifeq ($(UPX_ARCH),mipsel)
  PKG_HASH:=skip
else ifeq ($(UPX_ARCH),mips)
  PKG_HASH:=skip
else ifeq ($(UPX_ARCH),powerpc)
  PKG_HASH:=skip
else ifeq ($(UPX_ARCH),powerpc64le)
  PKG_HASH:=skip
else ifeq ($(UPX_ARCH),riscv64)
  PKG_HASH:=skip
else
  $(error Unsupported UPX_ARCH '$(UPX_ARCH)' for upx-static)
endif
# AUTO-GENERATED HASHES END

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SUBMENU:=Compression
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=UPX - The Ultimate Packer for eXecutables
  URL:=https://upx.github.io
endef

define Package/$(PKG_NAME)/description
  UPX is a free, portable, extendable, high-performance executable
  packer for several executable formats. This package installs the
  statically-linked pre-built binary from the official upstream release.
endef

define Build/Prepare
	rm -rf $(PKG_BUILD_DIR)
	mkdir -p $(PKG_BUILD_DIR)
	tar -xJf $(DL_DIR)/$(PKG_SOURCE) -C $(PKG_BUILD_DIR) --strip-components=1
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/upx $(1)/bin/upx
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
