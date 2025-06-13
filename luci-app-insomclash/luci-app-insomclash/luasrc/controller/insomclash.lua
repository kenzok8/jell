module("luci.controller.insomclash", package.seeall)

function index()
    entry({"admin", "vpn", "insomclash"}, alias("admin", "vpn", "insomclash", "home"), _("Insomclash"), 60)
    entry({"admin", "vpn", "insomclash", "home"}, template("insomclash/home"), _("Home"), 1)
    entry({"admin", "vpn", "insomclash", "dashboard"}, template("insomclash/dashboard"), _("Dashboard"), 2)
    entry({"admin", "vpn", "insomclash", "manager"}, template("insomclash/manager"), _("Manager"), 3)
    entry({"admin", "vpn", "insomclash", "converter"}, template("insomclash/converter"), _("Converter"), 4)
    entry({"admin", "vpn", "insomclash", "logs"}, template("insomclash/logs"), _("Logs"), 5)
    entry({"admin", "vpn", "insomclash", "editor"}, template("insomclash/editor"), nil)
    entry({"admin", "vpn", "insomclash", "edit_config"}, cbi("insomclash/config"), nil)
    entry({"admin", "vpn", "insomclash", "service_action"}, call("action_service"), nil)
    entry({"admin", "vpn", "insomclash", "get_logs"}, call("action_get_logs"), nil)
    entry({"admin", "vpn", "insomclash", "get_config"}, call("action_get_config"), nil)
    entry({"admin", "vpn", "insomclash", "set_config"}, call("action_set_config"), nil)
    entry({"admin", "vpn", "insomclash", "get_dashboard_info"}, call("action_get_dashboard_info"), nil)
    entry({"admin", "vpn", "insomclash", "load_editor_status"}, call("action_load_editor_status"), nil)
    entry({"admin", "vpn", "insomclash", "save_file"}, call("action_save_file"), nil)
    entry({"admin", "vpn", "insomclash", "load_file"}, call("action_load_file"), nil)
    entry({"admin", "vpn", "insomclash", "delete_file"}, call("action_delete_file"), nil)
    entry({"admin", "vpn", "insomclash", "upload_file"}, call("action_upload_file"), nil).leaf = true
    entry({"admin", "vpn", "insomclash", "create_file"}, call("action_create_file"), nil)
    entry({"admin", "vpn", "insomclash", "download_file"}, call("action_download_file"), nil)
    entry({"admin", "vpn", "insomclash", "backup_files"}, call("action_backup_files"), nil)
    entry({"admin", "vpn", "insomclash", "convert_proxy"}, call("action_convert_proxy"), nil)
end

-- Function to control insomclash service
function action_service()
    local http = require "luci.http"
    local util = require "luci.util"

    local action = http.formvalue("action")
    local result = { success = false, message = "Invalid action" }

    if action == "start" then
        util.exec("/etc/init.d/insomclash enable")
        util.exec("/etc/init.d/insomclash start")
        result = { success = true, message = "Insomclash service started" }
    elseif action == "stop" then
        util.exec("/etc/init.d/insomclash stop")
        util.exec("/etc/init.d/insomclash disable")
        result = { success = true, message = "Insomclash service stopped" }
    elseif action == "restart" then
        util.exec("/etc/init.d/insomclash restart")
        result = { success = true, message = "Insomclash service restarted" }
    elseif action == "status" then
        local status_output = util.exec("/etc/init.d/insomclash status")
        local running = false

        if status_output and status_output:match("running") then
            running = true
        else
            local pgrep_result = util.exec("pgrep -f insomclash")
            running = (pgrep_result and pgrep_result:len() > 0)
        end

        result = { success = true, running = running }
    end

    http.prepare_content("application/json")
    http.write_json(result)
end

