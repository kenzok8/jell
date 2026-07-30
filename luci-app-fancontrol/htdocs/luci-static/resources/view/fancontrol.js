'use strict';
'require dom';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require view';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

function serviceRunning(result) {
	const instances = result?.fancontrol?.instances || {};

	return Object.keys(instances).some(function(name) {
		return instances[name].running === true;
	});
}

function parseStatus(text) {
	const status = {};

	String(text || '').split(/\n/).forEach(function(line) {
		const separator = line.indexOf('=');

		if (separator > 0)
			status[line.substring(0, separator)] = line.substring(separator + 1);
	});

	return status;
}

function statusMetric(title, value, unit, level) {
	const children = [
		E('span', { 'class': 'fancontrol-metric-label' }, title),
		E('div', { 'class': 'fancontrol-metric-reading' }, [
			E('span', { 'class': 'fancontrol-metric-value' }, value),
			unit ? E('span', { 'class': 'fancontrol-metric-unit' }, unit) : ''
		])
	];

	if (level != null)
		children.push(E('div', { 'class': 'fancontrol-level', 'aria-hidden': 'true' },
			E('div', { 'style': 'width:%d%%'.format(level) })));

	return E('div', { 'class': 'fancontrol-metric' }, children);
}

function statusDetail(title, value) {
	return E('div', { 'class': 'fancontrol-detail' }, [
		E('span', { 'class': 'fancontrol-detail-label' }, title),
		E('span', { 'class': 'fancontrol-detail-value' }, value)
	]);
}

function renderStatus(node, running, status) {
	const temp = Number(status.temperature_mc);
	const pwm = Number(status.pwm);
	const rpm = Number(status.rpm);
	const tempValid = Number.isFinite(temp) && temp >= 0;
	const pwmValid = Number.isFinite(pwm) && pwm >= 0;
	const rpmValid = Number.isFinite(rpm) && rpm >= 0;
	const pwmPercent = pwmValid ? Math.round(pwm * 100 / 255) : null;
	const fault = status.error
		? E('span', { 'class': 'label warning' }, status.error)
		: E('span', { 'class': 'fancontrol-ok' }, _('None'));

	dom.content(node, E('div', { 'class': 'fancontrol-status' }, [
		E('div', { 'class': 'fancontrol-status-head' }, [
			E('span', { 'class': 'fancontrol-status-title' }, _('Runtime Status')),
			E('span', { 'class': running ? 'label success' : 'label warning' },
				running ? _('Running') : _('Stopped'))
		]),
		E('div', { 'class': 'fancontrol-metrics' }, [
			statusMetric(_('Temperature'), tempValid ? '%.1f'.format(temp / 1000) : '-',
				tempValid ? '°C' : ''),
			statusMetric(_('PWM output'), pwmValid ? String(pwm) : '-',
				pwmValid ? '/ 255 · %d%%'.format(pwmPercent) : '', pwmPercent),
			statusMetric(_('Fan speed'), rpmValid ? String(rpm) : '-', rpmValid ? 'RPM' : '')
		]),
		E('div', { 'class': 'fancontrol-details' }, [
			statusDetail(_('Temperature input'), status.thermal_file || '-'),
			statusDetail(_('PWM device'), status.fan_file || '-'),
			statusDetail(_('Fault'), fault)
		])
	]));
}

function validateAutoPath(sectionId, value) {
	if (value === 'auto' || value?.startsWith('/'))
		return true;

	return _('Enter "auto" or an absolute sysfs path.');
}

