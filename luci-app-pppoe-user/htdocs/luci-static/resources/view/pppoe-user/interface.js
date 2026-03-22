'use strict';
'require view';
'require fs';

return view.extend({
    load: function() {
        return fs.read('/var/pppoe-user/log/interface.log');
    },
    render: function(logs) {
        var m = new form.Map('pppoe-user');
        var s = m.section(form.NamedSection, 'logview', 'dummy');
        
        var o = s.option(form.TextValue, '_log');
        o.rows = 30;
        o.readonly = true;
        o.cfgvalue = function() {
            return logs || _('No log available.');
        };
        
        return m.render();
    }
});
