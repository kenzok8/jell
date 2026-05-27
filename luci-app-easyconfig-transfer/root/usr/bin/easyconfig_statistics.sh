#!/bin/sh

#
# (c) 2024 Cezary Jackiewicz <cezary@eko.one.pl>
#
# (c) 2024-2026 modified by Rafał Wabik (IceG) <https://github.com/4IceG>
#
# From eko.one.pl forum
#

TIMEISVALID=""
grep -q "time is valid" /tmp/state/dnsmasqsec 2>/dev/null && TIMEISVALID="yes"
[ -e /dev/rtc0 ] && TIMEISVALID="yes"
[ -z "$TIMEISVALID" ] && exit 0

DB=/tmp/easyconfig_statistics.json
SDB=/usr/lib/easyconfig/easyconfig_statistics.json.gz

LOCK=/var/lock/easyconfig_statistics.lock

lock $LOCK

MBACKUP=$(uci -q get easyconfig_transfer.traffic.external_backup)
MBACKUPATH=$(uci -q get easyconfig_transfer.traffic.external_path)
EXTERNAL_JSON="$MBACKUPATH/easyconfig_statistics.json"

json_valid() {
	local file="$1"
	[ -e "$file" ] || return 1
	[ -s "$file" ] || return 1
	jq -e 'type == "object"' "$file" >/dev/null 2>&1
}

safe_copy() {
	local src="$1"
	local dst="$2"
	if json_valid "$src"; then
		cp "$src" "$dst"
		return 0
	else
		logger -t easyconfig_statistics "OSTRZEŻENIE: plik $src zawiera nieprawidłowy JSON, pomijam kopiowanie"
		return 1
	fi
}

if [ ! -e "$DB" ]; then
	if [ "$MBACKUP" = "1" ] && [ -n "$MBACKUPATH" ] && [ -e "$EXTERNAL_JSON" ] && [ -e "$SDB" ]; then
		TMP_GZ=/tmp/easyconfig_statistics_gz_tmp.json
		zcat "$SDB" > "$TMP_GZ" 2>/dev/null
		if [ -e "$TMP_GZ" ]; then

			EXT_VALID=0
			GZ_VALID=0
			json_valid "$EXTERNAL_JSON" && EXT_VALID=1
			json_valid "$TMP_GZ"        && GZ_VALID=1

			if [ "$EXT_VALID" = "1" ] && [ "$GZ_VALID" = "1" ]; then
				EXT_SIZE=$(wc -c < "$EXTERNAL_JSON")
				GZ_SIZE=$(wc -c < "$TMP_GZ")
				if [ "$EXT_SIZE" -gt "$GZ_SIZE" ]; then
					cp "$EXTERNAL_JSON" "$DB"
				else
					cp "$TMP_GZ" "$DB"
					easyconfig_statistics.uc "init" "init" 0 0 0 "" 0
				fi
			elif [ "$EXT_VALID" = "1" ]; then
				logger -t easyconfig_statistics "OSTRZEŻENIE: plik gz zawiera nieprawidłowy JSON, używam zewnętrznej kopii"
				cp "$EXTERNAL_JSON" "$DB"
			elif [ "$GZ_VALID" = "1" ]; then
				logger -t easyconfig_statistics "OSTRZEŻENIE: zewnętrzna kopia zawiera nieprawidłowy JSON, używam pliku gz"
				cp "$TMP_GZ" "$DB"
				easyconfig_statistics.uc "init" "init" 0 0 0 "" 0
			else
				logger -t easyconfig_statistics "OSTRZEŻENIE: oba źródła zawierają nieprawidłowy JSON, inicjalizuję nową bazę"
				mkdir -p $(dirname "$SDB")
				echo "{}" > "$DB"
			fi
			rm -f "$TMP_GZ"
		else
			safe_copy "$EXTERNAL_JSON" "$DB" || echo "{}" > "$DB"
		fi
	elif [ "$MBACKUP" = "1" ] && [ -n "$MBACKUPATH" ] && [ -e "$EXTERNAL_JSON" ]; then
		safe_copy "$EXTERNAL_JSON" "$DB" || echo "{}" > "$DB"
	elif [ -e "$SDB" ]; then
		TMP_GZ=/tmp/easyconfig_statistics_gz_tmp.json
		zcat "$SDB" > "$TMP_GZ" 2>/dev/null
		if json_valid "$TMP_GZ"; then
			mv "$TMP_GZ" "$DB"
			easyconfig_statistics.uc "init" "init" 0 0 0 "" 0
		else
			logger -t easyconfig_statistics "OSTRZEŻENIE: plik gz zawiera nieprawidłowy JSON, inicjalizuję nową bazę"
			rm -f "$TMP_GZ"
			mkdir -p $(dirname "$SDB")
			echo "{}" > "$DB"
		fi
	else
		mkdir -p $(dirname "$SDB")
		echo "{}" > "$DB"
	fi
