'use strict';
'require view';
'require dom';
'require form';
'require fs';
'require poll';
'require uci';
'require ui';

function getServiceStatus() {
	return fs.exec_direct('/usr/libexec/clouddrive2-helper', ['status'], 'json').catch(function() {
		return { running: false };
	});
}

function buildWebUrl(status, pathSuffix) {
	var useHttps = !!status.https_enabled;
	var scheme = useHttps ? 'https' : 'http';
	var port = useHttps ? (status.https_port || 19799) : (status.port || 19798);
	var host = window.location.hostname;

	if (host.indexOf(':') !== -1 && host.charAt(0) !== '[')
		host = '[' + host + ']';

	return scheme + '://' + host + ':' + port + (pathSuffix || '');
}

function validateAbsPath(section_id, value) {
	if (!value || !value.trim())
		return _('Path cannot be empty');
	if (value.charAt(0) !== '/')
		return _('Please enter an absolute path starting with /');
	return true;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('clouddrive2'),
			getServiceStatus()
		]);
	},

	renderStatusNodes: function(status) {
		var self = this;
		var isRunning = !!status.running;
		var webUrl = buildWebUrl(status, '/');
		var davUrl = buildWebUrl(status, '/dav');
		var mounts = Array.isArray(status.mounts) ? status.mounts : [];
		var rssMb = status.rss_kb ? (status.rss_kb / 1024).toFixed(1) : null;

		var badgeStyle = 'display:inline-block;padding:3px 10px;border-radius:12px;font-weight:600;font-size:12px;' +
			(isRunning
				? 'background:rgba(46,160,67,0.15);color:#2ea043;border:1px solid rgba(46,160,67,0.35);'
				: 'background:rgba(218,54,51,0.15);color:#da3633;border:1px solid rgba(218,54,51,0.35);');

		var metaSpans = [];
		if (isRunning) {
			if (status.pid)
				metaSpans.push(E('span', { 'style': 'margin-left:10px;opacity:0.85;font-size:12px;' }, _('PID: %d').format(status.pid)));
			if (rssMb)
				metaSpans.push(E('span', { 'style': 'margin-left:10px;opacity:0.85;font-size:12px;' }, _('Memory: %s MB').format(rssMb)));
			metaSpans.push(E('span', { 'style': 'margin-left:10px;opacity:0.85;font-size:12px;' }, _('Active Mounts: %d').format(mounts.length)));
		}

		var handleAction = function(action, ev) {
			var btn = ev.currentTarget;
			btn.disabled = true;
			return fs.exec('/etc/init.d/clouddrive2', [action]).then(function(res) {
				if (res && res.code !== 0 && res.stderr)
					ui.addNotification(null, E('p', _('Service action failed: %s').format(res.stderr)), 'error');
				return new Promise(function(resolve) { setTimeout(resolve, 1000); });
			}).then(function() {
				return getServiceStatus();
			}).then(function(st) {
				var box = document.getElementById('clouddrive2-status-box');
				if (box)
					dom.content(box, self.renderStatusNodes(st));
			}).catch(function(err) {
				ui.addNotification(null, E('p', _('Failed to execute service command: %s').format(err.message || err)), 'error');
			}).finally(function() {
				btn.disabled = false;
			});
		};

		var actionBtns = [];
		if (isRunning) {
			actionBtns.push(E('button', {
				'type': 'button',
				'class': 'btn cbi-button cbi-button-apply',
				'click': function() { window.open(webUrl, '_blank', 'noopener'); }
			}, _('Open Web Interface')));

			actionBtns.push(E('button', {
				'type': 'button',
				'class': 'btn cbi-button cbi-button-reload',
				'click': ui.createHandlerFn(this, handleAction, 'restart')
			}, _('Restart')));

			actionBtns.push(E('button', {
				'type': 'button',
				'class': 'btn cbi-button cbi-button-reset',
				'click': ui.createHandlerFn(this, handleAction, 'stop')
			}, _('Stop')));
		} else {
			actionBtns.push(E('button', {
				'type': 'button',
				'class': 'btn cbi-button cbi-button-apply',
				'click': ui.createHandlerFn(this, handleAction, 'start')
			}, _('Start')));
		}

		var rows = [
			E('div', {
				'style': 'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;'
			}, [
				E('div', { 'style': 'display:flex;align-items:center;flex-wrap:wrap;gap:4px;' }, [
					E('strong', { 'style': 'margin-right:8px;font-size:14px;' }, 'CloudDrive2'),
					E('span', { 'style': badgeStyle }, isRunning ? _('RUNNING') : _('NOT RUNNING'))
				].concat(metaSpans)),
				E('div', { 'style': 'display:flex;align-items:center;flex-wrap:wrap;gap:8px;' }, actionBtns)
			])
		];

		if (isRunning) {
			rows.push(E('div', {
				'style': 'margin-top:8px;font-size:12px;opacity:0.85;display:flex;flex-wrap:wrap;gap:16px;'
			}, [
				E('span', {}, [
					_('Web Console'), ': ',
					E('a', { 'href': webUrl, 'target': '_blank', 'rel': 'noopener' }, webUrl)
				]),
				E('span', {}, [
					'WebDAV: ',
					E('a', { 'href': davUrl, 'target': '_blank', 'rel': 'noopener' }, davUrl)
				])
			]));

			if (mounts.length > 0) {
				rows.push(E('div', {
					'style': 'margin-top:6px;font-size:12px;opacity:0.85;'
				}, [
					_('Mounted Paths'), ': ',
					E('code', {}, mounts.join(', '))
				]));
			}
		}

		if (status.binary_exists === false) {
			rows.push(E('div', {
				'style': 'margin-top:8px;color:#da3633;font-size:12px;'
			}, _('Core binary /usr/share/clouddrive2/clouddrive was not found.')));
		} else if (status.fuse_ready === false) {
			rows.push(E('div', {
				'style': 'margin-top:8px;color:#d29922;font-size:12px;'
			}, _('Warning: /dev/fuse device was not detected. Install kmod-fuse for local cloud mounting.')));
		}

		return rows;
	},

	render: function(data) {
		var self = this;
		var initialStatus = data[1] || { running: false };
		var m, s, o;

		m = new form.Map('clouddrive2', _('CloudDrive2'),
			_('CloudDrive2 is a multi-cloud storage management tool supporting local FUSE mounting, cross-cloud backup, and WebDAV service.'));

		s = m.section(form.NamedSection, '_status');
		s.anonymous = true;
		s.render = function() {
			return E('div', { 'class': 'cbi-section' }, [
				E('div', {
					'id': 'clouddrive2-status-box',
					'style': 'padding:12px 16px;'
				}, self.renderStatusNodes(initialStatus))
			]);
		};

		poll.add(function() {
			return getServiceStatus().then(function(st) {
				var box = document.getElementById('clouddrive2-status-box');
				if (box)
					dom.content(box, self.renderStatusNodes(st));
			});
		}, 3);

		s = m.section(form.NamedSection, 'main', 'clouddrive2', _('Service Configuration'));
		s.addremove = false;
		s.anonymous = true;

		s.tab('general', _('General Settings'));
		s.tab('storage', _('Storage & Mount'));
		s.tab('advanced', _('Advanced Settings'));

		/* General Settings */
		o = s.taboption('general', form.Flag, 'enabled', _('Enable'),
			_('Enable and start the CloudDrive2 background service.'));
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'port', _('HTTP Port'),
			_('Default HTTP port for Web UI and WebDAV is 19798. Keep consistent if modified inside CloudDrive2 Web Server settings.'));
		o.datatype = 'port';
		o.default = '19798';
		o.placeholder = '19798';
		o.rmempty = false;

		o = s.taboption('general', form.Flag, 'https_enabled', _('Enable HTTPS'),
			_('Use HTTPS when opening the Web UI and optionally expose the HTTPS port in the firewall. Certificate must be configured in CloudDrive2 Web Server settings.'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'https_port', _('HTTPS Port'),
			_('Default HTTPS port in CloudDrive2 is 19799.'));
		o.datatype = 'port';
		o.default = '19799';
		o.placeholder = '19799';
		o.depends('https_enabled', '1');

		o = s.taboption('general', form.Flag, 'open_firewall', _('Open Firewall Port'),
			_('Automatically add firewall accept rules to allow external access to CloudDrive2 Web UI and WebDAV ports.'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'startup_delay', _('Startup Delay (Seconds)'),
			_('Delay service startup at boot to wait for external USB/SATA drives or WAN connection readiness. Set 0 to start immediately.'));
		o.datatype = 'uinteger';
		o.default = '0';
		o.placeholder = '0';

		/* Storage & Mount */
		o = s.taboption('storage', form.Value, 'config_dir', _('Configuration Directory'),
			_('Directory storing CloudDrive2 configuration, account database, directory cache, and logs (CLOUDDRIVE_HOME). Place on external storage if flash space is limited.'));
		o.default = '/etc/clouddrive2';
		o.placeholder = '/etc/clouddrive2';
		o.rmempty = false;
		o.validate = validateAbsPath;

		o = s.taboption('storage', form.Value, 'mount_point', _('Mount Base Directory'),
			_('Local base directory for FUSE cloud mounts. Sub-mounts under this directory are safely unmounted when stopping the service.'));
		o.default = '/mnt/clouddrive';
		o.placeholder = '/mnt/clouddrive';
		o.rmempty = false;
		o.validate = validateAbsPath;

		o = s.taboption('storage', form.Value, 'cache_dir', _('Temp & Cache Directory'),
			_('Directory for upload buffers and temporary files (temp_dir / TMPDIR). Using /tmp or an external disk prevents flash wear.'));
		o.default = '/tmp/clouddrive2';
		o.placeholder = '/tmp/clouddrive2';
		o.rmempty = false;
		o.validate = validateAbsPath;

		o = s.taboption('storage', form.Flag, 'shared_mount', _('Shared Mount Propagation'),
			_('Enable shared mount propagation (mount --make-shared) on the mount partition so Docker containers such as Jellyfin or Emby can access mounted cloud files.'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('storage', form.Flag, 'allow_other', _('Allow Other Users'),
			_('Enable user_allow_other in /etc/fuse.conf so Samba, ksmbd, and media services running under non-root accounts can read mounted directories.'));
		o.default = '1';
		o.rmempty = false;

		/* Advanced Settings */
		o = s.taboption('advanced', form.Value, 'proxy', _('HTTP/HTTPS Proxy'),
			_('Optional proxy URL for accessing cloud storage APIs (for example http://127.0.0.1:7890 or socks5://127.0.0.1:1080).'));
		o.placeholder = 'http://127.0.0.1:7890';

		o = s.taboption('advanced', form.Value, 'max_open_files', _('Max Open Files'),
			_('Maximum file descriptor limit (ulimit -n) for the CloudDrive2 process to avoid handle exhaustion under heavy concurrency.'));
		o.datatype = 'uinteger';
		o.default = '65535';
		o.placeholder = '65535';

		o = s.taboption('advanced', form.Flag, 'enable_run_after_start', _('Run Post-Start Command'),
			_('Enable ENABLE_RUN_AFTER_START so CloudDrive2 executes a command once startup and cloud mounts are ready.'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'run_after_start', _('Post-Start Command'),
			_('Command written to systemsettings.json (run_after_start), such as restarting media containers after mounts come online.'));
		o.placeholder = 'docker restart jellyfin';
		o.depends('enable_run_after_start', '1');

		o = s.taboption('advanced', form.Flag, 'log_stdout', _('Forward Stdout to Syslog'),
			_('Forward standard output of CloudDrive2 to OpenWrt system log (logread).'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'log_stderr', _('Forward Stderr to Syslog'),
			_('Forward standard error output of CloudDrive2 to OpenWrt system log (logread).'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('advanced', form.DynamicList, 'extra_env', _('Custom Environment Variables'),
			_('Additional environment variables passed to CloudDrive2 in KEY=VALUE format (for example RUST_LOG=info).'));
		o.placeholder = 'RUST_LOG=info';
		o.validate = function(section_id, value) {
			if (!value)
				return true;
			if (!/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(value))
				return _('Invalid format, expected KEY=VALUE');
			return true;
		};

		return m.render();
	}
});