return view.extend({
	load() {
		return uci.load('fancontrol');
	},

	render() {
		let m, s, o;
		let startTemp, fullTemp, startSpeed, maxSpeed, kickSpeed, kickMs;

		m = new form.Map('fancontrol', _('Fan Control'),
			_('Configure a continuous PWM curve based on device temperature. Automatic hardware detection is suitable for most devices.'));

		s = m.section(form.TypedSection, 'fancontrol', _('Runtime Status'));
		s.anonymous = true;
		s.addremove = false;
		s.render = function() {
			const node = E('div', { 'class': 'cbi-section fancontrol-runtime' }, [
				E('link', {
					'rel': 'stylesheet',
					'href': L.resource('view/fancontrol.css')
				}),
				E('div', { 'class': 'cbi-section-node' }, _('Collecting data...'))
			]);
			const statusNode = node.lastElementChild;

			poll.add(function() {
				return Promise.all([
					L.resolveDefault(callServiceList('fancontrol'), {}),
					L.resolveDefault(fs.read_direct('/var/run/fancontrol.status'), '')
				]).then(function(result) {
					renderStatus(statusNode, serviceRunning(result[0]), parseStatus(result[1]));
				});
			}, 5);

			return node;
		};

		s = m.section(form.NamedSection, 'settings', 'fancontrol', _('Settings'));
		s.addremove = false;
		s.tab('curve', _('Temperature Curve'),
			_('Controls when the fan starts and how its speed rises with temperature.'));
		s.tab('hardware', _('Hardware'),
			_('Automatic detection works on most devices. Select explicit sysfs entries only when necessary.'));
		s.tab('safety', _('Safety'),
			_('Controls startup assistance and fail-safe behavior. Full-speed safety defaults are recommended.'));

		o = s.taboption('curve', form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;
		o.description = _('Run the controller and apply this temperature curve.');

		startTemp = s.taboption('curve', form.Value, 'start_temp', _('Start temperature'));
		startTemp.default = '45';
		startTemp.datatype = 'range(-40,200)';
		startTemp.rmempty = false;
		startTemp.description = _('The fan remains off below this temperature and starts at the minimum running PWM when it is reached. Unit: °C.');

		fullTemp = s.taboption('curve', form.Value, 'full_speed_temp', _('Full-speed temperature'));
		fullTemp.default = '85';
		fullTemp.datatype = 'range(-39,250)';
		fullTemp.rmempty = false;
		fullTemp.description = _('PWM rises linearly and reaches the configured maximum at this temperature. Unit: °C.');
		fullTemp.validate = function(sectionId, value) {
			if (Number(value) <= Number(startTemp.formvalue(sectionId)))
				return _('Full-speed temperature must be higher than start temperature.');
			return true;
		};

		o = s.taboption('curve', form.Value, 'hysteresis', _('Stop hysteresis'));
		o.default = '3';
		o.datatype = 'range(0,50)';
		o.rmempty = false;
		o.description = _('After starting, the fan stops only after temperature falls this many degrees below the start temperature. This prevents rapid on/off cycling.');

		startSpeed = s.taboption('curve', form.Value, 'start_speed', _('Minimum running PWM'));
		startSpeed.default = '64';
		startSpeed.datatype = 'range(1,255)';
		startSpeed.rmempty = false;
		startSpeed.description = _('Lowest PWM used while the fan is running. Increase it if the fan stalls or cannot maintain rotation. Range: 1–255.');

		maxSpeed = s.taboption('curve', form.Value, 'max_speed', _('Maximum PWM'));
		maxSpeed.default = '255';
		maxSpeed.datatype = 'range(1,255)';
		maxSpeed.rmempty = false;
		maxSpeed.description = _('Highest PWM allowed by the curve. A value of 255 means 100% duty cycle.');
		maxSpeed.validate = function(sectionId, value) {
			if (Number(value) < Number(startSpeed.formvalue(sectionId)))
				return _('Maximum PWM must not be lower than minimum running PWM.');
			return true;
		};

		o = s.taboption('curve', form.Value, 'interval', _('Polling interval'));
		o.default = '5';
		o.datatype = 'range(1,300)';
		o.rmempty = false;
		o.description = _('How often the temperature is read and the PWM output is updated. Unit: seconds.');

		o = s.taboption('hardware', form.Value, 'thermal_file', _('Temperature input'));
		o.default = 'auto';
		o.rmempty = false;
		o.validate = validateAutoPath;
		o.description = _('Use "auto" to select a CPU or SoC thermal sensor, or enter an absolute thermal zone or hwmon tempN_input path.');

		o = s.taboption('hardware', form.Value, 'thermal_zone', _('Thermal zone type'));
		o.default = 'auto';
		o.rmempty = false;
		o.description = _('Preferred thermal zone type when temperature input is automatic, for example cpu_top_thermal. Leave as "auto" unless several sensors are available.');

		o = s.taboption('hardware', form.Value, 'fan_file', _('PWM output'));
		o.default = 'auto';
		o.rmempty = false;
		o.validate = validateAutoPath;
		o.description = _('Use "auto" to select a writable hwmon pwmN output, or enter its absolute path. cooling_device cur_state is not a PWM output.');

		o = s.taboption('hardware', form.Value, 'fan_hwmon', _('Hwmon device name'));
		o.default = 'auto';
		o.rmempty = false;
		o.description = _('Preferred hwmon name when PWM output is automatic. The pwmfan driver is preferred by default.');

		o = s.taboption('hardware', form.Value, 'enable_file', _('PWM mode control'));
		o.default = 'auto';
		o.rmempty = false;
		o.validate = validateAutoPath;
		o.description = _('Optional pwmN_enable path used to select manual PWM mode. With "auto", the matching control is used when available.');

		o = s.taboption('hardware', form.Value, 'temp_div', _('Temperature divisor'));
		o.default = '1000';
		o.value('1');
		o.value('1000');
		o.datatype = 'range(1,1000000)';
		o.rmempty = false;
		o.description = _('Divides the raw sensor value before control calculations. Standard Linux temperature inputs use 1000; sensors reporting whole degrees use 1.');

		kickSpeed = s.taboption('safety', form.Value, 'kick_speed', _('Start kick PWM'));
		kickSpeed.default = '255';
		kickSpeed.datatype = 'range(0,255)';
		kickSpeed.rmempty = false;
		kickSpeed.description = _('Brief PWM applied when a stopped fan starts. It helps fans that cannot start reliably at low duty. Set to 0 together with a zero duration to disable.');

		kickMs = s.taboption('safety', form.Value, 'kick_ms', _('Start kick duration'));
		kickMs.default = '500';
		kickMs.datatype = 'range(0,10000)';
		kickMs.rmempty = false;
		kickMs.description = _('How long the startup kick is applied. Unit: milliseconds.');
		kickMs.validate = function(sectionId, value) {
			if (Number(value) > 0 && Number(kickSpeed.formvalue(sectionId)) === 0)
				return _('Start kick PWM must be non-zero when a kick duration is configured.');
			return true;
		};

		o = s.taboption('safety', form.Value, 'fail_safe_speed', _('Sensor failure PWM'));
		o.default = '255';
		o.datatype = 'range(0,255)';
		o.rmempty = false;
		o.description = _('PWM used when the temperature sensor cannot be read. Keeping 255 is the safest choice.');

		o = s.taboption('safety', form.Value, 'exit_speed', _('Service exit PWM'));
		o.default = '255';
		o.datatype = 'range(0,255)';
		o.rmempty = false;
		o.description = _('PWM written when the service stops. Keeping the fan at full speed avoids losing cooling after an unexpected exit.');

		o = s.taboption('safety', form.Flag, 'debug', _('Debug logging'));
		o.default = o.disabled;
		o.rmempty = false;
		o.description = _('Write temperature, PWM and RPM values to the system log at every polling interval.');

		return m.render();
	}
});