-- Function to get logs from insomclash
function action_get_logs()
    local http = require "luci.http"
    local util = require "luci.util"
    local fs = require "nixio.fs"

    local clear = http.formvalue("clear")
    local logs = ""

    local insomclash_tmp_dir = "/tmp/insomclash"
    local core_log = insomclash_tmp_dir .. "/core.log"
    local insomclash_log = insomclash_tmp_dir .. "/insomclash.log"

    if clear == "1" then
        if fs.access(core_log) then
            local f = io.open(core_log, "w")
            if f then
                f:write("")
                f:close()
            end
        end

        if fs.access(insomclash_log) then
            local f = io.open(insomclash_log, "w")
            if f then
                f:write("")
                f:close()
            end
        end
    end

    local core_content = ""
    local insomclash_content = ""

    if fs.access(core_log) then
        core_content = fs.readfile(core_log) or ""
    end

    if fs.access(insomclash_log) then
        insomclash_content = fs.readfile(insomclash_log) or ""
    end

    if core_content == "" then
        core_content = "No core logs available. Make sure insomclash service is running or has been started at least once."
    end

    if insomclash_content == "" then
        insomclash_content = "No insomclash logs available. Make sure insomclash service is running or has been started at least once."
    end

    http.prepare_content("application/json")
    http.write_json({
        success = true,
        core_logs = core_content,
        insomclash_logs = insomclash_content
    })
end

-- Function to get UCI config
function action_get_config()
    local http = require "luci.http"
    local uci = require "luci.model.uci".cursor()

    local tunnel_mode = uci:get("insomclash", "config", "tunnel_mode") or "tproxy"
    local config_select = uci:get("insomclash", "config", "config_select") or "config.yaml"

    http.prepare_content("application/json")
    http.write_json({
        success = true,
        tunnel_mode = tunnel_mode,
        config_select = config_select
    })
end

-- Function to set UCI config
function action_set_config()
    local http = require "luci.http"
    local uci = require "luci.model.uci".cursor()

    local tunnel_mode = http.formvalue("tunnel_mode")
    local result = { success = false, message = "Invalid tunnel mode" }

    if tunnel_mode == "tproxy" or tunnel_mode == "tun" then
        uci:set("insomclash", "config", "tunnel_mode", tunnel_mode)
        uci:commit("insomclash")
        result = { success = true, message = "Tunnel mode updated to " .. tunnel_mode }
    end

    http.prepare_content("application/json")
    http.write_json(result)
end

-- Function to get dashboard info (IP and secret)
function action_get_dashboard_info()
    local http = require "luci.http"
    local uci = require "luci.model.uci".cursor()
    local util = require "luci.util"
    local fs = require "nixio.fs"

    local lan_ip = util.exec("uci -q get network.lan.ipaddr"):gsub("%s+", "")
    if lan_ip == "" then
        lan_ip = "192.168.1.1" 
    end

    local config_select = uci:get("insomclash", "config", "config_select") or "config.yaml"
    local config_path = "/etc/insomclash/config/" .. config_select

    local secret = ""
    local port = "9090"
    if fs.access(config_path) then
        local yq_secret = util.exec("yq eval '.secret' " .. config_path .. " 2>/dev/null"):gsub("%s+", "")
        if yq_secret and yq_secret ~= "" and yq_secret ~= "null" then
            secret = yq_secret
        else
            local grep_secret = util.exec("grep -E '^secret:' " .. config_path .. " 2>/dev/null | cut -d':' -f2"):gsub("%s+", "")
            if grep_secret and grep_secret ~= "" then
                secret = grep_secret
            end
        end

        local yq_port = util.exec("yq eval '.external-controller' " .. config_path .. " 2>/dev/null"):gsub("%s+", "")
        if yq_port and yq_port ~= "" and yq_port ~= "null" then
            local port_match = yq_port:match(":(%d+)$")
            if port_match then
                port = port_match
            end
        else
            local grep_port = util.exec("grep -E '^external-controller:' " .. config_path .. " 2>/dev/null | cut -d':' -f3"):gsub("%s+", "")
            if grep_port and grep_port ~= "" then
                port = grep_port
            end
        end
    end

    local dashboard_urls = {}
    if secret ~= "" then
        dashboard_urls.yacd = "http://" .. lan_ip .. ":" .. port .. "/ui/yacd/?hostname=" .. lan_ip .. "&port=" .. port .. "&secret=" .. secret
        dashboard_urls.metacubexd = "http://" .. lan_ip .. ":" .. port .. "/ui/metacubexd/?hostname=" .. lan_ip .. "&port=" .. port .. "&secret=" .. secret
        dashboard_urls.zashboard = "http://" .. lan_ip .. ":" .. port .. "/ui/zashboard/?hostname=" .. lan_ip .. "&port=" .. port .. "&secret=" .. secret
    end

    http.prepare_content("application/json")
    http.write_json({
        success = true,
        lan_ip = lan_ip,
        port = port,
        secret = secret,
        config_file = config_select,
        config_path = config_path,
        config_exists = fs.access(config_path),
        dashboard_urls = dashboard_urls
    })
