#!/bin/sh
#
# $1 delay time
# $2 ping count
# $3 hosts
# $4 period count (PRD – offline action counter)
# $5 action reboot|wan
#
# Status files:
# /tmp/lite_watchdog_gcnt (offline counter)
# /tmp/lite_watchdog_hidx (host index)
# Lock:
# /tmp/lite_watchdog.lock
# Action:
# /tmp/lite_watchdog_stage


T="$(uci -q get watchdog.@watchdog[0].iface)"
[ -z "$T" ] && exit 0
[ "x$T" = "xnone" ] && exit 0

UPTIME="$(awk '{printf "%d", $1}' /proc/uptime)"
[ "$UPTIME" -le "$1" ] && exit 0

DIR="/etc/modem"
LOG_FILE="$DIR/log.txt"
GCNT_FILE="/tmp/lite_watchdog_gcnt"
HIDX_FILE="/tmp/lite_watchdog_hidx"
LOCKDIR="/tmp/lite_watchdog.lock"
STAGE_FILE="/tmp/lite_watchdog_stage"

LINES_MAX=11000
LINES_MIN=6000

LOG_D="$(uci -q get watchdog.@watchdog[0].log)"

LEDST="$(uci -q get watchdog.@watchdog[0].ledstatus)"
LEDX="$(uci -q get watchdog.@watchdog[0].led)"
LEDPATH="/sys/class/leds/$LEDX"
LEDON="$LEDPATH/brightness"
LEDMAX="255"
[ -f "$LEDPATH/max_brightness" ] && LEDMAX="$(cat "$LEDPATH/max_brightness" 2>/dev/null || echo 255)"

[ -d "$DIR" ] || mkdir -p "$DIR" 2>/dev/null
[ -f "$LOG_FILE" ] || : > "$LOG_FILE"

LINES_COUNT="$(wc -l < "$LOG_FILE" 2>/dev/null)"
[ -z "$LINES_COUNT" ] && LINES_COUNT=0
if [ "$LINES_COUNT" -ge "$LINES_MAX" ]; then
    tmpf="$(mktemp /tmp/lwlog.XXXXXX)"
    tail -n "$LINES_MIN" "$LOG_FILE" > "$tmpf" 2>/dev/null
    cat "$tmpf" > "$LOG_FILE"
    rm -f "$tmpf"
fi

acquire_lock() {
    i=0
    while ! mkdir "$LOCKDIR" 2>/dev/null; do
        i=$((i+1))
        [ "$i" -ge 10 ] && break
        sleep 1
    done
}
release_lock() {
    rmdir "$LOCKDIR" 2>/dev/null
}

lines_count() {
    f="$1"
    [ -f "$f" ] || { echo 0; return; }
    n="$(wc -l < "$f" 2>/dev/null)"
    case "$n" in ''|*[!0-9]*) n=0 ;; esac
    echo "$n"
}
lines_reset() { : > "$1"; }
lines_inc()   { echo "fail" >> "$1"; }

read_int_file() {
    f="$1"
    [ -f "$f" ] || { echo 0; return; }
    v="$(cat "$f" 2>/dev/null)"
    case "$v" in ''|*[!0-9]*) v=0 ;; esac
    echo "$v"
}

init_temp_files() {
    local init_needed=0
    
    if [ ! -d "/tmp" ] || [ ! -w "/tmp" ]; then
        logger -t LITE-WATCHDOG "ERROR: /tmp directory is not accessible or writable"
        exit 1
    fi
    
    if [ ! -f "$GCNT_FILE" ]; then
        : > "$GCNT_FILE" 2>/dev/null || {
            logger -t LITE-WATCHDOG "ERROR: Cannot create $GCNT_FILE"
            exit 1
        }
        init_needed=1
    else
        if ! wc -l < "$GCNT_FILE" >/dev/null 2>&1; then
            : > "$GCNT_FILE"
            init_needed=1
        fi
    fi
  
    if [ ! -f "$HIDX_FILE" ]; then
        echo "0" > "$HIDX_FILE" 2>/dev/null || {
            logger -t LITE-WATCHDOG "ERROR: Cannot create $HIDX_FILE"
            exit 1
        }
        init_needed=1
    else
        hidx_val="$(read_int_file "$HIDX_FILE")"
        if [ "$hidx_val" -ge "$HOST_COUNT" ]; then
            echo "0" > "$HIDX_FILE"
            init_needed=1
        fi
    fi
    
    if [ -f "$STAGE_FILE" ] && [ "$UPTIME" -lt 300 ]; then
        rm -f "$STAGE_FILE"
        init_needed=1
    fi
    
    if [ "$init_needed" -eq 1 ]; then
        date +"%A %d-%B %Y %T, Watchdog initialized (uptime: ${UPTIME}s, hosts: $HOST_COUNT)" >> "$LOG_FILE"
    fi
}

PC="$2"
case "$PC" in
    ''|*[!0-9]*) PC=1 ;;
    *) [ "$PC" -le 0 ] && PC=1 ;;