else
	if ! json_valid "$DB"; then
		logger -t easyconfig_statistics "OSTRZEŻENIE: bieżący plik $DB jest uszkodzony, próba odtworzenia"

		if [ "$MBACKUP" = "1" ] && [ -n "$MBACKUPATH" ] && json_valid "$EXTERNAL_JSON"; then
			logger -t easyconfig_statistics "Odtwarzanie z zewnętrznej kopii: $EXTERNAL_JSON"
			cp "$EXTERNAL_JSON" "$DB"
		elif [ -e "$SDB" ]; then
			TMP_GZ=/tmp/easyconfig_statistics_gz_tmp.json
			zcat "$SDB" > "$TMP_GZ" 2>/dev/null
			if json_valid "$TMP_GZ"; then
				logger -t easyconfig_statistics "Odtwarzanie z pliku gz: $SDB"
				mv "$TMP_GZ" "$DB"
			else
				logger -t easyconfig_statistics "BŁĄD: brak poprawnego źródła do odtworzenia, inicjalizuję nową bazę"
				rm -f "$TMP_GZ"
				echo "{}" > "$DB"
			fi
		else
			logger -t easyconfig_statistics "BŁĄD: brak źródła do odtworzenia, inicjalizuję nową bazę"
			echo "{}" > "$DB"
		fi
	else
		if [ "$MBACKUP" = "1" ] && [ -n "$MBACKUPATH" ] && [ -e "$EXTERNAL_JSON" ]; then
			if json_valid "$EXTERNAL_JSON"; then
				EXT_SIZE=$(wc -c < "$EXTERNAL_JSON")
				DB_SIZE=$(wc -c < "$DB")
				if [ "$EXT_SIZE" -gt "$DB_SIZE" ]; then
					cp "$EXTERNAL_JSON" "$DB"
				fi
			else
				logger -t easyconfig_statistics "OSTRZEŻENIE: zewnętrzna kopia $EXTERNAL_JSON jest uszkodzona, pomijam nadpisanie"
			fi
		fi
	fi
fi

# lan
BRIDGE=$(ubus call network.interface.lan status | jsonfilter -q -e @.l3_device)
if [ -e /sys/class/net/$BRIDGE/bridge ]; then
	for I in /sys/class/net/$BRIDGE/lower_*; do
		IFNAME=${I##*lower_}
		if [ -e $I/phy80211 ]; then
			STATIONS=$(iw dev "$IFNAME" station dump | awk -v IFNAME="$IFNAME" '{if($1 == "Station") {MAC=$2;station[MAC]=1} if($0 ~ /rx bytes:/) {rx[MAC]=$3} if($0 ~ /tx bytes:/) {tx[MAC]=$3} if($0 ~ /connected time:/) {connected[MAC]=$3}} END {for (w in station) {printf "%s;%s;%s;%s;%s\n", w, IFNAME, tx[w], rx[w], connected[w]}}')
			for S in $STATIONS; do
				DHCPNAME=$(awk '/'$(echo "$S" | cut -f1 -d";")'/{if ($4 != "*") {print $4}}' /tmp/dhcp.leases)
#				easyconfig_statistics.uc $(echo "$S" | cut -f1 -d";") $(echo "$S" | cut -f2 -d";") $(echo "$S" | cut -f3 -d";") $(echo "$S" | cut -f4 -d";") $(echo "$S" | cut -f5 -d";") "$DHCPNAME" 2
				easyconfig_statistics.uc ${S//;/ } "$DHCPNAME" 2
			done
		else
			PORTID=$(printf "%d" $(cat /sys/class/net/$BRIDGE/brif/$IFNAME/port_no))
			STATIONS=$(brctl showmacs $BRIDGE 2>/dev/null | awk '/^\s*'$PORTID'\s.*no/{print $2}')
			for S in $STATIONS; do
				DHCPNAME=$(awk '/'$S'/{if ($4 != "*") {print $4}}' /tmp/dhcp.leases)
				easyconfig_statistics.uc "$S" "$IFNAME" 0 0 999 "$DHCPNAME" 1
			done
		fi
	done
fi

# wan
WNAME=$(uci -q get easyconfig_transfer.global.network)

IFNAME=$(ubus call network.interface.$WNAME status | jsonfilter -q -e @.l3_device)
[ -n "$IFNAME" ] && easyconfig_statistics.uc "wan" "$IFNAME" $(cat /sys/class/net/$IFNAME/statistics/tx_bytes) $(cat /sys/class/net/$IFNAME/statistics/rx_bytes) 999 "" 0

PERIOD=$(uci -q get easyconfig_transfer.global.datarec_period)
[ -z "$PERIOD" ] && PERIOD=0
if [ "$PERIOD" = "0" ]; then
	lock -u $LOCK
	exit 0
fi
NOW=$(date +%s)
if [ -e "$SDB" ]; then
	DBTS=$(date +%s -r "$SDB")
	WRITETS=$((DBTS + (PERIOD * 60)))
else
	WRITETS=$((NOW - 1))
fi
if [ $WRITETS -le $NOW ]; then
	if json_valid "$DB"; then
		gzip -k "$DB"
		mv "$DB.gz" "$SDB"
		sync
	else
		logger -t easyconfig_statistics "OSTRZEŻENIE: $DB jest uszkodzony, pomijam zapis do archiwum gz"
	fi
fi
if [ "$MBACKUP" = "1" ]; then
	sleep 10
	if json_valid "$DB"; then
		cp "$DB" "$MBACKUPATH/easyconfig_statistics.json"
	else
		logger -t easyconfig_statistics "OSTRZEŻENIE: $DB jest uszkodzony, pomijam kopię zewnętrzną"
	fi
fi

lock -u $LOCK

exit 0
