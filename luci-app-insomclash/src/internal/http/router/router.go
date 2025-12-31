package router

import (
	"insomclash/internal/http/handler"
	"insomclash/internal/http/middleware"
	"insomclash/internal/service"
	"insomclash/pkg/config"

	"github.com/gin-gonic/gin"
)

func Setup(app *gin.Engine, mihomoService *service.MihomoService, nftablesService *service.NftablesService, cfg *config.Config, configPath string) {
	app.Use(gin.Logger())
	app.Use(gin.Recovery())
	app.Use(middleware.CORS(&cfg.API.CORS))

	mihomoHandler := handler.NewMihomoHandler(mihomoService, cfg)
	appHandler := handler.NewAppHandler(cfg, mihomoService, configPath)
	mihomoFilesHandler := handler.NewMihomoFilesHandler(mihomoService, cfg, configPath)
	streamHandler := handler.NewStreamHandler(cfg, mihomoService)
	backupHandler := handler.NewBackupHandler(cfg)
	converterHandler := handler.NewConverterHandler()
	dnsHandler := handler.NewDNSHandler()

	api := app.Group("/api/v1")
	{
		backupGroup := api.Group("/backup")
		{
			backupGroup.POST("/create", backupHandler.CreateBackup)
			backupGroup.POST("/restore", backupHandler.RestoreBackup)
		}

		converterGroup := api.Group("/converter")
		{
			converterGroup.POST("/parse", converterHandler.ParseProxies)
		}

		dnsGroup := api.Group("/dns")
		{
			dnsGroup.POST("/lookup", dnsHandler.LookupDomain)
		}

		mihomoGroup := api.Group("/mihomo")
		{
			mihomoGroup.GET("/status", mihomoHandler.GetStatus)
			mihomoGroup.POST("/start", mihomoHandler.Start)
			mihomoGroup.POST("/stop", mihomoHandler.Stop)
			mihomoGroup.POST("/restart", mihomoHandler.Restart)
			mihomoGroup.GET("/logs", streamHandler.StreamMihomoLogs)
			mihomoGroup.DELETE("/logs", streamHandler.ClearMihomoLogs)
			mihomoGroup.GET("/memory", streamHandler.StreamMemory)
			mihomoGroup.GET("/traffic", streamHandler.StreamTraffic)
			mihomoGroup.GET("/connections", streamHandler.StreamConnections)
			mihomoGroup.GET("/core-version", mihomoHandler.GetCoreVersion)
			mihomoGroup.GET("/dashboard-info", mihomoHandler.GetDashboardInfo)
			mihomoGroup.GET("/api/*path", mihomoHandler.ProxyToMihomoAPI)

			mihomoGroup.GET("/configs", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "configs"})
				mihomoFilesHandler.GetFiles(c)
			})
			mihomoGroup.GET("/configs/:filename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "configs"})
				mihomoFilesHandler.GetFileContent(c)
			})
			mihomoGroup.GET("/configs/:filename/download", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "configs"})
				mihomoFilesHandler.DownloadFile(c)
			})
			mihomoGroup.POST("/configs", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "configs"})
				mihomoFilesHandler.CreateFile(c)
			})
			mihomoGroup.POST("/configs/upload", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "configs"})
				mihomoFilesHandler.UploadFile(c)
			})
			mihomoGroup.PUT("/configs/:filename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "configs"})
				mihomoFilesHandler.UpdateFile(c)
			})
			mihomoGroup.PUT("/configs/:filename/rename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "configs"})
				mihomoFilesHandler.RenameFile(c)
			})
			mihomoGroup.DELETE("/configs/:filename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "configs"})
				mihomoFilesHandler.DeleteFile(c)
			})
			mihomoGroup.GET("/active-config", mihomoFilesHandler.GetActiveConfigPath)
			mihomoGroup.PUT("/active-config", mihomoFilesHandler.SetActiveConfigPath)

			mihomoGroup.GET("/proxy-providers", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "proxy_providers"})
				mihomoFilesHandler.GetFiles(c)
			})
			mihomoGroup.GET("/proxy-providers/:filename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "proxy_providers"})
				mihomoFilesHandler.GetFileContent(c)
			})
			mihomoGroup.GET("/proxy-providers/:filename/download", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "proxy_providers"})
				mihomoFilesHandler.DownloadFile(c)
			})
			mihomoGroup.POST("/proxy-providers", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "proxy_providers"})
				mihomoFilesHandler.CreateFile(c)
			})
			mihomoGroup.POST("/proxy-providers/upload", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "proxy_providers"})
				mihomoFilesHandler.UploadFile(c)
			})
			mihomoGroup.PUT("/proxy-providers/:filename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "proxy_providers"})
				mihomoFilesHandler.UpdateFile(c)
			})
			mihomoGroup.PUT("/proxy-providers/:filename/rename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "proxy_providers"})
				mihomoFilesHandler.RenameFile(c)
			})
			mihomoGroup.DELETE("/proxy-providers/:filename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "proxy_providers"})
				mihomoFilesHandler.DeleteFile(c)
			})

			mihomoGroup.GET("/rule-providers", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "rule_providers"})
				mihomoFilesHandler.GetFiles(c)
			})
			mihomoGroup.GET("/rule-providers/:filename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "rule_providers"})
				mihomoFilesHandler.GetFileContent(c)
			})
			mihomoGroup.GET("/rule-providers/:filename/download", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "rule_providers"})
				mihomoFilesHandler.DownloadFile(c)
			})
			mihomoGroup.POST("/rule-providers", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "rule_providers"})
				mihomoFilesHandler.CreateFile(c)
			})
			mihomoGroup.POST("/rule-providers/upload", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "rule_providers"})
				mihomoFilesHandler.UploadFile(c)
			})
			mihomoGroup.PUT("/rule-providers/:filename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "rule_providers"})
				mihomoFilesHandler.UpdateFile(c)
			})
			mihomoGroup.PUT("/rule-providers/:filename/rename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "rule_providers"})
				mihomoFilesHandler.RenameFile(c)
			})
			mihomoGroup.DELETE("/rule-providers/:filename", func(c *gin.Context) {
				c.Params = append(c.Params, gin.Param{Key: "dir", Value: "rule_providers"})
				mihomoFilesHandler.DeleteFile(c)
			})
		}

		appGroup := api.Group("/app")
		{
			appGroup.GET("/config", appHandler.GetConfig)
			appGroup.PUT("/config", appHandler.UpdateConfig)
			appGroup.GET("/logs", streamHandler.StreamAppLogs)
			appGroup.DELETE("/logs", streamHandler.ClearAppLogs)
			appGroup.GET("/ipv4", appHandler.GetIPv4)
			appGroup.GET("/ipv6", appHandler.GetIPv6)
			appGroup.GET("/geo/ipv4", appHandler.GetGeoIPv4)
			appGroup.GET("/geo/ipv6", appHandler.GetGeoIPv6)
		}
	}
}
