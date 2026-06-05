include $(TOPDIR)/rules.mk

PKG_NAME:=hickory-dns
PKG_VERSION:=2026.06.05~56cef34
PKG_RELEASE:=1

HICKORY_COMMIT:=56cef34654a83ca67e49c5b6330b0ba0603e97ba

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/hickory-dns/hickory-dns/tar.gz/56cef34654a83ca67e49c5b6330b0ba0603e97ba?
PKG_HASH:=skip

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-56cef34654a83ca67e49c5b6330b0ba0603e97ba

PKG_BUILD_DEPENDS:=rust/host
PKG_BUILD_PARALLEL:=1

RUST_PKG_LOCKED:=0
RUST_PKG_FEATURES:=resolver,tls-ring,https-ring,quic-ring,h3-ring,rustls-platform-verifier,sqlite,prometheus-metrics,dnssec-ring

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/rust/rust-package.mk

# Derive Rust CPU flags from TARGET_CFLAGS (e.g. -mcpu=cortex-a53+crc+crypto)
_comma:=,
_empty:=
_space:=$(_empty) $(_empty)
_mcpu:=$(patsubst -mcpu=%,%,$(filter -mcpu=%,$(TARGET_CFLAGS)))
_mcpu_parts:=$(subst +,$(_space),$(_mcpu))
_cpu_base:=$(firstword $(_mcpu_parts))
_cpu_feats:=$(subst $(_space),$(_comma),$(addprefix +,$(wordlist 2,99,$(_mcpu_parts))))
PKG_RUST_CPU_FLAGS:=$(if $(_cpu_base),-Ctarget-cpu=$(_cpu_base)$(if $(_cpu_feats), -Ctarget-feature=$(_cpu_feats)))
# ring 0.17 在 x86 上强制要求 SSE2；OpenWrt i586 rust target 默认没开，
# 而 i386_pentium4 (Pentium 4) 实际支持 SSE2，显式打开以通过 ring 的编译期断言
ifeq ($(ARCH_PACKAGES),i386_pentium4)
  PKG_RUST_CPU_FLAGS+= -Ctarget-feature=+sse,+sse2
endif

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
	CARGO_PROFILE_RELEASE_OPT_LEVEL=3 \
	CARGO_PROFILE_RELEASE_OVERFLOW_CHECKS=false \
	RUSTFLAGS="$(CARGO_RUSTFLAGS) $(PKG_RUST_CPU_FLAGS)" \
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
	$(INSTALL_BIN) ./files/usr/bin/ipv6-neigh-wrapper $(1)/usr/bin/ipv6-neigh-wrapper
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_DIR) $(1)/etc/hickory-dns/
	$(INSTALL_BIN) ./files/etc/init.d/hickory-dns $(1)/etc/init.d/hickory-dns
	$(INSTALL_BIN) ./files/etc/hickory-dns/forwarder.toml $(1)/etc/hickory-dns/forwarder.toml
	$(INSTALL_DATA) ./files/etc/hickory-dns/lan.zone $(1)/etc/hickory-dns/lan.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/localhost.zone $(1)/etc/hickory-dns/localhost.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/127.0.0.1.zone $(1)/etc/hickory-dns/127.0.0.1.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/ipv6_1.zone $(1)/etc/hickory-dns/ipv6_1.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/255.zone $(1)/etc/hickory-dns/255.zone
	$(INSTALL_DATA) ./files/etc/hickory-dns/0.zone $(1)/etc/hickory-dns/0.zone
	echo "$(HICKORY_COMMIT)" > $(1)/etc/hickory-dns/commit
endef

$(eval $(call RustBinPackage,hickory-dns))
$(eval $(call BuildPackage,hickory-dns))
