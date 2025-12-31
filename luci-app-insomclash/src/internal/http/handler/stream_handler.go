package handler

import (
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"insomclash/internal/service"
	"insomclash/pkg/config"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type StreamHandler struct {
	config        *config.Config
	mihomoService *service.MihomoService
}

func NewStreamHandler(cfg *config.Config, mihomoService *service.MihomoService) *StreamHandler {
	return &StreamHandler{
		config:        cfg,
		mihomoService: mihomoService,
	}
}

func (h *StreamHandler) StreamMihomoLogs(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	status := h.mihomoService.GetStatus()
	if status != "running" {
		conn.WriteMessage(websocket.TextMessage, []byte("ERROR: mihomo is not running"))
		return
	}

	logFile := h.config.Mihomo.LogFile
	h.streamLogFile(c, conn, logFile)
}

func (h *StreamHandler) StreamAppLogs(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	logFile := h.config.Logging.File
	h.streamLogFile(c, conn, logFile)
}

func (h *StreamHandler) ClearMihomoLogs(c *gin.Context) {
	logFile := h.config.Mihomo.LogFile
	if logFile == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "log file not configured"})
		return
	}

	file, err := os.OpenFile(logFile, os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear log file"})
		return
	}
	defer file.Close()

	c.JSON(http.StatusOK, gin.H{"message": "Mihomo logs cleared successfully"})
}

func (h *StreamHandler) ClearAppLogs(c *gin.Context) {
	logFile := h.config.Logging.File
	if logFile == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "log file not configured"})
		return
	}

	file, err := os.OpenFile(logFile, os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear log file"})
		return
	}
	defer file.Close()

	c.JSON(http.StatusOK, gin.H{"message": "Application logs cleared successfully"})
}

func (h *StreamHandler) streamLogFile(c *gin.Context, conn *websocket.Conn, logFile string) {
	if logFile == "" {
		conn.WriteMessage(websocket.TextMessage, []byte("ERROR: log file not configured"))
		return
	}

	if _, err := os.Stat(logFile); os.IsNotExist(err) {
		conn.WriteMessage(websocket.TextMessage, []byte("ERROR: log file does not exist: "+logFile))
		return
	}

	file, err := os.Open(logFile)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("ERROR: failed to open log file: "+err.Error()))
		return
	}
	defer file.Close()

	// Initial read: last 4KB
	stat, err := file.Stat()
	if err == nil {
		fileSize := stat.Size()
		startPos := int64(0)
		if fileSize > 4096 {
			startPos = fileSize - 4096
		}

		_, err = file.Seek(startPos, io.SeekStart)
		if err == nil {
			// Read the chunk
			initialData := make([]byte, fileSize-startPos)
			n, err := file.Read(initialData)
			if err == nil && n > 0 {
				lines := strings.Split(string(initialData[:n]), "\n")
				// Skip the first line if we seeked, as it might be partial
				startIdx := 0
				if startPos > 0 && len(lines) > 0 {
					startIdx = 1
				}

				for i := startIdx; i < len(lines); i++ {
					line := strings.TrimSpace(lines[i])
					if line != "" {
						conn.WriteMessage(websocket.TextMessage, []byte(line))
					}
				}
			}
		}
	}

	// Seek to end for tailing
	currentSize, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return
	}

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			stat, err := file.Stat()
			if err != nil {
				return
			}

			if stat.Size() < currentSize {
				file.Seek(0, io.SeekStart)
				currentSize = 0
			}

			if stat.Size() == currentSize {
				continue
			}

			newData := make([]byte, stat.Size()-currentSize)
			n, err := file.Read(newData)
			if err != nil && err != io.EOF {
				return
			}

			if n > 0 {
				lines := strings.Split(string(newData[:n]), "\n")
				for _, line := range lines {
					line = strings.TrimSpace(line)
					if line != "" {
						if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
							return
						}
					}
				}
				currentSize = stat.Size()
			}

		case <-c.Request.Context().Done():
			return
		}
	}
}

func (h *StreamHandler) StreamTraffic(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	status := h.mihomoService.GetStatus()
	if status != "running" {
		conn.WriteMessage(websocket.TextMessage, []byte("ERROR: mihomo is not running"))
		return
	}

	h.streamMihomoAPI(c, conn, "/traffic")
}

func (h *StreamHandler) StreamMemory(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	status := h.mihomoService.GetStatus()
	if status != "running" {
		conn.WriteMessage(websocket.TextMessage, []byte("ERROR: mihomo is not running"))
		return
	}

	h.streamMihomoAPI(c, conn, "/memory")
}

func (h *StreamHandler) StreamConnections(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	status := h.mihomoService.GetStatus()
	if status != "running" {
		conn.WriteMessage(websocket.TextMessage, []byte("ERROR: mihomo is not running"))
		return
	}

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			url := h.config.Mihomo.APIURL + "/connections"
			req, err := http.NewRequest("GET", url, nil)
			if err != nil {
				continue
			}

			if h.config.Mihomo.APISecret != "" {
				req.Header.Set("Authorization", "Bearer "+h.config.Mihomo.APISecret)
			}

			client := &http.Client{Timeout: 5 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				continue
			}

			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				continue
			}

			if err := conn.WriteMessage(websocket.TextMessage, body); err != nil {
				return
			}

		case <-c.Request.Context().Done():
			return
		}
	}
}

func (h *StreamHandler) streamMihomoAPI(c *gin.Context, conn *websocket.Conn, endpoint string) {
	url := h.config.Mihomo.APIURL + endpoint

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("ERROR: failed to create request: "+err.Error()))
		return
	}

	if h.config.Mihomo.APISecret != "" {
		req.Header.Set("Authorization", "Bearer "+h.config.Mihomo.APISecret)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("ERROR: failed to connect to Mihomo API: "+err.Error()))
		return
	}
	defer resp.Body.Close()

	reader := io.Reader(resp.Body)
	buf := make([]byte, 4096)

	for {
		select {
		case <-c.Request.Context().Done():
			return
		default:
			n, err := reader.Read(buf)
			if err != nil {
				return
			}

			if n > 0 {
				data := buf[:n]
				lines := strings.Split(string(data), "\n")
				for _, line := range lines {
					line = strings.TrimSpace(line)
					if line != "" {
						if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
							return
						}
					}
				}
			}
		}
	}
}