end

-- Function to load editor status
function action_load_editor_status()
    local http = require "luci.http"
    local uci = require "luci.model.uci".cursor()

    local editor_file = uci:get("insomclash", "config", "editor_file") or "/etc/insomclash/config/config.yaml"
    local editor_theme = uci:get("insomclash", "config", "editor_theme") or "1"

    http.prepare_content("application/json")
    http.write_json({
        success = true,
        editor_file = editor_file,
        editor_theme = tonumber(editor_theme)
    })
end

-- Function to save file content
function action_save_file()
    local http = require "luci.http"
    local fs = require "nixio.fs"
    local uci = require "luci.model.uci".cursor()

    local file_path = http.formvalue("file_path")
    local content = http.formvalue("content")
    local theme = http.formvalue("theme")

    local result = { success = false, message = "Invalid parameters" }

    if file_path and content then
        local success = fs.writefile(file_path, content)
        if success then
            uci:set("insomclash", "config", "editor_file", file_path)
            if theme then
                uci:set("insomclash", "config", "editor_theme", theme)
            end
            uci:commit("insomclash")

            result = { success = true, message = "File saved successfully" }
        else
            result = { success = false, message = "Failed to save file" }
        end
    end

    http.prepare_content("application/json")
    http.write_json(result)
end

-- Function to load file content
function action_load_file()
    local http = require "luci.http"
    local fs = require "nixio.fs"

    local file_path = http.formvalue("file_path")
    local result = { success = false, message = "Invalid file path" }

    if file_path and fs.access(file_path) then
        local content = fs.readfile(file_path)
        if content then
            result = { success = true, content = content }
        else
            result = { success = false, message = "Failed to read file" }
        end
    else
        result = { success = false, message = "File not found" }
    end

    http.prepare_content("application/json")
    http.write_json(result)
end

-- Function to delete file
function action_delete_file()
    local http = require "luci.http"
    local fs = require "nixio.fs"

    local file_path = http.formvalue("file")

    if not file_path or file_path == "" then
        http.status(400, "Bad Request")
        http.prepare_content("application/json")
        http.write_json({ success = false, message = "No file specified" })
        return
    end

    if not fs.access(file_path) then
        http.status(404, "Not Found")
        http.prepare_content("application/json")
        http.write_json({ success = false, message = "File not found" })
        return
    end

    local success = fs.unlink(file_path)
    if success then
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=File deleted successfully&success=1")
    else
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Failed to delete file&success=0")
    end
end

-- Function to upload file
function action_upload_file()
    local http = require "luci.http"
    local fs = require "nixio.fs"
    local sys = require "luci.sys"

    local upload_type = http.formvalue("upload_type")
    local upload_dir = ""

    if upload_type == "config" then
        upload_dir = "/etc/insomclash/config/"
    elseif upload_type == "proxy" then
        upload_dir = "/etc/insomclash/proxy_providers/"
    elseif upload_type == "rule" then
        upload_dir = "/etc/insomclash/rule_providers/"
    elseif upload_type == "full_restore" then
        action_restore_backup()
        return
    else
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Invalid upload type&success=0")
        return
    end

    fs.mkdirr(upload_dir)

    local fd
    local filename
    local temp_file
    local is_tar_restore = false

    http.setfilehandler(
        function(meta, chunk, eof)
            if not fd then
                if meta and meta.file then
                    filename = meta.file

                    if filename:match("%.tar%.gz$") or filename:match("%.tgz$") then
                        temp_file = "/tmp/insomclash_individual_restore.tar.gz"
                        fd = nixio.open(temp_file, "w")
                        is_tar_restore = true
                    elseif filename:match("%.ya?ml$") then
                        fd = nixio.open(upload_dir .. filename, "w")
                        is_tar_restore = false
                    else
                        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Only YAML or tar.gz files allowed&success=0")
                        return
                    end
                    if not fd then
                        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Failed to create file&success=0")
                        return
                    end
                end
            end

            if chunk and fd then
                fd:write(chunk)
            end

            if eof and fd then
                fd:close()
                fd = nil

                if is_tar_restore then
                    action_restore_individual_folder(upload_type, temp_file)
                else
                    http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=File uploaded: " .. filename .. "&success=1")
                end
            end
        end
    )

    if not filename then
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=No file selected&success=0")
    end
