'use strict';
'require view';
'require poll';
'require rpc';

var callMptcpMonitor = rpc.declare({
	object: 'luci.mptcp',
	method: 'mptcp_monitor',
	expect: { output: '' }
});

return view.extend({
	render: function() {
		var pre = E('pre', { 'id': 'mptcp-monitor-output', 'style': 'white-space:pre-wrap' },
			[ _('Waiting for command to complete…') ]);

		poll.add(L.bind(this._update, this, pre), 10);

		/* Run immediately without waiting for the first poll interval */
		this._update(pre);

		return E('div', { 'class': 'cbi-section' }, [ pre ]);
	},

	_update: function(pre) {
		return callMptcpMonitor().then(function(text) {
			pre.textContent = (text || '').trim() || _('(no output)');
		}).catch(function() {
			pre.textContent = _('Error fetching monitor data.');
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
