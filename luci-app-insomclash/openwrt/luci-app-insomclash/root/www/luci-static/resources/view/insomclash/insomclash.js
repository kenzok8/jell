'use strict';
'require view';
'require fs';
'require ui';
'require rpc';
'require poll';

var callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

return view.extend({
    load: function () {
        return fs.read('/etc/insomclash/app.yaml').then(function (content) {
            var port = '8080';
            if (content) {
                var match = content.match(/port:\s*["']?(\d+)["']?/);
                if (match) port = match[1];
            }
            return port;
        }).catch(function () { return '8080'; });
    },

    render: function (port) {
        var url = 'http://' + window.location.hostname + ':' + port;

        var iframe = E('iframe', {
            'src': url,
            'style': 'width: 100%; min-height: 85vh; border: none; display: none;',
            'title': 'InsomClash Dashboard'
        });

        var warning = E('div', {
            'class': 'cbi-section',
            'style': 'display: none; text-align: center; margin-top: 50px; padding: 30px;'
        }, [
            E('h3', { 'style': 'color: #d9534f;' }, _('Service is Not Running')),
            E('p', { 'style': 'margin: 15px 0 25px;' }, _('The InsomClash backend service is currently stopped. Please start the service to access the dashboard.')),
            E('div', {}, [
                E('button', {
                    'class': 'cbi-button cbi-button-action',
                    'click': function () {
                        window.location.href = L.url('admin', 'services', 'insomclash', 'server');
                    }
                }, _('Go to Server Control'))
            ])
        ]);

        var container = E('div', {}, [warning, iframe]);

        var updateStatus = function () {
            return callServiceList('insomclash').then(function (res) {
                var running = false;
                try {
                    var instances = res.insomclash.instances;
                    for (var i in instances) {
                        if (instances[i].running) {
                            running = true;
                            break;
                        }
                    }
                } catch (e) { }

                if (running) {
                    if (iframe.style.display === 'none') {
                        warning.style.display = 'none';
                        iframe.style.display = 'block';
                        iframe.src = iframe.src;
                    }
                } else {
                    if (warning.style.display === 'none') {
                        iframe.style.display = 'none';
                        warning.style.display = 'block';
                    }
                }
            });
        };

        updateStatus();

        poll.add(updateStatus, 3);

        return container;
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
