#
# Copyright (C) 2010-2011 OpenWrt.org
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=automount
PKG_FLAGS:=nonshared
PKG_RELEASE:=19

PKG_CONFIG_DEPENDS:= \
	CONFIG_TARGET_ramips \
	CONFIG_USB_SUPPORT

include $(INCLUDE_DIR)/package.mk

define Package/automount
  TITLE:=Mount autoconfig hotplug script.
  MAINTAINER:=Lean
  DEPENDS:= \
    +luci-app-partexp \
    +block-mount \
    +e2fsprogs \
    +USB_SUPPORT:kmod-usb-storage \
    +USB_SUPPORT:kmod-usb-storage-extras \
    +(!TARGET_ramips&&USB_SUPPORT):kmod-usb-storage-uas \
    +kmod-fs-ext4 \
    +kmod-fs-exfat \
    +kmod-fs-vfat \
    +ntfs3-mount
  PKGARCH:=all
endef

define Package/ntfs3-mount
  SECTION:=utils
  CATEGORY:=Utilities
  SUBMENU:=Filesystem
  TITLE:=NTFS mount script for Paragon NTFS3 driver
  DEPENDS:=+kmod-fs-ntfs3
  CONFLICTS:=ntfs-3g
  VARIANT:=ntfs3-mount
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/automount/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults
endef

define Package/ntfs3-mount/install
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_BIN) ./files/mount.ntfs $(1)/sbin
endef

$(eval $(call BuildPackage,automount))
$(eval $(call BuildPackage,ntfs3-mount))
