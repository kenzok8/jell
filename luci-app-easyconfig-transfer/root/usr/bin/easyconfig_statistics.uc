#!/usr/bin/ucode
'use strict';

//
// (c) 2023 Cezary Jackiewicz <cezary@eko.one.pl>
//
// (c) 2025-2026 modified by Rafał Wabik (IceG) <https://github.com/4IceG>
//
// From eko.one.pl forum
//

import { readfile, writefile, rename, unlink, error } from "fs";

let filename = `/tmp/easyconfig_statistics.json`;
let filename_tmp = `/tmp/easyconfig_statistics.json.tmp`;

let MAC       = shift(ARGV);
let IFNAME    = shift(ARGV);
let TX        = shift(ARGV);
let RX        = shift(ARGV);
let CONNECTED = shift(ARGV);
let DHCPNAME  = shift(ARGV);
let TYPE      = shift(ARGV);

if (!MAC || !IFNAME || !TYPE) {
	warn("Usage: easyconfig_statistics.uc <MAC> <IFNAME> <TX> <RX> <CONNECTED> <DHCPNAME> <TYPE>\n");
	exit(1);
}

// compatibility with old scripts
MAC = replace(MAC, /:/g, "_");

if (!CONNECTED) CONNECTED = 0;
if (!TX)        TX = 0;
if (!RX)        RX = 0;

TX        = int(TX);
RX        = int(RX);
TYPE      = int(TYPE);
CONNECTED = int(CONNECTED);

let ts     = localtime();
let day    = sprintf("%04d%02d%02d", ts.year, ts.mon, ts.mday);
let hour   = sprintf("%02d", ts.hour);
let ts_now = sprintf("%04d%02d%02d%02d%02d", ts.year, ts.mon, ts.mday, ts.hour, ts.min);

function safe_write(data) {
	let serialized = sprintf("%J", data);
	if (!serialized || length(serialized) < 2) {
		warn("easyconfig_statistics.uc: błąd serializacji danych, zapis pominięty\n");
		return false;
	}

	let verify = null;
	try { verify = json(serialized); }
	catch { verify = null; }
	if (verify === null) {
		warn("easyconfig_statistics.uc: walidacja JSON nie powiodła się, zapis pominięty\n");
		return false;
	}

	let ret = writefile(filename_tmp, serialized);
	if (!ret) {
		warn("easyconfig_statistics.uc: nie można zapisać pliku tymczasowego\n");
		unlink(filename_tmp);
		return false;
	}

	if (!rename(filename_tmp, filename)) {
		warn("easyconfig_statistics.uc: nie można zastąpić pliku docelowego (rename)\n");
		unlink(filename_tmp);
		return false;
	}
	return true;
}

let db = {};
let content = readfile(filename);
if (content) {
	try { db = json(content); }
	catch {
		warn("easyconfig_statistics.uc: uszkodzony JSON w pliku bazy, resetowanie do {}\n");
		db = {};
	}

	if (type(db) != "object" || db === null) {
		warn("easyconfig_statistics.uc: nieprawidłowy typ danych w bazie, resetowanie do {}\n");
		db = {};
	}
}

let tmp = null;

if (IFNAME == "init") {
	for (let key1 in db) {
		if (type(db[key1]) == "object") {
			for (let key2 in db[key1]) {
				if (type(db[key1][key2]) == "object") {
					db[key1][key2].last_tx = 0;
					db[key1][key2].last_rx = 0;
				}
			}
		}
	}
	safe_write(db);
	exit(0)
}

if (IFNAME == "delete") {
	tmp = db[MAC];
	if (tmp) {
		delete db[MAC];
		safe_write(db);
	}
	exit(0)
}

tmp = db[MAC];
if (!tmp) {
	db[MAC] = {};
	db[MAC].first_seen = ts_now;
}

if (DHCPNAME)
	db[MAC].dhcpname = DHCPNAME;

db[MAC].type = TYPE;

tmp = db[MAC][IFNAME];
if (!tmp) {
	db[MAC][IFNAME] = {};
	db[MAC][IFNAME].last_tx = 0;
	db[MAC][IFNAME].last_rx = 0;
	db[MAC][IFNAME].first_seen = ts_now;
}

let last_tx = int(db[MAC][IFNAME].last_tx);
let last_rx = int(db[MAC][IFNAME].last_rx);

tmp = db[MAC][IFNAME][day];
if (!tmp) {
	db[MAC][IFNAME][day] = {};
	db[MAC][IFNAME][day].total_tx = 0;
	db[MAC][IFNAME][day].total_rx = 0;
	db[MAC][IFNAME][day].hours = {};
}

if (!db[MAC][IFNAME][day].hours)
	db[MAC][IFNAME][day].hours = {};

let total_tx = int(db[MAC][IFNAME][day].total_tx);
let total_rx = int(db[MAC][IFNAME][day].total_rx);

let dtx = TX - last_tx;
if (dtx < 0) dtx = TX;

let drx = RX - last_rx;
if (drx < 0) drx = RX;

if (CONNECTED <= 60) {
	dtx = TX;
	drx = RX;
}

db[MAC][IFNAME][day].total_tx = total_tx + dtx;
db[MAC][IFNAME][day].total_rx = total_rx + drx;

if (dtx > 0 || drx > 0) {
	if (!db[MAC][IFNAME][day].hours[hour]) {
		db[MAC][IFNAME][day].hours[hour] = {
			total_tx: 0,
			total_rx: 0
		};
	}

	let hour_tx = int(db[MAC][IFNAME][day].hours[hour].total_tx);
	let hour_rx = int(db[MAC][IFNAME][day].hours[hour].total_rx);

	db[MAC][IFNAME][day].hours[hour].total_tx = hour_tx + dtx;
	db[MAC][IFNAME][day].hours[hour].total_rx = hour_rx + drx;
}

db[MAC][IFNAME].last_tx = TX;
db[MAC][IFNAME].last_rx = RX;
db[MAC][IFNAME].last_seen = ts_now;
db[MAC].last_seen = ts_now;

safe_write(db);
exit(0);
