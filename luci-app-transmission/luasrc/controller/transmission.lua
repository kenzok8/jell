-- Copyright 2012 Gabor Varga <vargagab@gmail.com>
-- Licensed to the public under the Apache License 2.0.

module("luci.controller.transmission", package.seeall)

function index()
	entry({"admin", "nas"}, firstchild(), _("NAS") , 45).dependent = false
	if not nixio.fs.access("/etc/config/transmission") then
		return
	end
	
	entry({"admin", "nas"}, firstchild(), "NAS", 44).dependent = false

	local page = entry({"admin", "nas", "transmission"}, cbi("transmission"), _("Transmission"))
	page.dependent = true

end
