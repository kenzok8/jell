package converter

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

func ParseTrojan(link string) (*Proxy, error) {
	if !strings.HasPrefix(link, "trojan://") {
		return nil, fmt.Errorf("invalid trojan link")
	}

	link = strings.TrimPrefix(link, "trojan://")

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

	parts := strings.Split(link, "@")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid trojan link format")
	}

	password := parts[0]
	serverPort := parts[1]

	serverParts := strings.Split(serverPort, ":")
	if len(serverParts) != 2 {
		return nil, fmt.Errorf("invalid server:port format")
	}

	server := serverParts[0]
	port, err := strconv.Atoi(serverParts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid port: %v", err)
	}

	proxy := &Proxy{
		Name:     remark,
		Type:     ProxyTypeTrojan,
		Server:   server,
		Port:     port,
		Password: password,
		UDP:      true,
	}

	if query != "" {
		params, _ := url.ParseQuery(query)

		if security := params.Get("security"); security == "tls" {
			proxy.TLS = true
		}

		if sni := params.Get("sni"); sni != "" {
			proxy.SNI = sni
		}

		if alpn := params.Get("alpn"); alpn != "" {
			proxy.ALPN = strings.Split(alpn, ",")
		}

		if network := params.Get("type"); network != "" {
			proxy.Network = network

			switch network {
			case "ws", "websocket":
				if path := params.Get("path"); path != "" {
					proxy.WSPath, _ = url.QueryUnescape(path)
				}
				if host := params.Get("host"); host != "" {
					proxy.WSHeaders = map[string]string{"Host": host}
				}
			case "grpc":
				if serviceName := params.Get("serviceName"); serviceName != "" {
					proxy.GRPCServiceName = serviceName
				}
			case "splithttp":
				if path := params.Get("path"); path != "" {
					proxy.SplitHTTPPath, _ = url.QueryUnescape(path)
				}
			case "xhttp":
				if path := params.Get("path"); path != "" {
					proxy.XHTTPPath, _ = url.QueryUnescape(path)
				}
			case "httpupgrade":
				if path := params.Get("path"); path != "" {
					proxy.HTTPUpgradePath, _ = url.QueryUnescape(path)
				}
			}
		}

		if fp := params.Get("fp"); fp != "" {
		}
	}

	if proxy.Name == "" {
		proxy.Name = fmt.Sprintf("%s:%d", server, port)
	}

	return proxy, nil
}
