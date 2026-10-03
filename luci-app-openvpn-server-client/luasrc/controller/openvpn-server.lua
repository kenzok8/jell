--[[
LuCI - Lua Configuration Interface

Copyright 2025 LunaticKochiya<125438787@qq.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

$Id$
]]--
module("luci.controller.openvpn-server", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/openvpn") then
		return
	end

	entry({"admin", "services", "openvpn-server"},firstchild(), _("OpenVPN Server"), 1).dependent = true

	entry({"admin", "services", "openvpn-server", "general"}, cbi("openvpn-server/openvpn-server"), _("OpenVPN Server"), 1).leaf = true
	entry({"admin", "services", "openvpn-server", "client"},cbi("openvpn-server/openvpn-server_ovpn"), _("Client"), 2).leaf = true
	entry({"admin", "services", "openvpn-server", "log"},form("openvpn-server/openvpn-server_run_log"), _("Running log"), 3).leaf = true

	entry({"admin", "services", "openvpn-server","status"},call("act_status")).leaf=true
end

-- 内核是否提供 DCO (需要 ovpn.ko)
function dco_kernel_supported()
	local fs = require "nixio.fs"
	local krel = luci.sys.exec("uname -r"):gsub("%s+$", "")
	return (fs.access("/sys/module/ovpn") or fs.access("/lib/modules/" .. krel .. "/ovpn.ko")) and true or false
end

-- openvpn 是否编译了 DCO 支持
function dco_build_supported()
	local v = luci.sys.exec("openvpn --version 2>/dev/null | head -n1")
	return v:find("%[DCO%]") ~= nil
end

-- DCO 是否真的在工作: 优先看内核模块引用计数, 退路是查运行日志
function dco_in_use()
	local fs = require "nixio.fs"
	local rc = fs.readfile("/sys/module/ovpn/refcnt")
	if rc then
		-- 注意: gsub 返回两个值, 必须加括号只取第一个
		local n = tonumber((rc:gsub("%s+$", "")))
		if n and n > 0 then
			return true
		end
	end

	local uci = require("luci.model.uci").cursor()
	local logf = uci:get("openvpn", "myvpn", "log") or "/tmp/openvpn.log"
	local hit = luci.sys.exec("grep -m1 -E 'DCO device .* opened|ovpn-dco device' '" .. logf .. "' 2>/dev/null")
	return hit ~= nil and hit ~= ""
end

function act_status()
	local e = {}
	e.running = luci.sys.call("pgrep openvpn >/dev/null") == 0

	e.dco_kernel    = dco_kernel_supported()
	e.dco_build     = dco_build_supported()
	e.dco_supported = (e.dco_kernel and e.dco_build) and true or false
	e.dco_active    = dco_in_use()

	local uci = require("luci.model.uci").cursor()
	local ac  = uci:get("openvpn", "myvpn", "allow_compression")
	local lzo = uci:get("openvpn", "myvpn", "comp_lzo")
	local dis = uci:get("openvpn", "myvpn", "disable_dco")

	e.dco_disabled      = (dis == "1")
	e.allow_compression = ac  or ""
	e.comp_lzo          = lzo or ""
	-- 非法的压缩组合: allow-compression=no 与 comp_lzo 同时存在, openvpn 会拒绝启动
	e.conflict          = (ac == "no" and lzo ~= nil and lzo ~= "")

	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end
