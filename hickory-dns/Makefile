include $(TOPDIR)/rules.mk

PKG_NAME:=hickory-dns

# Set a base version with a git snapshot suffix for APK compatibility.
PKG_VERSION:=0.0.0_git20250618.1476c06
PKG_RELEASE:=12

# Set the full commit for the tarball and build directory.
HICKORY_COMMIT:=1476c0616e4653a58351abcf22ee512fad43fa6b

PKG_SOURCE:=hickory-dns-${PKG_VERSION}.tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/hickory-dns/hickory-dns/tar.gz/1476c0616e4653a58351abcf22ee512fad43fa6b?
PKG_HASH:=skip

# Override PKG_BUILD_DIR to match the extracted folder name
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-1476c0616e4653a58351abcf22ee512fad43fa6b

PKG_BUILD_DEPENDS:=rust/host
PKG_BUILD_PARALLEL:=1

RUST_PKG_FEATURES:=resolver,tls-ring,https-ring,quic-ring,h3-ring,rustls-platform-verifier,sqlite,prometheus-metrics

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/rust/rust-package.mk

define Package/hickory-dns
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=IP Addresses and Names
  TITLE:=A plug-in DNS forwarder/splitter
  URL:=https://github.com/hickory-dns/hickory-dns
  DEPENDS:=$(RUST_ARCH_DEPENDS)
endef

define Build/Compile
  $(call Build/Compile/Cargo,bin,--no-default-features)
endef

define Package/hickory-dns/install
	$(INSTALL_DIR) $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/bin/* $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_DIR) $(1)/etc/hickory-dns/
	$(INSTALL_BIN) ./files/etc/init.d/hickory-dns $(1)/etc/init.d/hickory-dns
	$(INSTALL_BIN) ./files/etc/hickory-dns/forwarder.toml $(1)/etc/hickory-dns/forwarder.toml
endef

$(eval $(call RustBinPackage,hickory-dns))
$(eval $(call BuildPackage,hickory-dns))