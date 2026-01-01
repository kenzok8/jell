package service

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"fusiontunx/pkg/config"
	"fusiontunx/pkg/logger"

	"github.com/vishvananda/netlink"
)

type MihomoServiceInterface interface {
	GetStatus() string
	Start() error
	Stop(saveState bool) error
	Restart() error
	RestoreState() error
	GetAppConfig() *config.MihomoConfig
	UpdateAppConfig(*config.MihomoConfig) error
	GetLogs(lines int) ([]string, error)
}

type MihomoService struct {
	appConfig       *config.Config
	configPath      string
	nftablesService *NftablesService
}

func NewMihomoService(appConfig *config.Config, configPath string, nftablesService *NftablesService) *MihomoService {
	return &MihomoService{
		appConfig:       appConfig,
		configPath:      configPath,
		nftablesService: nftablesService,
	}
}

func (s *MihomoService) GetStatus() string {
	pidFile := filepath.Join(s.appConfig.Mihomo.WorkingDir, "mihomo.pid")
	pidData, err := os.ReadFile(pidFile)
	if err != nil {
		return "stopped"
	}

	var pid int
	_, err = fmt.Sscanf(string(pidData), "%d", &pid)
	if err != nil {
		return "stopped"
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return "stopped"
	}

	err = process.Signal(syscall.Signal(0))
	if err != nil {
		os.Remove(pidFile)
		return "stopped"
	}

	return "running"
}

func (s *MihomoService) killExistingMihomo() error {
	pidFile := filepath.Join(s.appConfig.Mihomo.WorkingDir, "mihomo.pid")
	pidData, err := os.ReadFile(pidFile)
	if err != nil {
		logger.Debug("No existing mihomo PID file found")
		return nil
	}

	var pid int
	_, err = fmt.Sscanf(string(pidData), "%d", &pid)
	if err != nil {
		logger.Warnf("Invalid PID file format, removing: %v", err)
		os.Remove(pidFile)
		return nil
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		logger.Debugf("Process %d not found, removing stale PID file", pid)
		os.Remove(pidFile)
		return nil
	}

	err = process.Signal(syscall.Signal(0))
	if err == nil {
		logger.Infof("Killing existing mihomo process (PID: %d)", pid)
		if err := process.Kill(); err != nil {
			return fmt.Errorf("failed to kill existing mihomo process: %w", err)
		}
		if err := os.Remove(pidFile); err != nil {
			return fmt.Errorf("failed to remove old pid file: %w", err)
		}
		logger.Info("Existing mihomo process killed successfully")
	}

	return nil
}

func (s *MihomoService) Start() error {
	logger.Info("Starting mihomo service")

	if err := s.killExistingMihomo(); err != nil {
		logger.Errorf("Failed to kill existing mihomo: %v", err)
		return fmt.Errorf("failed to kill existing mihomo: %w", err)
	}

	logger.Debug("Adjusting mihomo configuration")
	if err := s.adjustMihomoConfig(); err != nil {
		logger.Errorf("Failed to adjust mihomo config: %v", err)
		return fmt.Errorf("failed to adjust mihomo config: %w", err)
	}

	if s.appConfig.Mihomo.LogFile != "" {
		if _, err := os.Stat(s.appConfig.Mihomo.LogFile); err == nil {
			logger.Debug("Clearing old mihomo log file")
			if err := os.Remove(s.appConfig.Mihomo.LogFile); err != nil {
				logger.Warnf("Failed to clear old log file: %v", err)
				return fmt.Errorf("failed to clear old log file: %w", err)
			}
		}
	}

	shouldSetupRouting, err := s.shouldSetupRouting()
	if err != nil {
		logger.Errorf("Failed to check routing mode: %v", err)
		return fmt.Errorf("failed to check routing mode: %w", err)
	}

	logger.Debugf("Starting mihomo core: %s", s.appConfig.Mihomo.CorePath)
	cmd := exec.Command(s.appConfig.Mihomo.CorePath,
		"-d", s.appConfig.Mihomo.WorkingDir,
		"-f", s.appConfig.Mihomo.ConfigPath)

	if s.appConfig.Mihomo.LogFile != "" {
		logFile, err := os.OpenFile(s.appConfig.Mihomo.LogFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			logger.Errorf("Failed to open log file: %v", err)
			return fmt.Errorf("failed to open log file: %w", err)
		}
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	}

	err = cmd.Start()
	if err != nil {
		logger.Errorf("Failed to start mihomo: %v", err)
		return fmt.Errorf("failed to start mihomo: %w", err)
	}

	pidFile := filepath.Join(s.appConfig.Mihomo.WorkingDir, "mihomo.pid")
	err = os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", cmd.Process.Pid)), 0644)
	if err != nil {
		cmd.Process.Kill()
		logger.Errorf("Failed to write PID file: %v", err)
		return fmt.Errorf("failed to write pid file: %w", err)
	}
	logger.Infof("Mihomo process started (PID: %d)", cmd.Process.Pid)

	if shouldSetupRouting {
		logger.Debug("Waiting for mihomo to be ready")
		if err := s.waitForMihomoReady(); err != nil {
			cmd.Process.Kill()
			os.Remove(pidFile)
			logger.Errorf("Mihomo not ready: %v", err)
			return fmt.Errorf("mihomo not ready: %w", err)
		}

		logger.Debug("Setting up routing")
		err = s.nftablesService.SetupRouting(s.appConfig.Mihomo.Routing)
		if err != nil {
			cmd.Process.Kill()
			os.Remove(pidFile)
			logger.Errorf("Failed to setup routing: %v", err)
			return fmt.Errorf("failed to setup routing: %w", err)
		}
	}

	s.appConfig.Mihomo.AutoStart = true
	if err := s.appConfig.Save(s.configPath); err != nil {
		logger.Warnf("Failed to save auto_start state: %v", err)
	}

	logger.Info("Mihomo service started successfully")
	return nil
}