end

-- Function to create new file
function action_create_file()
    local http = require "luci.http"
    local fs = require "nixio.fs"
    local disp = require "luci.dispatcher"

    local file_type = http.formvalue("file_type")
    local filename = http.formvalue("filename")

    if not filename or filename == "" then
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Filename required&success=0")
        return
    end

    local file_dir = ""
    if file_type == "config" then
        file_dir = "/etc/insomclash/config/"
    elseif file_type == "proxy" then
        file_dir = "/etc/insomclash/proxy_providers/"
    elseif file_type == "rule" then
        file_dir = "/etc/insomclash/rule_providers/"
    else
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Invalid file type&success=0")
        return
    end

    fs.mkdirr(file_dir)

    if not filename:match("%.ya?ml$") then
        filename = filename .. ".yaml"
    end

    local filepath = file_dir .. filename

    if fs.access(filepath) then
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=File already exists&success=0")
        return
    end

    local content = "# " .. filename .. "\n# Created: " .. os.date("%Y-%m-%d %H:%M:%S") .. "\n\n"
    if file_type == "config" then
        content = content .. "# Clash configuration file\nport: 7890\nsocks-port: 7891\nallow-lan: false\nmode: rule\nlog-level: info\n"
    elseif file_type == "proxy" then
        content = content .. "# Proxy provider configuration\nproxies:\n  # Add your proxies here\n"
    elseif file_type == "rule" then
        content = content .. "# Rule provider configuration\npayload:\n  # Add your rules here\n"
    end

    local success = fs.writefile(filepath, content)
    if success then
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "editor") .. "?file=" .. luci.http.urlencode(filepath))
    else
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Failed to create file&success=0")
    end
end

-- Function to download file
function action_download_file()
    local http = require "luci.http"
    local fs = require "nixio.fs"

    local filepath = http.formvalue("file")
    if not filepath or not fs.access(filepath) then
        http.status(404, "File not found")
        return
    end

    local filename = filepath:match("([^/]+)$")
    local content = fs.readfile(filepath)

    if content then
        http.header('Content-Disposition', 'attachment; filename="' .. filename .. '"')
        http.prepare_content("application/octet-stream")
        http.write(content)
    else
        http.status(500, "Failed to read file")
    end
end

-- Function to backup files
function action_backup_files()
    local http = require "luci.http"
    local fs = require "nixio.fs"
    local sys = require "luci.sys"

    local backup_type = http.formvalue("backup_type")
    local timestamp = os.date("%Y%m%d_%H%M%S")

    if backup_type == "full" then
        local backup_filename = "insomclash_backup_" .. timestamp .. ".tar.gz"
        local temp_file = "/tmp/" .. backup_filename

        local cmd = string.format("cd /etc && tar -czf %s insomclash/ 2>/dev/null", temp_file)
        local result = sys.exec(cmd)

        if fs.access(temp_file) then
            local content = fs.readfile(temp_file)
            if content then
                http.header('Content-Disposition', 'attachment; filename="' .. backup_filename .. '"')
                http.prepare_content("application/gzip")
                http.write(content)
                fs.unlink(temp_file)
            else
                http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Failed to read backup file&success=0")
            end
        else
            http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Failed to create backup&success=0")
        end

    else
        local folder_map = {
            config = "/etc/insomclash/config/",
            proxy = "/etc/insomclash/proxy_providers/",
            rule = "/etc/insomclash/rule_providers/"
        }

        local backup_dir = folder_map[backup_type]
        if not backup_dir or not fs.access(backup_dir) then
            http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Invalid backup type or directory not found&success=0")
            return
        end

        local backup_filename = "insomclash_" .. backup_type .. "_" .. timestamp .. ".tar.gz"
        local temp_file = "/tmp/" .. backup_filename

        local cmd = string.format("cd %s && find . -name '*.yaml' -o -name '*.yml' | tar -czf %s -T - 2>/dev/null", backup_dir, temp_file)
        local result = sys.exec(cmd)

        if not fs.access(temp_file) then
            cmd = string.format("cd %s && tar -czf %s --files-from=/dev/null", backup_dir, temp_file)
            result = sys.exec(cmd)
        end

        if fs.access(temp_file) then
            local content = fs.readfile(temp_file)
            if content then
                http.header('Content-Disposition', 'attachment; filename="' .. backup_filename .. '"')
                http.prepare_content("application/gzip")
                http.write(content)
                fs.unlink(temp_file)
            else
                http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Failed to read backup file&success=0")
            end
        else
            http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=No files to backup or backup failed&success=0")
        end
    end
