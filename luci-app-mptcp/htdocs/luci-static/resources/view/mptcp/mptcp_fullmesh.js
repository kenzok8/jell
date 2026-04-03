'use strict';
'require view';
'require poll';
'require rpc';

var callMptcpFullmesh = rpc.declare({
	object: 'luci.mptcp',
	method: 'mptcp_fullmesh',
	expect: { output: '' }
});

return view.extend({
	render: function() {
		var pre = E('pre', { 'id': 'mptcp-fullmesh-output', 'style': 'white-space:pre-wrap' },
			[ _('Waiting for command to complete…') ]);

		poll.add(L.bind(this._update, this, pre), 10);

		this._update(pre);

		return E('div', { 'class': 'cbi-section' }, [ pre ]);
	},

	_update: function(pre) {
		return callMptcpFullmesh().then(function(text) {
			pre.textContent = (text || '').trim() || _('(no output)');
		}).catch(function() {
			pre.textContent = _('Error fetching fullmesh data.');
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
