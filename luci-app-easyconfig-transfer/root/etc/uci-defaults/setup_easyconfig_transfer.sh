#!/bin/sh
# Copyright 2024-2026 Rafał Wabik (IceG) - From eko.one.pl forum
# Licensed to the GNU General Public License v3.0.

chmod +x /etc/uci-defaults/setup_easyconfig_transfer.sh >/dev/null 2>&1 &

chmod +x /usr/bin/auto_reset_statistics.sh >/dev/null 2>&1 &

chmod +x /usr/bin/easyconfig_statistics.sh >/dev/null 2>&1 &
chmod +x /usr/bin/easyconfig_statistics.uc >/dev/null 2>&1 &

echo "{}" > /tmp/easyconfig_statistics.json >/dev/null 2>&1 &

mkdir -p /usr/lib/easyconfig >/dev/null 2>&1 &

rm -rf /tmp/luci-indexcache >/dev/null 2>&1 &
rm -rf /tmp/luci-modulecache/ >/dev/null 2>&1 &
exit 0
