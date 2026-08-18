#!/bin/sh
# bench-dispatch.sh — what one LuCI CGI dispatch costs the device, measured on
# the device itself so no network is in the number.
#
#   ssh root@192.168.1.1 'sh -s' < bench-dispatch.sh
#
# Two halves:
#   requests  curl against 127.0.0.1, median of 15, time_starttransfer + bytes.
#             The `en` catalog is the control: a 13-byte response that still
#             pays the whole dispatch, so the cost is the dispatch, not the
#             payload.
#   steps     the per-process cost of each phase every dispatch runs, timed as
#             50 ucode processes so the shell's own overhead averages out.
#             `spawn` is the floor; subtract it to read a phase's own cost.
#
# Needs a LuCI session for the view-page rows; it makes one and destroys it.
# Output is JSON on stdout, progress on stderr.

set -u
N_REQ=15
N_PROC=50

log() { echo "$@" >&2; }

# --- a throwaway session, so the authenticated rows are measurable ----------
SID=$(ubus call session login '{"username":"root","password":""}' 2>/dev/null |
      sed -n 's/.*"ubus_rpc_session": "\([a-f0-9]*\)".*/\1/p')
if [ -n "$SID" ]; then
  ubus call session set "{\"ubus_rpc_session\":\"$SID\",\"values\":{\"token\":\"0123456789abcdef0123456789abcdef\"}}" >/dev/null 2>&1
else
  log "warning: no passwordless root login; authenticated rows will be skipped"
fi

# median of N_REQ, printed as "<seconds> <bytes>"
req() {
  n=0
  while [ $n -lt $N_REQ ]; do
    curl -s -o /dev/null ${SID:+-b "sysauth_http=$SID"} \
      -w "%{time_starttransfer} %{size_download}\n" "$1"
    n=$((n + 1))
  done | sort -n | sed -n "$(( (N_REQ + 1) / 2 ))p"
}

row() { # name url
  set -- "$1" "$2"
  r=$(req "$2") || r="0 0"
  ms=$(echo "$r" | awk '{printf "%.1f", $1 * 1000}')
  by=$(echo "$r" | awk '{print $2}')
  log "  $1: $ms ms, $by B"
  printf '    {"what":"%s","url":"%s","ms":%s,"bytes":%s}' "$1" "$2" "$ms" "$by"
}

# per-process ms for a ucode snippet, over N_PROC processes
proc() { # name expr
  name=$1; expr=$2
  cat > /tmp/.bd-loop.sh <<EOF
i=0; while [ \$i -lt $N_PROC ]; do ucode -e '$expr' >/dev/null 2>&1; i=\$((i+1)); done
EOF
  t=$( { time -p sh /tmp/.bd-loop.sh; } 2>&1 | awk '/^real/ {print $2}' )
  [ -n "$t" ] || t=$( { time sh /tmp/.bd-loop.sh; } 2>&1 | awk '/real/ {gsub("m"," ");print $(NF-1)*60+$NF}' )
  ms=$(echo "$t $N_PROC" | awk '{printf "%.1f", $1 * 1000 / $2}')
  log "  $name: $ms ms/process"
  printf '    {"what":"%s","ms":%s}' "$name" "$ms"
  rm -f /tmp/.bd-loop.sh
}

CACHE=$(ls /tmp/luci-indexcache.*.json 2>/dev/null | head -1)
MENUD=$(ls /usr/share/luci/menu.d/*.json 2>/dev/null | wc -l)
CACHESZ=$(wc -c < "$CACHE" 2>/dev/null || echo 0)
LANG_UCI=$(uci get luci.main.lang 2>/dev/null || echo auto)

log "requests (median of $N_REQ, loopback):"
printf '{\n'
printf '  "device": %s,\n' "$(ubus call system board | tr -d '\n' | sed 's/  */ /g')"
printf '  "menuFiles": %s, "indexCacheBytes": %s, "lang": "%s",\n' "$MENUD" "$CACHESZ" "$LANG_UCI"
printf '  "requests": [\n'
row "page HTML (view node)"   "http://127.0.0.1/cgi-bin/luci/admin/status/routesj"; printf ',\n'
row "i18n catalog (en)"       "http://127.0.0.1/cgi-bin/luci/admin/translations/en"; printf ',\n'
row "i18n catalog (zh-cn)"    "http://127.0.0.1/cgi-bin/luci/admin/translations/zh-cn"; printf ',\n'
row "/admin/menu — once per session" "http://127.0.0.1/cgi-bin/luci/admin/menu"; printf ',\n'
row "static main.css"          "http://127.0.0.1/luci-static/aurora/main.css"; printf '\n'
printf '  ],\n'

log "dispatch steps (per process, over $N_PROC processes):"
printf '  "steps": [\n'
proc "fork + ucode VM"                 'x=1;'; printf ',\n'
proc "import luci.dispatcher"          'import d from "luci.dispatcher";'; printf ',\n'
proc "menu tree: stat + parse cache"   "import { open, glob, stat } from \"fs\"; for (let f in glob(\"/usr/share/luci/menu.d/*.json\",\"/usr/lib/lua/luci/controller/*.lua\",\"/usr/lib/lua/luci/controller/*/*.lua\")) stat(f); json(open(\"$CACHE\",\"r\"));"; printf ',\n'
proc "session.get + session.access"    "import { connect } from \"ubus\"; let u = connect(); u.call(\"session\",\"get\",{ubus_rpc_session:\"$SID\"}); u.call(\"session\",\"access\",{ubus_rpc_session:\"$SID\"});"; printf '\n'
printf '  ]\n}\n'

[ -n "$SID" ] && ubus call session destroy "{\"ubus_rpc_session\":\"$SID\"}" >/dev/null 2>&1
exit 0
