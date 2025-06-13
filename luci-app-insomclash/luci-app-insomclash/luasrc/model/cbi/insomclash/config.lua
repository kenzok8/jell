local m, s, o

m = Map("insomclash", translate("Insomclash Configuration"), translate("Configure Insomclash tunnel mode and other settings"))

s = m:section(NamedSection, "config", "insomclash", translate("General Settings"))
s.addremove = false

o = s:option(ListValue, "config_select", translate("Config"), translate("Select configuration file"))
local config_dir = "/etc/insomclash/config"
local fs = require "nixio.fs"
if fs.access(config_dir) then
	for file in fs.dir(config_dir) do
		if file:match("%.yaml$") or file:match("%.yml$") then
			o:value(file, file)
		end
	end
end
o.default = "config.yaml"

o = s:option(ListValue, "tunnel_mode", translate("Mode"), translate("Select tunnel mode: TPROXY or TUN"))
o:value("tproxy", "TPROXY")
o:value("tun", "TUN")
o.default = "tproxy"

return m
