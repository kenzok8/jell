'use strict';
'require baseclass';
'require form';
'require fs';
'require uci';
'require ui';
'require view';
'require tools.widgets as widgets'

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

return view.extend({
	usrScriptPath       : '/etc/lite_watchdog.user',

	load: function() {
		return Promise.all([
    			L.resolveDefault(fs.list('/dev'), null),
    			L.resolveDefault(uci.load('watchdog'))
  		]);
	},

fileEditDialog: baseclass.extend({
	__init__: function(file, title, description, callback, fileExists = false) {
		this.file        = file;
		this.title       = title;
		this.description = description;
		this.callback    = callback;
		this.fileExists  = fileExists;
	},

	load: function() {
		return L.resolveDefault(fs.read(this.file), '');
	},

	handleSave: function(ev) {
		let textarea = document.getElementById('widget.modal_content');
		let value = textarea.value.trim().replace(/\r\n/g, '\n') + '\n';
		return fs.write(this.file, value).then(rc => {
			textarea.value = value;
			popTimeout(null, E('p', _('Contents have been saved.')), 5000, 'info');
			if (this.callback) {
				return this.callback(rc);
			}
		}).catch(e => {
			ui.addNotification(null, E('p', _('Unable to save the contents') + ': %s'.format(e.message)));
		}).finally(() => {
			ui.hideModal();
		});
	},

	error: function(e) {
		if (!this.fileExists && e instanceof Error && e.name === 'NotFoundError') {
			return this.render();
		} else {
			ui.showModal(this.title, [
				E('p', {}, _('Unable to read the contents') + ': %s'.format(e.message)),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.hideModal,
					}, _('Dismiss'))
				])
			], 'cbi-modal');
		}
	},

	show: function() {
		ui.showModal(null, E('p', { 'class': 'spinning' }, _('Loading')));
		this.load().then(content => {
			ui.hideModal();
			return this.render(content);
		}).catch(e => {
			ui.hideModal();
			return this.error(e);
		});
	},

	render: function(content) {
		ui.showModal(this.title, [
			E('p', this.description),
			E('textarea', {
				'id': 'widget.modal_content',
				'class': 'cbi-input-textarea',
				'style': 'width:100% !important; height: 60vh; min-height: 500px;',
				'wrap': 'off',
				'spellcheck': 'false'
			}, content.trim()),
			E('div', { 'class': 'right' }, [
			    E('button', {
                    'class': 'btn cbi-button-remove',
                    'click': () => {
                        document.getElementById('widget.modal_content').value = '';
                        fs.write('/etc/lite_watchdog.user', '').then(() => {
                        }).catch(e => {
                            ui.addNotification(null, E('p', _('Unable to clear the file') + ': %s'.format(e.message)), 'error');
                        });
                    }
                }, _('Clear')),
                ' ',
				E('button', {
					'id': 'btn_save',
					'class': 'btn cbi-button-positive important',
					'click': ui.createHandlerFn(this, this.handleSave)
				}, _('Save')),
				' ',
				E('button', {
					'class': 'btn',
					'click': ui.hideModal
				}, _('Dismiss'))
			])
		], 'cbi-modal');
	}
}),

	render: function(res) {

		let usrScriptEditDialog = new this.fileEditDialog(
			this.usrScriptPath,
			_('User script'),
			_("User-defined commands."),
		);

		let sections = uci.sections('watchdog');
		let mainAction = sections[0].action;

		let m, s, o;
		m = new form.Map('watchdog', _('Configuration lite-watchdog'), _('Configuration panel for lite-watchdog and gui application.'));

		s = m.section(form.TypedSection, 'watchdog', '', _(''));
		s.anonymous = true;

		o = s.option(widgets.NetworkSelect, 'iface', _('Interface'),
		_('Network interface for Internet access.')
		);
		o.exclude = s.section;
		o.nocreate = true;
		o.rmempty = false;
		o.default = 'wan';

		o = s.option(form.Flag, 'ledstatus', _('LED settings'),
		_('The LED shows the internet connection status.')
		);
		o.rmempty = false;

		let led = s.option(form.ListValue, 'led', _('<abbr title="Light Emitting Diode">LED</abbr> Name'), _("Select the status LED."));

		led.load = function(section_id) {
			return L.resolveDefault(fs.list('/sys/class/leds'), []).then(L.bind(function(leds) {
				if (leds.length > 0) {
					leds.sort((a, b) => a.name > b.name);
					leds.forEach(e => this.value(e.name));
				}
				return this.super('load', [section_id]);
			}, this));
		};
		led.depends("ledstatus", "1");

		s = m.section(form.TypedSection, 'watchdog', _('User Script Wizard'), _('Before executing the action, system calls a script in which user can place his own commands.'));
		s.anonymous = true;

		s.tab('uscriptTab', _('Settings'));

		function handleID(ev, section_id, value) {
			let fa     = this.section.getUIElement(section_id, 'first_action');
			let ma     = this.section.getUIElement(section_id, 'modem_action');
			let cmport = this.section.getUIElement(section_id, 'set_port');
			let rcmd   = this.section.getUIElement(section_id, 'restartcmd');
			let rgpio  = this.section.getUIElement(section_id, 'gpio');

			let contentLines = [];

			if (mainAction === "wan") {
				// restart interface
				if (fa.getValue() === "mr") {
					// modem restart
					if (ma.getValue() === "sr") {
						// soft restart
						contentLines.push('#!/bin/sh');
						contentLines.push('');
						contentLines.push('#');
						contentLines.push('# (c) 2025-2026 Rafał Wabik - IceG - From eko.one.pl forum');
						contentLines.push('# Script generated by user');
						contentLines.push('#');
						contentLines.push('# ENV from main');
						contentLines.push('# ACTION=wan|reboot');
						contentLines.push('# PHASE=pre|post');
						contentLines.push('#');
						contentLines.push('');
						contentLines.push('safe_log() {');
						contentLines.push('    [ -n "$LOG_FILE" ] || return 0');
						contentLines.push('    date +"%A %d-%B %Y %T, USER-SCRIPT: $1" >> "$LOG_FILE"');
						contentLines.push('}');
						contentLines.push('');
						contentLines.push('reset_counters_and_stage() {');
						contentLines.push('    [ -n "$CNT_FILE" ]   && : > "$CNT_FILE"');
						contentLines.push('    [ -n "$GCNT_FILE" ]  && : > "$GCNT_FILE"');
						contentLines.push('    if [ -n "$INDEX_FILE" ]; then');
						contentLines.push('        echo 0 > "$INDEX_FILE"');
						contentLines.push('    fi');
						contentLines.push('    [ -n "$STAGE_FILE" ] && rm -f "$STAGE_FILE"');
						contentLines.push('}');
						contentLines.push('');
						contentLines.push('if [ "$PHASE" = "pre" ]; then');
						contentLines.push('');
						contentLines.push('    safe_log "Commands before main action"');
						contentLines.push('');
						contentLines.push('    # ---Space for user actions---');
						contentLines.push('');
						contentLines.push('    # ---Space for user actions---');
						contentLines.push('');
						contentLines.push('elif [ "$PHASE" = "post" ]; then');
						contentLines.push('');
						contentLines.push('    safe_log "Commands after main action"');
						contentLines.push('');
						contentLines.push('    /bin/date +"%A %d-%B %Y %T, Status: OFFLINE ➜ Action from script: Soft modem restart" >> "$LOG_FILE" && sleep 5');
						contentLines.push('    (/bin/sms_tool -d ' + cmport.getValue() + ' at "' + rcmd.getValue() + '") && sleep 30');
						contentLines.push('');
						contentLines.push('    reset_counters_and_stage');
						contentLines.push('fi');
						contentLines.push('');
						contentLines.push('exit 0');
					} else {
						// hard restart
						contentLines.push('#!/bin/sh');
						contentLines.push('');
						contentLines.push('#');
						contentLines.push('# (c) 2025-2026 Rafał Wabik - IceG - From eko.one.pl forum');
						contentLines.push('# Script generated by user');
						contentLines.push('#');
						contentLines.push('# ENV from main');
						contentLines.push('# ACTION=wan|reboot');
						contentLines.push('# PHASE=pre|post');
						contentLines.push('#');
						contentLines.push('');
						contentLines.push('safe_log() {');
						contentLines.push('    [ -n "$LOG_FILE" ] || return 0');
						contentLines.push('    date +"%A %d-%B %Y %T, USER-SCRIPT: $1" >> "$LOG_FILE"');
						contentLines.push('}');
						contentLines.push('');
						contentLines.push('reset_counters_and_stage() {');
						contentLines.push('    [ -n "$CNT_FILE" ]   && : > "$CNT_FILE"');
						contentLines.push('    [ -n "$GCNT_FILE" ]  && : > "$GCNT_FILE"');
						contentLines.push('    if [ -n "$INDEX_FILE" ]; then');
						contentLines.push('        echo 0 > "$INDEX_FILE"');
						contentLines.push('    fi');
						contentLines.push('    [ -n "$STAGE_FILE" ] && rm -f "$STAGE_FILE"');
						contentLines.push('}');
						contentLines.push('');
						contentLines.push('if [ "$PHASE" = "pre" ]; then');
						contentLines.push('');
						contentLines.push('    safe_log "Commands before main action"');
						contentLines.push('');
						contentLines.push('    # ---Space for user actions---');
						contentLines.push('');
						contentLines.push('    # ---Space for user actions---');
						contentLines.push('');
						contentLines.push('elif [ "$PHASE" = "post" ]; then');
						contentLines.push('');
						contentLines.push('    safe_log "Commands after main action"');
						contentLines.push('');
						contentLines.push('    /bin/date +"%A %d-%B %Y %T, Status: OFFLINE ➜ Action from script: Hard modem restart" >> "$LOG_FILE" && sleep 5');
						contentLines.push('    /bin/echo "0" > /sys/class/gpio/' + rgpio.getValue() + '/value');
						contentLines.push('    sleep 20');
						contentLines.push('    /bin/echo "1" > /sys/class/gpio/' + rgpio.getValue() + '/value');
						contentLines.push('');
						contentLines.push('    reset_counters_and_stage');
						contentLines.push('fi');
						contentLines.push('');
						contentLines.push('exit 0');
					}
				} else {
					// restart router
					contentLines.push('#!/bin/sh');
					contentLines.push('');
					contentLines.push('#');
					contentLines.push('# (c) 2025-2026 Rafał Wabik - IceG - From eko.one.pl forum');
					contentLines.push('# Script generated by user');
					contentLines.push('#');
					contentLines.push('# ENV from main');
					contentLines.push('# ACTION=wan|reboot');
					contentLines.push('# PHASE=pre|post');
					contentLines.push('#');
					contentLines.push('');
					contentLines.push('safe_log() {');
					contentLines.push('    [ -n "$LOG_FILE" ] || return 0');
					contentLines.push('    date +"%A %d-%B %Y %T, USER-SCRIPT: $1" >> "$LOG_FILE"');
					contentLines.push('}');
					contentLines.push('');
					contentLines.push('reset_counters_and_stage() {');
					contentLines.push('    [ -n "$CNT_FILE" ]   && : > "$CNT_FILE"');
					contentLines.push('    [ -n "$GCNT_FILE" ]  && : > "$GCNT_FILE"');
					contentLines.push('    if [ -n "$INDEX_FILE" ]; then');
					contentLines.push('        echo 0 > "$INDEX_FILE"');
					contentLines.push('    fi');
					contentLines.push('    [ -n "$STAGE_FILE" ] && rm -f "$STAGE_FILE"');
					contentLines.push('}');
					contentLines.push('');
					contentLines.push('if [ "$PHASE" = "pre" ]; then');
					contentLines.push('');
					contentLines.push('    safe_log "Commands before main action"');
					contentLines.push('');
					contentLines.push('    # ---Space for user actions---');
					contentLines.push('');
					contentLines.push('    # ---Space for user actions---');
					contentLines.push('');
					contentLines.push('elif [ "$PHASE" = "post" ]; then');
					contentLines.push('');
					contentLines.push('    safe_log "Commands after main action"');
					contentLines.push('');
					contentLines.push('    reset_counters_and_stage');
					contentLines.push('');
					contentLines.push('    /bin/date +"%A %d-%B %Y %T, Status: OFFLINE ➜ Action from script: Reboot" >> "$LOG_FILE" && sleep 5');
					contentLines.push('    reboot');
					contentLines.push('');
					contentLines.push('fi');
					contentLines.push('');
					contentLines.push('exit 0');
				}
			} else {
				// restart
				contentLines.push('#!/bin/sh');
				contentLines.push('');
				contentLines.push('#');
				contentLines.push('# (c) 2025-2026 Rafał Wabik - IceG - From eko.one.pl forum');
				contentLines.push('# Script generated by user');
				contentLines.push('#');
				contentLines.push('# ENV from main');
				contentLines.push('# ACTION=wan|reboot');
				contentLines.push('# PHASE=pre|post');
				contentLines.push('#');
				contentLines.push('');
				contentLines.push('safe_log() {');
				contentLines.push('    [ -n "$LOG_FILE" ] || return 0');
				contentLines.push('    date +"%A %d-%B %Y %T, USER-SCRIPT: $1" >> "$LOG_FILE"');
				contentLines.push('}');
				contentLines.push('');
				contentLines.push('reset_counters_and_stage() {');
				contentLines.push('    [ -n "$CNT_FILE" ]   && : > "$CNT_FILE"');
				contentLines.push('    [ -n "$GCNT_FILE" ]  && : > "$GCNT_FILE"');
				contentLines.push('    if [ -n "$INDEX_FILE" ]; then');
				contentLines.push('        echo 0 > "$INDEX_FILE"');
				contentLines.push('    fi');
				contentLines.push('    [ -n "$STAGE_FILE" ] && rm -f "$STAGE_FILE"');
				contentLines.push('}');
				contentLines.push('');
				contentLines.push('if [ "$PHASE" = "pre" ]; then');
				contentLines.push('');
				contentLines.push('    safe_log "Commands before main action"');
				contentLines.push('');
				contentLines.push('    # ---Space for user actions---');
				contentLines.push('');
				contentLines.push('    # ---Space for user actions---');
				contentLines.push('');
				contentLines.push('    reset_counters_and_stage');
				contentLines.push('');
				contentLines.push('fi');
				contentLines.push('');
				contentLines.push('exit 0');
			}

		let contentToSave = contentLines.join('\n') + '\n';

        return fs.write('/etc/lite_watchdog.user', contentToSave).then(function(rc) {
            popTimeout(null, E('p', _('Contents have been saved.')), 5000, 'info');
        }).catch(function(e) {
            ui.addNotification(null, E('p', _('Unable to save contents: %s').format(e.message)));
        });
        }

		o = s.taboption('uscriptTab', form.DummyValue, '_dummy');
			o.rawhtml = true;
			o.default = '<div class="cbi-section-descr">' +
				_('Hint: You do not need to save anything in the settings. Select the actions and click the Generate button.') +
				'</div>';

				if (mainAction === "wan") {

							o = s.taboption('uscriptTab', form.RichListValue, "first_action", _('Actions in script'),
								_("The available options depend on the previously defined main action (interface or router restart)."));
							o.value('nn', _("None"));
							o.value('mr', _("modem restart"), _('Restart modem if restarting the interfaces did not restore internet access.'));
							o.value('rr', _("reboot"), _('Router reboot if restarting the interfaces did not restore internet access.'));
							o.optional = false;

							o = s.taboption('uscriptTab', form.RichListValue, "modem_action", _("Modem actions"));
							o.value('sr', _("soft restart"), _('Restart modem using at commands')+' ('+_('effect depends on modem')+'). '+_('Some at commands can also restart the router.'));
							o.value('hr', _("hard restart"), _('Restart modem via GPIO.'));
							o.optional = false;
							o.depends("first_action", "mr");

							o = s.taboption('uscriptTab', form.Value, 'set_port', _('Port for communication with the modem'),
								_("Select one of the available ttyUSBX ports."));
							    res[0].sort((a, b) => a.name > b.name);
							    res[0].forEach(dev => {
								    if (dev.name.match(/^ttyUSB/) || dev.name.match(/^ttyACM/) || dev.name.match(/^mhi_/) || dev.name.match(/^wwan/)) {
									    o.value('/dev/' + dev.name);
								    }
							    });
							o.placeholder = _('Please select a port');
							o.rmempty = false;
							o.depends("modem_action", "sr");

							o = s.taboption('uscriptTab', form.Value, 'restartcmd', _('AT command'),
							_('AT command to restart the modem.')
							);
							o.default = 'at+cfun=1,1';
							o.rmempty = false;
							o.depends("modem_action", "sr");

							let gpio = s.taboption('uscriptTab', form.ListValue, 'gpio', _('Restart modem using GPIO'), _("Select the GPIO related to 4G/5G modem."));

							gpio.load = function(section_id) {
								return L.resolveDefault(fs.read('/sys/kernel/debug/gpio'), '').then(L.bind(function(output) {
									if (output) {
										output.split('\n').forEach(line => {
											if (/4g|5g|lte|modem/i.test(line)) {
												let cleanLine = line.replace(/\|/g, '').trim();
												let value = cleanLine.match(/\(\s*(.*?)\s*\)/)?.[1];

												if (value)
													gpio.value(value, cleanLine);
											}
										});
									}
									return this.super('load', [section_id]);
								}, this));
							};
							gpio.depends("modem_action", "hr");

							o = s.taboption('uscriptTab', form.Button, '_Generate');
							o.title      = _('Generate a script');
							o.inputtitle = _('Generate user script');
							o.inputstyle  = 'cbi-button cbi-button-action important';
							o.description = _('Generate and save the prepared script.');
							o.onclick = function(ev) {
								let section_id = this.section.cfgsections()[0];
								handleID.call(this, ev, section_id, null);
							};
							o.depends("first_action", "mr");
							o.depends("first_action", "rr");

						} else {

							o = s.taboption('uscriptTab', form.RichListValue, "first_action", _('Actions in script'),
								_("The availability of actions depends on the selection of the main action (interface or router restart)."));
							o.value('nn', _("None"));
							o.value('ua', _("user code"), _('Add custom commands before restarting the device.'));
							o.optional = false;

							o = s.taboption('uscriptTab', form.Button, '_Generate');
							o.title      = _('Generate a script');
							o.inputtitle = _('Generate user script');
							o.inputstyle  = 'cbi-button cbi-button-action important';
							o.description = _('Generate and save the prepared script.');
							o.onclick = function(ev) {
								let section_id = this.section.cfgsections()[0];
								handleID.call(this, ev, section_id, null);
							};
							o.depends("first_action", "ua");

						}

		                o = s.taboption('uscriptTab', form.Button,
			                '_usr_script_btn', _('Edit user script'),
			                _('User can add his script or generate a new one from the selection options.')
		                );
		                o.onclick    = () => usrScriptEditDialog.show();
		                o.inputtitle = _('Edit');
		                o.inputstyle = 'edit btn';

		    return m.render();
	}
});