end

-- Function to restore backup from uploaded tar.gz
function action_restore_backup()
    local http = require "luci.http"
    local fs = require "nixio.fs"
    local sys = require "luci.sys"

    local fd
    local filename
    local temp_file = "/tmp/insomclash_restore.tar.gz"

    http.setfilehandler(
        function(meta, chunk, eof)
            if not fd then
                if meta and meta.file then
                    filename = meta.file
                    if not (filename:match("%.tar%.gz$") or filename:match("%.tgz$")) then
                        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Only tar.gz files allowed for restore&success=0")
                        return
                    end
                    fd = nixio.open(temp_file, "w")
                    if not fd then
                        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Failed to create temp file&success=0")
                        return
                    end
                end
            end

            if chunk and fd then
                fd:write(chunk)
            end

            if eof and fd then
                fd:close()
                fd = nil

                local extract_success = false

                local backup_current = string.format("cd /etc && tar -czf /tmp/insomclash_backup_before_restore_%s.tar.gz insomclash/ 2>/dev/null", os.date("%Y%m%d_%H%M%S"))
                sys.exec(backup_current)

                local extract_cmd = string.format("cd /etc && tar -xzf %s 2>/dev/null", temp_file)
                local result = sys.exec(extract_cmd)

                if fs.access("/etc/insomclash") then
                    extract_success = true
                end

                fs.unlink(temp_file)

                if extract_success then
                    http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Backup restored successfully&success=1")
                else
                    http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Failed to restore backup - invalid file format&success=0")
                end
            end
        end
    )

    if not filename then
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=No file selected for restore&success=0")
    end
end

-- Function to restore individual folder from tar.gz
function action_restore_individual_folder(folder_type, temp_file)
    local http = require "luci.http"
    local fs = require "nixio.fs"
    local sys = require "luci.sys"

    if not temp_file or not fs.access(temp_file) then
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=No file selected for restore&success=0")
        return
    end

    local folder_map = {
        config = "/etc/insomclash/config/",
        proxy = "/etc/insomclash/proxy_providers/",
        rule = "/etc/insomclash/rule_providers/"
    }

    local target_dir = folder_map[folder_type]
    if not target_dir then
        fs.unlink(temp_file)
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Invalid folder type for restore&success=0")
        return
    end

    local timestamp = os.date("%Y%m%d_%H%M%S")
    local backup_current = string.format("cd %s && tar -czf /tmp/insomclash_%s_backup_before_restore_%s.tar.gz *.yaml *.yml 2>/dev/null", target_dir, folder_type, timestamp)
    sys.exec(backup_current)

    fs.mkdirr(target_dir)

    local extract_cmd = string.format("cd %s && tar -xzf %s --strip-components=1 2>/dev/null", target_dir, temp_file)
    local result = sys.exec(extract_cmd)

    fs.unlink(temp_file)

    local files_found = false
    if fs.access(target_dir) then
        local dir_iter = fs.dir(target_dir)
        if dir_iter then
            for file in dir_iter do
                if file:match("%.ya?ml$") then
                    files_found = true
                    break
                end
            end
        end
    end

    if files_found then
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=" .. folder_type:upper() .. " folder restored successfully&success=1")
    else
        http.redirect(luci.dispatcher.build_url("admin", "vpn", "insomclash", "manager") .. "?message=Failed to restore " .. folder_type .. " folder - no valid files found in backup&success=0")
    end
end

