package handler

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"fusiontunx/internal/service"
	"fusiontunx/pkg/config"

	"github.com/gin-gonic/gin"
)

type MihomoFilesHandler struct {
	mihomoService *service.MihomoService
	appConfig     *config.Config
	configPath    string
}

func NewMihomoFilesHandler(mihomoService *service.MihomoService, appConfig *config.Config, configPath string) *MihomoFilesHandler {
	return &MihomoFilesHandler{
		mihomoService: mihomoService,
		appConfig:     appConfig,
		configPath:    configPath,
	}
}

func (h *MihomoFilesHandler) validateDir(dirName string) bool {
	return dirName == "configs" || dirName == "proxy_providers" || dirName == "rule_providers"
}

// GetFiles godoc
// @Summary Get files from directory
// @Description Get list of all files in the specified directory
// @Tags Mihomo files
// @Produce json
// @Param dir path string true "Directory name (configs, proxy_providers, rule_providers)"
// @Success 200 {array} string "List of files"
// @Failure 400 {object} map[string]string "Error message"
// @Failure 500 {object} map[string]string "Error message"
// @Router /mihomo/{dir} [get]
func (h *MihomoFilesHandler) GetFiles(c *gin.Context) {
	dirName := c.Param("dir")

	if !h.validateDir(dirName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory"})
		return
	}

	dirPath := filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName)
	files, err := os.ReadDir(dirPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var fileNames []string
	for _, file := range files {
		if !file.IsDir() {
			fileNames = append(fileNames, file.Name())
		}
	}

	c.JSON(http.StatusOK, fileNames)
}

// GetFileContent godoc
// @Summary Get file content
// @Description Get the content of a specific file
// @Tags Mihomo files
// @Produce json
// @Param dir path string true "Directory name (configs, proxy_providers, rule_providers)"
// @Param filename path string true "Filename of the file"
// @Success 200 {object} map[string]string "File content"
// @Failure 400 {object} map[string]string "Error message"
// @Failure 500 {object} map[string]string "Error message"
// @Router /mihomo/{dir}/{filename} [get]
func (h *MihomoFilesHandler) GetFileContent(c *gin.Context) {
	dirName := c.Param("dir")
	filename := c.Param("filename")

	if !h.validateDir(dirName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory"})
		return
	}

	if filepath.Ext(filename) != ".yaml" && filepath.Ext(filename) != ".yml" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only yaml files are allowed"})
		return
	}

	filePath := filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName, filename)

	if !isPathSafe(filePath, filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"content": string(data)})
}

// CreateFile godoc
// @Summary Create a new file
// @Description Create a new file with the specified content
// @Tags Mihomo files
// @Accept json
// @Produce json
// @Param dir path string true "Directory name (configs, proxy_providers, rule_providers)"
// @Param request body map[string]string true "Filename and content"
// @Success 201 {object} map[string]string "Success message"
// @Failure 400 {object} map[string]string "Error message"
// @Failure 500 {object} map[string]string "Error message"
// @Router /mihomo/{dir} [post]
func (h *MihomoFilesHandler) CreateFile(c *gin.Context) {
	dirName := c.Param("dir")

	if !h.validateDir(dirName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory"})
		return
	}

	var req struct {
		Filename string `json:"filename" binding:"required"`
		Content  string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if filepath.Ext(req.Filename) != ".yaml" && filepath.Ext(req.Filename) != ".yml" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only yaml files are allowed"})
		return
	}

	filePath := filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName, req.Filename)

	if !isPathSafe(filePath, filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}

	if _, err := os.Stat(filePath); err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file already exists"})
		return
	}

	err := os.WriteFile(filePath, []byte(req.Content), 0644)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "File created successfully"})
}

