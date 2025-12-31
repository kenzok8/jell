package converter

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type vmessConfig struct {
	V    interface{} `json:"v"`
	PS   string      `json:"ps"`
	Add  string      `json:"add"`
	Port interface{} `json:"port"`
	ID   string      `json:"id"`
	Aid  interface{} `json:"aid"`
	Net  string      `json:"net"`
	Type string      `json:"type"`
	Host string      `json:"host"`
	Path string      `json:"path"`
	TLS  string      `json:"tls"`
	SNI  string      `json:"sni"`
	ALPN interface{} `json:"alpn"`
	SCY  string      `json:"scy"`
	FP   string      `json:"fp"`
	Mode string      `json:"mode"`
}

func getStringValue(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	case int:
		return strconv.Itoa(val)
	default:
		return fmt.Sprintf("%v", val)
	}
}

func ParseVMess(link string) (*Proxy, error) {
	if !strings.HasPrefix(link, "vmess://") {
		return nil, fmt.Errorf("invalid vmess link")
	}

	encoded := strings.TrimPrefix(link, "vmess://")

	decoded, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		decoded, err = base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, fmt.Errorf("failed to decode vmess link: %v", err)
		}
	}

	var config vmessConfig
	if err := json.Unmarshal(decoded, &config); err != nil {
		return nil, fmt.Errorf("failed to parse vmess config: %v", err)
	}

	portStr := getStringValue(config.Port)
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, fmt.Errorf("invalid port: %v", err)
	}

	alterId, _ := strconv.Atoi(getStringValue(config.Aid))

	cipher := config.SCY
	if cipher == "" {
		cipher = "auto"
	}

	proxy := &Proxy{
		Name:    config.PS,
		Type:    ProxyTypeVMess,
		Server:  config.Add,
		Port:    port,
		UUID:    config.ID,
		AlterId: alterId,
		Cipher:  cipher,
		UDP:     true,
	}

	if config.TLS == "tls" {
		proxy.TLS = true
	}

	if config.SNI != "" {
		proxy.SNI = config.SNI
	}

	alpnStr := getStringValue(config.ALPN)
	if alpnStr != "" {
		proxy.ALPN = strings.Split(alpnStr, ",")
	}

	if config.Net != "" {
		proxy.Network = config.Net

		switch config.Net {
		case "ws", "websocket":
			if config.Path != "" {
				proxy.WSPath = config.Path
			}
			if config.Host != "" {
				proxy.WSHeaders = map[string]string{"Host": config.Host}
			}
		case "grpc":
			if config.Path != "" {
				proxy.GRPCServiceName = config.Path
			}
		case "splithttp":
			if config.Path != "" {
				proxy.SplitHTTPPath = config.Path
			}
		case "xhttp":
			if config.Path != "" {
				proxy.XHTTPPath = config.Path
			}
		case "httpupgrade":
			if config.Path != "" {
				proxy.HTTPUpgradePath = config.Path
			}
		}
	}

	if proxy.Name == "" {
		proxy.Name = fmt.Sprintf("%s:%d", config.Add, port)
	}

	return proxy, nil
}