-- Function to convert proxy URLs to Clash YAML format
function action_convert_proxy()
    local http = require "luci.http"
    local util = require "luci.util"
    local json = require "luci.jsonc"

    local input = http.formvalue("proxy_input")
    local result = { success = false, message = "No input provided" }

    if input and input ~= "" then
        local proxies = {}
        local lines = {}

        if input:match("^https?://") then
            local subscription_content = fetch_subscription(input)
            if subscription_content then
                input = subscription_content
            else
                result = { success = false, message = "Failed to fetch subscription URL" }
                http.prepare_content("application/json")
                http.write_json(result)
                return
            end
        end

        for line in input:gmatch("[^\r\n]+") do
            line = line:gsub("^%s*(.-)%s*$", "%1") -- trim whitespace
            if line ~= "" and not line:match("^#") then
                table.insert(lines, line)
            end
        end

        for _, line in ipairs(lines) do
            local proxy = nil

            if line:match("^trojan://") then
                proxy = parse_trojan_url(line)
            elseif line:match("^vless://") then
                proxy = parse_vless_url(line)
            elseif line:match("^vmess://") then
                proxy = parse_vmess_url(line)
            elseif line:match("^ss://") then
                proxy = parse_ss_url(line)
            elseif line:match("^ssh://") or line:match("^[^@]+@[^:]+") then
                proxy = parse_ssh_url(line)
            end

            if proxy then
                table.insert(proxies, proxy)
            end
        end

        if #proxies > 0 then
            table.sort(proxies, function(a, b)
                if a.type == b.type then
                    return a.name < b.name
                end
                return a.type < b.type
            end)

            result = { success = true, proxies = proxies }
        else
            result = { success = false, message = "No valid proxy URLs found" }
        end
    end

    http.prepare_content("application/json")
    http.write_json(result)
end

-- Helper function to parse URL parameters
function parse_url_params(url)
    local parts = {}
    local params = {}

    local scheme, rest = url:match("^([^:]+)://(.+)$")
    if scheme and rest then
        parts.scheme = scheme

        local main_part, fragment = rest:match("^(.-)#(.*)$")
        if fragment then
            parts.fragment = fragment
            rest = main_part
        end

        local path_part, query = rest:match("^(.-)%?(.*)$")
        if query then
            rest = path_part
            for k, v in query:gmatch("([^&=]+)=([^&=]*)") do
                params[k] = v
            end
        end

        local userinfo, hostport = rest:match("^(.-)@(.+)$")
        if userinfo and hostport then
            local user, pass = userinfo:match("^([^:]*):?(.*)$")
            parts.user = user or ""
            parts.pass = pass or ""
        else
            hostport = rest
        end

        if hostport then
            local host, port = hostport:match("^([^:]+):?(%d*)$")
            parts.host = host or ""
            parts.port = port ~= "" and port or nil
        end
    end

    return parts, params
end

-- Function to parse Trojan URL
function parse_trojan_url(url)
    local parts, params = parse_url_params(url)
    local user = parts.user or ""
    local host = parts.host or ""
    local port = parts.port or "443"
    local name = parts.fragment and parts.fragment:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end) or "Trojan"
    local sni = params.sni or params.host or host

    local network = "tcp"
    if params.type then
        network = params.type
    elseif name:find(" ws ") or name:find("%[Trojan %- ws%]") then
        network = "ws"
    elseif name:find(" grpc ") or name:find("%[Trojan %- grpc%]") then
        network = "grpc"
    end

    local path = "/trojan"
    if params.path then
        path = params.path
    elseif name:find("antiporn") or name:find("AntiPorn") then
        path = "/trojan-antiporn"
    elseif name:find("antiads") or name:find("AntiADS") then
        path = "/trojan-antiads"
    end

    local tls = true
    if params.security then
        tls = params.security:lower() == "tls"
    elseif port == "80" or name:find("nonTLS") or name:find("nTLS") then
        tls = false
    end

    local proxy = {
        name = name,
        server = host,
        port = tonumber(port),
        type = "trojan",
        password = user,
        ["skip-cert-verify"] = true,
        sni = sni,
        udp = true
    }

    if network == "ws" then
        proxy.network = "ws"
        proxy["ws-opts"] = {
            path = path,
            headers = { Host = sni }
        }
    elseif network == "grpc" then
        proxy.network = "grpc"
        proxy["grpc-opts"] = {
            ["grpc-service-name"] = "trojan-service"
        }
    end

    return proxy
