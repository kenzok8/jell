package converter

import (
	"fmt"
	"strings"
)

func ParseLink(link string) (*Proxy, error) {
	link = strings.TrimSpace(link)

	if strings.HasPrefix(link, "vmess://") {
		return ParseVMess(link)
	} else if strings.HasPrefix(link, "vless://") {
		return ParseVLess(link)
	} else if strings.HasPrefix(link, "trojan://") {
		return ParseTrojan(link)
	} else if strings.HasPrefix(link, "ss://") {
		return ParseSS(link)
	}

	return nil, fmt.Errorf("unsupported link format: %s", link[:min(20, len(link))])
}

func ParseLinks(links []string) ([]*Proxy, error) {
	var proxies []*Proxy
	var errors []string

	for _, link := range links {
		if link == "" {
			continue
		}

		proxy, err := ParseLink(link)
		if err != nil {
			errors = append(errors, err.Error())
			continue
		}

		proxies = append(proxies, proxy)
	}

	if len(proxies) == 0 && len(errors) > 0 {
		return nil, fmt.Errorf("failed to parse any links: %v", errors)
	}

	return proxies, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
