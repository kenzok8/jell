package handler

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"

	"fusiontunx/internal/service"
	"fusiontunx/pkg/config"

	"github.com/gin-gonic/gin"
)

type MihomoHandler struct {
	mihomoService *service.MihomoService
	appConfig     *config.Config
}

func NewMihomoHandler(mihomoService *service.MihomoService, appConfig *config.Config) *MihomoHandler {
	return &MihomoHandler{
		mihomoService: mihomoService,
		appConfig:     appConfig,
	}
}

func (h *MihomoHandler) createRequest(method, url string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}
	if h.appConfig.Mihomo.APISecret != "" {
		req.Header.Set("Authorization", "Bearer "+h.appConfig.Mihomo.APISecret)
	}
	return req, nil
}

// GetStatus godoc
// @Summary Get mihomo status
// @Description Get current status of mihomo service
// @Tags Mihomo
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /mihomo/status [get]
func (h *MihomoHandler) GetStatus(c *gin.Context) {
	status := h.mihomoService.GetStatus()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"running": status == "running",
		},
	})
}

// Start godoc
// @Summary Start mihomo service
// @Description Start the mihomo service
// @Tags Mihomo
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /mihomo/start [post]
func (h *MihomoHandler) Start(c *gin.Context) {
	err := h.mihomoService.Start()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Mihomo service started"})
}

// Stop godoc
// @Summary Stop mihomo service
// @Description Stop the mihomo service
// @Tags Mihomo
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /mihomo/stop [post]
func (h *MihomoHandler) Stop(c *gin.Context) {
	err := h.mihomoService.Stop(true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Mihomo service stopped"})
}

// Restart godoc
// @Summary Restart mihomo service
// @Description Restart the mihomo service
// @Tags Mihomo
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /mihomo/restart [post]
func (h *MihomoHandler) Restart(c *gin.Context) {
	err := h.mihomoService.Restart()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Mihomo service restarted"})
}

// ProxyToMihomoAPI godoc
// @Summary Proxy to Mihomo API
// @Description Proxy requests to Mihomo core API (port 9090)
// @Tags Mihomo
// @Accept json
// @Produce json
// @Param path path string true "API path (e.g., /version, /proxies, /rules)"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 503 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /mihomo/api/{path} [get]
func (h *MihomoHandler) ProxyToMihomoAPI(c *gin.Context) {
	status := h.mihomoService.GetStatus()
	if status != "running" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "mihomo is not running",
			"status":  status,
		})
		return
	}

	path := c.Param("path")
	url := fmt.Sprintf("%s%s", h.appConfig.Mihomo.APIURL, path)

	req, err := h.createRequest("GET", url, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to create request",
		})
		return
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "Failed to connect to Mihomo API",
		})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to read Mihomo API response",
		})
		return
	}

	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), body)
}

// GetCoreVersion godoc

// @Description Get the version of mihomo core binary (works even when service is not running)
// @Tags Mihomo
// @Produce json
// @Success 200 {object} map[string]interface{} "Core version information"
// @Failure 500 {object} map[string]interface{} "Error message"
// @Router /mihomo/core-version [get]
func (h *MihomoHandler) GetCoreVersion(c *gin.Context) {
	corePath := h.appConfig.Mihomo.CorePath
	if corePath == "" {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "core path not configured",
		})
		return
	}

	cmd := exec.Command(corePath, "-v")
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "failed to get core version: " + err.Error(),
		})
		return
	}

	versionStr := strings.TrimSpace(string(output))
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"version": versionStr,
		},
	})
}

// GetDashboardInfo godoc
// @Summary Get Mihomo dashboard information
// @Description Get external-controller port, secret, and available dashboards from ui directory
// @Tags Mihomo
// @Produce json
// @Success 200 {object} map[string]interface{} "Dashboard information"
// @Failure 500 {object} map[string]interface{} "Error message"
// @Router /mihomo/dashboard-info [get]
func (h *MihomoHandler) GetDashboardInfo(c *gin.Context) {
	uiPath := h.appConfig.Mihomo.WorkingDir + "/ui"
	var availableDashboards []string

	entries, err := os.ReadDir(uiPath)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				availableDashboards = append(availableDashboards, entry.Name())
			}
		}
	}

	port := "9090"
	if h.appConfig.Mihomo.APIURL != "" {
		parts := strings.Split(h.appConfig.Mihomo.APIURL, ":")
		if len(parts) >= 3 {
			port = parts[2]
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"port":       port,
			"secret":     h.appConfig.Mihomo.APISecret,
			"dashboards": availableDashboards,
		},
	})
}
