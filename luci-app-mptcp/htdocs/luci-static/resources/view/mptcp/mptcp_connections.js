'use strict';
'require view';
'require poll';
'require rpc';

var callMptcpConnections = rpc.declare({
	object: 'luci.mptcp',
	method: 'mptcp_connections',
	expect: { output: '' }
});

return view.extend({
	render: function() {
		var pre = E('pre', { 'id': 'mptcp-connections-output', 'style': 'white-space:pre-wrap' },
			[ _('Waiting for command to complete…') ]);

		poll.add(L.bind(this._update, this, pre), 10);

		this._update(pre);

		return E('div', { 'class': 'cbi-section' }, [ pre ]);
	},

	_update: function(pre) {
		return callMptcpConnections().then(function(text) {
			pre.textContent = (text || '').trim() || _('No data');
		}).catch(function() {
			pre.textContent = _('Error fetching connections data.');
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