// UpdateFile godoc
// @Summary Update a file
// @Description Update the content of an existing file
// @Tags Mihomo files
// @Accept json
// @Produce json
// @Param dir path string true "Directory name (configs, proxy_providers, rule_providers)"
// @Param filename path string true "Filename of the file"
// @Param request body map[string]string true "New content"
// @Success 200 {object} map[string]string "Success message"
// @Failure 400 {object} map[string]string "Error message"
// @Failure 500 {object} map[string]string "Error message"
// @Router /mihomo/{dir}/{filename} [put]
func (h *MihomoFilesHandler) UpdateFile(c *gin.Context) {
	dirName := c.Param("dir")
	filename := c.Param("filename")

	if !h.validateDir(dirName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory"})
		return
	}

	if filepath.Ext(filename) != ".yaml" && filepath.Ext(filename) != ".yml" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only yaml files are allowed"})
		return
	}

	var req struct {
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	filePath := filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName, filename)

	if !isPathSafe(filePath, filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "file does not exist"})
		return
	}

	err := os.WriteFile(filePath, []byte(req.Content), 0644)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.appConfig.Mihomo.AutoRestart && h.mihomoService.GetStatus() == "running" &&
		(dirName == "configs" && filePath == h.appConfig.Mihomo.ConfigPath) {
		if err := h.mihomoService.Restart(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "file updated but failed to restart mihomo: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "File updated and mihomo restarted successfully"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "File updated successfully"})
}

// DeleteFile godoc
// @Summary Delete a file
// @Description Delete an existing file
// @Tags Mihomo files
// @Produce json
// @Param dir path string true "Directory name (configs, proxy_providers, rule_providers)"
// @Param filename path string true "Filename of the file to delete"
// @Success 200 {object} map[string]string "Success message"
// @Failure 400 {object} map[string]string "Error message"
// @Failure 500 {object} map[string]string "Error message"
// @Router /mihomo/{dir}/{filename} [delete]
func (h *MihomoFilesHandler) DeleteFile(c *gin.Context) {
	dirName := c.Param("dir")
	filename := c.Param("filename")

	if !h.validateDir(dirName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory"})
		return
	}

	if filepath.Ext(filename) != ".yaml" && filepath.Ext(filename) != ".yml" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only yaml files are allowed"})
		return
	}

	filePath := filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName, filename)

	if !isPathSafe(filePath, filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "file does not exist"})
		return
	}

	if dirName == "configs" && filePath == h.appConfig.Mihomo.ConfigPath {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete active config file"})
		return
	}

	err := os.Remove(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "File deleted successfully"})
}

