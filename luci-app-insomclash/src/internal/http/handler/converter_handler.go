package handler

import (
	"net/http"
	"strings"

	"insomclash/internal/converter"

	"github.com/gin-gonic/gin"
)

type ConverterHandler struct{}

func NewConverterHandler() *ConverterHandler {
	return &ConverterHandler{}
}

type ParseRequest struct {
	URL     string `json:"url" example:"https://example.com/sub or vmess://..."`
	Content string `json:"content,omitempty" example:"base64 encoded proxy list"`
}

type ParseResponse struct {
	Success bool               `json:"success"`
	Proxies []*converter.Proxy `json:"proxies,omitempty"`
	Count   int                `json:"count"`
	Error   string             `json:"error,omitempty"`
}

// ParseProxies godoc
// @Summary Parse proxy links or subscription
// @Description Auto-detects and parses: subscription URLs (http/https), single proxy links (vmess/vless/trojan/ss), or base64 content
// @Description - For subscription URL: {"url": "https://example.com/sub"}
// @Description - For single link: {"url": "vmess://..."}
// @Description - For base64 content: {"content": "base64..."}
// @Tags Converter
// @Accept json
// @Produce json
// @Param request body ParseRequest true "Parse request with either url or content"
// @Success 200 {object} ParseResponse
// @Failure 400 {object} ParseResponse
// @Failure 500 {object} ParseResponse
// @Router /converter/parse [post]

func (h *ConverterHandler) ParseProxies(c *gin.Context) {
	var req ParseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ParseResponse{
			Success: false,
			Error:   "invalid request: " + err.Error(),
		})
		return
	}

	var proxies []*converter.Proxy
	var err error

	if req.Content != "" && req.Content != "string" {
		proxies, err = converter.ParseSubscription(req.Content)
	} else if req.URL != "" {
		if strings.HasPrefix(req.URL, "http://") || strings.HasPrefix(req.URL, "https://") {
			proxies, err = converter.FetchSubscription(req.URL)
		} else if strings.HasPrefix(req.URL, "vmess://") ||
			strings.HasPrefix(req.URL, "vless://") ||
			strings.HasPrefix(req.URL, "trojan://") ||
			strings.HasPrefix(req.URL, "ss://") {
			var proxy *converter.Proxy
			proxy, err = converter.ParseLink(req.URL)
			if err == nil {
				proxies = []*converter.Proxy{proxy}
			}
		} else {
			c.JSON(http.StatusBadRequest, ParseResponse{
				Success: false,
				Error:   "invalid URL: must be http(s):// subscription or vmess/vless/trojan/ss link",
			})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, ParseResponse{
			Success: false,
			Error:   "either 'url' or 'content' is required",
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, ParseResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, ParseResponse{
		Success: true,
		Proxies: proxies,
		Count:   len(proxies),
	})
}
