'use strict';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

const CONF_PATH = '/etc/filebrowser-q/config.yaml';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('filebrowser-q'), {}).then(function(res) {
		let isRunning = false;
		try {
			let instances = res['filebrowser-q']['instances'];
			for (let k in instances) {
				if (instances[k] && instances[k].running) {
					isRunning = true;
					break;
				}
			}
		} catch (e) { }
		return isRunning;
	});
}

function buildWebUrl() {
	let port = uci.get('filebrowser-q', 'config', 'listen_port') || '8787';
	let httpsEnabled = uci.get('filebrowser-q', 'config', 'https_enabled') === '1';
	let tlsCert = (uci.get('filebrowser-q', 'config', 'tls_cert') || '').trim();
	let tlsKey = (uci.get('filebrowser-q', 'config', 'tls_key') || '').trim();
	let baseUrl = (uci.get('filebrowser-q', 'config', 'base_url') || '/').trim();

	if (!baseUrl.startsWith('/')) {
		baseUrl = '/' + baseUrl;
	}

	let scheme = (httpsEnabled && tlsCert && tlsKey) ? 'https' : 'http';
	let host = window.location.hostname;
	if (host.indexOf(':') !== -1 && !host.startsWith('[')) {
		host = '[' + host + ']';
	}

	return String.format('%s://%s:%s%s', scheme, host, port, baseUrl);
}

function renderStatus(isRunning) {
	let spanTemp = '<span style="color:%s"><strong>%s %s</strong></span>';
	if (isRunning) {
		let button = String.format(
			'&#160;<a class="btn cbi-button cbi-button-apply" href="%s" target="_blank" rel="noreferrer noopener">%s</a>',
			buildWebUrl(), _('Open Web Interface')
		);
		return spanTemp.format('green', _('FileBrowser Quantum'), _('RUNNING')) + button;
	}
	return spanTemp.format('red', _('FileBrowser Quantum'), _('NOT RUNNING'));
}

function fetchRuntimeLogs() {
	return L.resolveDefault(fs.exec_direct('/sbin/logread', ['-e', 'filebrowser-q', '-l', '200']), '').then(function(out) {
		return (out && out.trim()) ? out.trim() : _('No log entries found.');
	});
}

