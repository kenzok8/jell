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
        return fs.read('/etc/fusiontunx/app.yaml').then(function (content) {
            var port = '8080';
            if (content) {
                var match = content.match(/port:\s*["']?(\d+)["']?/);
                if (match) port = match[1];
            }
            return port;
        }).catch(function () { return '8080'; });
    },

    render: function (port) {
        var statusEl = E('span', { 'class': 'label' }, _('Checking...'));

        var btnStart = E('button', {
            'class': 'cbi-button cbi-button-apply',
            'disabled': true
        }, _('Start'));

        var btnRestart = E('button', {
            'class': 'cbi-button cbi-button-save',
            'disabled': true
        }, _('Restart'));

        var btnStop = E('button', {
            'class': 'cbi-button cbi-button-reset',
            'disabled': true
        }, _('Stop'));

        var btnOpen = E('button', {
            'class': 'cbi-button cbi-button-action',
            'disabled': true,
            'click': function () {
                var url = 'http://' + window.location.hostname + ':' + port;
                window.open(url, '_blank');
            }
        }, _('Open Dashboard'));



        var handleAction = function (action) {
            return fs.exec('/etc/init.d/fusiontunx', [action]).then(function (res) {
                if (res.code !== 0) {
                    ui.addNotification(null, E('p', _('Command failed: %s').format(res.stderr || res.stdout)), 'error');
                    throw new Error(res.stderr || res.stdout);
                } else {
                    window.location.reload();
                }
            });
        };

        var handleStart = function () {
            return fs.exec('/etc/init.d/fusiontunx', ['enable']).then(function () {
                return handleAction('start');
            });
        };

        var handleStop = function () {
            return handleAction('stop').then(function () {
                return fs.exec('/etc/init.d/fusiontunx', ['disable']);
            });
        };

        btnStart.onclick = ui.createHandlerFn(this, handleStart);
        btnRestart.onclick = ui.createHandlerFn(this, function () { return handleAction('restart'); });
        btnStop.onclick = ui.createHandlerFn(this, handleStop);

        var updateStatus = function () {
            return callServiceList('fusiontunx').then(function (res) {
                var running = false;
                try {
                    var instances = res.fusiontunx.instances;
                    for (var i in instances) {
                        if (instances[i].running) {
                            running = true;
                            break;
                        }
                    }
                } catch (e) { }

                if (running) {
                    statusEl.textContent = _('Running');
                    statusEl.className = 'label success';

                    btnStart.setAttribute('disabled', 'disabled');
                    btnRestart.removeAttribute('disabled');
                    btnStop.removeAttribute('disabled');
                    btnOpen.removeAttribute('disabled');
                } else {
                    statusEl.textContent = _('Stopped');
                    statusEl.className = 'label important';

                    btnStart.removeAttribute('disabled');
                    btnRestart.setAttribute('disabled', 'disabled');
                    btnStop.setAttribute('disabled', 'disabled');
                    btnOpen.setAttribute('disabled', 'disabled');
                }
            }).catch(function () {
                statusEl.textContent = _('Error');
                statusEl.className = 'label warning';
            });
        };

        updateStatus();

        poll.add(updateStatus, 3);

        return E('div', { 'class': 'cbi-map' }, [
            E('h2', _('FusionTunX Control')),
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Service Status')),
                    E('div', { 'class': 'cbi-value-field' }, statusEl)
                ]),

                E('div', { 'class': 'cbi-section-descr' }, _('Control the FusionTunX backend service.')),

                E('div', { 'class': 'cbi-page-actions' }, [
                    btnStart, btnRestart, btnStop, btnOpen
                ])
            ])
        ]);
    },
    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
