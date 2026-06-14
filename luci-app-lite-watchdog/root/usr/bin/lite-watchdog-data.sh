#!/bin/sh

PING_FILE="/tmp/lite_watchdog"
TEST_TIME_FILE="/tmp/lite_watchdog_tt"
GCNT_FILE="/tmp/lite_watchdog_gcnt"

MIN=""
AVG=""
MAX=""

if [ -f "$PING_FILE" ]; then
    VPING="$(cat "$PING_FILE" 2>/dev/null)"

    LINE="$(printf '%s\n' "$VPING" | grep -E '(^|[[:space:]])(rtt|round-trip)[^=]*min/avg/max' | tail -n1)"
    if [ -n "$LINE" ]; then
        STATS="$(printf '%s' "$LINE" | sed -n 's/.*=\s*\([^ ]*\)\s*ms.*/\1/p')"

        MIN="$(printf '%s' "$STATS" | cut -d'/' -f1)"
        AVG="$(printf '%s' "$STATS" | cut -d'/' -f2)"
        MAX="$(printf '%s' "$STATS" | cut -d'/' -f3)"
    fi
fi

[ -n "$MIN" ] || MIN="--.---"
[ -n "$AVG" ] || AVG="--.---"
[ -n "$MAX" ] || MAX="--.---"

if [ -f "$TEST_TIME_FILE" ]; then
    TEST_TIME="$(cat "$TEST_TIME_FILE" 2>/dev/null)"
else
    TEST_TIME=""
fi

if [ -f "$GCNT_FILE" ]; then
    NOW_COUNT="$(wc -l < "$GCNT_FILE" 2>/dev/null)"
    case "$NOW_COUNT" in ''|*[!0-9]*) NOW_COUNT=0 ;; esac
else
    NOW_COUNT=0
fi

ONV="$(uci -q get watchdog.@watchdog[0].enabled)"
if [ "$ONV" = "0" ]; then ON="0"; else ON="1"; fi

DT="$(uci -q get watchdog.@watchdog[0].dest)"
DY="$(uci -q get watchdog.@watchdog[0].delay)"
PD="$(uci -q get watchdog.@watchdog[0].period)"
CT="$(uci -q get watchdog.@watchdog[0].period_count)"
AN="$(uci -q get watchdog.@watchdog[0].action)"

[ -n "$DT" ] || DT=""
[ -n "$DY" ] || DY="0"
[ -n "$PD" ] || PD="0"
[ -n "$CT" ] || CT="0"
[ -n "$AN" ] || AN=""

cat <<EOF
{
"enable":"$ON",
"dest":"$DT",
"delay":"$DY",
"period":"$PD",
"count":"$CT",
"now_count":"$NOW_COUNT",
"action":"$AN",
"testtime":"$TEST_TIME",
"min":"$MIN",
"avg":"$AVG",
"max":"$MAX"
}
EOF

exit 0
