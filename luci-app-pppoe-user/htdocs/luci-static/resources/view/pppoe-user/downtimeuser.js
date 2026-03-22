'use strict';
'require view';
'require form';
'require uci';

return view.extend({
    load: function() {
        return uci.load('pppoe-user');
    },
    render: function() {
        var users = uci.sections('pppoe-user', 'user');
        var downUsers = users.filter(u => u.enabled == '0');
        
        var m = new form.Map('pppoe-user');
        var s = m.section(form.TableSection, 'downtime', _('Downtime User [%d]').format(downUsers.length));
        s.anonymous = true;
        s.addremove = false;
        
        // 填充数据
        s.section = function(section_id) {
            // 手动注入数据到 section
            return this.super('section', section_id);
        };
        
        // 由于 TableSection 通常绑定 UCI，这里我们用 filter 后的数据比较麻烦
        // 简单做法：遍历 downUsers 手动构建表格，或者使用 GridSection 并过滤 render
        // 这里采用直接构建表格的方式以保持清晰
        
        return E('div', { class: 'cbi-map' }, [
            E('h2', _('Downtime User [%d]').format(downUsers.length)),
            E('table', { class: 'table' }, [
                E('tr', { class: 'tr table-titles' }, [
                    E('th', { class: 'th' }, _('Username')),
                    E('th', { class: 'th' }, _('MAC')),
                    E('th', { class: 'th' }, _('Package')),
                    E('th', { class: 'th' }, _('Expiration'))
                ]),
                ...downUsers.map(u => E('tr', { class: 'tr cbi-rowstyle-1' }, [
                    E('td', { class: 'td' }, u.username),
                    E('td', { class: 'td' }, u.macaddr || '-'),
                    E('td', { class: 'td' }, u.package),
                    E('td', { class: 'td' }, u.expires)
                ]))
            ])
        ]);
    }
});