end

-- Function to parse VLESS URL
function parse_vless_url(url)
    local parts, params = parse_url_params(url)
    local user = parts.user or ""
    local host = parts.host or ""
    local port = parts.port or "443"
    local name = parts.fragment and parts.fragment:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end) or "VLESS"
    local sni = params.sni or params.host or host

    local network = "tcp"
    if params.type then
        network = params.type
    elseif name:find(" ws ") or name:find("%[VLESS %- ws%]") then
        network = "ws"
    elseif name:find(" grpc ") or name:find("%[VLESS %- grpc%]") then
        network = "grpc"
    end

    local path = "/vless"
    if params.path then
        path = params.path
    elseif name:find("antiporn") or name:find("AntiPorn") then
        path = "/vless-antiporn"
    elseif name:find("antiads") or name:find("AntiADS") then
        path = "/vless-antiads"
    end

    local tls = true
    if params.security then
        tls = params.security:lower() == "tls"
    elseif port == "80" or name:find("nonTLS") or name:find("nTLS") then
        tls = false
    end

    local proxy = {
        name = name,
        server = host,
        port = tonumber(port),
        type = "vless",
        uuid = user,
        cipher = "auto",
        tls = tls,
        ["skip-cert-verify"] = true,
        servername = sni,
        udp = true
    }

    if network == "ws" then
        proxy.network = "ws"
        proxy["ws-opts"] = {
            path = path,
            headers = { Host = sni }
        }
    elseif network == "grpc" then
        proxy.network = "grpc"
        proxy["grpc-opts"] = {
            ["grpc-service-name"] = "vless-service"
        }
    end

    return proxy
end

-- Function to parse VMess URL
function parse_vmess_url(url)
    local vmess_data = url:sub(9)
    local decoded = util.exec("echo '" .. vmess_data .. "' | base64 -d 2>/dev/null")

    if decoded and decoded ~= "" then
        local json = require "luci.jsonc"
        local data = json.parse(decoded)

        if data then
            local host = data.add or ""
            local port = data.port or "443"
            local uuid = data.id or ""
            local aid = data.aid or "0"
            local network = (data.net or "tcp"):lower()
            local tls = (data.tls or ""):lower() == "tls"
            local path = data.path or "/vmess"
            local sni = data.sni or data.host or host
            local name = data.ps or "VMess"

            if name:find(" ws ") or name:find("%[VMess %- ws%]") then
                network = "ws"
            elseif name:find(" grpc ") or name:find("%[VMess %- grpc%]") then
                network = "grpc"
            elseif name:find(" tcp ") or name:find("%[VMess %- tcp%]") then
                network = "http"
            end

            if name:find("nonTLS") or name:find("nTLS") then
                tls = false
            elseif name:find("TLS") then
                tls = true
            end

            local proxy = {
                name = name,
                server = host,
                port = tonumber(port),
                type = "vmess",
                uuid = uuid,
                alterId = tonumber(aid),
                cipher = "auto",
                tls = tls,
                ["skip-cert-verify"] = true,
                servername = sni,
                udp = true
            }

            if network == "ws" then
                proxy.network = "ws"
                proxy["ws-opts"] = {
                    path = path,
                    headers = { Host = sni }
                }
            elseif network == "grpc" then
                proxy.network = "grpc"
                proxy["grpc-opts"] = {
                    ["grpc-service-name"] = "vmess-service"
                }
            elseif network == "http" then
                proxy["http-opts"] = {
                    method = "GET",
                    path = { "/vmess-tcp" }
                }
            end

            return proxy
        end
    end

    return nil
end

