'use strict';
'require view';
'require form';
'require fs';
'require ubus';
'require ui';

return view.extend({
    load: function() {
        return Promise.all([
            fs.read('/proc/net/dev'),
            fs.list('/var/etc/pppoe-user/session')
        ]).then(function(data) {
            let devContent = data[0] || '';
            let files = data[1] || [];
            
            let pppCount = 0;
            devContent.split(/\n/).forEach(function(line) {
                if (/^\s*ppp/.test(line)) pppCount++;
            });

            let sessions = [];
            let promises = files.map(function(f) {
                if (f.name.endsWith('.json')) {
                    return fs.read('/var/etc/pppoe-user/session/' + f.name).then(function(content) {
                        try {
                            let obj = JSON.parse(content);
                            obj.session_file = '/var/etc/pppoe-user/session/' + f.name;
                            sessions.push(obj);
                        } catch(e) {}
                    });
                }
            });

            return Promise.all(promises).then(function() {
                return { count: pppCount, sessions: sessions };
            });
        });
    },

    render: function(data) {
        var m, s, o;
        var tableData = data.sessions || [];

        m = new form.Map('pppoe-user');
        s = m.section(form.TableSection, 'sessions', _('Online Users [%d]').format(data.count));
        s.anonymous = true;
        s.addremove = false;
        s.sortable = false;
        s.nodescriptions = true;

        o = s.option(form.DummyValue, 'username', _('User Name'));
        o = s.option(form.DummyValue, 'mac', _('MAC address'));
        o = s.option(form.DummyValue, 'interface', _('Interface'));
        o = s.option(form.DummyValue, 'ip', _('IP address'));
        o = s.option(form.DummyValue, 'package', _('Package'));
        o = s.option(form.DummyValue, 'updated', _('Renewal Date'));
        o = s.option(form.DummyValue, 'uptime', _('Up Time'));
        
        var btn = s.option(form.Button, 'kill', _('Forced Offline'));
        btn.inputstyle = 'reset';
        btn.onclick = function(ev, section_id) {
            var row = tableData.find(function(r) { return r.username === section_id; }); 
            // 注意：TableSection 的 section_id 通常是配置名，这里我们是动态数据，需特殊处理
            // 更好的方式是将 username 作为 key 或使用 custom render
            // 此处简化：假设我们能获取到 row 数据
            // 实际开发中，建议使用 form.GridSection 配合 load 数据映射，或者自定义 HTML
            // 下面展示一种通过 data-attribute 传递参数的方法
            
            // 由于 TableSection 处理动态非 UCI 数据较麻烦，这里采用更直接的 UI 构建方式
            // 或者在 render 中手动构建表格。
            // 为了保持代码简洁，这里演示核心逻辑：
            
            var targetRow = this.map.findElement('id', 'cbi.pppoe-user.sessions.' + section_id);
            // 获取该行对应的真实数据 (需要在 render 时将数据绑定到 DOM 或全局变量)
            // 鉴于复杂度，推荐直接使用 L.ui.showModal 或 自定义 renderContent
        };
        
        // 【更优解】：对于非 UCI 的动态列表，直接返回 HTML 往往比 form.TableSection 更灵活
        // 但为了保持风格统一，我们假设用户能理解需要自定义 onclick 来获取数据
        
        // 重新实现 onclick 以获取正确数据
        btn.onclick = L.bind(function(ev, section_id) {
            // 在 load 阶段我们将数据存到了 this.sessionsData
            var session = this.sessionsData.find(s => s.username === section_id);
            if (!session) return;

            return ui.showModal(_('Confirm'), [
                E('p', _('Are you sure you want to force offline user "%s"?').format(session.username)),
                E('div', { class: 'right' }, [
                    E('button', {
                        class: 'btn',
                        click: ui.hideModal
                    }, [ _('Cancel') ]),
                    ' ',
                    E('button', {
                        class: 'btn cbi-button-action',
                        click: ui.handler(L.bind(function() {
                            return ubus.call('pppoe.user', 'kill', {
                                session_file: session.session_file,
                                pid: session.pid
                            }).then(() => {
                                ui.addNotification(null, E('p', _('User killed successfully')));
                                this.load().then(d => this.render(d)); // 刷新
                            }).catch(e => {
                                ui.addNotification(null, E('p', _('Error: ') + e.message));
                            });
                        }, this))
                    }, [ _('OK') ])
                ])
            ]);
        }, this);
        
        // 需要将数据挂载到 this 以便 onclick 访问
        this.sessionsData = tableData;
        
        // 覆盖 renderSection 以正确映射 section_id 到 username
        s.renderSection = function(section_id) {
             // 这里的 section_id 其实是 username，因为我们在 load 后需要手动映射
             // 这种动态数据最好用 form.GridSection 的 load/save 钩子，或者直接手写 HTML
             // 简单起见，这里假设 section_id 就是 username (需在 section 定义时指定)
             return this.super('renderSection', section_id);
        };
        
        // 修正：TableSection 默认基于 UCI config。对于纯动态数据，
        // 建议重写 render 函数直接生成 HTML 表格，不使用 form.Map 的自动渲染
        // 下面提供一个直接渲染 HTML 的版本思路：
        
        return E('div', { class: 'cbi-map' }, [
            E('h2', _('Online Users [%d]').format(data.count)),
            E('table', { class: 'table' }, [
                E('tr', { class: 'tr table-titles' }, [
                    E('th', { class: 'th' }, _('User Name')),
                    E('th', { class: 'th' }, _('IP')),
                    E('th', { class: 'th' }, _('MAC')),
                    E('th', { class: 'th' }, _('Action'))
                ]),
                ...tableData.map(user => E('tr', { class: 'tr cbi-rowstyle-' + ((Math.random() > 0.5) ? '1' : '2') }, [
                    E('td', { class: 'td' }, user.username),
                    E('td', { class: 'td' }, user.ip),
                    E('td', { class: 'td' }, user.mac),
                    E('td', { class: 'td' }, [
                        E('button', {
                            class: 'btn cbi-button-action',
                            click: () => {
                                // 同上 kill 逻辑
                                ui.showModal(_('Confirm'), [
                                    E('p', _('Kill %s?').format(user.username)),
                                    E('div', { class: 'right' }, [
                                        E('button', { class: 'btn', click: ui.hideModal }, _('Cancel')),
                                        ' ',
                                        E('button', {
                                            class: 'btn cbi-button-negative',
                                            click: () => {
                                                ubus.call('pppoe.user', 'kill', { session_file: user.session_file, pid: user.pid })
                                                    .then(() => location.reload())
                                                    .catch(e => alert(e));
                                            }
                                        }, _('Kill'))
                                    ])
                                ]);
                            }
                        }, _('Forced Offline'))
                    ])
                ]))
            ])
        ]);
    }
});
