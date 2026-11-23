'use strict';
'require view';
'require dom';
'require fs';
'require poll';
'require ui';

function formatBytes(bytes) {
	var b = Number(bytes) || 0;
	if (b < 1024)
		return b + ' B';
	if (b < 1024 * 1024)
		return (b / 1024).toFixed(1) + ' KB';
	return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

return view.extend({
	logSource: 'app',
	logLines: '200',
	logLevel: 'ALL',
	logKeyword: '',
	newestFirst: true,
	autoRefresh: true,
	rawLog: '',
	logMeta: null,

	fetchLogMeta: function() {
		return fs.exec_direct('/usr/libexec/clouddrive2-helper', ['log_meta'], 'json').catch(function() {
			return { has_app_log: false, log_file: '', log_size: 0 };
		});
	},

	fetchLogs: function(source, lines) {
		return fs.exec_direct('/usr/libexec/clouddrive2-helper', ['log', source, String(lines)], 'text').catch(function() {
			return '';
		});
	},

	load: function() {
		var self = this;
		return this.fetchLogMeta().then(function(meta) {
			self.logMeta = meta;
			if (!meta.has_app_log)
				self.logSource = 'syslog';
			return self.fetchLogs(self.logSource, self.logLines);
		}).then(function(text) {
			self.rawLog = text || '';
			return self.rawLog;
		});
	},

	applyFilterAndRender: function() {
		var textarea = document.getElementById('clouddrive2-log-textarea');
		var metaEl = document.getElementById('clouddrive2-log-meta');

		if (metaEl && this.logMeta) {
			if (this.logSource === 'app' && this.logMeta.has_app_log) {
				metaEl.textContent = _('Log File: %s (%s)').format(this.logMeta.log_file, formatBytes(this.logMeta.log_size));
			} else if (this.logSource === 'app' && !this.logMeta.has_app_log) {
				metaEl.textContent = _('No application log file found in %s, showing syslog output').format(this.logMeta.log_file || '/etc/clouddrive2/log/');
			} else {
				metaEl.textContent = _('Source: OpenWrt logread (clouddrive)');
			}
		}

		if (!textarea)
			return;

		var lines = (this.rawLog || '').replace(/\r\n/g, '\n').split('\n');
		if (lines.length && lines[lines.length - 1] === '')
			lines.pop();

		var level = this.logLevel;
		var kw = (this.logKeyword || '').trim().toLowerCase();

		var filtered = lines.filter(function(line) {
			if (level !== 'ALL') {
				var upper = line.toUpperCase();
				if (level === 'ERROR' && upper.indexOf('ERROR') === -1 && upper.indexOf('ERR') === -1 && upper.indexOf('FATAL') === -1)
					return false;
				if (level === 'WARN' && upper.indexOf('WARN') === -1)
					return false;
				if (level === 'INFO' && upper.indexOf('INFO') === -1)
					return false;
				if (level === 'DEBUG' && upper.indexOf('DEBUG') === -1 && upper.indexOf('TRACE') === -1)
					return false;
			}
			if (kw && line.toLowerCase().indexOf(kw) === -1)
				return false;
			return true;
		});

		if (this.newestFirst)
			filtered.reverse();

		textarea.value = filtered.length ? filtered.join('\n') : _('No log entries found.');
	},

	refreshLogs: function() {
		var self = this;
		return Promise.all([
			this.fetchLogMeta(),
			this.fetchLogs(this.logSource, this.logLines)
		]).then(function(res) {
			self.logMeta = res[0];
			self.rawLog = res[1] || '';
			self.applyFilterAndRender();
		});
	},

	render: function() {
		var self = this;

		var pollFn = function() {
			if (!self.autoRefresh)
				return Promise.resolve();
			return self.refreshLogs();
		};
		poll.add(pollFn, 3);

		var sourceSelect = E('select', {
			'class': 'cbi-input-select',
			'style': 'width:auto;min-width:150px;',
			'change': function(ev) {
				self.logSource = ev.target.value;
				self.refreshLogs();
			}
		}, [
			E('option', { 'value': 'app', 'selected': self.logSource === 'app' ? 'selected' : null }, _('Application Log')),
			E('option', { 'value': 'syslog', 'selected': self.logSource === 'syslog' ? 'selected' : null }, _('System Log (syslog)'))
		]);

		var levelSelect = E('select', {
			'class': 'cbi-input-select',
			'style': 'width:auto;min-width:110px;',
			'change': function(ev) {
				self.logLevel = ev.target.value;
				self.applyFilterAndRender();
			}
		}, [
			E('option', { 'value': 'ALL' }, _('All Levels')),
			E('option', { 'value': 'ERROR' }, 'ERROR'),
			E('option', { 'value': 'WARN' }, 'WARN'),
			E('option', { 'value': 'INFO' }, 'INFO'),
			E('option', { 'value': 'DEBUG' }, 'DEBUG')
		]);

		var linesSelect = E('select', {
			'class': 'cbi-input-select',
			'style': 'width:auto;min-width:100px;',
			'change': function(ev) {
				self.logLines = ev.target.value;
				self.refreshLogs();
			}
		}, [
			E('option', { 'value': '100' }, _('100 Lines')),
			E('option', { 'value': '200', 'selected': 'selected' }, _('200 Lines')),
			E('option', { 'value': '500' }, _('500 Lines')),
			E('option', { 'value': '1000' }, _('1000 Lines'))
		]);

		var keywordInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'style': 'width:180px;',
			'placeholder': _('Filter by keyword...'),
			'input': function(ev) {
				self.logKeyword = ev.target.value;
				self.applyFilterAndRender();
			}
		});

		var newestCheckbox = E('input', {
			'type': 'checkbox',
			'checked': self.newestFirst ? 'checked' : null,
			'change': function(ev) {
				self.newestFirst = ev.target.checked;
				self.applyFilterAndRender();
			}
		});

		var autoRefreshCheckbox = E('input', {
			'type': 'checkbox',
			'checked': self.autoRefresh ? 'checked' : null,
			'change': function(ev) {
				self.autoRefresh = ev.target.checked;
				if (self.autoRefresh)
					self.refreshLogs();
			}
		});

		var refreshBtn = E('button', {
			'type': 'button',
			'class': 'btn cbi-button cbi-button-reload',
			'click': function() {
				return self.refreshLogs();
			}
		}, _('Refresh'));

		var downloadBtn = E('button', {
			'type': 'button',
			'class': 'btn cbi-button cbi-button-neutral',
			'click': function() {
				var textarea = document.getElementById('clouddrive2-log-textarea');
				var content = textarea ? textarea.value : self.rawLog;
				var blob = new Blob([content || ''], { type: 'text/plain;charset=utf-8' });
				var url = URL.createObjectURL(blob);
				var a = document.createElement('a');
				var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
				a.href = url;
				a.download = 'clouddrive2-' + self.logSource + '-' + ts + '.log';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}
		}, _('Download Log'));

		var clearBtn = E('button', {
			'type': 'button',
			'class': 'btn cbi-button cbi-button-reset',
			'click': function() {
				if (!window.confirm(_('Are you sure you want to clear CloudDrive2 application log files?')))
					return;
				return fs.exec_direct('/usr/libexec/clouddrive2-helper', ['clear_log'], 'json').then(function() {
					ui.addNotification(null, E('p', _('Application log files have been cleared.')), 'info');
					return self.refreshLogs();
				}).catch(function(err) {
					ui.addNotification(null, E('p', _('Failed to clear logs: %s').format(err.message || err)), 'error');
				});
			}
		}, _('Clear Log'));

		var viewNode = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('CloudDrive2 Logs')),
			E('div', { 'class': 'cbi-map-descr' },
				_('View real-time CloudDrive2 application logs and OpenWrt procd system logs.')),
			E('div', { 'class': 'cbi-section' }, [
				E('div', {
					'style': 'padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-bottom:1px solid rgba(128,128,128,0.2);'
				}, [
					E('div', { 'style': 'display:flex;align-items:center;flex-wrap:wrap;gap:8px;' }, [
						sourceSelect,
						levelSelect,
						linesSelect,
						keywordInput,
						E('label', { 'style': 'display:inline-flex;align-items:center;gap:4px;margin:0 4px;cursor:pointer;' }, [
							newestCheckbox,
							E('span', {}, _('Newest First'))
						]),
						E('label', { 'style': 'display:inline-flex;align-items:center;gap:4px;margin:0 4px;cursor:pointer;' }, [
							autoRefreshCheckbox,
							E('span', {}, _('Auto Refresh'))
						])
					]),
					E('div', { 'style': 'display:flex;align-items:center;flex-wrap:wrap;gap:8px;' }, [
						refreshBtn,
						downloadBtn,
						clearBtn
					])
				]),
				E('div', { 'style': 'padding:8px 16px 4px;font-size:12px;opacity:0.8;', 'id': 'clouddrive2-log-meta' }, ''),
				E('div', { 'style': 'padding:8px 16px 16px;' }, [
					E('textarea', {
						'id': 'clouddrive2-log-textarea',
						'class': 'cbi-input-textarea',
						'readonly': 'readonly',
						'wrap': 'off',
						'rows': 26,
						'style': 'width:100%;min-height:500px;font-family:Consolas,Menlo,Monaco,monospace;font-size:12px;line-height:1.5;resize:vertical;'
					}, '')
				])
			])
		]);

		requestAnimationFrame(function() {
			self.applyFilterAndRender();
		});

		return viewNode;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