-- Function to parse Shadowsocks URL
function parse_ss_url(url)
    local name = "Shadowsocks"
    local url_part = url

    if url:find("#") then
        local parts = {}
        for part in url:gmatch("[^#]+") do
            table.insert(parts, part)
        end
        if #parts >= 2 then
            url_part = parts[1]
            name = parts[2]:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end)
        end
    end

    url_part = url_part:sub(6)

    local cipher = ""
    local password = ""
    local host = ""
    local port = "443"

    if url_part:find("@") then
        local userinfo, hostport = url_part:match("^(.-)@(.+)$")
        if userinfo and hostport then
            local decoded = util.exec("echo '" .. userinfo .. "' | base64 -d 2>/dev/null")
            if decoded and decoded:find(":") then
                cipher, password = decoded:match("^([^:]+):(.+)$")
            end

            if hostport:find(":") then
                host, port = hostport:match("^([^:]+):(%d+)")
            else
                host = hostport
            end
        end
    else
        local decoded = util.exec("echo '" .. url_part .. "' | base64 -d 2>/dev/null")
        if decoded and decoded:find("@") then
            local methodpass, hostport = decoded:match("^(.-)@(.+)$")
            if methodpass and methodpass:find(":") then
                cipher, password = methodpass:match("^([^:]+):(.+)$")
            end
            if hostport and hostport:find(":") then
                host, port = hostport:match("^([^:]+):(%d+)")
            else
                host = hostport or ""
            end
        end
    end

    if cipher == "" then cipher = "aes-128-gcm" end
    if password == "" then password = "password" end
    if host == "" then host = "unknown" end

    local proxy = {
        name = name,
        server = host,
        port = tonumber(port),
        type = "ss",
        cipher = cipher,
        password = password,
        udp = true
    }

    return proxy
end

-- Function to parse SSH URL
function parse_ssh_url(url)
    local user = ""
    local pass = ""
    local host = ""
    local port = "22"
    local name = ""

    if url:match("^ssh://") then
        local parts, params = parse_url_params(url)
        user = parts.user or ""
        pass = parts.pass or ""
        host = parts.host or ""
        port = parts.port or "22"
        name = parts.fragment and parts.fragment:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end) or ("SSH-" .. host)
    else
        local match_result = { url:match("^([^:@]+):?([^@]*)@([^:]+):?(%d*)") }
        if #match_result >= 3 then
            user = match_result[1] or ""
            pass = match_result[2] or ""
            host = match_result[3] or ""
            port = match_result[4] ~= "" and match_result[4] or "22"
            name = "SSH-" .. host
        end
    end

    if host == "" then
        return nil
    end

    local proxy = {
        name = name,
        server = host,
        port = tonumber(port),
        type = "ss",
        cipher = "aes-256-gcm",
        password = pass ~= "" and (user .. ":" .. pass) or user,
        udp = true,
        plugin = "obfs-local",
        ["plugin-opts"] = {
            mode = "tls",
            host = host
        }
    }

    return proxy
end

-- Function to fetch subscription URL content
function fetch_subscription(url)
    local util = require "luci.util"
    local fs = require "nixio.fs"

    local temp_file = "/tmp/subscription_" .. os.time() .. ".txt"

    local success = false
    local content = ""

    local wget_cmd = string.format("wget -q -O '%s' --timeout=30 --tries=3 '%s' 2>/dev/null", temp_file, url)
    local wget_result = util.exec(wget_cmd)

    if fs.access(temp_file) then
        content = fs.readfile(temp_file)
        if content and content ~= "" then
            success = true
        end
    end

    if not success then
        local curl_cmd = string.format("curl -s -L -m 30 --retry 3 -o '%s' '%s' 2>/dev/null", temp_file, url)
        local curl_result = util.exec(curl_cmd)

        if fs.access(temp_file) then
            content = fs.readfile(temp_file)
            if content and content ~= "" then
                success = true
            end
        end
    end

    if not success then
        local uclient_cmd = string.format("uclient-fetch -q -O '%s' '%s' 2>/dev/null", temp_file, url)
        local uclient_result = util.exec(uclient_cmd)

        if fs.access(temp_file) then
            content = fs.readfile(temp_file)
            if content and content ~= "" then
                success = true
            end
        end
    end

    if fs.access(temp_file) then
        fs.unlink(temp_file)
    end

    if success then
        if content:match("^[A-Za-z0-9+/=]+$") and #content > 100 then
            local decoded = util.exec("echo '" .. content .. "' | base64 -d 2>/dev/null")
            if decoded and decoded ~= "" then
                content = decoded
            end
        end

        return content
    else
        return nil
    end
end
