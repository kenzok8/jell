include $(TOPDIR)/rules.mk

LUCI_TITLE:=PPPoE Server User Management (Modern JS/Ucode)
LUCI_DEPENDS:=+luci-compat +kmod-nft-connlimit +ucode +rpcd +ppp +ppp-mod-pppoe
LUCI_PKGARCH:=all

# 定义配置文件，升级时保留
define Package/luci-app-pppoe-user/conffiles
/etc/config/pppoe-user
endef

# 预安装脚本：清理旧版本残留
define Package/luci-app-pppoe-user/preinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
    # 仅在运行时清理，安装到新根文件系统时不清理
    if [ -f /etc/init.d/pppoe-user ]; then
        /etc/init.d/pppoe-user stop 2>/dev/null || true
    fi
    # 清理旧的 Lua 视图缓存
    rm -rf /tmp/luci-modulecache/*
    rm -rf /tmp/luci-indexcache/*
fi
exit 0
endef

define Package/luci-app-pppoe-user/install
	# --- 1. I18N (让 luci.mk 自动处理，或手动编译) ---
	# 注意：现代 luci.mk 会自动扫描 po 目录并编译。
	# 如果必须手动指定，确保编译为 .lua 或 .json (视版本而定)
	# 这里我们依赖 luci.mk 的默认行为，只需确保 po 目录存在即可。
	# 如果 luci.mk 没有自动安装，取消下面注释：
	# $(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	# $(foreach po,$(wildcard ./po/*/pppoe-user.po), \
	# 	$(call Build/install-po,$(po),$(1)/usr/lib/lua/luci/i18n) \
	# )

	# --- 2. LuCI JS Views (Modern Path) ---
	$(INSTALL_DIR) $(1)/usr/share/luci/static/resources/view/pppoe-user
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/pppoe-user/*.js \
		$(1)/usr/share/luci/static/resources/view/pppoe-user/

	# --- 3. Ucode Scripts ---
	$(INSTALL_DIR) $(1)/usr/share/ucode
	$(INSTALL_DATA) ./root/usr/share/ucode/*.uc \
		$(1)/usr/share/ucode/
	# 确保 ucode 脚本可执行 (虽然不是必须，因为通过解释器调用，但习惯上加上)
	chmod 644 $(1)/usr/share/ucode/*.uc

	# --- 4. RPCD ACL ---
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/*.json \
		$(1)/usr/share/rpcd/acl.d/

	# --- 5. System Configuration ---
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/pppoe-user \
		$(1)/etc/config/

	# --- 6. Init Scripts ---
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/pppoe-user \
		$(1)/etc/init.d/

	# --- 7. PPP Scripts ---
	$(INSTALL_DIR) $(1)/etc/ppp
	$(INSTALL_BIN) ./root/etc/ppp/ip-up \
		$(1)/etc/ppp/
	$(INSTALL_BIN) ./root/etc/ppp/ip-down \
		$(1)/etc/ppp/

	$(INSTALL_DIR) $(1)/etc/ppp/ip-up.d
	$(INSTALL_BIN) ./root/etc/ppp/ip-up.d/* \
		$(1)/etc/ppp/ip-up.d/

	$(INSTALL_DIR) $(1)/etc/ppp/ip-down.d
	$(INSTALL_BIN) ./root/etc/ppp/ip-down.d/* \
		$(1)/etc/ppp/ip-down.d/

	# --- 8. Hotplug Scripts ---
	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface
	$(INSTALL_BIN) ./root/etc/hotplug.d/iface/* \
		$(1)/etc/hotplug.d/iface/

	# --- 9. UCI Defaults ---
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/pppoe-user \
		$(1)/etc/uci-defaults/

	# --- 10. LuCI Menu ---
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/*.json \
		$(1)/usr/share/luci/menu.d/
endef

# 调用标准的 luci.mk 构建规则
# 它会自动处理 i18n 编译和元数据生成
include $(TOPDIR)/feeds/luci/luci.mk
