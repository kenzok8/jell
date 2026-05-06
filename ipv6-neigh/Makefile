include $(TOPDIR)/rules.mk

PKG_NAME:=ipv6-neigh
PKG_VERSION:=0.1.0
PKG_RELEASE:=6

PKG_BUILD_DEPENDS:=rust/host
PKG_BUILD_PARALLEL:=1

RUST_PKG_LOCKED:=0

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/rust/rust-package.mk

define Package/ipv6-neigh
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=IP Addresses and Names
  TITLE:=LAN neighbor DNS updater for hickory-dns
  URL:=https://github.com/nicebonn/hickory-dns-openwrt
  DEPENDS:=$(RUST_ARCH_DEPENDS) +hickory-dns
endef

define Package/ipv6-neigh/description
  Monitors Linux neighbor table (ARP/NDP) via netlink and dynamically
  updates DNS records in a local hickory-dns server using RFC 2136
  DNS UPDATE over TCP. Maps MAC addresses to hostnames via OpenWrt
  DHCP leases (ubus).
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)/src
	$(CP) $(CURDIR)/src/. $(PKG_BUILD_DIR)/src/
	$(CP) $(CURDIR)/Cargo.toml $(PKG_BUILD_DIR)/
	$(CP) $(CURDIR)/Cargo.lock $(PKG_BUILD_DIR)/
endef

define Build/Compile
	+$(CARGO_PKG_VARS) \
	cargo build -v --profile $(CARGO_PKG_PROFILE) \
		--manifest-path "$(PKG_BUILD_DIR)/Cargo.toml" \
		--target $(RUSTC_TARGET_ARCH) \
		--no-default-features \
		$(if $(filter --jobserver%,$(PKG_JOBS)),,-j1) \
		$(CARGO_PKG_ARGS)
	+$(INSTALL_DIR) $(PKG_INSTALL_DIR)/bin/
	+$(INSTALL_BIN) $(PKG_BUILD_DIR)/target/$(RUSTC_TARGET_ARCH)/$(CARGO_PKG_PROFILE)/ip-neigh $(PKG_INSTALL_DIR)/bin/
endef

define Package/ipv6-neigh/install
	$(INSTALL_DIR) $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/bin/ip-neigh $(1)/usr/bin/ipv6-neigh
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/init.d/ipv6-neigh $(1)/etc/init.d/ipv6-neigh
endef

$(eval $(call RustBinPackage,ipv6-neigh))
$(eval $(call BuildPackage,ipv6-neigh))
