#!/bin/sh

sed -i 's/git\.openwrt\.org\/project\/luci/github\.com\/openwrt\/luci/g' ./feeds.conf.default
./scripts/feeds update luci
./scripts/feeds install -a luci
mv ./bin/luci-app-argone-config ./package/
make defconfig
make package/luci-app-argone-config/compile V=s -j$(nproc) BUILD_LOG=1

tar -cJf logs.tar.xz logs 2>/dev/null || true
mv logs.tar.xz bin/ 2>/dev/null || true
