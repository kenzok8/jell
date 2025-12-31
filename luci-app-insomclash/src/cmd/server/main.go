package main

import (
	"context"
	"flag"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "insomclash/docs"
	"insomclash/internal/http/router"
	"insomclash/internal/service"
	"insomclash/internal/ui"
	"insomclash/pkg/config"
	"insomclash/pkg/logger"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

// @title InsomClash API
// @version 1.0
// @description Backend API untuk aplikasi tunneling menggunakan mihomo
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.url http://www.swagger.io/support
// @contact.email support@swagger.io

// @license.name MIT
// @license.url https://opensource.org/licenses/MIT

// @BasePath /api/v1

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
func main() {
	var configPath string
	flag.StringVar(&configPath, "config", "/etc/insomclash/app.yaml", "Path to configuration file")
	flag.StringVar(&configPath, "c", "/etc/insomclash/app.yaml", "Path to configuration file (shorthand)")
	flag.Parse()

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Printf("Failed to load config from %s: %v", configPath, err)
		os.Exit(1)
	}

	if err := logger.Init(cfg.Logging.Level, cfg.Logging.File); err != nil {
		log.Printf("Failed to initialize logger: %v", err)
		os.Exit(1)
	}
	defer logger.Close()

	gin.SetMode(cfg.Server.Mode)
	app := gin.New()
	app.RedirectTrailingSlash = false
	app.RedirectFixedPath = false

	nftablesService := service.NewNftablesService()
	mihomoService := service.NewMihomoService(cfg, configPath, nftablesService)

	if err := mihomoService.RestoreState(); err != nil {
		log.Printf("Failed to restore mihomo state: %v", err)
	}

	router.Setup(app, mihomoService, nftablesService, cfg, configPath)

	if cfg.API.EnableSwagger {
		app.GET("/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	staticFS, err := ui.GetStaticFS()
	if err != nil {
		log.Printf("Warning: Failed to get embedded static files: %v", err)
	} else {
		indexFile, err := staticFS.Open("index.html")
		var indexBytes []byte
		if err == nil {
			indexBytes, _ = io.ReadAll(indexFile)
			indexFile.Close()
		} else {
			log.Printf("Error reading index.html: %v", err)
		}

		serveIndex := func(c *gin.Context) {
			c.Data(http.StatusOK, "text/html; charset=utf-8", indexBytes)
		}

		app.GET("/", serveIndex)

		app.NoRoute(func(c *gin.Context) {
			if !strings.HasPrefix(c.Request.URL.Path, "/api/") {
				serveIndex(c)
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
		})

		app.GET("/assets/*filepath", func(c *gin.Context) {
			c.FileFromFS("assets"+c.Param("filepath"), http.FS(staticFS))
		})
		app.GET("/favicon.svg", func(c *gin.Context) {
			c.FileFromFS("favicon.svg", http.FS(staticFS))
		})
		app.GET("/vite.svg", func(c *gin.Context) {
			c.FileFromFS("vite.svg", http.FS(staticFS))
		})
	}

	address := cfg.Server.Host + ":" + cfg.Server.Port
	log.Printf("Starting server on %s", address)

	server := &http.Server{
		Addr:    address,
		Handler: app,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("Failed to start server: %v", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	if mihomoService.GetStatus() == "running" {
		log.Println("Stopping mihomo service...")
		if err := mihomoService.Stop(false); err != nil {
			log.Printf("Failed to stop mihomo: %v", err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
