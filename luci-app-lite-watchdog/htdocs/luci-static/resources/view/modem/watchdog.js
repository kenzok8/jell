'use strict';
'require form';
'require fs';
'require view';
'require ui';
'require uci';
'require poll';
'require dom';
'require tools.widgets as widgets';

/*
	Copyright 2022-2026 Rafał Wabik - IceG - From eko.one.pl forum

 	MIT License
*/

function pop(a, message, severity) {
	ui.addNotification(a, message, severity)
}

function popTimeout(a, message, timeout, severity) {
	ui.addTimeLimitedNotification(a, message, timeout, severity)
}

function setSpinner(id) {
	var el = document.getElementById(id);
	if (!el) return;
	el.innerHTML = '';
	el.appendChild(E('span', { 'class': 'spinning', 'style': 'font-size: inherit;' }, _('Loading...')));
}

function setText(id, value) {
	var el = document.getElementById(id);
	if (!el) return;
	el.innerHTML = '';
	el.textContent = value || '-';
}

function setHTML(id, value) {
	var el = document.getElementById(id);
	if (!el) return;
	el.innerHTML = '';
	el.innerHTML = (value || '-').trim();
}

return view.extend({
	formdata: { watchdog: {} },

	load: function() {
		return L.resolveDefault(fs.exec_direct('/usr/bin/lite-watchdog-data.sh', [ 'json' ]));
		uci.load('watchdog')
	},

	render: function(data) {
		var m, s, o;


		var spinEl = E('span', { 'class': 'spinning', 'style': 'font-size: inherit;' }, _('Loading...'));
		var testtime = spinEl;
		var min      = E('span', { 'class': 'spinning', 'style': 'font-size: inherit;' }, _('Loading...'));
		var avg      = E('span', { 'class': 'spinning', 'style': 'font-size: inherit;' }, _('Loading...'));
		var max      = E('span', { 'class': 'spinning', 'style': 'font-size: inherit;' }, _('Loading...'));

		var onoff = '1', dest = '', delay = 3, period = '1', count = 10, allcount = 10, action = 'wan';
		var json = null;

		if (data != null) {
			try {
				json = JSON.parse(data);

				if (!("error" in json)) {
					testtime = json.testtime || '-';
					min      = json.min      || '--.---';
					avg      = json.avg      || '--.---';
					max      = json.max      || '--.---';

					if (min !== '--.---' && !min.includes('ms')) min = min + ' ms';
					if (avg !== '--.---' && !avg.includes('ms')) avg = avg + ' ms';
					if (max !== '--.---' && !max.includes('ms')) max = max + ' ms';

					onoff    = json.enable;
					dest     = json.dest;
					var countdest = dest.split(',');
					delay    = parseInt(json.delay) / 60;
					period   = json.period;
					count    = parseInt(json.count);
					allcount = parseInt(json.count) * countdest.length;
					action   = json.action;
				}
			} catch (err) {
				console.log('Error parsing initial data: ', err.message);
			}
		}

		poll.add(function() {
			setSpinner('testtime');
			setSpinner('min');
			setSpinner('avg');
			setSpinner('max');

			return L.resolveDefault(fs.exec_direct('/usr/bin/lite-watchdog-data.sh', [ 'json' ]))
			.then(function(res) {
				if (!res) {
					setText('testtime', '-');
					setText('min', '-');
					setText('avg', '-');
					setText('max', '-');
					return;
				}

				var pjson;
				try { pjson = JSON.parse(res); } catch(e) { return; }
				if (!pjson) return;

				var pmin    = (pjson.min    || '').toString();
				var pavg    = (pjson.avg    || '').toString();
				var pmax    = (pjson.max    || '').toString();
				var ttime   = (pjson.testtime  || '').toString();
				var countz  = (pjson.now_count || '0').toString();

				if (countz === '' || parseInt(countz) < 0) countz = '0';

				if (pmin !== '' && !pmin.includes('ms')) pmin = pmin + ' ms';
				if (pavg !== '' && !pavg.includes('ms')) pavg = pavg + ' ms';
				if (pmax !== '' && !pmax.includes('ms')) pmax = pmax + ' ms';

				if (ttime === '' || ttime === '-') {
					var waitingHTML = '<span class="spinning" style="font-size: inherit;"></span> ' + _('Waiting for ping command execution...');
					setHTML('testtime', waitingHTML);
				} else {
					var timeHTML = ttime + ' (' + _('failed') + ' ' + countz + ' ' + _('out of') + ' ' + count + ')';
					setHTML('testtime', timeHTML);
				}

				if (pmin === '' || pmin === '--.--- ms') {
					setText('min', '-');
					setText('avg', '-');
					setText('max', '-');
				} else {
					setText('min', pmin);
					setText('avg', pavg);
					setText('max', pmax);
				}
			});
		}, 60);

		var info = _('Configuration of the connection monitor known from the easyconfig package. More information on the %seko.one.pl forum%s.').format('<a href="https://eko.one.pl/?p=easyconfig" target="_blank">', '</a>');

		m = new form.JSONMap(this.formdata, _('Connection monitor settings'), info);

		s = m.section(form.TypedSection, 'watchdog', '', _(''));
		s.anonymous = true;

		s.render = L.bind(function(view, section_id) {
			return E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Information')),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'width': '33%' }, [ _('Last check') ]),
						E('td', { 'class': 'td left', 'id': 'testtime' }, [ testtime ]),
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'width': '33%' }, [ _('minimum') ]),
						E('td', { 'class': 'td left', 'id': 'min' }, [ min ]),
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'width': '33%' }, [ _('average') ]),
						E('td', { 'class': 'td left', 'id': 'avg' }, [ avg ]),
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'width': '33%' }, [ _('maximum') ]),
						E('td', { 'class': 'td left', 'id': 'max' }, [ max ]),
					]),
				])
			]);
		}, o, this);

		s = m.section(form.TypedSection, 'watchdog', _(''));
		s.anonymous = true;
		s.addremove = false;

		if (json && !("error" in json)) {
			s.tab('basic', _('Basic settings'));

			o = s.taboption('basic', form.Flag, 'enabled', _('Enabled'),
				_('Enable a connection monitor.')
			);
			o.rmempty = false;
			o.default = onoff;

			o = s.taboption('basic', form.Value, 'delay', _('System startup delay'),
				_('[1 - 59] minute(s)')
			);
			o.default = delay || "3";
			o.rmempty = false;
			o.validate = function(section_id, value) {
				if (value.match(/^[0-9]+(?:\.[0-9]+)?$/) && +value >= 1 && +value < 60)
					return true;
				return _('Expect a decimal value between one and fifty-nine');
			};
			o.datatype = 'range(1, 59)';

			o = s.taboption('basic', form.DynamicList, 'dest', _('Address or name'), _('Set test address (only one recommended).'));
			o.default = dest ? dest.split(',') : "google.com";
			o.rmempty = false;
			o.datatype = 'host';
			o.max = 3;

			o.validate = function(section_id, value) {
				if (Array.isArray(value) && value.length > 3) {
					return _('You can add up to 2 destinations.');
				}
				return true;
			};

			o = s.taboption('basic', form.Value, 'period', _('Verification period'),
				_('[1 - 59] minute(s)')
			);
			o.default = period || "1";
			o.rmempty = false;
			o.validate = function(section_id, value) {
				if (value.match(/^[0-9]+(?:\.[0-9]+)?$/) && +value >= 1 && +value < 60)
					return true;
				return _('Expect a decimal value between one and fifty-nine');
			};
			o.datatype = 'range(1, 59)';

			o = s.taboption('basic', form.Value, 'period_count', _('Number of failed checks'),
				_('[1 - 59]')
			);
			o.default = count || "10";
			o.rmempty = false;
			o.validate = function(section_id, value) {
				if (value.match(/^[0-9]+(?:\.[0-9]+)?$/) && +value >= 1 && +value < 60)
					return true;
				return _('Expect a decimal value between one and fifty-nine');
			};
			o.datatype = 'range(1, 59)';

			o = s.taboption('basic', form.ListValue, 'action', _('Action'));
			o.value('wan', _('Connection restart'));
			o.value('reboot', _('Reboot'));
			o.default = action || "wan";
			o.rmempty = false;
		}

		return m.render();
	},

	handleWATCHDOGSETup: function(ev) {
		var map  = document.querySelector('#maincontent .cbi-map'),
		    data = this.formdata;

		return dom.callClassMethod(map, 'save').then(function() {
			var ax  = (data.watchdog.enabled     || '').toString();
			var ax2 = parseInt(data.watchdog.delay || 0) * 60;
			var ax3 = (data.watchdog.dest          || '').toString();
			var ax4 = (data.watchdog.period        || '').toString();
			var ax5 = (data.watchdog.period_count  || '').toString();
			var ax6 = (data.watchdog.action        || '').toString();

			return uci.load('watchdog').then(function() {
				uci.set('watchdog', '@watchdog[0]', 'enabled',      ax);
				uci.set('watchdog', '@watchdog[0]', 'delay',        ax2.toString());
				uci.set('watchdog', '@watchdog[0]', 'dest',         ax3);
				uci.set('watchdog', '@watchdog[0]', 'period',       ax4);
				uci.set('watchdog', '@watchdog[0]', 'period_count', ax5);
				uci.set('watchdog', '@watchdog[0]', 'action',       ax6);
				uci.save();
				uci.apply();

			}).then(function() {
				return L.resolveDefault(fs.read('/etc/crontabs/root'), '');
			}).then(function(crontab) {
				var lines = (crontab || '').replace(/\r\n/g, '\n').split('\n');
				var filtered = lines.filter(function(l) {
					return l.trim() !== '' && !l.includes('watchdog');
				});

				if (ax === '1') {
					filtered.push('*/' + ax4 + ' * * * * /usr/bin/lite_watchdog.sh ' + ax2 + ' 3 "' + ax3 + '" ' + ax5 + ' ' + ax6);
				}

				return fs.write('/etc/crontabs/root', filtered.join('\n') + '\n');
			}).then(function() {
				return fs.exec('/etc/init.d/cron', ['restart']);
			}).then(function() {
				if (ax === '1') {
					popTimeout(null, E('p', _('Changes have been saved. Connection Monitor has started.')), 5000, 'info');
				} else {
					popTimeout(null, E('p', _('Changes have been saved. Connection Monitor is not running.')), 5000, 'info');
				}
			});
		});
	},

	addFooter: function() {
		return E('div', { 'class': 'cbi-page-actions' }, [
			E('button', {
				'class': 'cbi-button cbi-button-save',
				'click': L.ui.createHandlerFn(this, 'handleWATCHDOGSETup')
			}, [ _('Save') ])
		]);
	}

});