return view.extend({
	load() {
		return uci.load('filebrowser-q');
	},

	render() {
		let m, s, o;

		m = new form.Map('filebrowser-q', _('FileBrowser Quantum'),
			_('Modern self-hosted web file manager with multi-source storage, indexed search, WebDAV, and rich previews.') + '<br />' +
			_('Default login username is %s and password is %s.').format('<code>admin</code>', '<code>admin123</code>'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function() {
			poll.add(function() {
				return L.resolveDefault(getServiceStatus(), false).then(function(res) {
					let viewEl = document.getElementById('service_status');
					if (viewEl) {
						viewEl.innerHTML = renderStatus(res);
					}
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'service_status' }, _('Collecting data...'))
			]);
		};

		s = m.section(form.NamedSection, 'config', 'filebrowser');
		s.addremove = false;
		s.anonymous = true;

		s.tab('basic', _('Basic Settings'));
		s.tab('config', _('Custom Config'));
		s.tab('log', _('Service Logs'));

		/* ==================== Tab 1: Basic Settings ==================== */
		o = s.taboption('basic', form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'listen_addr', _('Listen address'),
			_('Choose 127.0.0.1 when running behind a local reverse proxy.'));
		o.value('0.0.0.0', _('0.0.0.0 (All interfaces)'));
		o.value('127.0.0.1', _('127.0.0.1 (Localhost only)'));
		o.value('::', _(':: (IPv6 & dual-stack)'));
		o.datatype = 'ipaddr';
		o.default = '0.0.0.0';
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'listen_port', _('Listen port'));
		o.datatype = 'port';
		o.default = '8787';
		o.rmempty = false;

		o = s.taboption('basic', form.Flag, 'open_firewall', _('Open firewall port'),
			_('Automatically allow incoming WAN TCP traffic to the listen port.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.ListValue, 'auth_mode', _('Authentication mode'));
		o.value('password', _('Password authentication'));
		o.value('noauth', _('No authentication (Trusted LAN only)'));
		o.default = 'password';
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'adminUsername', _('Admin username'));
		o.default = 'admin';
		o.rmempty = false;
		o.depends('auth_mode', 'password');

		o = s.taboption('basic', form.Value, 'adminPassword', _('Admin password'),
			_('Clear this field after initial login if you want password changes made in the Web UI to persist across restarts.'));
		o.password = true;
		o.default = 'admin123';
		o.rmempty = true;
		o.depends('auth_mode', 'password');
		o.validate = function(section_id, value) {
			if (!value) {
				return true;
			}
			if (value === 'admin') {
				return _('Password cannot be "admin"; enter at least 5 characters.');
			}
			if (value.length < 5) {
				return _('Password length must be at least 5 characters.');
			}
			return true;
		};

		o = s.taboption('basic', form.Value, 'root_path', _('Root directory'),
			_('Primary storage path (for example / or /mnt/sda1).'));
		o.default = '/';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			return (value && value.startsWith('/')) ? true : _('Path must start with "/".');
		};

		o = s.taboption('basic', form.DynamicList, 'extra_sources', _('Additional directories'),
			_('Optional extra storage sources. Format: /path, /path:Name, or /path:Name:ro (read-only).'));
		o.placeholder = '/mnt/sda1:USB_Drive';
		o.validate = function(section_id, value) {
			if (!value) {
				return true;
			}
			let parts = value.split(':');
			if (!parts[0] || !parts[0].startsWith('/')) {
				return _('Path must start with "/".');
			}
			if (parts.length > 3 || (parts.length === 3 && parts[2] !== 'ro' && parts[2] !== 'readonly')) {
				return _('Invalid format. Use /path, /path:Name, or /path:Name:ro.');
			}
			return true;
		};

		o = s.taboption('basic', form.Value, 'db_path', _('Database file path'),
			_('Move to external storage (for example /mnt/sda1/filebrowser-q/filebrowser.sqlite) if router flash space is limited.'));
		o.default = '/etc/filebrowser-q/filebrowser.sqlite';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (!value || !value.startsWith('/')) {
				return _('Path must start with "/".');
			}
			if (value === '/database.db' || value.endsWith('/database.db')) {
				return _('Filename "database.db" is reserved for v1 migration; use "filebrowser.sqlite" instead.');
			}
			return true;
		};

		o = s.taboption('basic', form.Value, 'cacheDir', _('Cache directory'),
			_('Stores thumbnails, search index, and archive temp files. Point to disk storage when downloading large folders.'));
		o.default = '/tmp/filebrowser-q';
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'cacheDirMaxSizeMB', _('Cache max size (MB)'),
			_('Maximum disk space used by thumbnail previews (0 = unlimited).'));
		o.datatype = 'uinteger';
		o.default = '300';
		o.rmempty = false;

		o = s.taboption('basic', form.Flag, 'disable_previews', _('Disable thumbnails'),
			_('Disable image, video, and document thumbnail generation to reduce CPU and RAM usage on low-end devices.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'base_url', _('Base URL path'),
			_('Subpath prefix when behind a reverse proxy (for example /files).'));
		o.default = '/';
		o.placeholder = '/';
		o.rmempty = false;

		o = s.taboption('basic', form.Flag, 'trust_proxy_headers', _('Trust reverse-proxy headers'),
			_('Enable when running behind Nginx, Caddy, or Lucky to honor X-Forwarded-* headers.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Flag, 'https_enabled', _('Enable HTTPS (TLS)'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'tls_cert', _('TLS certificate path'));
		o.placeholder = '/etc/filebrowser-q/cert.pem';
		o.rmempty = true;
		o.depends('https_enabled', '1');

		o = s.taboption('basic', form.Value, 'tls_key', _('TLS private key path'));
		o.placeholder = '/etc/filebrowser-q/key.pem';
		o.rmempty = true;
		o.depends('https_enabled', '1');

		/* ==================== Tab 2: Custom Config ==================== */
		o = s.taboption('config', form.Flag, 'use_custom_config', _('Use custom YAML configuration'),
			_('Keep manual edits to /etc/filebrowser-q/config.yaml without overwriting from UCI options above (for OIDC, OnlyOffice, or advanced rules).'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('config', form.TextValue, '_custom_yaml', _('Configuration YAML (/etc/filebrowser-q/config.yaml)'),
			_('Changes here are saved only when "Use custom YAML configuration" is enabled.'));
		o.rows = 22;
		o.monospace = true;
		o.load = function() {
			return L.resolveDefault(fs.read_direct(CONF_PATH), '');
		};
		o.write = function(section_id, formvalue) {
			let useCustomEl = this.map.lookupOption('use_custom_config', section_id);
			let isCustom = useCustomEl && useCustomEl[0] && useCustomEl[0].formvalue(section_id) === '1';
			if (!isCustom) {
				return;
			}
			let normalized = (formvalue || '').replace(/\r\n/g, '\n');
			if (normalized && !normalized.endsWith('\n')) {
				normalized += '\n';
			}
			return fs.write(CONF_PATH, normalized);
		};
		o.remove = function() { };

		/* ==================== Tab 3: Service Logs ==================== */
		o = s.taboption('log', form.DummyValue, '_runtime_logs', _('Service Logs'));
		o.rawhtml = true;
		o.load = function() {
			return fetchRuntimeLogs();
		};
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			let textarea = E('textarea', {
				id: 'fbq_log_textarea',
				class: 'cbi-input-textarea',
				style: 'width:100%; font-family:monospace; font-size:12px;',
				rows: 18,
				readonly: 'readonly'
			}, [ cfgvalue || _('No log entries found.') ]);

			let refreshBtn = E('button', {
				type: 'button',
				class: 'btn cbi-button cbi-button-neutral',
				style: 'margin-bottom:8px;',
				click: ui.createHandlerFn(this, function() {
					return fetchRuntimeLogs().then(function(logs) {
						textarea.value = logs;
						textarea.scrollTop = textarea.scrollHeight;
					});
				})
			}, [ _('Refresh Logs') ]);

			return E('div', {}, [ refreshBtn, textarea ]);
		};

		return m.render();
	}
});
