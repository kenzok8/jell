'use strict';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

const DEFAULT_CONF_PATH = '/etc/filebrowser-q/config.yaml';

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
	let socket = (uci.get('filebrowser-q', 'config', 'socket') || '').trim();
	let externalUrl = (uci.get('filebrowser-q', 'config', 'external_url') || '').trim();

	if (socket) {
		return externalUrl || '';
	}

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
		let url = buildWebUrl();
		let extra = '';
		if (url) {
			extra = String.format(
				'&#160;<a class="btn cbi-button cbi-button-apply" href="%s" target="_blank" rel="noreferrer noopener">%s</a>',
				url, _('Open Web Interface')
			);
		} else {
			extra = '&#160;<em>(' + _('Unix Socket Mode') + ')</em>';
		}
		return spanTemp.format('green', _('FileBrowser Quantum'), _('RUNNING')) + extra;
	}
	return spanTemp.format('red', _('FileBrowser Quantum'), _('NOT RUNNING'));
}

function fetchRuntimeLogs() {
	let logFile = (uci.get('filebrowser-q', 'config', 'log_file') || '').trim();
	if (logFile) {
		return L.resolveDefault(fs.read_direct(logFile), '').then(function(content) {
			if (!content) {
				return _('No log entries found.');
			}
			let lines = content.trim().split('\n');
			return lines.slice(-200).join('\n');
		});
	}
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
		s.tab('storage', _('Storage & Sources'));
		s.tab('auth', _('Authentication & Security'));
		s.tab('network', _('Network, TLS & Proxy'));
		s.tab('advanced', _('Performance & Integrations'));
		s.tab('custom', _('Custom Config & Logs'));

		/* ==================== Tab 1: Basic Settings ==================== */
		o = s.taboption('basic', form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'listen_addr', _('Listen address'),
			_('IP address to bind the HTTP server. Choose 127.0.0.1 when running behind a local reverse proxy.'));
		o.value('0.0.0.0', _('0.0.0.0 (All IPv4/IPv6 interfaces)'));
		o.value('127.0.0.1', _('127.0.0.1 (Localhost only)'));
		o.value('::', _(':: (IPv6 & dual-stack)'));
		o.datatype = 'ipaddr';
		o.default = '0.0.0.0';
		o.rmempty = false;
		o.depends('socket', '');

		o = s.taboption('basic', form.Value, 'listen_port', _('Listen port'));
		o.datatype = 'port';
		o.default = '8787';
		o.rmempty = false;
		o.depends('socket', '');

		o = s.taboption('basic', form.Flag, 'open_firewall', _('Open firewall port'),
			_('Automatically add a dynamic firewall rule allowing incoming TCP connections to the listen port.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('socket', '');

		o = s.taboption('basic', form.Value, 'base_url', _('Base URL path'),
			_('URL subpath prefix when serving FileBrowser under a reverse proxy path (for example /files).'));
		o.default = '/';
		o.placeholder = '/';
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'locale', _('Default UI language'),
			_('Default language seeded for new users. Choose Unlocked to manage freely in the Web UI.'));
		o.value('unlocked', _('Unlocked (Manage in Web UI)'));
		o.value('zhCN', _('Simplified Chinese (zhCN)'));
		o.value('zhTW', _('Traditional Chinese (zhTW)'));
		o.value('en', _('English (en)'));
		o.value('ja', _('Japanese (ja)'));
		o.value('ko', _('Korean (ko)'));
		o.value('de', _('German (de)'));
		o.value('fr', _('French (fr)'));
		o.value('es', _('Spanish (es)'));
		o.value('ru', _('Russian (ru)'));
		o.default = 'zhCN';
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'frontend_name', _('Site title'),
			_('Custom display name shown in the browser tab, top header, and PWA manifest.'));
		o.placeholder = 'FileBrowser Quantum';
		o.rmempty = true;

		o = s.taboption('basic', form.Flag, 'disable_update_check', _('Disable update check'),
			_('Stop periodic background requests checking GitHub for new FileBrowser Quantum releases.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Flag, 'disable_default_links', _('Hide default sidebar links'),
			_('Hide built-in external documentation and project links from the sidebar.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Flag, 'disable_used_percentage', _('Hide storage usage bar'),
			_('Hide disk capacity percentage bars on storage sources in the sidebar.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Flag, 'disable_pwa_install', _('Disable PWA install prompt'),
			_('Globally hide the "Install App" prompt banner across desktop and mobile browsers.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Flag, 'disable_event_themes', _('Disable seasonal themes'),
			_('Prevent automatic holiday theme switching (such as Halloween styling).'));
		o.default = o.disabled;
		o.rmempty = false;

		/* ==================== Tab 2: Storage & Sources ==================== */
		o = s.taboption('storage', form.Value, 'root_path', _('Primary root directory'),
			_('Filesystem path for the primary storage source (for example /mnt/sda1 or /).'));
		o.default = '/';
		o.rmempty = false;

		o = s.taboption('storage', form.Value, 'root_name', _('Primary source display name'),
			_('Optional label shown in the sidebar. Defaults to "root" for / or the directory basename.'));
		o.placeholder = _('Auto-derived from path');
		o.rmempty = true;

		o = s.taboption('storage', form.Flag, 'read_only', _('Read-only primary source'),
			_('Block file creation, modification, upload, and deletion across Web UI, API, and WebDAV.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('storage', form.Flag, 'private_source', _('Disable public sharing'),
			_('Mark the primary source as private to disallow generating share links.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('storage', form.Flag, 'create_user_dir', _('Auto-create per-user directory'),
			_('Automatically create and scope each user to an isolated subdirectory named after their username.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('storage', form.Flag, 'use_logical_size', _('Use logical file size'),
			_('Calculate sizes from apparent file length instead of disk blocks (recommended for FUSE/CloudDrive2/rclone mounts).'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('storage', form.Flag, 'exclude_virtual_fs', _('Exclude virtual kernel filesystems'),
			_('Skip indexing /proc, /sys, and /dev, and set /tmp and /var to browse-only when root directory is /.'));
		o.default = o.enabled;
		o.rmempty = false;
		o.depends('root_path', '/');

		o = s.taboption('storage', form.Flag, 'disable_indexing', _('Disable background indexing'),
			_('Allow browsing files without building background search and directory size indexes (saves RAM/IO on slow mounts).'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('storage', form.Flag, 'ignore_hidden', _('Exclude hidden files'),
			_('Skip dotfiles and hidden folders starting with "." during indexing and listing.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('disable_indexing', '0');

		o = s.taboption('storage', form.Flag, 'ignore_symlinks', _('Exclude symbolic links'),
			_('Omit symbolic links completely from source indexing.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('disable_indexing', '0');

		o = s.taboption('storage', form.Flag, 'ignore_zero_size_folders', _('Exclude empty folders'),
			_('Hide folders whose total indexed content size is 0 bytes.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('disable_indexing', '0');

		o = s.taboption('storage', form.DynamicList, 'extra_sources', _('Additional storage sources'),
			_('Mount extra directories as separate sidebar sources. Format: /path, /path:DisplayName, or /path:DisplayName:ro (read-only).'));
		o.placeholder = '/mnt/sda1:USB_Drive';
		o.validate = function(section_id, value) {
			if (!value) {
				return true;
			}
			let parts = value.split(':');
			if (!parts[0] || !parts[0].startsWith('/')) {
				return _('Source path must be an absolute path starting with "/".');
			}
			if (parts.length > 3 || (parts.length === 3 && parts[2] !== 'ro' && parts[2] !== 'readonly')) {
				return _('Invalid format. Use /path, /path:Name, or /path:Name:ro.');
			}
			return true;
		};

		o = s.taboption('storage', form.Value, 'file_mode', _('Default file permission'),
			_('Unix octal permission applied to newly created or uploaded files (default: 644).'));
		o.default = '644';
		o.placeholder = '644';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			return /^[0-7]{3,4}$/.test(value) ? true : _('Enter a valid 3 or 4 digit octal permission (for example 644 or 0664).');
		};

		o = s.taboption('storage', form.Value, 'dir_mode', _('Default directory permission'),
			_('Unix octal permission applied to newly created folders (default: 755).'));
		o.default = '755';
		o.placeholder = '755';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			return /^[0-7]{3,4}$/.test(value) ? true : _('Enter a valid 3 or 4 digit octal permission (for example 755 or 2755).');
		};

		/* ==================== Tab 3: Authentication & Security ==================== */
		o = s.taboption('auth', form.ListValue, 'auth_mode', _('Authentication mode'));
		o.value('password', _('Password authentication (Recommended)'));
		o.value('proxy', _('Reverse-proxy header authentication'));
		o.value('noauth', _('No authentication (Trusted LAN only)'));
		o.default = 'password';
		o.rmempty = false;

		o = s.taboption('auth', form.Value, 'adminUsername', _('Admin username'),
			_('Built-in administrator account username.'));
		o.default = 'admin';
		o.rmempty = false;
		o.depends('auth_mode', 'password');
		o.depends('auth_mode', 'proxy');

		o = s.taboption('auth', form.Value, 'adminPassword', _('Admin password'),
			_('Synced via FILEBROWSER_ADMIN_PASSWORD on startup. Clear this field after setup if you want password changes made inside the Web UI to persist across restarts.'));
		o.password = true;
		o.default = 'admin123';
		o.rmempty = true;
		o.depends('auth_mode', 'password');
		o.validate = function(section_id, value) {
			if (!value) {
				return true;
			}
			if (value === 'admin') {
				return _('FileBrowser Quantum v2 rejects "admin" as a configured password; choose another password with at least 5 characters.');
			}
			let minEl = this.map.lookupOption('min_password_length', section_id);
			let minLen = (minEl && minEl[0]) ? parseInt(minEl[0].formvalue(section_id) || '5', 10) : 5;
			if (isNaN(minLen) || minLen < 5) {
				minLen = 5;
			}
			if (value.length < minLen) {
				return _('Password length must be at least %d characters.').format(minLen);
			}
			return true;
		};

		o = s.taboption('auth', form.Value, 'min_password_length', _('Minimum password length'));
		o.datatype = 'min(5)';
		o.default = '5';
		o.rmempty = false;
		o.depends('auth_mode', 'password');

		o = s.taboption('auth', form.Flag, 'signup', _('Allow user signup'),
			_('Allow visitors to self-register new accounts on the login page.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('auth_mode', 'password');

		o = s.taboption('auth', form.Flag, 'enforced_otp', _('Enforce Two-Factor Authentication (2FA)'),
			_('Require all password-authenticated users to set up TOTP 2FA on login.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('auth_mode', 'password');

		o = s.taboption('auth', form.Value, 'totp_secret', _('2FA encryption secret'),
			_('Optional base64 secret passed via FILEBROWSER_TOTP_SECRET to encrypt TOTP keys. Do not change once users enable 2FA.'));
		o.password = true;
		o.rmempty = true;
		o.depends('auth_mode', 'password');

		o = s.taboption('auth', form.Flag, 'enable_passkey', _('Enable Passkey (WebAuthn)'),
			_('Allow users to register hardware security keys or biometric passkeys (requires HTTPS or localhost).'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('auth_mode', 'password');

		o = s.taboption('auth', form.Value, 'proxy_header', _('Trusted proxy user header'),
			_('HTTP request header carrying the authenticated username from your reverse proxy (such as Authelia or Authentik).'));
		o.value('X-Forwarded-User', 'X-Forwarded-User');
		o.value('Remote-User', 'Remote-User');
		o.default = 'X-Forwarded-User';
		o.rmempty = false;
		o.depends('auth_mode', 'proxy');

		o = s.taboption('auth', form.Value, 'token_expiration_hours', _('Session expiration (hours)'),
			_('Validity duration in hours for each Web UI login session token.'));
		o.datatype = 'min(1)';
		o.default = '2';
		o.rmempty = false;
		o.depends('auth_mode', 'password');
		o.depends('auth_mode', 'proxy');

		o = s.taboption('auth', form.Flag, 'disable_rate_limit', _('Disable auth rate limiting'),
			_('Turn off built-in brute-force throttling and 15-minute failed-login lockouts on /api/auth/* endpoints.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('auth_mode', 'password');
		o.depends('auth_mode', 'proxy');

		/* ==================== Tab 4: Network, TLS & Proxy ==================== */
		o = s.taboption('network', form.Flag, 'disable_webdav', _('Disable WebDAV'),
			_('Disable the /dav/<source> WebDAV endpoint if external WebDAV client access is not needed.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('network', form.Flag, 'trust_proxy_headers', _('Trust reverse-proxy headers'),
			_('Honor X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host, and X-Real-IP when running behind Nginx, Caddy, Lucky, or Traefik.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('network', form.Value, 'external_url', _('External public URL'),
			_('Public scheme and domain (for example https://files.example.com) used when generating share links and WebAuthn origins.'));
		o.placeholder = 'https://files.example.com';
		o.rmempty = true;

		o = s.taboption('network', form.Value, 'internal_url', _('Internal callback URL'),
			_('Optional private LAN URL (for example http://192.168.1.1:8787) used by OnlyOffice to reach FileBrowser directly.'));
		o.placeholder = 'http://192.168.1.1:8787';
		o.rmempty = true;

		o = s.taboption('network', form.Flag, 'https_enabled', _('Enable native HTTPS (TLS)'),
			_('Serve HTTPS directly from FileBrowser Quantum using a certificate and private key.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('socket', '');

		o = s.taboption('network', form.Value, 'tls_cert', _('TLS certificate path'));
		o.placeholder = '/etc/filebrowser-q/cert.pem';
		o.rmempty = true;
		o.depends({ https_enabled: '1', socket: '' });

		o = s.taboption('network', form.Value, 'tls_key', _('TLS private key path'));
		o.placeholder = '/etc/filebrowser-q/key.pem';
		o.rmempty = true;
		o.depends({ https_enabled: '1', socket: '' });

		o = s.taboption('network', form.Value, 'socket', _('Unix domain socket path'),
			_('Listen on a local Unix socket instead of TCP port/TLS (for example /var/run/filebrowser-q.sock). Leave empty to use TCP.'));
		o.placeholder = '/var/run/filebrowser-q.sock';
		o.rmempty = true;

		/* ==================== Tab 5: Performance & Integrations ==================== */
		o = s.taboption('advanced', form.Value, 'db_path', _('SQLite database path'),
			_('Path to the SQLite state database (must not be named database.db). Move to external storage if /overlay space is tight.'));
		o.default = '/etc/filebrowser-q/filebrowser.sqlite';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (!value || !value.startsWith('/')) {
				return _('Database path must be an absolute file path.');
			}
			if (value === '/database.db' || value.endsWith('/database.db')) {
				return _('Filename "database.db" is reserved for legacy v1 BoltDB migration; use "filebrowser.sqlite" instead.');
			}
			return true;
		};

		o = s.taboption('advanced', form.Flag, 'disable_auto_backup', _('Disable automatic DB backup'),
			_('Set FILEBROWSER_DISABLE_AUTOMATIC_BACKUP=true to save flash storage space on routers.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'cacheDir', _('Cache directory'),
			_('Directory storing thumbnails, index SQLite files, and archive spool files. Point to disk storage when downloading large ZIP folders.'));
		o.default = '/tmp/filebrowser-q';
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'cacheDirMaxSizeMB', _('Preview cache max size (MB)'),
			_('Maximum disk space used by generated thumbnail previews (0 = unlimited).'));
		o.datatype = 'uinteger';
		o.default = '300';
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'cache_cleanup', _('Auto-clean cache directory'),
			_('Automatically clean up temporary cache files on startup and shutdown.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'max_archive_size', _('Max archive/unarchive size (GB)'),
			_('Maximum combined size in GB for ZIP/TAR compression and extraction operations (0 = unlimited).'));
		o.datatype = 'uinteger';
		o.default = '20';
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'min_search_length', _('Minimum search query length'));
		o.datatype = 'min(1)';
		o.default = '3';
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'search_results_limit', _('Advanced search results limit'),
			_('Maximum indexed matches returned for a single Advanced Search request.'));
		o.datatype = 'min(10)';
		o.default = '1000';
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'disable_previews', _('Disable all previews & thumbnails'),
			_('Use lightweight file icons instead of generating image, video, and document thumbnails.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'disable_preview_resize', _('Disable preview resizing'),
			_('Skip image resizing when serving previews.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('disable_previews', '0');

		o = s.taboption('advanced', form.Flag, 'disable_type_detection', _('Disable file header type detection'),
			_('Detect file types by extension only without reading file headers (improves listing speed on slow network/USB drives).'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'num_image_processors', _('Thumbnail worker threads'),
			_('Concurrent image preview workers (FFmpeg uses half). Leave empty to match CPU cores, or set 1-2 on low-power routers.'));
		o.datatype = 'min(1)';
		o.placeholder = _('Auto (CPU cores)');
		o.rmempty = true;

		o = s.taboption('advanced', form.ListValue, 'startup_integrity_check', _('Index DB startup check'),
			_('Integrity verification mode for the SQLite search index database on service startup.'));
		o.value('quickCheck', _('quickCheck (Thorough PRAGMA quick_check)'));
		o.value('probe', _('probe (Fast catalog check, recommended for large disks)'));
		o.value('off', _('off (Fastest startup, minimal check)'));
		o.default = 'quickCheck';
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'index_cache_size_mb', _('Index SQLite cache size (MB)'));
		o.datatype = 'min(4)';
		o.default = '32';
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'index_wal_mode', _('Enable index WAL mode'),
			_('Enable SQLite Write-Ahead Logging for the search index (higher RAM usage, better concurrency under heavy activity).'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'ffmpeg_path', _('FFmpeg directory path'),
			_('Directory containing ffmpeg and ffprobe binaries (for example /usr/bin) for video thumbnails. Leave empty for system PATH discovery.'));
		o.placeholder = '/usr/bin';
		o.rmempty = true;

		o = s.taboption('advanced', form.Flag, 'extract_subtitles', _('Extract embedded video subtitles'),
			_('Allow extracting embedded subtitle tracks from video files during playback (I/O intensive on large videos).'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'heic_preview', _('Enable HEIC image conversion'),
			_('Use FFmpeg to convert Apple HEIC photos for preview in non-Safari browsers (requires FFmpeg 8.1+).'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'onlyoffice_enabled', _('Enable OnlyOffice integration'),
			_('Connect an external OnlyOffice Document Server for online Office viewing and collaborative editing.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'onlyoffice_url', _('OnlyOffice server URL'),
			_('Browser-accessible URL of your OnlyOffice Document Server.'));
		o.placeholder = 'https://office.example.com';
		o.rmempty = true;
		o.depends('onlyoffice_enabled', '1');
		o.validate = function(section_id, value) {
			let enabledEl = this.map.lookupOption('onlyoffice_enabled', section_id);
			let isEnabled = enabledEl && enabledEl[0] && enabledEl[0].formvalue(section_id) === '1';
			if (isEnabled && (!value || !/^https?:\/\//.test(value.trim()))) {
				return _('Enter a valid http:// or https:// OnlyOffice server URL.');
			}
			return true;
		};

		o = s.taboption('advanced', form.Value, 'onlyoffice_internal_url', _('OnlyOffice internal URL'),
			_('Optional LAN/container address FileBrowser uses for backend requests to OnlyOffice.'));
		o.placeholder = 'http://192.168.1.2:8080';
		o.rmempty = true;
		o.depends('onlyoffice_enabled', '1');

		o = s.taboption('advanced', form.Value, 'onlyoffice_secret', _('OnlyOffice JWT secret'),
			_('Shared JWT secret matching your OnlyOffice Document Server configuration (passed via FILEBROWSER_ONLYOFFICE_SECRET).'));
		o.password = true;
		o.rmempty = true;
		o.depends('onlyoffice_enabled', '1');
		o.validate = function(section_id, value) {
			let enabledEl = this.map.lookupOption('onlyoffice_enabled', section_id);
			let isEnabled = enabledEl && enabledEl[0] && enabledEl[0].formvalue(section_id) === '1';
			if (isEnabled && (!value || !value.trim())) {
				return _('OnlyOffice JWT secret is required when OnlyOffice integration is enabled.');
			}
			return true;
		};

		o = s.taboption('advanced', form.Flag, 'onlyoffice_view_only', _('OnlyOffice view-only mode'),
			_('Open Office documents in read-only viewer mode without editing.'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('onlyoffice_enabled', '1');

		o = s.taboption('advanced', form.ListValue, 'log_level', _('Log level'));
		o.value('info|warning|error', _('Standard (info | warning | error)'));
		o.value('warning|error', _('Warnings & Errors only'));
		o.value('error', _('Errors only'));
		o.value('info|warning|error|debug', _('Debug (Verbose)'));
		o.value('disabled', _('Disabled'));
		o.default = 'info|warning|error';
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'api_log', _('Enable HTTP API access logs'),
			_('Log individual API request/response events (disabled by default to reduce syslog noise).'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'log_file', _('Custom log file path'),
			_('Leave empty to log to OpenWrt system log (stdout), or enter a file path such as /var/log/filebrowser-q.log.'));
		o.placeholder = '/var/log/filebrowser-q.log';
		o.rmempty = true;

		/* ==================== Tab 6: Custom Config & Logs ==================== */
		o = s.taboption('custom', form.Flag, 'use_custom_config', _('Use custom YAML configuration'),
			_('When enabled, the init script will not overwrite the YAML file from UCI options above, allowing manual configuration of OIDC, LDAP, or complex access rules.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('custom', form.Value, 'custom_config_path', _('Custom config file path'));
		o.default = DEFAULT_CONF_PATH;
		o.placeholder = DEFAULT_CONF_PATH;
		o.rmempty = false;
		o.depends('use_custom_config', '1');

		o = s.taboption('custom', form.TextValue, '_custom_yaml', _('Configuration YAML (/etc/filebrowser-q/config.yaml)'),
			_('Displays the active YAML file. Edits made here are saved only when "Use custom YAML configuration" is enabled above.'));
		o.rows = 20;
		o.monospace = true;
		o.load = function() {
			let cfgPath = (uci.get('filebrowser-q', 'config', 'custom_config_path') || DEFAULT_CONF_PATH).trim();
			return L.resolveDefault(fs.read_direct(cfgPath), '');
		};
		o.write = function(section_id, formvalue) {
			let useCustomEl = this.map.lookupOption('use_custom_config', section_id);
			let isCustom = useCustomEl && useCustomEl[0] && useCustomEl[0].formvalue(section_id) === '1';
			if (!isCustom) {
				return;
			}
			let pathEl = this.map.lookupOption('custom_config_path', section_id);
			let cfgPath = (pathEl && pathEl[0] && pathEl[0].formvalue(section_id)) ? pathEl[0].formvalue(section_id).trim() : DEFAULT_CONF_PATH;
			let normalized = (formvalue || '').replace(/\r\n/g, '\n');
			if (normalized && !normalized.endsWith('\n')) {
				normalized += '\n';
			}
			return fs.write(cfgPath, normalized);
		};
		o.remove = function() { };

		o = s.taboption('custom', form.DummyValue, '_runtime_logs', _('Service Logs'));
		o.rawhtml = true;
		o.load = function() {
			return fetchRuntimeLogs();
		};
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			let textarea = E('textarea', {
				id: 'fbq_log_textarea',
				class: 'cbi-input-textarea',
				style: 'width:100%; font-family:monospace; font-size:12px;',
				rows: 16,
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
