
# - Copyright 2024
# - bobbyunknown <https://github.com/bobbyunknown>
#
# https://opensource.org/license/mit
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

include $(TOPDIR)/rules.mk

PKG_NAME:=mihomo
PKG_RELEASE:=1
PKG_VERSION:=1.19.10

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/MetaCubeX/mihomo/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=a0ca7bb23fcfa067e8a58a9618879a507881dbca321a8eb0550948b1d26296c0

PKG_LICENSE:=MIT
PKG_MAINTAINER:=BobbyUnknown

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/metacubex/mihomo
GO_PKG_LDFLAGS_X:=$(GO_PKG)/constant.Version=v$(PKG_VERSION)
GO_PKG_TAGS:=with_gvisor

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/$(PKG_NAME)
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Universal proxy platform.
  URL:=https://wiki.metacubex.one
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle +ip-full +kmod-tun
  USERID:=mihomo=7890:mihomo=7890
endef

define Package/$(PKG_NAME)/description
 Mihomo kernel with VMess, VLESS, Shadowsocks, Trojan, Snell, TUIC, Hysteria protocol.
endef

define Package/$(PKG_NAME)/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/etc/insomclash
	wget -q -O $(1)/etc/insomclash/country.mmdb https://github.com/rtaserver/meta-rules-dat/releases/latest/download/country.mmdb
	wget -q -O $(1)/etc/insomclash/geoip.dat https://github.com/rtaserver/meta-rules-dat/releases/latest/download/geoip.dat
	wget -q -O $(1)/etc/insomclash/geosite.dat https://github.com/rtaserver/meta-rules-dat/releases/latest/download/geosite.dat
endef

define Build/Prepare
	$(Build/Prepare/Default)
	$(RM) -r $(PKG_BUILD_DIR)/rules/logic_test
endef

$(eval $(call GoBinPackage,$(PKG_NAME)))
$(eval $(call BuildPackage,$(PKG_NAME)))
