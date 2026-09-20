'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';

// 辅助工具：统一纯净数组转换
function toArray(val) {
	if (Array.isArray(val)) return val.filter(Boolean);
	return typeof val === 'string' ? val.trim().split(/\s+/).filter(Boolean) : [];
}

// 辅助工具：提取首个 IP 并去除可能的 CIDR 掩码（容错支持 String、Array 及 null/undefined）
function getFirstIp(val, defaultVal) {
	if (Array.isArray(val)) val = val[0];
	if (typeof val === 'string') return val.split('/')[0].trim();
	return defaultVal || '';
}

// 辅助工具：通用值深度比对（支持标量与数组）
function isEqual(a, b) {
	if (Array.isArray(a) || Array.isArray(b)) {
		var arrA = toArray(a).sort(), arrB = toArray(b).sort();
		return arrA.length === arrB.length && arrA.every(function(v, i) { return v === arrB[i]; });
	}
	return String(a == null ? '' : a) === String(b == null ? '' : b);
}

// 辅助工具：检查数组是否包含元素（兼容低版本环境）
function has(arr, item) {
	return Array.isArray(arr) && arr.indexOf(item) !== -1;
}

// 辅助工具：安全删除 UCI 选项（只有当该选项在 UCI 内存中真实存在时才调用 unset，防止 ubus 报 code 4 资源未找到错误）
function safeUnset(conf, sid, opt) {
	try {
		if (uci.get(conf, sid, opt) != null) {
			uci.unset(conf, sid, opt);
			return true;
		}
	} catch(e) {}
	return false;
}

