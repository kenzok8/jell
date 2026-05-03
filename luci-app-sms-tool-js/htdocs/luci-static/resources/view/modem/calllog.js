'use strict';
'require fs';
'require ui';
'require uci';
'require view';

/*
	Copyright 2022-2026 Rafał Wabik - IceG - From eko.one.pl forum

	Licensed to the GNU General Public License v3.0.
*/

document.head.append(E('style', {'type': 'text/css'},
`
#callLogTable {
  width: 100%;
  border: 1px solid var(--border-color-medium) !important;
}

#callLogTable th,
#callLogTable td {
  padding: 10px;
  text-align: justify !important;
  vertical-align: top !important;
}

#callLogTable tr:nth-child(odd) td {
  background: var(--background-color-medium) !important;
  border-bottom: 1px solid var(--border-color-medium) !important;
  border-top: 1px solid var(--border-color-medium) !important;
}

#callLogTable tr:nth-child(even) td {
  border-bottom: 1px solid var(--border-color-medium) !important;
  border-top: 1px solid var(--border-color-medium) !important;
}

#callLogTable .date {
  width: 25% !important;
}

#callLogTable .call-type {
  width: 15% !important;
}

#callLogTable .number {
  width: 25% !important;
}

#callLogTable .duration {
  width: 15% !important;
}

#callLogTable .name {
  width: 20% !important;
}
`));

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('sms_tool_js'),
			L.resolveDefault(fs.read('/tmp/sms_tool_call_log.json'), '{"calls":[]}')
		]);
	},

	handleRefresh: function() {
		location.reload();
	},

	handleClear: function() {
		if (confirm(_('Clear all call log entries?'))) {
			return Promise.all([
				fs.write('/tmp/sms_tool_call_log.json', '{"calls":[]}'),
				fs.write('/tmp/sms_tool_call_log.lines', '')
			]).then(function() {
				this.handleRefresh();
			}.bind(this));
		}
	},

	setTableMessage: function(message, spinning) {
		var table = document.getElementById('callLogTable');
		if (!table)
			return;

		while (table.rows.length > 1)
			table.deleteRow(1);

		var row = table.insertRow(-1);
		var cell = row.insertCell(0);
		cell.colSpan = 5;
		cell.style.textAlign = 'center';
		cell.appendChild(E('span', spinning ? { 'class': 'spinning' } : {}, message));
	},

	updateCallLogTable: function(calls) {
		var table = document.getElementById('callLogTable');
		if (!table)
			return;

		while (table.rows.length > 1)
			table.deleteRow(1);

		if (!calls || !calls.length) {
			this.setTableMessage(_('No call log entries found'), false);
			return;
		}

		// Filter by type if needed, but for now show all
		var select = document.getElementById('call-log-type');
		var filter = select ? select.value : 'all';

		for (var i = 0; i < calls.length; i++) {
			if (filter !== 'all' && calls[i].type.toLowerCase() !== filter)
				continue;

			var row = table.insertRow(-1);
			row.insertCell(0).textContent = calls[i].date;
			row.insertCell(1).textContent = _(calls[i].type);
			row.insertCell(2).textContent = calls[i].number;
			row.insertCell(3).textContent = calls[i].duration;
			row.insertCell(4).textContent = '-'; // Name lookup could be added later
		}

		if (table.rows.length === 1) {
			this.setTableMessage(_('No matching call log entries found'), false);
		}
	},

	render: function(data) {
		var callLogData;

		try {
			callLogData = JSON.parse(data[1] || '{"calls":[]}');
		}
		catch (e) {
			callLogData = { calls: [] };
		}

		var calls = callLogData.calls || [];

		var calllog_enabled = uci.get('sms_tool_js', '@sms_tool_js[0]', 'calllog_enabled') === '1';

		setTimeout(function() {
			this.updateCallLogTable(calls);
		}.bind(this), 100);

		return E([], [
			E('h2', _('Call Log')),
			E('div', { 'class': 'cbi-map-descr' }, _('User interface for viewing call logs. The log is collected by a background daemon.')),

			(function() {
				if (!calllog_enabled) {
					return E('div', { 'class': 'alert-message warning' }, [
						E('p', {}, _('Call log daemon is disabled. Please enable it in the configuration to start collecting logs.'))
					]);
				}
				return E('div', { 'style': 'display: none;' });
			})(),

			E('h3', _('Calls')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left', 'width': '33%' }, [ _('Filter call type') ]),
					E('td', { 'class': 'td' }, [
						E('select', {
							'class': 'cbi-input-select',
							'id': 'call-log-type',
							'change': function() {
								this.updateCallLogTable(calls);
							}.bind(this)
						}, [
							E('option', { 'value': 'all' }, _('All calls')),
							E('option', { 'value': 'missed' }, _('Missed calls')),
							E('option', { 'value': 'received' }, _('Received calls')),
							E('option', { 'value': 'dialed' }, _('Dialed calls'))
						])
					])
				])
			]),

			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': ui.createHandlerFn(this, 'handleRefresh')
				}, [ _('Refresh') ]),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-remove',
					'click': ui.createHandlerFn(this, 'handleClear')
				}, [ _('Clear Log') ])
			]),

			E('p'),

			E('table', { 'class': 'table', 'id': 'callLogTable' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th date' }, _('Date')),
					E('th', { 'class': 'th call-type' }, _('Type')),
					E('th', { 'class': 'th number' }, _('Number')),
					E('th', { 'class': 'th duration' }, _('Duration')),
					E('th', { 'class': 'th name' }, _('Name'))
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
