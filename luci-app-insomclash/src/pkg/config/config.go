package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v2"
)

func Load(path string) (*Config, error) {
	config := &Config{}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return createDefaultConfig(path)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	err = yaml.Unmarshal(data, config)
	if err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	if config.Mihomo.ConfigPath != "" {
		apiURL, secret, err := ParseMihomoConfig(config.Mihomo.ConfigPath)
		if err == nil {
			config.Mihomo.APIURL = apiURL
			config.Mihomo.APISecret = secret
		}
	}

	return config, nil
}

func (c *Config) Save(path string) error {
	data, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	dir := filepath.Dir(path)
	err = os.MkdirAll(dir, 0755)
	if err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	err = os.WriteFile(path, data, 0644)
	if err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

func createDefaultConfig(path string) (*Config, error) {
	config := &Config{
		Server: ServerConfig{
			Port: getEnv("PORT", "8080"),
			Host: getEnv("HOST", "0.0.0.0"),
			Mode: getEnv("GIN_MODE", "release"),
		},
		Mihomo: MihomoConfig{
			CorePath:    "/usr/bin/mihomo",
			ConfigPath:  "/etc/insomclash/config/config.yaml",
			WorkingDir:  "/etc/insomclash",
			AutoRestart: true,
			Routing: RoutingConfig{
				TunDevice: "Meta",
			},
		},
		Logging: LoggingConfig{
			Level:      getEnv("LOG_LEVEL", "info"),
			File:       "/var/log/insomclash.log",
			MaxSize:    100,
			MaxBackups: 3,
			MaxAge:     28,
		},
		API: APIConfig{
			RateLimit:     100,
			Timeout:       30,
			EnableSwagger: true,
		},
	}

	err := config.Save(path)
	if err != nil {
		return nil, fmt.Errorf("failed to save default config: %w", err)
	}

	return config, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