esac

HOSTS="$(echo "$3" | tr ',' ' ')"
HOST_COUNT=0
for H in $HOSTS; do
    [ -n "$H" ] || continue
    eval "HOST_${HOST_COUNT}=\$H"
    HOST_COUNT=$((HOST_COUNT + 1))
done
[ "$HOST_COUNT" -le 0 ] && exit 0

PRD="$4"
case "$PRD" in
    ''|*[!0-9]*) PRD=3 ;;
    *) if [ "$PRD" -le 0 ] || [ "$PRD" -gt 100 ]; then PRD=3; fi ;;
esac

MAX_GLOBAL_COUNT=$((PRD + 5))

init_temp_files

date +"%Y-%m-%d %T" > /tmp/lite_watchdog_tt

acquire_lock
HIDX="$(read_int_file "$HIDX_FILE")"
if [ "$HIDX" -ge "$HOST_COUNT" ] || [ "$HIDX" -lt 0 ]; then
    HIDX=0
    echo "0" > "$HIDX_FILE"
fi

eval "CURRENT_HOST=\$HOST_${HIDX}"

if [ -z "$CURRENT_HOST" ]; then
    logger -t LITE-WATCHDOG "ERROR: Cannot read host at index $HIDX"
    release_lock
    exit 1
fi
release_lock

if ping -q -4 -w 10 -c "$PC" "$CURRENT_HOST" >/tmp/lite_watchdog 2>&1; then
    # ONLINE
    acquire_lock
    if [ "$LOG_D" != "offline" ]; then
        date +"%A %d-%B %Y %T, Status: ONLINE (host: $CURRENT_HOST)" >> "$LOG_FILE"
    fi
    lines_reset "$GCNT_FILE"
    release_lock
    rm -f "$STAGE_FILE"

    if [ "x$LEDST" = "x1" ] && [ -w "$LEDON" ]; then
        echo "$LEDMAX" > "$LEDON" 2>/dev/null
    fi
    exit 0
else
    # OFFLINE
    acquire_lock
    GCNT_BEFORE="$(lines_count "$GCNT_FILE")"
    [ "$GCNT_BEFORE" -lt "$MAX_GLOBAL_COUNT" ] && lines_inc "$GCNT_FILE"
    GCNT="$(lines_count "$GCNT_FILE")"
    
    NEXT_HIDX=$(( (HIDX + 1) % HOST_COUNT ))
    echo "$NEXT_HIDX" > "$HIDX_FILE"
    release_lock

    date +"%A %d-%B %Y %T, Status: OFFLINE, host: $CURRENT_HOST ➜ Failed $GCNT out of $PRD" >> "$LOG_FILE"

    if [ "x$LEDST" = "x1" ] && [ -w "$LEDON" ]; then
        echo "0" > "$LEDON" 2>/dev/null
    fi

    if [ "$GCNT" -ge "$PRD" ]; then
        ACTION="$5"
        WAN="$(uci -q get watchdog.@watchdog[0].iface)"

        if [ -x /etc/lite_watchdog.user ]; then
            env -i \
              ACTION="$ACTION" PHASE="pre" \
              HOST_COUNT="$HOST_COUNT" PRD="$PRD" \
              GCNT_FILE="$GCNT_FILE" \
              GCNT="$GCNT" GLOBAL_THRESHOLD="$PRD" \
              LOG_FILE="$LOG_FILE" STAGE_FILE="$STAGE_FILE" \
              /bin/sh /etc/lite_watchdog.user >/dev/null 2>&1
        fi

        case "$ACTION" in
            reboot)
                date +"%A %d-%B %Y %T, Status: OFFLINE ➜ Action: Reboot" >> "$LOG_FILE" && sleep 5
                logger -t LITE-WATCHDOG "Reboot"
                reboot
                ;;
            wan)
                if [ ! -f "$STAGE_FILE" ]; then
                    date +"%A %d-%B %Y %T, Status: OFFLINE ➜ Action: Restarting interface" >> "$LOG_FILE" && sleep 5
                    logger -t LITE-WATCHDOG "Restarting network interface: \"$WAN\"."
                    : > "$STAGE_FILE"
                    ( ifdown "$WAN"; sleep 5; ifup "$WAN" ) &
                fi
                ;;
        esac

        if [ -f "$STAGE_FILE" ] && [ "$GCNT" -ge $((PRD + 1)) ]; then
            if [ -x /etc/lite_watchdog.user ]; then
                env -i \
                  ACTION="$5" PHASE="post" \
                  HOST_COUNT="$HOST_COUNT" PRD="$PRD" \
                  GCNT_FILE="$GCNT_FILE" \
                  GCNT="$GCNT" GLOBAL_THRESHOLD="$PRD" \
                  LOG_FILE="$LOG_FILE" STAGE_FILE="$STAGE_FILE" \
                  /bin/sh /etc/lite_watchdog.user >/dev/null 2>&1
            fi
        fi
    fi
fi

exit 0
