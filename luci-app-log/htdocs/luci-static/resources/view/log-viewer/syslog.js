'use strict';
'require view.log-viewer.log-system as abc';

return abc.view.extend({
	viewName   : 'syslog',
	title      : _('System Log'),
	autoRefresh: true,
	appPattern : '^',
	loggerTail : true,
});