// RenameFile godoc
// @Summary Rename a file
// @Description Rename an existing file
// @Tags Mihomo files
// @Accept json
// @Produce json
// @Param dir path string true "Directory name (configs, proxy_providers, rule_providers)"
// @Param filename path string true "Current filename of the file"
// @Param request body map[string]string true "New filename"
// @Success 200 {object} map[string]string "Success message"
// @Failure 400 {object} map[string]string "Error message"
// @Failure 500 {object} map[string]string "Error message"
// @Router /mihomo/{dir}/{filename}/rename [put]
func (h *MihomoFilesHandler) RenameFile(c *gin.Context) {
	dirName := c.Param("dir")
	filename := c.Param("filename")

	if !h.validateDir(dirName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory"})
		return
	}

	if filepath.Ext(filename) != ".yaml" && filepath.Ext(filename) != ".yml" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only yaml files are allowed"})
		return
	}

	var req struct {
		NewFilename string `json:"new_filename" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if filepath.Ext(req.NewFilename) != ".yaml" && filepath.Ext(req.NewFilename) != ".yml" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only yaml files are allowed"})
		return
	}

	oldPath := filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName, filename)
	newPath := filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName, req.NewFilename)

	if !isPathSafe(oldPath, filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName)) ||
		!isPathSafe(newPath, filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}

	if _, err := os.Stat(oldPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "source file does not exist"})
		return
	}

	if _, err := os.Stat(newPath); err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "destination file already exists"})
		return
	}

	err := os.Rename(oldPath, newPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if dirName == "configs" && oldPath == h.appConfig.Mihomo.ConfigPath {
		h.appConfig.Mihomo.ConfigPath = newPath
		if err := h.appConfig.Save(h.configPath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "file renamed but failed to update app config: " + err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "File renamed successfully"})
}

// DownloadFile godoc
// @Summary Download a file
// @Description Download a specific file
// @Tags Mihomo files
// @Produce octet-stream
// @Param dir path string true "Directory name (configs, proxy_providers, rule_providers)"
// @Param filename path string true "Filename of the file"
// @Success 200 {file} binary "File content"
// @Failure 400 {object} map[string]string "Error message"
// @Failure 500 {object} map[string]string "Error message"
// @Router /mihomo/{dir}/{filename}/download [get]
func (h *MihomoFilesHandler) DownloadFile(c *gin.Context) {
	dirName := c.Param("dir")
	filename := c.Param("filename")

	if !h.validateDir(dirName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory"})
		return
	}

	if filepath.Ext(filename) != ".yaml" && filepath.Ext(filename) != ".yml" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only yaml files are allowed"})
		return
	}

	filePath := filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName, filename)

	if !isPathSafe(filePath, filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "file does not exist"})
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Cache-Control", "no-cache")

	c.File(filePath)
}

// UploadFile godoc
// @Summary Upload a file
// @Description Upload a new file
// @Tags Mihomo files
// @Accept multipart/form-data
// @Produce json
// @Param dir path string true "Directory name (configs, proxy_providers, rule_providers)"
// @Param file formData file true "File to upload"
// @Success 200 {object} map[string]string "Success message"
// @Failure 400 {object} map[string]string "Error message"
// @Failure 500 {object} map[string]string "Error message"
// @Router /mihomo/{dir}/upload [post]
func (h *MihomoFilesHandler) UploadFile(c *gin.Context) {
	dirName := c.Param("dir")

	if !h.validateDir(dirName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file uploaded: " + err.Error()})
		return
	}
	defer file.Close()

	filename := header.Filename
	if filepath.Ext(filename) != ".yaml" && filepath.Ext(filename) != ".yml" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only yaml files are allowed"})
		return
	}

	filePath := filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName, filename)

	if !isPathSafe(filePath, filepath.Join(h.appConfig.Mihomo.WorkingDir, dirName)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}

	if _, err := os.Stat(filePath); err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file already exists"})
		return
	}

	dst, err := os.Create(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create file: " + err.Error()})
		return
	}
	defer dst.Close()

	if _, err = io.Copy(dst, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "File uploaded successfully", "filename": filename})
}

// GetActiveConfigPath godoc
// @Summary Get active config path
// @Description Get the currently active mihomo configuration file path
// @Tags Mihomo files
// @Produce json
// @Success 200 {object} map[string]interface{} "Active config path"
// @Failure 500 {object} map[string]interface{} "Error message"
// @Router /mihomo/active-config [get]
func (h *MihomoFilesHandler) GetActiveConfigPath(c *gin.Context) {
	relativePath := filepath.Base(h.appConfig.Mihomo.ConfigPath)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"active_config": relativePath,
		},
	})
}

// SetActiveConfigPath godoc
// @Summary Set active config path
// @Description Set the active mihomo configuration file path
// @Tags Mihomo files
// @Accept json
// @Produce json
// @Param request body map[string]string true "Filename to set as active"
// @Success 200 {object} map[string]interface{} "Success message"
// @Failure 400 {object} map[string]interface{} "Error message"
// @Failure 404 {object} map[string]interface{} "File not found"
// @Failure 500 {object} map[string]interface{} "Error message"
// @Router /mihomo/active-config [put]
func (h *MihomoFilesHandler) SetActiveConfigPath(c *gin.Context) {
	var req struct {
		Filename string `json:"filename" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if filepath.Ext(req.Filename) != ".yaml" && filepath.Ext(req.Filename) != ".yml" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only yaml files are allowed"})
		return
	}

	newPath := filepath.Join(h.appConfig.Mihomo.WorkingDir, "configs", req.Filename)

	if !isPathSafe(newPath, filepath.Join(h.appConfig.Mihomo.WorkingDir, "configs")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}

	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "file does not exist"})
		return
	}

	h.appConfig.Mihomo.ConfigPath = newPath
	if err := h.appConfig.Save(h.configPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update app config: " + err.Error()})
		return
	}

	if h.appConfig.Mihomo.AutoRestart && h.mihomoService.GetStatus() == "running" {
		if err := h.mihomoService.Restart(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "config updated but failed to restart mihomo: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Active config updated and mihomo restarted successfully"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Active config updated successfully"})
}

func isPathSafe(path string, basePath string) bool {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return false
	}

	absBasePath, err := filepath.Abs(basePath)
	if err != nil {
		return false
	}

	relPath, err := filepath.Rel(absBasePath, absPath)
	if err != nil {
		return false
	}

	return !filepath.IsAbs(relPath) && !strings.HasPrefix(relPath, "..")
}
