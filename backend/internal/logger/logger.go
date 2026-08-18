package logger

import (
	"io"
	"log/slog"
	"os"
	"strings"

	"commerce-backend/internal/config"
)

// ParseLevel maps string log level (case-insensitive) to slog.Level.
// Defaults to slog.LevelInfo for unknown or empty values.
func ParseLevel(lvl string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(lvl)) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// NewBootstrapLogger creates a logger using raw process environment before config loading.
// It uses os.Stdout as the output writer.
func NewBootstrapLogger() *slog.Logger {
	appEnv := os.Getenv("APP_ENV")
	logLevel := os.Getenv("LOG_LEVEL")
	return NewBootstrapLoggerWithWriter(appEnv, logLevel, os.Stdout)
}

// NewBootstrapLoggerWithWriter creates a bootstrap logger with the given environment, log level and writer.
func NewBootstrapLoggerWithWriter(appEnv, logLevel string, w io.Writer) *slog.Logger {
	level := ParseLevel(logLevel)
	opts := &slog.HandlerOptions{
		Level: level,
	}

	if strings.TrimSpace(appEnv) == "production" {
		return slog.New(slog.NewJSONHandler(w, opts))
	}
	return slog.New(slog.NewTextHandler(w, opts))
}

// New creates an application logger from the loaded configuration.
func New(cfg *config.Config) *slog.Logger {
	return NewWithWriter(cfg, os.Stdout)
}

// NewWithWriter creates an application logger with the given config and writer.
func NewWithWriter(cfg *config.Config, w io.Writer) *slog.Logger {
	level := ParseLevel(cfg.LogLevel)
	opts := &slog.HandlerOptions{
		Level: level,
	}

	if cfg.AppEnv == "production" {
		return slog.New(slog.NewJSONHandler(w, opts))
	}
	return slog.New(slog.NewTextHandler(w, opts))
}
