package handler

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"fusiontunx/pkg/config"

	"github.com/gin-gonic/gin"
)

type BackupHandler struct {
	config *config.Config
}

func NewBackupHandler(cfg *config.Config) *BackupHandler {
	return &BackupHandler{
		config: cfg,
	}
}

// CreateBackup godoc
// @Summary Create backup
// @Description Create a tar.gz backup of the entire working directory
// @Tags Backup
// @Produce application/gzip
// @Success 200 {file} binary "Backup file"
// @Failure 500 {object} map[string]interface{}
// @Router /backup/create [post]
func (h *BackupHandler) CreateBackup(c *gin.Context) {

	workingDir := h.config.Mihomo.WorkingDir
	timestamp := time.Now().Format("20060102-150405")
	backupFilename := fmt.Sprintf("fusiontunx-backup-%s.tar.gz", timestamp)

	tmpFile := filepath.Join(os.TempDir(), backupFilename)

	file, err := os.Create(tmpFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create backup file"})
		return
	}
	defer file.Close()
	defer os.Remove(tmpFile)

	gzipWriter := gzip.NewWriter(file)
	defer gzipWriter.Close()

	tarWriter := tar.NewWriter(gzipWriter)
	defer tarWriter.Close()

	err = filepath.Walk(workingDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		relPath, err := filepath.Rel(workingDir, path)
		if err != nil {
			return err
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = relPath

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}

		srcFile, err := os.Open(path)
		if err != nil {
			return err
		}
		defer srcFile.Close()

		_, err = io.Copy(tarWriter, srcFile)
		return err
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create backup: " + err.Error()})
		return
	}

	tarWriter.Close()
	gzipWriter.Close()
	file.Close()

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", "attachment; filename="+backupFilename)
	c.Header("Content-Type", "application/gzip")
	c.File(tmpFile)
}

// RestoreBackup godoc
// @Summary Restore backup
// @Description Restore configuration from uploaded tar.gz backup file
// @Tags Backup
// @Accept multipart/form-data
// @Produce json
// @Param backup formData file true "Backup file (.tar.gz)"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /backup/restore [post]
func (h *BackupHandler) RestoreBackup(c *gin.Context) {

	file, err := c.FormFile("backup")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no backup file provided"})
		return
	}

	tmpFile := filepath.Join(os.TempDir(), file.Filename)
	if err := c.SaveUploadedFile(file, tmpFile); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save uploaded file"})
		return
	}
	defer os.Remove(tmpFile)

	srcFile, err := os.Open(tmpFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open backup file"})
		return
	}
	defer srcFile.Close()

	gzipReader, err := gzip.NewReader(srcFile)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid gzip file"})
		return
	}
	defer gzipReader.Close()

	tarReader := tar.NewReader(gzipReader)
	workingDir := h.config.Mihomo.WorkingDir

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read tar file"})
			return
		}

		if header.Typeflag != tar.TypeReg {
			continue
		}

		targetPath := filepath.Join(workingDir, header.Name)

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create directory"})
			return
		}

		dstFile, err := os.Create(targetPath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create file"})
			return
		}

		if _, err := io.Copy(dstFile, tarReader); err != nil {
			dstFile.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to extract file"})
			return
		}
		dstFile.Close()
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Backup restored successfully",
	})
}
