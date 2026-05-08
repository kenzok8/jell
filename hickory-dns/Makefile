include $(TOPDIR)/rules.mk

PKG_NAME:=hickory-dns
PKG_VERSION:=2026.05.07~43b89c7
PKG_RELEASE:=65

HICKORY_COMMIT:=43b89c72ef2a4127f3d79df6bdf78f437af35ff1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/hickory-dns/hickory-dns/tar.gz/43b89c72ef2a4127f3d79df6bdf78f437af35ff1?
PKG_HASH:=skip

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-43b89c72ef2a4127f3d79df6bdf78f437af35ff1

PKG_BUILD_DEPENDS:=rust/host
PKG_BUILD_PARALLEL:=1

RUST_PKG_LOCKED:=0
RUST_PKG_FEATURES:=resolver,tls-ring,https-ring,quic-ring,h3-ring,rustls-platform-verifier,sqlite,prometheus-metrics,dnssec-ring

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
	+$(CARGO_PKG_VARS) \
	cargo build -v --profile $(CARGO_PKG_PROFILE) \
		--manifest-path "$(PKG_BUILD_DIR)/Cargo.toml" \
		--bin hickory-dns \
		--target $(RUSTC_TARGET_ARCH) \
		--features "$(RUST_PKG_FEATURES)" \
		--no-default-features \
		$(if $(filter --jobserver%,$(PKG_JOBS)),,-j1) \
		$(CARGO_PKG_ARGS)
	+$(INSTALL_DIR) $(PKG_INSTALL_DIR)/bin/
	+$(INSTALL_BIN) $(PKG_BUILD_DIR)/target/$(RUSTC_TARGET_ARCH)/$(CARGO_PKG_PROFILE)/hickory-dns $(PKG_INSTALL_DIR)/bin/
endef

define Package/hickory-dns/install
	$(INSTALL_DIR) $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/bin/* $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_DIR) $(1)/etc/hickory-dns/
	chown nobody:nogroup $(1)/etc/hickory-dns/
	$(INSTALL_DIR) $(1)/var/lib/hickory-dns/
	chown nobody:nogroup $(1)/var/lib/hickory-dns/
	$(INSTALL_BIN) ./files/etc/init.d/hickory-dns $(1)/etc/init.d/hickory-dns
	$(INSTALL_BIN) ./files/etc/hickory-dns/forwarder.toml $(1)/etc/hickory-dns/forwarder.toml
	$(INSTALL_DATA) ./files/etc/hickory-dns/lan.zone $(1)/etc/hickory-dns/lan.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/localhost.zone $(1)/etc/hickory-dns/localhost.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/127.0.0.1.zone $(1)/etc/hickory-dns/127.0.0.1.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/ipv6_1.zone $(1)/etc/hickory-dns/ipv6_1.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/255.zone $(1)/etc/hickory-dns/255.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/0.zone $(1)/etc/hickory-dns/0.zone
	chown nobody:nogroup $(1)/etc/hickory-dns/*.zone $(1)/etc/hickory-dns/forwarder.toml
	echo "$(HICKORY_COMMIT)" > $(1)/etc/hickory-dns/commit
endef

$(eval $(call RustBinPackage,hickory-dns))
$(eval $(call BuildPackage,hickory-dns))
