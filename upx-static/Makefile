
# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) kenzok8 <https://github.com/kenzok8>

include $(TOPDIR)/rules.mk

PKG_NAME:=upx-static
PKG_VERSION:=5.1.1
PKG_RELEASE:=177
PKG_SOURCE_VERSION:=965cb22e9e53a4701b2fd03bda107f6e66dbd51a

# Map OpenWrt $(ARCH) to UPX pre-built binary arch name.
# NOTE: OpenWrt uses "aarch64", UPX tarball uses "arm64".
UPX_ARCH:=$(ARCH)
ifeq ($(findstring x86_64,$(ARCH)),x86_64)
  UPX_ARCH:=amd64
else ifeq ($(findstring i386,$(ARCH)),i386)
  UPX_ARCH:=i386
else ifeq ($(findstring aarch64,$(ARCH)),aarch64)
  UPX_ARCH:=arm64
else ifeq ($(findstring arm,$(ARCH)),arm)
  UPX_ARCH:=arm
else ifeq ($(findstring armeb,$(ARCH)),armeb)
  UPX_ARCH:=armeb
else ifeq ($(findstring mipsel,$(ARCH)),mipsel)
  UPX_ARCH:=mipsel
else ifeq ($(findstring mips,$(ARCH)),mips)
  UPX_ARCH:=mips
else ifeq ($(findstring powerpc,$(ARCH)),powerpc)
  UPX_ARCH:=powerpc
else ifeq ($(findstring powerpc64,$(ARCH)),powerpc64)
  UPX_ARCH:=powerpc64le
else ifeq ($(findstring riscv64,$(ARCH)),riscv64)
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