func (s *MihomoService) Stop(saveState bool) error {
	logger.Info("Stopping mihomo service")

	if s.GetStatus() == "stopped" {
		logger.Warn("Mihomo is already stopped")
		return fmt.Errorf("mihomo is not running")
	}

	pidFile := filepath.Join(s.appConfig.Mihomo.WorkingDir, "mihomo.pid")
	pidData, err := os.ReadFile(pidFile)
	if err != nil {
		logger.Errorf("Failed to read PID file: %v", err)
		return fmt.Errorf("failed to read pid file: %w", err)
	}

	var pid int
	_, err = fmt.Sscanf(string(pidData), "%d", &pid)
	if err != nil {
		logger.Errorf("Failed to parse PID: %v", err)
		return fmt.Errorf("failed to parse pid: %w", err)
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		logger.Errorf("Failed to find process %d: %v", pid, err)
		return fmt.Errorf("failed to find process: %w", err)
	}

	logger.Debugf("Killing mihomo process (PID: %d)", pid)
	err = process.Kill()
	if err != nil {
		handled := errors.Is(err, os.ErrProcessDone) || errors.Is(err, syscall.ESRCH)

		var pathErr *os.PathError
		if !handled && errors.As(err, &pathErr) && errors.Is(pathErr.Err, syscall.ESRCH) {
			handled = true
		}
		var sysErr *os.SyscallError
		if !handled && errors.As(err, &sysErr) && errors.Is(sysErr.Err, syscall.ESRCH) {
			handled = true
		}
		if !handled {
			logger.Errorf("Failed to kill process: %v", err)
			return fmt.Errorf("failed to kill process: %w", err)
		}
	}

	err = os.Remove(pidFile)
	if err != nil {
		logger.Warnf("Failed to remove PID file: %v", err)
		return fmt.Errorf("failed to remove pid file: %w", err)
	}

	shouldCleanupRouting, err := s.shouldSetupRouting()
	if err == nil && shouldCleanupRouting {
		logger.Debug("Cleaning up routing")
		s.nftablesService.CleanupTUNRouting()
	}

	if saveState {
		logger.Debug("Saving auto_start state to config")
		s.appConfig.Mihomo.AutoStart = false
		if err := s.appConfig.Save(s.configPath); err != nil {
			logger.Warnf("Failed to save auto_start state: %v", err)
		}
	}

	logger.Info("Mihomo service stopped successfully")
	return nil
}

func (s *MihomoService) Restart() error {
	logger.Info("Restarting mihomo service")
	err := s.Stop(false)
	if err != nil && s.GetStatus() != "stopped" {
		logger.Errorf("Failed to stop mihomo: %v", err)
		return fmt.Errorf("failed to stop mihomo: %w", err)
	}

	return s.Start()
}

