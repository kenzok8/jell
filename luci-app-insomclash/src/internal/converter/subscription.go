package converter

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func FetchSubscription(url string) ([]*Proxy, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch subscription: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("subscription returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read subscription body: %v", err)
	}

	decoded, err := base64.StdEncoding.DecodeString(string(body))
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(string(body))
		if err != nil {
			decoded = body
		}
	}

	lines := strings.Split(string(decoded), "\n")

	var links []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		links = append(links, line)
	}

	return ParseLinks(links)
}

func ParseSubscription(content string) ([]*Proxy, error) {
	decoded, err := base64.StdEncoding.DecodeString(content)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(content)
		if err != nil {
			decoded = []byte(content)
		}
	}

	lines := strings.Split(string(decoded), "\n")

	var links []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		links = append(links, line)
	}

	return ParseLinks(links)
}
