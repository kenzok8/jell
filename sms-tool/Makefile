include $(TOPDIR)/rules.mk

PKG_NAME:=sms-tool
PKG_RELEASE:=10

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/obsy/sms_tool.git
PKG_SOURCE_DATE:=2024-07-25
PKG_SOURCE_VERSION:=ee229370eed5f2907cdfba95f17bc913a238b17e
PKG_MIRROR_HASH:=skip

include $(INCLUDE_DIR)/package.mk

define Package/sms-tool
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=sms tool
  URL:=https://github.com/obsy/sms_tool
endef

define Package/sms-tool/description
	SMS Tool for 3G/4G/5G modem
endef

define Package/sms-tool/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/sms_tool $(1)/usr/bin/
endef

$(eval $(call BuildPackage,sms-tool))
