package handler

import (
	"bufio"
	"encoding/json"
	"net/http"

	"fusiontunx/internal/service"
	"fusiontunx/pkg/config"

	"github.com/gin-gonic/gin"
)

type AppHandler struct {
	config        *config.Config
	mihomoService *service.MihomoService
	configPath    string
}

func NewAppHandler(cfg *config.Config, mihomoService *service.MihomoService, configPath string) *AppHandler {
	return &AppHandler{
		config:        cfg,
		mihomoService: mihomoService,
		configPath:    configPath,
	}
}

// GetConfig godoc
// @Summary Get application configuration
// @Description Get current FusionTunX application configuration
// @Tags FusionTunX App
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /app/config [get]
func (h *AppHandler) GetConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"mihomo": h.mihomoService.GetAppConfig(),
		"logging": gin.H{
			"level": h.config.Logging.Level,
		},
	})
}

// GetIPv4 godoc

// @Summary Get IPv4 address
// @Description Get current IPv4 address
// @Tags FusionTunX App
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Failure 503 {object} map[string]interface{}
// @Router /app/ipv4 [get]
func (h *AppHandler) GetIPv4(c *gin.Context) {
	client := &http.Client{}
	req, err := http.NewRequest("GET", "https://api-ipv4.ip.sb/ip", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create request",
		})
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "Failed to get IPv4 address",
		})
		return
	}
	defer resp.Body.Close()

	var ip string
	scanner := bufio.NewScanner(resp.Body)
	if scanner.Scan() {
		ip = scanner.Text()
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"ip": ip,
		},
	})
}

// GetIPv6 godoc
// @Summary Get IPv6 address
// @Description Get current IPv6 address
// @Tags FusionTunX App
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Failure 503 {object} map[string]interface{}
// @Router /app/ipv6 [get]
func (h *AppHandler) GetIPv6(c *gin.Context) {
	client := &http.Client{}
	req, err := http.NewRequest("GET", "https://api-ipv6.ip.sb/ip", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create request",
		})
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "Failed to get IPv6 address",
		})
		return
	}
	defer resp.Body.Close()

	var ip string
	scanner := bufio.NewScanner(resp.Body)
	if scanner.Scan() {
		ip = scanner.Text()
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"ip": ip,
		},
	})
}

// GetGeoIPv4 godoc
// @Summary Get IPv4 geolocation
// @Description Get IPv4 address with geolocation information
// @Tags FusionTunX App
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Failure 503 {object} map[string]interface{}
// @Router /app/geo/ipv4 [get]
func (h *AppHandler) GetGeoIPv4(c *gin.Context) {
	type GeoIPResponse struct {
		IP           string  `json:"ip"`
		Country      string  `json:"country"`
		CountryCode  string  `json:"country_code"`
		Region       string  `json:"region"`
		RegionCode   string  `json:"region_code"`
		City         string  `json:"city"`
		Latitude     float64 `json:"latitude"`
		Longitude    float64 `json:"longitude"`
		Timezone     string  `json:"timezone"`
		ASN          int     `json:"asn"`
		Organization string  `json:"organization"`
		ISP          string  `json:"isp"`
	}

	client := &http.Client{}
	req, err := http.NewRequest("GET", "https://api-ipv4.ip.sb/geoip", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create request",
		})
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "Failed to get IPv4 geolocation",
		})
		return
	}
	defer resp.Body.Close()

	var geoData GeoIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&geoData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to parse geolocation data",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    geoData,
	})
}

// GetGeoIPv6 godoc
// @Summary Get IPv6 geolocation
// @Description Get IPv6 address with geolocation information
// @Tags FusionTunX App
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Failure 503 {object} map[string]interface{}
// @Router /app/geo/ipv6 [get]
func (h *AppHandler) GetGeoIPv6(c *gin.Context) {
	type GeoIPResponse struct {
		IP           string  `json:"ip"`
		Country      string  `json:"country"`
		CountryCode  string  `json:"country_code"`
		Region       string  `json:"region"`
		RegionCode   string  `json:"region_code"`
		City         string  `json:"city"`
		Latitude     float64 `json:"latitude"`
		Longitude    float64 `json:"longitude"`
		Timezone     string  `json:"timezone"`
		ASN          int     `json:"asn"`
		Organization string  `json:"organization"`
		ISP          string  `json:"isp"`
	}

	client := &http.Client{}
	req, err := http.NewRequest("GET", "https://api-ipv6.ip.sb/geoip", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create request",
		})
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "Failed to get IPv6 geolocation",
		})
		return
	}
	defer resp.Body.Close()

	var geoData GeoIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&geoData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to parse geolocation data",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    geoData,
	})
}

// UpdateConfig godoc
// @Summary Update application configuration
// @Description Update FusionTunX application configuration
// @Tags FusionTunX App
// @Accept json
// @Produce json
// @Param config body map[string]interface{} true "Configuration to update"
// @Success 200 {object} map[string]interface{} "Success message"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /app/config [put]
func (h *AppHandler) UpdateConfig(c *gin.Context) {
	var req struct {
		Mihomo  *config.MihomoConfig `json:"mihomo"`
		Logging *struct {
			Level string `json:"level"`
		} `json:"logging"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	needsRestart := false

	if req.Mihomo != nil {
		h.config.Mihomo.CorePath = req.Mihomo.CorePath
		h.config.Mihomo.ConfigPath = req.Mihomo.ConfigPath
		h.config.Mihomo.WorkingDir = req.Mihomo.WorkingDir
		h.config.Mihomo.AutoRestart = req.Mihomo.AutoRestart
		h.config.Mihomo.LogFile = req.Mihomo.LogFile
		h.config.Mihomo.APIURL = req.Mihomo.APIURL
		h.config.Mihomo.APISecret = req.Mihomo.APISecret
		h.config.Mihomo.Routing = req.Mihomo.Routing
		needsRestart = req.Mihomo.AutoRestart && h.mihomoService.GetStatus() == "running"
	}

	if req.Logging != nil && req.Logging.Level != "" {
		h.config.Logging.Level = req.Logging.Level
	}

	if err := h.config.Save(h.configPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "failed to save config: " + err.Error(),
		})
		return
	}

	if needsRestart {
		if err := h.mihomoService.Restart(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "config updated but failed to restart mihomo: " + err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Configuration updated and mihomo restarted successfully",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Configuration updated successfully. Restart application to apply logging changes.",
	})
}
