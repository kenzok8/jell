'use strict';
'require view';
'require fs';
'require ui';
'require uci';

/*

	Copyright 2023-2026 Rafał Wabik - IceG - From eko.one.pl forum
	
	MIT License
	
	Tab is a modification of the package https://github.com/gSpotx2f/luci-app-syslog 
	
*/

return L.view.extend({
	tailDefault: 20,

	parseLogData: function(logdata) {
		/* Log file translation */
		logdata = logdata.replaceAll('Failed', _('Failed'));
		logdata = logdata.replaceAll('out of', _('out of'));
		logdata = logdata.replaceAll('Status', _('Status'));
		logdata = logdata.replaceAll('OFFLINE', _('OFFLINE'));
		logdata = logdata.replaceAll('ONLINE', _('ONLINE'));
		logdata = logdata.replaceAll('Action', _('Action'));
		logdata = logdata.replaceAll('Commands before main action', _('Commands before main action'));
		logdata = logdata.replaceAll('Commands after main action', _('Commands after main action'));
		logdata = logdata.replaceAll('Restarting interface', _('Restarting interface'));
		logdata = logdata.replaceAll('At command was sent to modem', _('At command was sent to modem'));
		logdata = logdata.replaceAll('from script:', _('from script:'));
		logdata = logdata.replaceAll('USER-SCRIPT:', _('USER-SCRIPT:'));
		logdata = logdata.replaceAll('Soft modem restart', _('Soft modem restart'));
		logdata = logdata.replaceAll('Hard modem restart', _('Hard modem restart'));
		logdata = logdata.replaceAll('Space for user actions', _('Space for user actions'));
		logdata = logdata.replaceAll('Reboot', _('Reboot'));

		logdata = logdata.replaceAll('January', _('January'));
		logdata = logdata.replaceAll('February', _('February'));
		logdata = logdata.replaceAll('March', _('March'));
		logdata = logdata.replaceAll('April', _('April'));
		logdata = logdata.replaceAll('May', _('May'));
		logdata = logdata.replaceAll('June', _('June'));
		logdata = logdata.replaceAll('July', _('July'));
		logdata = logdata.replaceAll('August', _('August'));
		logdata = logdata.replaceAll('September', _('September'));
		logdata = logdata.replaceAll('October', _('October'));
		logdata = logdata.replaceAll('November', _('November'));
		logdata = logdata.replaceAll('December', _('December'));

		logdata = logdata.replaceAll('Monday', _('Monday'));
		logdata = logdata.replaceAll('Tuesday', _('Tuesday'));
		logdata = logdata.replaceAll('Wednesday', _('Wednesday'));
		logdata = logdata.replaceAll('Thursday', _('Thursday'));
		logdata = logdata.replaceAll('Friday', _('Friday'));
		logdata = logdata.replaceAll('Saturday', _('Saturday'));
		logdata = logdata.replaceAll('Sunday', _('Sunday'));
		
		logdata = logdata.replaceAll('Watchdog initialized', _('Watchdog initialized'));
		logdata = logdata.replaceAll('uptime', _('uptime'));
		logdata = logdata.replaceAll('hosts', _('hosts'));
		/* Log file translation */
		return logdata.trim().split(/\n/).map(function(line){ return line.replace(/^<\d+>/, ''); });
	},

	setLogTail: function(cArr) {
		let tailNumVal = document.getElementById('tailValue').value;
		if (tailNumVal && tailNumVal > 0 && cArr) return cArr.slice(-tailNumVal);
		return cArr;
	},

	setLogFilter: function(cArr) {
		let fPattern = document.getElementById('logFilter').value;
		if (!fPattern) return cArr;
		try {
			const re = new RegExp(fPattern, 'iu');
			const fArr = cArr.filter(function(s){ return re.test(s); });
			return (fArr.length ? fArr : [ _('No matches...') ]);
		} catch(err) {
			if (err.name === 'SyntaxError') {
				ui.addNotification(null, E('p', {}, _('Wrong regular expression') + ': ' + err.message));
				return cArr;
			}
			throw err;
		}
	},

	handleClear: function(ev) {
		if (confirm(_('Clear connection monitor log?'))) {
			var ov = document.getElementById('syslog'); if (ov) ov.value = '';
			var ln = document.getElementById('lineNumbers'); if (ln) ln.value = '';
			
            fs.write('/etc/modem/log.txt', '');
            fs.write('/tmp/lite_watchdog_cnt', '');
            fs.write('/tmp/lite_watchdog_gcnt', '');
            fs.write('/tmp/lite_watchdog_index', '0');
            fs.remove('/tmp/lite_watchdog_stage');
            
			return true;
		}
	},

	handleChangeDetail: function(ev) {
		var x = document.getElementById('log_detail').value;
		return uci.load('watchdog').then(function() {
			uci.set('watchdog', '@watchdog[0]', 'log', x.toString());
			uci.save(); uci.apply();
		});
	},

	handleDownload: function(ev) {
		return L.resolveDefault(fs.read_direct('/etc/modem/log.txt'), null).then(function (res) {
			if (res) {
				var link = E('a', {
					'download': 'log.txt',
					'href': URL.createObjectURL(new Blob([ res ], { type: 'text/plain' })),
				});
				link.click();
				URL.revokeObjectURL(link.href);
			}
		}).catch(function(err){
			ui.addNotification(null, E('p', {}, _('Download error') + ': ' + err.message));
		});
	},

	handleRestoreLOG: function(ev) {
		return ui.uploadFile('/etc/modem/log.txt', ev.target)
			.then(L.bind(function(btn, res) {}, this, ev.target))
			.catch(function(e) { ui.addNotification(null, E('p', e.message)) })
			.finally(L.bind(function(btn, input) {}, this, ev.target));
	},

	load: function() {
		return fs.read_direct('/etc/modem/log.txt').catch(function(err){
			ui.addNotification(null, E('p', {}, _('Unable to load log data:') + ' ' + err.message));
			return '';
		});
	},

	render: function(logdata) {
		/* Log file translation */
		logdata = logdata.replaceAll('Failed', _('Failed'));
		logdata = logdata.replaceAll('out of', _('out of'));
		logdata = logdata.replaceAll('Status', _('Status'));
		logdata = logdata.replaceAll('OFFLINE', _('OFFLINE'));
		logdata = logdata.replaceAll('ONLINE', _('ONLINE'));
		logdata = logdata.replaceAll('Action', _('Action'));
		logdata = logdata.replaceAll('Commands before main action', _('Commands before main action'));
		logdata = logdata.replaceAll('Commands after main action', _('Commands after main action'));
		logdata = logdata.replaceAll('Restarting interface', _('Restarting interface'));
		logdata = logdata.replaceAll('At command was sent to modem', _('At command was sent to modem'));
		logdata = logdata.replaceAll('from script:', _('from script:'));
		logdata = logdata.replaceAll('USER-SCRIPT:', _('USER-SCRIPT:'));
		logdata = logdata.replaceAll('Soft modem restart', _('Soft modem restart'));
		logdata = logdata.replaceAll('Hard modem restart', _('Hard modem restart'));
		logdata = logdata.replaceAll('Space for user actions', _('Space for user actions'));
		logdata = logdata.replaceAll('Reboot', _('Reboot'));

		logdata = logdata.replaceAll('January', _('January'));
		logdata = logdata.replaceAll('February', _('February'));
		logdata = logdata.replaceAll('March', _('March'));
		logdata = logdata.replaceAll('April', _('April'));
		logdata = logdata.replaceAll('May', _('May'));
		logdata = logdata.replaceAll('June', _('June'));
		logdata = logdata.replaceAll('July', _('July'));
		logdata = logdata.replaceAll('August', _('August'));
		logdata = logdata.replaceAll('September', _('September'));
		logdata = logdata.replaceAll('October', _('October'));
		logdata = logdata.replaceAll('November', _('November'));
		logdata = logdata.replaceAll('December', _('December'));

		logdata = logdata.replaceAll('Monday', _('Monday'));
		logdata = logdata.replaceAll('Tuesday', _('Tuesday'));
		logdata = logdata.replaceAll('Wednesday', _('Wednesday'));
		logdata = logdata.replaceAll('Thursday', _('Thursday'));
		logdata = logdata.replaceAll('Friday', _('Friday'));
		logdata = logdata.replaceAll('Saturday', _('Saturday'));
		logdata = logdata.replaceAll('Sunday', _('Sunday'));
		
		logdata = logdata.replaceAll('Watchdog initialized', _('Watchdog initialized'));
		logdata = logdata.replaceAll('uptime', _('uptime'));
		logdata = logdata.replaceAll('hosts', _('hosts'));
		/* Log file translation */

		let loglines = this.parseLogData(logdata);

		uci.load('watchdog').then(function() {
			var logsettings = (uci.get('watchdog', '@watchdog[0]', 'log'));
			switch (logsettings) {
				case 'all': document.getElementById('log_detail').value = 'all'; break;
				case 'offline': document.getElementById('log_detail').value = 'offline'; break;
				default: ;
			}
		});

		const fontSize = '11px';
		const lineH   = '1.4em';
		const padTop = '6px', padBottom = '6px';
		const logHeight = '400px';

        let lineNumbers = E('textarea', {
	        'id': 'lineNumbers',
	        'readonly': 'readonly',
	        'class': 'cbi-input-textarea',
	        'style': [
		        'resize:none',
		        'height:' + logHeight,'max-height:800px','min-height:' + logHeight,
		        'font-size:' + fontSize,'font-family:monospace',
		        'text-align:right','color:#888','background:var(--border-color-soft)',
		        'border:1px solid var(--border-color-medium)','border-right:0',
		        'overflow:hidden',
		        'padding:' + padTop + ' 6px ' + padBottom + ' 0',
		        'line-height:' + lineH,'box-sizing:border-box',
		        'min-width:6ch'
	        ].join(';'),
	        'wrap': 'off','spellcheck': 'false',
        });

		let logTextWrapper = E('div', {
			'style': 'position:relative; flex:1 1 auto; min-width:0;'
		});

		let logTextarea = E('textarea', {
			'id': 'syslog',
			'class': 'cbi-input-textarea',
			'style': [
				'display:block','width:100%','resize:vertical',
				'height:' + logHeight,'max-height:800px','min-height:' + logHeight,
				'padding:' + padTop + ' 36px ' + padBottom + ' 8px',
				'font-size:' + fontSize,'font-family:monospace','white-space:pre',
				'line-height:' + lineH,'box-sizing:border-box',
				'overflow:auto'
			].join(';'),
			'readonly': 'readonly',
			'wrap': 'off',
			'rows': this.tailDefault,
			'spellcheck': 'false',
		}, [ loglines.slice(-this.tailDefault).join('\n') ]);

		let overlayNav = E('div', {
			'style': 'position:absolute; right:6px; top:6px; display:flex; gap:6px; z-index:2;'
		}, [
			E('button', {
				'class': 'btn','title': _('Go to top'),
				'click': function(ev){
					logTextarea.scrollTop = 0;
					ev.target.blur();
				},
				'style': 'line-height:1; padding:6px 10px; font-size:16px;'
			}, '\u25b2'),
			E('button', {
				'class': 'btn','title': _('Go to bottom'),
				'click': function(ev){
					logTextarea.scrollTop = logTextarea.scrollHeight - logTextarea.clientHeight;
					ev.target.blur();
				},
				'style': 'line-height:1; padding:6px 10px; font-size:16px;'
			}, '\u25bc'),
		]);

		logTextWrapper.appendChild(overlayNav);
		logTextWrapper.appendChild(logTextarea);

		let logContainer = E('div', {
			'style': 'display:flex; flex-direction:row; gap:0;'
		}, [ lineNumbers, logTextWrapper ]);

		const setLineNumberWidth = function(lines) {
			const digits = String(Math.max(1, lines)).length;
			const ch = Math.max(6, Math.min(10, digits + 2.5));
			lineNumbers.style.width = ch + 'ch';
		};

		const updateLineNumbers = function(text) {
			const lines = text.length ? text.split('\n').length : 1;
			lineNumbers.value = Array.from({ length: lines }, function(_, i){ return i + 1; }).join('\n');

			const rowsCount = (lines < this.tailDefault) ? this.tailDefault : lines;
			lineNumbers.rows = rowsCount;
			logTextarea.rows = rowsCount;

			setLineNumberWidth(lines);

			lineNumbers.style.height = logTextarea.offsetHeight + 'px';
			lineNumbers.scrollTop = logTextarea.scrollTop;
		}.bind(this);

		updateLineNumbers(logTextarea.value);
		lineNumbers.addEventListener('scroll', function(){ logTextarea.scrollTop = lineNumbers.scrollTop; });
		logTextarea.addEventListener('scroll', function(){ lineNumbers.scrollTop = logTextarea.scrollTop; });

		let tailValue = E('input', {
			'id': 'tailValue','name': 'tailValue','type': 'text','form': 'logForm',
			'class': 'cbi-input-text',
			'style': 'width:4em !important; min-width:4em !important; margin-bottom:0.3em !important',
			'maxlength': 5,
		});
		tailValue.value = this.tailDefault;
		ui.addValidator(tailValue, 'uinteger', true);

		let logFilter = E('input', {
			'id': 'logFilter','name': 'logFilter','type': 'text','form': 'logForm',
			'class': 'cbi-input-text',
			'style': 'min-width:16em !important; margin-right:1em !important; margin-bottom:0.3em !important',
			'placeholder': _('Entries filter'),
			'data-tooltip': _('Filter entries using regexp, press [Delete] to delete all text'),
			'keydown': function(ev) {
				if (ev.keyCode === 46) {
					var del = document.getElementById('logFilter');
					if (del) { var ov = document.getElementById('logFilter'); ov.value = ''; document.getElementById('logFilter').focus(); }
				}
			},
		});

		let logFormSubmitBtn = E('input', {
			'type': 'submit','form': 'logForm','class': 'cbi-button cbi-button-add',
			'style': 'margin-right:1em !important; margin-bottom:0.3em !important;',
			'value': _('Refresh'),'click': function(ev){ ev.target.blur(); },
		});

		return E([
			E('h2', { 'id': 'logTitle', 'class': 'fade-in' }, _('Connection monitor activity log')),
			E('div', { 'class': 'cbi-map-descr' }, _('Connection monitor activity log known from the easyconfig package. More information on the %seko.one.pl forum%s.').format('<a href="https://eko.one.pl/?p=easyconfig" target="_blank">', '</a>')),
			E('hr'),
			E('div', { 'class': 'cbi-section-descr fade-in' }),

			E('div', { 'class': 'cbi-section fade-in' },
				E('div', { 'class': 'cbi-section-node' },
					E('div', { 'id': 'contentSyslog', 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title', 'for': 'tailValue', 'style': 'margin-bottom:0.3em !important' },
							_('Show only the last entries')),
						E('div', { 'class': 'cbi-value-field' }, [
							tailValue,
							E('input', {
								'type': 'button','form': 'logForm','class': 'btn cbi-button','value': 'x',
								'click': function(ev){ tailValue.value = null; logFormSubmitBtn.click(); ev.target.blur(); },
								'style': 'margin-right:1em !important; margin-bottom:0.3em !important; max-width:4em !important',
							}),
							E('form', {
								'id': 'logForm','name': 'logForm',
								'style': 'display:inline-block; margin-bottom:0.3em !important',
								'submit': ui.createHandlerFn(this, function(ev) {
									ev.preventDefault();
									let formElems = Array.from(document.forms.logForm.elements);
									formElems.forEach(function(e){ e.disabled = true; });
									return this.load().then(function(logdata){
										let loglines = this.setLogFilter(this.setLogTail(this.parseLogData(logdata)));
										const text = loglines.join('\n');
										logTextarea.value = text;
										updateLineNumbers(text);
										logTextarea.scrollTop = logTextarea.scrollHeight - logTextarea.clientHeight;
									}.bind(this)).finally(function(){
										formElems.forEach(function(e){ e.disabled = false; });
									});
								}),
							}, E('span', {}, '&#160;')),
						]),
					])
				)
			),

			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'log_detail' }, _('Type of messages')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('select', { 'class': 'cbi-input-select', 'id': 'log_detail', 'change': ui.createHandlerFn(this, 'handleChangeDetail') }, [
						E('option', { 'value': 'all' }, _('All actions')),
						E('option', { 'value': 'offline' }, _('Only connection problems'))
					]),
				])
			]),

			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'logFilter' }, _('Message filter')),
				E('div', { 'class': 'cbi-value-field' }, logFilter),
			]),

			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'logFormSubmitBtn' }, _('Refresh log')),
				E('div', { 'class': 'cbi-value-field' }, [ logFormSubmitBtn ])
			]),

			E('div', { 'class': 'cbi-section fade-in' },
				E('div', { 'class': 'cbi-section-node' }, [ logContainer ])
			),

			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'cbi-button cbi-button-remove', 'id': 'clear', 'click': ui.createHandlerFn(this, 'handleClear') }, [ _('Clear log') ]),
				'\xa0\xa0\xa0',
				E('button', { 'class': 'cbi-button cbi-button-action important', 'id': 'upload-log', 'click': ui.createHandlerFn(this, 'handleRestoreLOG') }, [ _('Upload log file') ]),
				'\xa0\xa0\xa0',
				E('button', { 'class': 'cbi-button cbi-button-apply important', 'id': 'download-log', 'click': ui.createHandlerFn(this, 'handleDownload') }, [ _('Download log') ]),
			]),
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,
});
