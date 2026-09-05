include $(TOPDIR)/rules.mk

PKG_NAME:=filebrowser-q
PKG_VERSION:=1.5.6-stable
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/gtsteffaniak/filebrowser/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=skip
PKG_BUILD_DIR:=$(BUILD_DIR)/filebrowser-$(PKG_VERSION)

PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=kiddin9

PKG_BUILD_DEPENDS:=golang/host node/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/gtsteffaniak/filebrowser/backend
GO_PKG_BUILD_DIR:=$(PKG_BUILD_DIR)/backend
GO_PKG_LDFLAGS_X:= \
	$(GO_PKG)/internal/version.Version=v$(PKG_VERSION) \
	$(GO_PKG)/internal/version.CommitSHA=$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/filebrowser-q
  SECTION:=utils
  CATEGORY:=Utilities
  SUBMENU:=Filesystem
  TITLE:=FileBrowser Quantum - Modern Web File Manager
  URL:=https://github.com/gtsteffaniak/filebrowser
  DEPENDS:=$(GO_ARCH_DEPENDS)
endef

define Package/filebrowser-q/description
  FileBrowser Quantum provides a modern, responsive web-based file management
  interface with multi-source, real-time search, and enhanced preview features.
endef

define Package/filebrowser-q/conffiles
/etc/filebrowser-q/
/etc/config/filebrowser-q
endef

define Build/Prepare
	$(call Build/Prepare/Default)
endef

define Build/Compile
	( \
		pushd $(PKG_BUILD_DIR)/frontend && \
		npm install && \
		npm run build ; \
	)
	( \
		cd $(PKG_BUILD_DIR)/backend && \
		$(GO_PKG_VARS) \
		go build \
			-trimpath \
			-ldflags="-w -s" \
			-o $(PKG_BUILD_DIR)/filebrowser . ; \
	)
endef

define Package/filebrowser-q/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/filebrowser $(1)/usr/bin/filebrowser-q

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) $(CURDIR)/files/filebrowser.config $(1)/etc/config/filebrowser-q
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(CURDIR)/files/filebrowser.init $(1)/etc/init.d/filebrowser-q
endef

$(eval $(call BuildPackage,filebrowser-q))
