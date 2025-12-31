package handler

import (
	"net"
	"net/http"

	"github.com/gin-gonic/gin"
)

type DNSHandler struct{}

func NewDNSHandler() *DNSHandler {
	return &DNSHandler{}
}

type LookupRequest struct {
	Domain string `json:"domain" binding:"required"`
}

type LookupResponse struct {
	Success bool     `json:"success"`
	Domain  string   `json:"domain"`
	IPv4    []string `json:"ipv4"`
	IPv6    []string `json:"ipv6"`
	Error   string   `json:"error,omitempty"`
}

// LookupDomain godoc
// @Summary Lookup domain IP addresses
// @Description Resolve domain name to IPv4 and IPv6 addresses
// @Tags DNS
// @Accept json
// @Produce json
// @Param request body LookupRequest true "Domain to lookup"
// @Success 200 {object} LookupResponse
// @Failure 400 {object} LookupResponse
// @Failure 500 {object} LookupResponse
// @Router /dns/lookup [post]
func (h *DNSHandler) LookupDomain(c *gin.Context) {
	var req LookupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, LookupResponse{
			Success: false,
			Error:   "invalid request: " + err.Error(),
		})
		return
	}

	ips, err := net.LookupIP(req.Domain)
	if err != nil {
		c.JSON(http.StatusInternalServerError, LookupResponse{
			Success: false,
			Domain:  req.Domain,
			Error:   "failed to lookup domain: " + err.Error(),
		})
		return
	}

	var ipv4List []string
	var ipv6List []string

	for _, ip := range ips {
		if ip.To4() != nil {
			ipv4List = append(ipv4List, ip.String())
		} else {
			ipv6List = append(ipv6List, ip.String())
		}
	}

	c.JSON(http.StatusOK, LookupResponse{
		Success: true,
		Domain:  req.Domain,
		IPv4:    ipv4List,
		IPv6:    ipv6List,
	})
}
