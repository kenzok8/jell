package converter

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

func ParseSS(link string) (*Proxy, error) {
	if !strings.HasPrefix(link, "ss://") {
		return nil, fmt.Errorf("invalid ss link")
	}

	link = strings.TrimPrefix(link, "ss://")

	var remark string
	if idx := strings.Index(link, "#"); idx != -1 {
		remark, _ = url.QueryUnescape(link[idx+1:])
		link = link[:idx]
	}

	var query string
	if idx := strings.Index(link, "?"); idx != -1 {
		query = link[idx+1:]
		link = link[:idx]
	}

	var method, password, server string
	var port int

	if strings.Contains(link, "@") {
		parts := strings.Split(link, "@")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid ss link format")
		}

		userinfo := parts[0]
		serverPort := parts[1]

		decoded, err := base64.RawURLEncoding.DecodeString(userinfo)
		if err != nil {
			decoded, err = base64.StdEncoding.DecodeString(userinfo)
			if err != nil {
				return nil, fmt.Errorf("failed to decode userinfo: %v", err)
			}
		}

		methodPassword := strings.SplitN(string(decoded), ":", 2)
		if len(methodPassword) != 2 {
			return nil, fmt.Errorf("invalid method:password format")
		}

		method = methodPassword[0]
		password = methodPassword[1]

		serverParts := strings.Split(serverPort, ":")
		if len(serverParts) != 2 {
			return nil, fmt.Errorf("invalid server:port format")
		}

		server = serverParts[0]
		port, err = strconv.Atoi(serverParts[1])
		if err != nil {
			return nil, fmt.Errorf("invalid port: %v", err)
		}
	} else {
		decoded, err := base64.RawURLEncoding.DecodeString(link)
		if err != nil {
			decoded, err = base64.StdEncoding.DecodeString(link)
			if err != nil {
				return nil, fmt.Errorf("failed to decode ss link: %v", err)
			}
		}

		parts := strings.SplitN(string(decoded), "@", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid ss link format")
		}

		methodPassword := strings.SplitN(parts[0], ":", 2)
		if len(methodPassword) != 2 {
			return nil, fmt.Errorf("invalid method:password format")
		}

		method = methodPassword[0]
		password = methodPassword[1]

		serverParts := strings.Split(parts[1], ":")
		if len(serverParts) != 2 {
			return nil, fmt.Errorf("invalid server:port format")
		}

		server = serverParts[0]
		port, err = strconv.Atoi(serverParts[1])
		if err != nil {
			return nil, fmt.Errorf("invalid port: %v", err)
		}
	}

	proxy := &Proxy{
		Name:     remark,
		Type:     ProxyTypeSS,
		Server:   server,
		Port:     port,
		Password: password,
		Cipher:   method,
		UDP:      true,
	}

	if query != "" {
		params, _ := url.ParseQuery(query)

		if plugin := params.Get("plugin"); plugin != "" {
			pluginParts := strings.SplitN(plugin, ";", 2)
			proxy.Plugin = pluginParts[0]

			if len(pluginParts) > 1 {
				opts := make(map[string]interface{})
				for _, opt := range strings.Split(pluginParts[1], ";") {
					kv := strings.SplitN(opt, "=", 2)
					if len(kv) == 2 {
						opts[kv[0]] = kv[1]
					}
				}
				proxy.PluginOpts = opts
			}
		}
	}

	if proxy.Name == "" {
		proxy.Name = fmt.Sprintf("%s:%d", server, port)
	}

	return proxy, nil
}
