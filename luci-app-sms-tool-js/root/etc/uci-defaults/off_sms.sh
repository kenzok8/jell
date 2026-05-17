#!/bin/sh
# 
# Copyright 2023-2026 Rafał Wabik (IceG) - From eko.one.pl forum
# Licensed to the GNU General Public License v3.0.
# 

/etc/init.d/my_new_sms stop >/dev/null 2>&1 &
/etc/init.d/my_new_sms disable >/dev/null 2>&1 &
/etc/init.d/my_new_sms disable >/dev/null 2>&1 &
sleep 4
/etc/init.d/sms_tool_calllogd stop >/dev/null 2>&1 &
/etc/init.d/sms_tool_calllogd disable >/dev/null 2>&1 &
/etc/init.d/sms_tool_calllogd disable >/dev/null 2>&1 &
 
exit 0