return view.extend({
	initialValues: {},
	initialShortcuts: [],
	hasWireless: false,
	hasNginx: false,
	firstApSec: null,
	map: null,
	fields: null,
	optMap: null,

	// 1. 直连加载系统真实配置包，无需任何中间文件
	load: function() {
		var pkgs = ['network', 'wireless', 'dhcp', 'uhttpd', 'firewall', 'luci', 'wizard'];
		var tasks = pkgs.map(function(p) {
			return uci.load(p).catch(function() { return null; });
		});
		tasks.push(fs.stat('/etc/nginx/uci.conf').then(function() { return true; }).catch(function() { return false; }));

		return Promise.all(tasks).then(function(res) {
			var wifiSecs = res ? (uci.sections('wireless', 'wifi-device') || []) : [];
			return {
				hasWireless: wifiSecs.length > 0,
				hasNginx: res[7]
			};
		});
	},

	// 2. 统一聚合读取系统当前各子模块的实时配置
	getSystemConfig: function() {
		var isSideRouter = !!uci.get('network', 'lan', 'gateway') && uci.get('network', 'wan', 'auto') === '0';

		var ap = null;
		if (this.hasWireless) {
			var ifaces = uci.sections('wireless', 'wifi-iface') || [];
			for (var i = 0; i < ifaces.length; i++) {
				if (ifaces[i].mode === 'ap' || !ifaces[i].mode) {
					ap = ifaces[i];
					break;
				}
			}
		}
		this.firstApSec = ap ? ap['.name'] : null;

		return {
			wan_proto: isSideRouter ? 'siderouter' : (uci.get('network', 'wan', 'proto') || 'dhcp'),
			wan_pppoe_user: uci.get('network', 'wan', 'username') || '',
			wan_pppoe_pass: uci.get('network', 'wan', 'password') || '',
			lan_ipaddr: getFirstIp(uci.get('network', 'lan', 'ipaddr'), '10.0.0.1'),
			lan_gateway: getFirstIp(uci.get('network', 'lan', 'gateway'), ''),
			lan_dns: toArray(uci.get('network', 'lan', 'dns')),
			dhcp: uci.get('dhcp', 'lan', 'ignore') === '1' ? '0' : '1',
			ipv6: uci.get('network', 'wan6', 'auto') === '0' ? '0' : '1',
			https: uci.get('wizard', 'default', 'https') || '0',
			cookie_p: uci.get('luci', 'sgi', 'persistent_cookies') || '1',
			landing_page: uci.get('luci', 'main', 'landing_page') || 'default',
			autoupgrade_fm: uci.get('wizard', 'default', 'autoupgrade_fm') || '1',
			coremark: uci.get('wizard', 'default', 'coremark') || '0',
			wifi_ssid: (ap && ap.ssid) || (this.hasWireless ? 'OpenWrt' : ''),
			wifi_key: (ap && ap.key) || ''
		};
	},

	render: function(data) {
		this.hasWireless = !!data.hasWireless;
		this.hasNginx = !!data.hasNginx;

		var sys = this.getSystemConfig();
		this.initialValues = Object.assign({}, sys);

		// 缓存初始 shortcuts 配置快照，用于保存时比对差异
		var shortcuts = uci.sections('wizard', 'shortcuts') || [];
		this.initialShortcuts = shortcuts.map(function(sec) {
			return {
				shortcut: sec.shortcut || '',
				to_url: sec.to_url || '',
				comments: sec.comments || ''
			};
		});

		var m = new form.Map('wizard', _('Setup Wizard'),
			_('Quickly configure common network, wireless, and system settings.'));

		var s = m.section(form.NamedSection, 'default', 'wizard');
		s.anonymous = true;
		s.addremove = false;

		s.tab('netsetup', _('Net Settings'));
		s.tab('firmware', _('Firmware Settings'));
		if (this.hasWireless) s.tab('wifisetup', _('Wireless Settings'));

		if (this.hasNginx) {
			s.tab('shortcuts', _('Shortcuts'), _('比如设置google.com的快捷方式为字母g,则在此路由器网络的任何浏览器中输入g/即可访问google.com'));
		}

		// 3. 声明式配置项驱动表
		var opt, fields = [
			// 网络设置
			{ tab: 'netsetup', type: form.ListValue, id: 'wan_proto', title: _('WAN Protocol / Mode'),
			  choices: { dhcp: _('DHCP Client (Default Router)'), pppoe: _('PPPoE Dial-up'), siderouter: _('Side-Router Mode (Bypass Gateway)') } },
			{ tab: 'netsetup', type: form.Value, id: 'wan_pppoe_user', title: _('PPPoE Username'), depends: { wan_proto: 'pppoe' } },
			{ tab: 'netsetup', type: form.Value, id: 'wan_pppoe_pass', title: _('PPPoE Password'), depends: { wan_proto: 'pppoe' }, password: true },
			{ tab: 'netsetup', type: form.Value, id: 'lan_ipaddr', title: _('LAN IPv4 Address'), datatype: 'ip4addr', placeholder: '10.0.0.1' },
			{ tab: 'netsetup', type: form.DynamicList, id: 'lan_dns', title: _('Custom DNS Server(s)'), datatype: 'ipaddr', placeholder: '223.5.5.5' },
			{ tab: 'netsetup', type: form.Value, id: 'lan_gateway', title: _('Gateway Address'), datatype: 'ip4addr', placeholder: '', depends: { wan_proto: 'siderouter' }, desc: _('Primary router IP address used when operating in side-router mode.') },
			{ tab: 'netsetup', type: form.Flag, id: 'dhcp', title: _('Enable DHCP Server'), depends: { wan_proto: 'siderouter' }, desc: _('Usually disabled in side-router mode to avoid IP address assignment conflicts with the main router.') },
			{ tab: 'netsetup', type: form.Flag, id: 'ipv6', title: _('IPv6 Support'), desc: _('Enable or disable IPv6 router advertisements and DHCPv6.') },

			// 固件与系统设置
			{ tab: 'firmware', type: form.Flag, id: 'autoupgrade_fm', title: _('Firmware Upgrade Notice'), desc: _('Check and display notices for newer firmware versions.') },
			{ tab: 'firmware', type: form.Flag, id: 'coremark', title: _('Run CoreMark on Boot'), desc: _('Run CPU benchmark upon initial router initialization.') },
			{ tab: 'firmware', type: form.Flag, id: 'cookie_p', title: _('Persistent Cookie Session'), desc: _('Maintain persistent login sessions in the web browser.') },
			{ tab: 'firmware', type: form.Flag, id: 'https', title: _('Enforce HTTPS Access'), desc: _('Automatically redirect HTTP requests to secure HTTPS.') },
			{ tab: 'firmware', type: form.ListValue, id: 'landing_page', title: _('Landing Dashboard Mode'),
			  choices: { 'default': _('Default'), routerdog: _('RouterDog'), nas: _('NAS'), 'next-nas': _('Next-NAS'), router: _('Router') } }
		];

		// 无线配置根据设备硬件动态追加
		if (this.hasWireless) {
			fields.push(
				{ tab: 'wifisetup', type: form.Value, id: 'wifi_ssid', title: _('Wireless Network Name (SSID)'), placeholder: 'OpenWrt' },
				{ tab: 'wifisetup', type: form.Value, id: 'wifi_key', title: _('Wireless Password (Key)'), password: true, placeholder: _('Leave empty for open network or 8+ characters') }
			);
		}

		var optMap = {};
		fields.forEach(function(f) {
			opt = s.taboption(f.tab, f.type, f.id, f.title, f.desc);
			opt.cfgvalue = function() { return sys[f.id]; };
			opt.default = sys[f.id];

			// 彻底拦截 form.Map 默认的 write 与 remove 行为
			// 确保表单仅做纯前端 UI 交互和数据校验，绝不向后端发送无意义的 uci delete / set
			opt.write = function() {};
			opt.remove = function() {};

			if (f.password) opt.password = true;
			if (f.datatype) opt.datatype = f.datatype;
			if (f.placeholder) opt.placeholder = f.placeholder;
			if (f.choices) Object.keys(f.choices).forEach(function(k) { opt.value(k, f.choices[k]); });
			if (f.depends) Object.keys(f.depends).forEach(function(k) { opt.depends(k, f.depends[k]); });

			optMap[f.id] = opt;
		});

		// Shortcuts GridSection 渲染
		if (this.hasNginx) {
			var so = s.taboption('shortcuts', form.SectionValue, '_shortcuts', form.GridSection, 'shortcuts', null, _('Shortcuts'));
			var ss = so.subsection;
			ss.addremove = true;
			ss.anonymous = true;
			ss.sortable  = true;

			var o_sc = ss.option(form.Value, 'shortcut', _('Shortcut'));
			o_sc.rmempty = false;
			o_sc.placeholder = 'g';
			o_sc.validate = function(section_id, value) {
				if (!value)
					return _('Shortcut phrase cannot be empty');
				if (!value.match(/^[a-zA-Z0-9_-]+$/))
					return _('Only alphanumeric characters, dashes and underscores are allowed');
				return true;
			};

			var o_url = ss.option(form.Value, 'to_url', _('Target URL'));
			o_url.rmempty = false;
			o_url.placeholder = 'https://example.com';
			o_url.validate = function(section_id, value) {
				if (value && value.match(/^https?:\/\/.+/i)) {
					return true;
				}
				return _('Please enter a valid URL starting with http:// or https://');
			};

			var o_comm = ss.option(form.Value, 'comments', _('Comments'));
			o_comm.optional = true;
			o_comm.placeholder = _('Optional');
		}

		// 保存关键引用供 View 级保存处理函数使用
		this.map = m;
		this.fields = fields;
		this.optMap = optMap;

		return m.render();
	},

	// 4. 重写 View 级别的 handleSave：仅精准写入发生变化的配置到 UCI 暂存区
	handleSave: function(ev) {
		var self = this;
		if (!this.map) return Promise.resolve(false);

		return this.map.parse().then(function() {
			var cur = {};
			self.fields.forEach(function(f) {
				var v = self.optMap[f.id].formvalue('default');
				cur[f.id] = (v != null) ? v : '';
			});
			cur.lan_dns = toArray(cur.lan_dns);

			// 精准筛选出发生变化的常规字段
			var changed = self.fields.map(function(f) { return f.id; }).filter(function(id) {
				return !isEqual(cur[id], self.initialValues[id]);
			});

			// 检测 shortcuts 是否有增删改
			var curShortcuts = (uci.sections('wizard', 'shortcuts') || []).map(function(sec) {
				return {
					shortcut: sec.shortcut || '',
					to_url: sec.to_url || '',
					comments: sec.comments || ''
				};
			});
			var shortcutsChanged = JSON.stringify(curShortcuts) !== JSON.stringify(self.initialShortcuts);

			// 未做任何改动直接提示并退出
			if (changed.length === 0 && !shortcutsChanged) {
				ui.addNotification(null, E('p', _('There are no changes to apply')), 'info');
				return false;
			}

			// A. 无线配置直接写回 wireless
			if (self.hasWireless && self.firstApSec && (has(changed, 'wifi_ssid') || has(changed, 'wifi_key'))) {
				if (has(changed, 'wifi_ssid') && cur.wifi_ssid) {
					uci.set('wireless', self.firstApSec, 'ssid', cur.wifi_ssid);
				}
				if (has(changed, 'wifi_key')) {
					if (cur.wifi_key) {
						uci.set('wireless', self.firstApSec, 'key', cur.wifi_key);
						var enc = uci.get('wireless', self.firstApSec, 'encryption') || '';
						if (enc.indexOf('psk') === -1 && enc.indexOf('sae') === -1) {
							uci.set('wireless', self.firstApSec, 'encryption', 'psk2');
						}
					} else {
						safeUnset('wireless', self.firstApSec, 'key');
						uci.set('wireless', self.firstApSec, 'encryption', 'none');
					}
				}
			}

			// B. WAN 模式与 PPPoE
			if (has(changed, 'wan_proto') || has(changed, 'wan_pppoe_user') || has(changed, 'wan_pppoe_pass')) {
				var zones = uci.sections('firewall', 'zone') || [];
				var lanZone = null;
				for (var zi = 0; zi < zones.length; zi++) {
					if (zones[zi].name === 'lan') {
						lanZone = zones[zi];
						break;
					}
				}

				if (cur.wan_proto === 'siderouter') {
					uci.set('network', 'wan', 'auto', '0');
					// 旁路由模式：开启 LAN 区域动态伪装 (masq)
					if (lanZone) uci.set('firewall', lanZone['.name'], 'masq', '1');
				} else {
					uci.set('network', 'wan', 'auto', '1');
					uci.set('network', 'wan', 'proto', cur.wan_proto);
					// 切换回主路由模式：清除 LAN 区域的动态伪装 (masq)
					if (lanZone) safeUnset('firewall', lanZone['.name'], 'masq');

					if (cur.wan_proto === 'pppoe') {
						uci.set('network', 'wan', 'username', cur.wan_pppoe_user);
						uci.set('network', 'wan', 'password', cur.wan_pppoe_pass);
					} else {
						safeUnset('network', 'wan', 'username');
						safeUnset('network', 'wan', 'password');
					}
				}
			}

			// C. LAN IP（兼容 list ipaddr / option ipaddr / CIDR 掩码）
			if (has(changed, 'lan_ipaddr') && cur.lan_ipaddr) {
				var origIpRaw = uci.get('network', 'lan', 'ipaddr');
				var firstIp = Array.isArray(origIpRaw) ? origIpRaw[0] : origIpRaw;
				var mask = '';

				if (typeof firstIp === 'string') {
					var slashIdx = firstIp.indexOf('/');
					if (slashIdx !== -1) {
						mask = '/' + firstIp.substring(slashIdx + 1).trim();
					}
				}

				var cleanIp = (typeof cur.lan_ipaddr === 'string') ? cur.lan_ipaddr.split('/')[0].trim() : String(cur.lan_ipaddr);
				var targetVal = cleanIp + mask;

				if (Array.isArray(origIpRaw)) {
					var newArr = origIpRaw.slice();
					newArr[0] = targetVal;
					uci.set('network', 'lan', 'ipaddr', newArr);
				} else {
					uci.set('network', 'lan', 'ipaddr', targetVal);
					if (!mask && !uci.get('network', 'lan', 'netmask')) {
						uci.set('network', 'lan', 'netmask', '255.255.255.0');
					}
				}
			}

			// D. 自定义 LAN DNS（无论处于何种工作模式，只要变动均写入 network.lan.dns）
			if (has(changed, 'lan_dns')) {
				if (cur.lan_dns && cur.lan_dns.length > 0) {
					uci.set('network', 'lan', 'dns', cur.lan_dns);
				} else {
					safeUnset('network', 'lan', 'dns');
				}
			}

			// E. LAN 网关（独立变更或切换至旁路由模式时更新）
			if (has(changed, 'lan_gateway') || has(changed, 'wan_proto')) {
				if (cur.wan_proto === 'siderouter') {
					if (cur.lan_gateway) {
						uci.set('network', 'lan', 'gateway', cur.lan_gateway);
					} else {
						safeUnset('network', 'lan', 'gateway');
					}
				} else {
					safeUnset('network', 'lan', 'gateway');
				}
			}

			// F. DHCP 开关（旁路由模式下严格根据开关设置，常规主路由模式默认开启 DHCP）
			if (has(changed, 'dhcp') || has(changed, 'wan_proto')) {
				if (cur.wan_proto === 'siderouter') {
					uci.set('dhcp', 'lan', 'ignore', (cur.dhcp === '1') ? '0' : '1');
				} else {
					safeUnset('dhcp', 'lan', 'ignore');
				}
			}

			// G. IPv6
			if (has(changed, 'ipv6')) {
				var enabled = (cur.ipv6 === '1');
				uci.set('network', 'wan6', 'auto', enabled ? '1' : '0');
				uci.set('dhcp', 'lan', 'ra', enabled ? 'server' : 'disabled');
				uci.set('dhcp', 'lan', 'dhcpv6', enabled ? 'server' : 'disabled');
				uci.set('dhcp', 'lan', 'ndp', enabled ? 'server' : 'disabled');
			}

			// H. HTTPS 访问重定向（同步保存至 wizard 供 init.d 调度生效）
			if (has(changed, 'https')) {
				uci.set('wizard', 'default', 'https', cur.https);
			}

			// I. 页面与会话设置
			if (has(changed, 'cookie_p')) {
				uci.set('luci', 'sgi', 'persistent_cookies', cur.cookie_p);
			}
			if (has(changed, 'landing_page')) {
				uci.set('luci', 'main', 'landing_page', cur.landing_page);
			}

			// J. 向导专属项
			if (has(changed, 'autoupgrade_fm')) {
				uci.set('wizard', 'default', 'autoupgrade_fm', cur.autoupgrade_fm);
			}
			if (has(changed, 'coremark')) {
				uci.set('wizard', 'default', 'coremark', cur.coremark);
			}

			self.initialValues = Object.assign({}, cur);
			self.initialShortcuts = curShortcuts;

			// 调用 LuCI 原生 UCI 保存接口，将改动安全提交到系统暂存区
			return uci.save().then(function() {
				return true;
			});
		});
	},

	// 5. 重写 View 级别的 handleSaveApply：通过 LuCI 原生 ui.changes.apply 标准流程应用与生效
	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function(hasChanges) {
			if (hasChanges) {
				return ui.changes.apply(mode == '0');
			}
		});
	},

	handleReset: null
});