func (s *MihomoService) GetAppConfig() *config.MihomoConfig {
	return &s.appConfig.Mihomo
}

func (s *MihomoService) UpdateAppConfig(newConfig *config.MihomoConfig) error {
	s.appConfig.Mihomo = *newConfig

	if s.GetStatus() == "running" {
		return s.Restart()
	}

	return nil
}

func (s *MihomoService) RestoreState() error {
	logger.Debug("Checking auto_start state")
	if s.appConfig.Mihomo.AutoStart {
		logger.Info("Auto-start is enabled, checking mihomo status")
		if s.GetStatus() == "stopped" {
			logger.Info("Mihomo is stopped, starting automatically")
			return s.Start()
		}
		logger.Info("Mihomo is already running")
	} else {
		logger.Debug("Auto-start is disabled")
	}
	return nil
}

func (s *MihomoService) shouldSetupRouting() (bool, error) {
	routing := s.appConfig.Mihomo.Routing

	if routing.TCP != config.RoutingModeDisable || routing.UDP != config.RoutingModeDisable {
		return true, nil
	}

	return false, nil
}

func (s *MihomoService) waitForMihomoReady() error {
	pidFile := filepath.Join(s.appConfig.Mihomo.WorkingDir, "mihomo.pid")
	maxWait := 10 * time.Second
	checkInterval := 500 * time.Millisecond
	elapsed := time.Duration(0)

	needTUN := s.appConfig.Mihomo.Routing.TCP == config.RoutingModeTUN ||
		s.appConfig.Mihomo.Routing.UDP == config.RoutingModeTUN

	if needTUN {
		logger.Debug("Waiting for TUN interface to be ready")
	} else {
		logger.Debug("Waiting for mihomo process to be ready")
	}

	for elapsed < maxWait {
		pidData, err := os.ReadFile(pidFile)
		if err == nil {
			var pid int
			if _, err := fmt.Sscanf(string(pidData), "%d", &pid); err == nil {
				process, err := os.FindProcess(pid)
				if err == nil {
					if err := process.Signal(syscall.Signal(0)); err == nil {
						if needTUN {
							tunDevice := s.appConfig.Mihomo.Routing.TunDevice
							if tunDevice == "" {
								tunDevice = "Meta"
							}
							_, err := netlink.LinkByName(tunDevice)
							if err == nil {
								logger.Info("TUN interface is ready")
								return nil
							}
							logger.Debugf("TUN interface not ready yet, elapsed: %v", elapsed)
						} else {
							logger.Info("Mihomo process is ready")
							return nil
						}
					} else {
						logger.Error("Mihomo process died unexpectedly")
						return fmt.Errorf("mihomo process died")
					}
				}
			}
		}

		time.Sleep(checkInterval)
		elapsed += checkInterval
	}

	if needTUN {
		logger.Error("Timeout waiting for TUN interface")
		return fmt.Errorf("timeout waiting for TUN interface")
	}
	logger.Error("Timeout waiting for mihomo to be ready")
	return fmt.Errorf("timeout waiting for mihomo to be ready")
}

func (s *MihomoService) adjustMihomoConfig() error {
	routing := s.appConfig.Mihomo.Routing
	needTUN := routing.TCP == config.RoutingModeTUN || routing.UDP == config.RoutingModeTUN

	configData, err := os.ReadFile(s.appConfig.Mihomo.ConfigPath)
	if err != nil {
		return fmt.Errorf("failed to read mihomo config: %w", err)
	}

	configStr := string(configData)

	if needTUN {
		tunDevice := s.appConfig.Mihomo.Routing.TunDevice
		if tunDevice == "" {
			tunDevice = "Meta"
		}
		configStr = ensureTUNEnabled(configStr, tunDevice)
	} else {
		configStr = ensureTUNDisabled(configStr)
	}

	err = os.WriteFile(s.appConfig.Mihomo.ConfigPath, []byte(configStr), 0644)
	if err != nil {
		return fmt.Errorf("failed to write mihomo config: %w", err)
	}

	return nil
}

