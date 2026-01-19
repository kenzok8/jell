# Makefile.deb - FusionTunX Debian Packaging

PKG_NAME:=fusiontunx
PKG_VERSION:=1.0.3
PKG_RELEASE:=149
PKG_MAINTAINER:=BobbyUnknown
PKG_DESC:=FusionTunX Core + Mihomo
PKG_ARCH_AMD64:=amd64
PKG_ARCH_ARM64:=arm64
PKG_ARCH_ARMHF:=armhf

# Arch Linux Architecture Mappings
PKG_ARCH_ARCH_X86_64:=x86_64
PKG_ARCH_ARCH_AARCH64:=aarch64
PKG_ARCH_ARCH_ARMV7H:=armv7h

BUILD_DIR:=build
CORE_DIR:=core
FILES_DIR:=files

# Binary mappings
BIN_AMD64:=fusiontunx-linux-amd64
BIN_ARM64:=fusiontunx-linux-arm64
BIN_ARMHF:=fusiontunx-linux-armv7

# Mihomo Configuration
MIHOMO_VERSION:=v1.19.17
MIHOMO_URL_BASE:=https://github.com/MetaCubeX/mihomo/releases/download/$(MIHOMO_VERSION)

# Mihomo Architecture Mappings (for download)
MIHOMO_ARCH_AMD64:=mihomo-linux-amd64-v1
MIHOMO_ARCH_ARM64:=mihomo-linux-arm64
MIHOMO_ARCH_ARMHF:=mihomo-linux-armv7

# URLs
URL_GEOIP_MMDB:=https://github.com/rtaserver/meta-rules-dat/releases/latest/download/country.mmdb
URL_GEOIP_DAT:=https://github.com/rtaserver/meta-rules-dat/releases/latest/download/geoip.dat
URL_GEOSITE:=https://github.com/rtaserver/meta-rules-dat/releases/latest/download/geosite.dat
URL_GEOIP_META:=https://github.com/rtaserver/meta-rules-dat/releases/download/latest/geoip.metadb

.PHONY: all clean download-assets build-core deb-amd64 deb-arm64 deb-armhf arch-x86_64 arch-aarch64 arch-armv7h build-all build-deb build-arch

all: build-deb build-arch

build-deb: deb-amd64 deb-arm64 deb-armhf

build-arch: arch-x86_64 arch-aarch64 arch-armv7h

build-all: all

build-core:
	@echo "Installing Swag (Swagger Generator)..."
	(which swag >/dev/null 2>&1) || (go install github.com/swaggo/swag/cmd/swag@latest && export PATH=$$HOME/go/bin:$$PATH)
	@echo "Building binaries from source..."
	export PATH=$$HOME/go/bin:$$PATH && cd src && bash build.sh
	@echo "Copying binaries to core directory..."
	mkdir -p $(CORE_DIR)
	cp src/bin/fusiontunx-linux-amd64 $(CORE_DIR)/$(BIN_AMD64)
	cp src/bin/fusiontunx-linux-arm64 $(CORE_DIR)/$(BIN_ARM64)
	cp src/bin/fusiontunx-linux-armv7 $(CORE_DIR)/$(BIN_ARMHF)
	@echo "Core binaries ready in $(CORE_DIR)/"

clean:
	rm -rf $(BUILD_DIR)
	rm -rf $(CORE_DIR)

