'use strict';
'require view';
'require uci';
'require ui';
'require form';

return view.extend({

	load() {
	return Promise.all([
		uci.load('netspeedtest')
	]);
	},

	render(res) {
		let m, s, o;

		m = new form.Map('netspeedtest', _('OpenSpeedTest'));

		s = m.section(form.NamedSection, '_iframe');
		s.anonymous = true;
		s.render = function (section_id) {
			return E('iframe', {
				src: '//openspeedtest.com/speedtest',
				style: 'border:none;width:100%;height:100%;min-height:360px;border:none;overflow:hidden !important;'
			});
		};

		return m.render();
	}



    // handleSaveApply: null,
   //  handleSave: null,
    // handleReset: null
});
