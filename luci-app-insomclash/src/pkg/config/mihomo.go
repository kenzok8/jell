package config

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

type MihomoExternalConfig struct {
	ExternalController string `yaml:"external-controller"`
	Secret             string `yaml:"secret"`
}

func ParseMihomoConfig(configPath string) (apiURL string, secret string, err error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return "", "", fmt.Errorf("failed to read mihomo config: %w", err)
	}

	var mihomoConfig MihomoExternalConfig
	if err := yaml.Unmarshal(data, &mihomoConfig); err != nil {
		return "", "", fmt.Errorf("failed to parse mihomo config: %w", err)
	}

	if mihomoConfig.ExternalController == "" {
		mihomoConfig.ExternalController = "127.0.0.1:9090"
	}

	if !strings.HasPrefix(mihomoConfig.ExternalController, "http://") &&
		!strings.HasPrefix(mihomoConfig.ExternalController, "https://") {
		apiURL = "http://" + mihomoConfig.ExternalController
	} else {
		apiURL = mihomoConfig.ExternalController
	}

	secret = mihomoConfig.Secret

	return apiURL, secret, nil
}