func ensureTUNEnabled(config string, deviceName string) string {
	lines := splitLines(config)
	var newLines []string
	inTunSection := false
	hasDeviceField := false
	tunSectionIndent := "  "

	tempInTun := false
	for _, line := range lines {
		trimmed := trimSpace(line)
		if trimmed == "tun:" {
			tempInTun = true
			continue
		}
		if tempInTun {
			if len(trimmed) > 0 {
				isIndented := len(line) > 0 && (line[0] == ' ' || line[0] == '\t')
				if !isIndented {
					tempInTun = false
				} else if startsWith(trimmed, "device:") {
					hasDeviceField = true
				}
			}
		}
	}

	for _, line := range lines {
		trimmed := trimSpace(line)

		if trimmed == "tun:" {
			inTunSection = true
			newLines = append(newLines, line)
			continue
		}

		if inTunSection {
			if len(trimmed) > 0 {
				isIndented := len(line) > 0 && (line[0] == ' ' || line[0] == '\t')
				if !isIndented {
					inTunSection = false
				}
			}
		}

		if inTunSection {
			if len(trimmed) > 0 && startsWith(trimmed, " ") {
				if len(line) > len(trimmed) {
					tunSectionIndent = line[:len(line)-len(trimmed)]
				}
			}

			if startsWith(trimmed, "enable:") {
				if strings.Contains(line, "false") {
					newLines = append(newLines, replaceInString(line, "enable: false", "enable: true"))
				} else {
					newLines = append(newLines, line)
				}

				if !hasDeviceField {
					newLines = append(newLines, tunSectionIndent+"device: "+deviceName)
					hasDeviceField = true
				}
				continue
			}

			if startsWith(trimmed, "device:") {
				idx := strings.Index(line, ":")
				if idx != -1 {
					prefix := line[:idx+1]
					newLines = append(newLines, prefix+" "+deviceName)
				} else {
					newLines = append(newLines, line)
				}
				continue
			}
		}

		newLines = append(newLines, line)
	}
	return joinLines(newLines)
}

func ensureTUNDisabled(config string) string {
	lines := splitLines(config)
	inTunSection := false

	for i, line := range lines {
		trimmed := trimSpace(line)

		if trimmed == "tun:" {
			inTunSection = true
			continue
		}

		if inTunSection && startsWith(trimmed, "enable:") {
			lines[i] = replaceInString(line, "enable: true", "enable: false")
			inTunSection = false
		}

		if inTunSection && len(trimmed) > 0 && !startsWith(trimmed, " ") && trimmed[0] != ' ' {
			inTunSection = false
		}
	}

	return joinLines(lines)
}

func splitLines(s string) []string {
	result := []string{}
	current := ""
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			result = append(result, current)
			current = ""
		} else {
			current += string(s[i])
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

func joinLines(lines []string) string {
	result := ""
	for i, line := range lines {
		result += line
		if i < len(lines)-1 {
			result += "\n"
		}
	}
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)

	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}

	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\r') {
		end--
	}

	return s[start:end]
}

func startsWith(s, prefix string) bool {
	if len(s) < len(prefix) {
		return false
	}
	for i := 0; i < len(prefix); i++ {
		if s[i] != prefix[i] {
			return false
		}
	}
	return true
}

func replaceInString(s, old, new string) string {
	result := ""
	i := 0
	for i < len(s) {
		found := true
		if i+len(old) <= len(s) {
			for j := 0; j < len(old); j++ {
				if s[i+j] != old[j] {
					found = false
					break
				}
			}
		} else {
			found = false
		}

		if found {
			result += new
			i += len(old)
		} else {
			result += string(s[i])
			i++
		}
	}
	return result
}

func (s *MihomoService) GetLogs(lines int) ([]string, error) {
	if s.appConfig.Mihomo.LogFile == "" {
		return nil, fmt.Errorf("log file not configured")
	}

	data, err := os.ReadFile(s.appConfig.Mihomo.LogFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read log file: %w", err)
	}

	allLines := splitLines(string(data))

	start := 0
	if len(allLines) > lines {
		start = len(allLines) - lines
	}

	return allLines[start:], nil
}

func (s *MihomoService) ClearLogs() error {
	if s.appConfig.Mihomo.LogFile == "" {
		return fmt.Errorf("log file not configured")
	}

	file, err := os.OpenFile(s.appConfig.Mihomo.LogFile, os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to clear log file: %w", err)
	}
	defer file.Close()

	return nil
}
