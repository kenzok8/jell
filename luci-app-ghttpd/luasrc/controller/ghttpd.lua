
module("luci.controller.ghttpd", package.seeall)

function index()
  entry({"admin", "services", "ghttpd"}, alias("admin", "services", "ghttpd", "config"), _("Ghttpd"), 31).dependent = true
  entry({"admin", "services", "ghttpd", "config"}, cbi("ghttpd"))
end