download-assets:
	mkdir -p $(BUILD_DIR)/assets
	@echo "Downloading GeoIP assets..."
	[ -f $(BUILD_DIR)/assets/country.mmdb ] || wget -q -O $(BUILD_DIR)/assets/country.mmdb $(URL_GEOIP_MMDB)
	[ -f $(BUILD_DIR)/assets/geoip.dat ] || wget -q -O $(BUILD_DIR)/assets/geoip.dat $(URL_GEOIP_DAT)
	[ -f $(BUILD_DIR)/assets/geosite.dat ] || wget -q -O $(BUILD_DIR)/assets/geosite.dat $(URL_GEOSITE)
	[ -f $(BUILD_DIR)/assets/geoip.metadb ] || wget -q -O $(BUILD_DIR)/assets/geoip.metadb $(URL_GEOIP_META)
	
	@echo "Downloading UI assets..."
	# Zashboard
	[ -f $(BUILD_DIR)/assets/zashboard.zip ] || curl -sL -o $(BUILD_DIR)/assets/zashboard.zip "https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip"
	rm -rf $(BUILD_DIR)/assets/ui/zashboard
	mkdir -p $(BUILD_DIR)/assets/ui/zashboard
	unzip -q -o $(BUILD_DIR)/assets/zashboard.zip -d $(BUILD_DIR)/assets/temp_zashboard
	mv $(BUILD_DIR)/assets/temp_zashboard/dist/* $(BUILD_DIR)/assets/ui/zashboard/
	rm -rf $(BUILD_DIR)/assets/temp_zashboard

	# MetaCubeXD
	[ -f $(BUILD_DIR)/assets/metacubexd.tgz ] || curl -sL -o $(BUILD_DIR)/assets/metacubexd.tgz "https://github.com/MetaCubeX/metacubexd/releases/latest/download/compressed-dist.tgz"
	rm -rf $(BUILD_DIR)/assets/ui/metacubexd
	mkdir -p $(BUILD_DIR)/assets/ui/metacubexd
	tar -xzf $(BUILD_DIR)/assets/metacubexd.tgz -C $(BUILD_DIR)/assets/ui/metacubexd --strip-components=0

	# Yacd
	[ -f $(BUILD_DIR)/assets/yacd.zip ] || curl -sL -o $(BUILD_DIR)/assets/yacd.zip "https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip"
	rm -rf $(BUILD_DIR)/assets/ui/yacd
	mkdir -p $(BUILD_DIR)/assets/ui/yacd
	unzip -q -o $(BUILD_DIR)/assets/yacd.zip -d $(BUILD_DIR)/assets/temp_yacd
	mv $(BUILD_DIR)/assets/temp_yacd/Yacd-meta-gh-pages/* $(BUILD_DIR)/assets/ui/yacd/
	rm -rf $(BUILD_DIR)/assets/temp_yacd

# Template for building package
# Usage: $(call build_deb, ARCH, FUSIONTUNX_BINARY, MIHOMO_BINARY)
define build_deb
	@echo "Building package for $(1)..."
	$(eval PKG_DIR := $(BUILD_DIR)/$(PKG_NAME)_$(PKG_VERSION)-$(PKG_RELEASE)_$(1))
	rm -rf $(PKG_DIR)
	mkdir -p $(PKG_DIR)/usr/share/fusiontunx
	mkdir -p $(PKG_DIR)/usr/bin
	mkdir -p $(PKG_DIR)/etc/fusiontunx
	mkdir -p $(PKG_DIR)/lib/systemd/system
	mkdir -p $(PKG_DIR)/DEBIAN

	# Copy FusionTunX Binary
	@if [ -f $(CORE_DIR)/$(2) ]; then \
		cp $(CORE_DIR)/$(2) $(PKG_DIR)/usr/share/fusiontunx/fusiontunx; \
		chmod +x $(PKG_DIR)/usr/share/fusiontunx/fusiontunx; \
	else \
		echo "Error: $(CORE_DIR)/$(2) not found!"; \
		exit 1; \
	fi

	# Download and Copy Mihomo Binary
	@echo "Processing Mihomo binary for $(1)..."
	@if [ ! -f $(BUILD_DIR)/assets/mihomo-$(1) ]; then \
		echo "Downloading Mihomo $(MIHOMO_VERSION) for $(1)..."; \
		wget -q -O $(BUILD_DIR)/assets/mihomo-$(1).gz $(MIHOMO_URL_BASE)/$(3)-$(MIHOMO_VERSION).gz; \
		gunzip $(BUILD_DIR)/assets/mihomo-$(1).gz; \
		chmod +x $(BUILD_DIR)/assets/mihomo-$(1); \
	fi
	cp $(BUILD_DIR)/assets/mihomo-$(1) $(PKG_DIR)/usr/bin/mihomo
	chmod +x $(PKG_DIR)/usr/bin/mihomo

	# Copy Config Files
	cp -r $(FILES_DIR)/* $(PKG_DIR)/etc/fusiontunx/
	
	# Copy Assets
	cp $(BUILD_DIR)/assets/*.mmdb $(PKG_DIR)/etc/fusiontunx/ || true
	cp $(BUILD_DIR)/assets/*.dat $(PKG_DIR)/etc/fusiontunx/ || true
	cp $(BUILD_DIR)/assets/*.metadb $(PKG_DIR)/etc/fusiontunx/ || true
	cp -r $(BUILD_DIR)/assets/ui $(PKG_DIR)/etc/fusiontunx/
	
	# Create Control File
	echo "Package: $(PKG_NAME)" > $(PKG_DIR)/DEBIAN/control
	echo "Version: $(PKG_VERSION)-$(PKG_RELEASE)" >> $(PKG_DIR)/DEBIAN/control
	echo "Section: net" >> $(PKG_DIR)/DEBIAN/control
	echo "Priority: optional" >> $(PKG_DIR)/DEBIAN/control
	echo "Architecture: $(1)" >> $(PKG_DIR)/DEBIAN/control
	echo "Maintainer: $(PKG_MAINTAINER)" >> $(PKG_DIR)/DEBIAN/control
	echo "Depends: iproute2, ca-certificates, iptables, nftables" >> $(PKG_DIR)/DEBIAN/control
	echo "Description: $(PKG_DESC)" >> $(PKG_DIR)/DEBIAN/control
	echo "  FusionTunX core binary packaged for Debian/Ubuntu" >> $(PKG_DIR)/DEBIAN/control

	# Create Systemd Service
	echo "[Unit]" > $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "Description=FusionTunX Service" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "After=network.target" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "[Service]" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "ExecStart=/usr/share/fusiontunx/fusiontunx -c /etc/fusiontunx/app.yaml" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "Restart=always" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "RestartSec=5" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "User=root" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "[Install]" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service
	echo "WantedBy=multi-user.target" >> $(PKG_DIR)/lib/systemd/system/fusiontunx.service

	# Create postinst script to reload systemd
	echo "#!/bin/sh" > $(PKG_DIR)/DEBIAN/postinst
	echo "set -e" >> $(PKG_DIR)/DEBIAN/postinst
	echo "if [ \"\$$1\" = \"configure\" ]; then" >> $(PKG_DIR)/DEBIAN/postinst
	echo "    systemctl daemon-reload" >> $(PKG_DIR)/DEBIAN/postinst
	echo "    systemctl enable fusiontunx" >> $(PKG_DIR)/DEBIAN/postinst
	echo "    systemctl restart fusiontunx || true" >> $(PKG_DIR)/DEBIAN/postinst
	echo "fi" >> $(PKG_DIR)/DEBIAN/postinst
	chmod 755 $(PKG_DIR)/DEBIAN/postinst

	# Create prerm script
	echo "#!/bin/sh" > $(PKG_DIR)/DEBIAN/prerm
	echo "set -e" >> $(PKG_DIR)/DEBIAN/prerm
	echo "if [ \"\$$1\" = \"remove\" ]; then" >> $(PKG_DIR)/DEBIAN/prerm
	echo "    systemctl stop fusiontunx || true" >> $(PKG_DIR)/DEBIAN/prerm
	echo "    systemctl disable fusiontunx || true" >> $(PKG_DIR)/DEBIAN/prerm
	echo "fi" >> $(PKG_DIR)/DEBIAN/prerm
	chmod 755 $(PKG_DIR)/DEBIAN/prerm

	# Build Package
	dpkg-deb --build $(PKG_DIR)
	@echo "Package created at $(PKG_DIR).deb"
endef

deb-amd64: build-core download-assets
	$(call build_deb,$(PKG_ARCH_AMD64),$(BIN_AMD64),$(MIHOMO_ARCH_AMD64))

deb-arm64: build-core download-assets
	$(call build_deb,$(PKG_ARCH_ARM64),$(BIN_ARM64),$(MIHOMO_ARCH_ARM64))

deb-armhf: build-core download-assets
	$(call build_deb,$(PKG_ARCH_ARMHF),$(BIN_ARMHF),$(MIHOMO_ARCH_ARMHF))

# Template for building Arch Linux package
# Usage: $(call build_arch, ARCH, FUSIONTUNX_BINARY, MIHOMO_BINARY)
define build_arch
	@echo "Building Arch package for $(1)..."
	$(eval PKG_DIR := $(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)-$(PKG_RELEASE)-$(1))
	rm -rf $(PKG_DIR)
	mkdir -p $(PKG_DIR)/usr/share/fusiontunx
	mkdir -p $(PKG_DIR)/usr/bin
	mkdir -p $(PKG_DIR)/etc/fusiontunx
	mkdir -p $(PKG_DIR)/usr/lib/systemd/system

	# Copy FusionTunX Binary
	@if [ -f $(CORE_DIR)/$(2) ]; then \
		cp $(CORE_DIR)/$(2) $(PKG_DIR)/usr/share/fusiontunx/fusiontunx; \
		chmod +x $(PKG_DIR)/usr/share/fusiontunx/fusiontunx; \
	else \
		echo "Error: $(CORE_DIR)/$(2) not found!"; \
		exit 1; \
	fi

	# Download and Copy Mihomo Binary
	@echo "Processing Mihomo binary for $(1)..."
	@if [ ! -f $(BUILD_DIR)/assets/mihomo-$(1) ]; then \
		echo "Downloading Mihomo $(MIHOMO_VERSION) for $(1)..."; \
		wget -q -O $(BUILD_DIR)/assets/mihomo-$(1).gz $(MIHOMO_URL_BASE)/$(3)-$(MIHOMO_VERSION).gz; \
		gunzip $(BUILD_DIR)/assets/mihomo-$(1).gz; \
		chmod +x $(BUILD_DIR)/assets/mihomo-$(1); \
	fi
	cp $(BUILD_DIR)/assets/mihomo-$(1) $(PKG_DIR)/usr/bin/mihomo
	chmod +x $(PKG_DIR)/usr/bin/mihomo

	# Copy Config Files
	cp -r $(FILES_DIR)/* $(PKG_DIR)/etc/fusiontunx/
	
	# Copy Assets
	cp $(BUILD_DIR)/assets/*.mmdb $(PKG_DIR)/etc/fusiontunx/ || true
	cp $(BUILD_DIR)/assets/*.dat $(PKG_DIR)/etc/fusiontunx/ || true
	cp $(BUILD_DIR)/assets/*.metadb $(PKG_DIR)/etc/fusiontunx/ || true
	cp -r $(BUILD_DIR)/assets/ui $(PKG_DIR)/etc/fusiontunx/

	# Create Systemd Service
	echo "[Unit]" > $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "Description=FusionTunX Service" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "After=network.target" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "[Service]" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "ExecStart=/usr/share/fusiontunx/fusiontunx -c /etc/fusiontunx/app.yaml" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "Restart=always" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "RestartSec=5" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "User=root" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "[Install]" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service
	echo "WantedBy=multi-user.target" >> $(PKG_DIR)/usr/lib/systemd/system/fusiontunx.service

	# Create .PKGINFO
	echo "pkgname = $(PKG_NAME)" > $(PKG_DIR)/.PKGINFO
	echo "pkgver = $(PKG_VERSION)-$(PKG_RELEASE)" >> $(PKG_DIR)/.PKGINFO
	echo "pkgdesc = $(PKG_DESC)" >> $(PKG_DIR)/.PKGINFO
	echo "url = https://github.com/bobbyunknown/FusionTunX" >> $(PKG_DIR)/.PKGINFO
	echo "builddate = $$(date +%s)" >> $(PKG_DIR)/.PKGINFO
	echo "packager = $(PKG_MAINTAINER)" >> $(PKG_DIR)/.PKGINFO
	echo "size = $$(du -sb $(PKG_DIR) | cut -f1)" >> $(PKG_DIR)/.PKGINFO
	echo "arch = $(1)" >> $(PKG_DIR)/.PKGINFO
	echo "depend = iproute2" >> $(PKG_DIR)/.PKGINFO
	echo "depend = ca-certificates" >> $(PKG_DIR)/.PKGINFO
	echo "depend = iptables" >> $(PKG_DIR)/.PKGINFO
	echo "depend = nftables" >> $(PKG_DIR)/.PKGINFO

	# Create .install script
	echo "post_install() {" > $(PKG_DIR)/.INSTALL
	echo "    systemctl daemon-reload" >> $(PKG_DIR)/.INSTALL
	echo "    systemctl enable fusiontunx" >> $(PKG_DIR)/.INSTALL
	echo "    systemctl start fusiontunx || true" >> $(PKG_DIR)/.INSTALL
	echo "}" >> $(PKG_DIR)/.INSTALL
	echo "" >> $(PKG_DIR)/.INSTALL
	echo "post_upgrade() {" >> $(PKG_DIR)/.INSTALL
	echo "    systemctl daemon-reload" >> $(PKG_DIR)/.INSTALL
	echo "    systemctl restart fusiontunx || true" >> $(PKG_DIR)/.INSTALL
	echo "}" >> $(PKG_DIR)/.INSTALL
	echo "" >> $(PKG_DIR)/.INSTALL
	echo "pre_remove() {" >> $(PKG_DIR)/.INSTALL
	echo "    systemctl stop fusiontunx || true" >> $(PKG_DIR)/.INSTALL
	echo "    systemctl disable fusiontunx || true" >> $(PKG_DIR)/.INSTALL
	echo "}" >> $(PKG_DIR)/.INSTALL

	# Create .MTREE (file list)
	cd $(PKG_DIR) && find . -type f -o -type l | LC_ALL=C sort | sed 's/^\.\///' > .MTREE

	# Build Package (create tar.zst archive)
	cd $(PKG_DIR) && tar -cf - .PKGINFO .INSTALL .MTREE usr etc | zstd -19 -T0 -q -o ../$(PKG_NAME)-$(PKG_VERSION)-$(PKG_RELEASE)-$(1).pkg.tar.zst
	@echo "Package created at $(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)-$(PKG_RELEASE)-$(1).pkg.tar.zst"
endef

arch-x86_64: build-core download-assets
	$(call build_arch,$(PKG_ARCH_ARCH_X86_64),$(BIN_AMD64),$(MIHOMO_ARCH_AMD64))

arch-aarch64: build-core download-assets
	$(call build_arch,$(PKG_ARCH_ARCH_AARCH64),$(BIN_ARM64),$(MIHOMO_ARCH_ARM64))

arch-armv7h: build-core download-assets
	$(call build_arch,$(PKG_ARCH_ARCH_ARMV7H),$(BIN_ARMHF),$(MIHOMO_ARCH_ARMHF))
