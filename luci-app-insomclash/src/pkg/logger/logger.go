package logger

import (
	"io"
	"log"
	"os"
	"path/filepath"
)

var (
	logFile  *os.File
	logLevel string
)

const (
	LevelDebug = "debug"
	LevelInfo  = "info"
	LevelWarn  = "warn"
	LevelError = "error"
)

func Init(level, logPath string) error {
	logLevel = level
	log.SetFlags(log.LstdFlags)

	if logPath != "" {
		logDir := filepath.Dir(logPath)
		if err := os.MkdirAll(logDir, 0755); err != nil {
			log.Printf("Failed to create log directory: %v", err)
			return err
		}

		var err error
		logFile, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			log.Printf("Failed to open log file: %v", err)
			return err
		}

		multiWriter := io.MultiWriter(os.Stdout, logFile)
		log.SetOutput(multiWriter)
	}

	switch level {
	case LevelDebug:
		log.Println("Logger initialized in DEBUG mode")
	case LevelInfo:
		log.Println("Logger initialized in INFO mode")
	case LevelWarn:
		log.Println("Logger initialized in WARN mode")
	case LevelError:
		log.Println("Logger initialized in ERROR mode")
	default:
		logLevel = LevelInfo
		log.Println("Logger initialized in INFO mode (default)")
	}

	return nil
}

func Close() {
	if logFile != nil {
		logFile.Close()
	}
}

func shouldLog(level string) bool {
	levels := map[string]int{
		LevelDebug: 0,
		LevelInfo:  1,
		LevelWarn:  2,
		LevelError: 3,
	}

	currentLevel, ok1 := levels[logLevel]
	targetLevel, ok2 := levels[level]

	if !ok1 || !ok2 {
		return true
	}

	return targetLevel >= currentLevel
}

func Debug(msg string) {
	if shouldLog(LevelDebug) {
		log.Printf("[DEBUG] %s", msg)
	}
}

func Debugf(format string, args ...interface{}) {
	if shouldLog(LevelDebug) {
		log.Printf("[DEBUG] "+format, args...)
	}
}

func Info(msg string) {
	if shouldLog(LevelInfo) {
		log.Printf("[INFO] %s", msg)
	}
}

func Infof(format string, args ...interface{}) {
	if shouldLog(LevelInfo) {
		log.Printf("[INFO] "+format, args...)
	}
}

func Warn(msg string) {
	if shouldLog(LevelWarn) {
		log.Printf("[WARN] %s", msg)
	}
}

func Warnf(format string, args ...interface{}) {
	if shouldLog(LevelWarn) {
		log.Printf("[WARN] "+format, args...)
	}
}

func Error(msg string) {
	if shouldLog(LevelError) {
		log.Printf("[ERROR] %s", msg)
	}
}

func Errorf(format string, args ...interface{}) {
	if shouldLog(LevelError) {
		log.Printf("[ERROR] "+format, args...)
	}
}

func Fatal(msg string) {
	log.Fatalf("[FATAL] %s", msg)
}

func Fatalf(format string, args ...interface{}) {
	log.Fatalf("[FATAL] "+format, args...)
}
