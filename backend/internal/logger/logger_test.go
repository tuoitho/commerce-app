package logger

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"commerce-backend/internal/config"
)

func TestLogger_Bootstrap_TextFormat_DefaultInfo(t *testing.T) {
	var buf bytes.Buffer
	l := NewBootstrapLoggerWithWriter("development", "", &buf)

	l.Debug("debug message")
	l.Info("hello world", "key", "val")

	out := buf.String()
	if strings.Contains(out, "debug message") {
		t.Errorf("expected debug message to be filtered out at default info level, got %s", out)
	}
	if !strings.Contains(out, "hello world") || !strings.Contains(out, "key=val") {
		t.Errorf("expected text formatted info log, got %s", out)
	}
}

func TestLogger_Bootstrap_ProductionJSONFormat(t *testing.T) {
	var buf bytes.Buffer
	l := NewBootstrapLoggerWithWriter("production", "debug", &buf)

	l.Debug("bootstrap starting", "phase", "init")

	var parsed map[string]interface{}
	if err := json.Unmarshal(buf.Bytes(), &parsed); err != nil {
		t.Fatalf("expected valid JSON output in production, got %q: %v", buf.String(), err)
	}

	if parsed["level"] != "DEBUG" {
		t.Errorf("expected level DEBUG, got %v", parsed["level"])
	}
	if parsed["msg"] != "bootstrap starting" {
		t.Errorf("expected msg 'bootstrap starting', got %v", parsed["msg"])
	}
	if parsed["phase"] != "init" {
		t.Errorf("expected phase 'init', got %v", parsed["phase"])
	}
	if _, ok := parsed["time"]; !ok {
		t.Errorf("expected timestamp 'time' field in JSON log, got %v", parsed)
	}
}

func TestLogger_Application_TextFormat(t *testing.T) {
	cfg := &config.Config{
		AppEnv:   "development",
		LogLevel: "debug",
	}

	var buf bytes.Buffer
	l := NewWithWriter(cfg, &buf)

	l.Debug("debug trace")
	l.Info("service up")

	out := buf.String()
	if !strings.Contains(out, "debug trace") || !strings.Contains(out, "service up") {
		t.Errorf("expected both debug and info in output, got %s", out)
	}
}

func TestLogger_Application_ProductionJSONFormat(t *testing.T) {
	cfg := &config.Config{
		AppEnv:   "production",
		LogLevel: "warn",
	}

	var buf bytes.Buffer
	l := NewWithWriter(cfg, &buf)

	l.Info("should be ignored")
	l.Warn("warning happened", "error_code", "db_timeout")

	out := buf.String()
	if strings.Contains(out, "should be ignored") {
		t.Errorf("expected info log to be filtered out at warn level, got %s", out)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &parsed); err != nil {
		t.Fatalf("expected valid JSON log, got %q: %v", out, err)
	}

	if parsed["level"] != "WARN" {
		t.Errorf("expected level WARN, got %v", parsed["level"])
	}
	if parsed["msg"] != "warning happened" {
		t.Errorf("expected msg 'warning happened', got %v", parsed["msg"])
	}
	if parsed["error_code"] != "db_timeout" {
		t.Errorf("expected error_code 'db_timeout', got %v", parsed["error_code"])
	}
}

func TestLogger_ParseLevel(t *testing.T) {
	cases := []struct {
		input    string
		expected slog.Level
	}{
		{"debug", slog.LevelDebug},
		{"DEBUG", slog.LevelDebug},
		{"info", slog.LevelInfo},
		{"INFO", slog.LevelInfo},
		{"warn", slog.LevelWarn},
		{"WARN", slog.LevelWarn},
		{"warning", slog.LevelWarn},
		{"error", slog.LevelError},
		{"ERROR", slog.LevelError},
		{"unknown", slog.LevelInfo},
		{"", slog.LevelInfo},
	}

	for _, tc := range cases {
		lvl := ParseLevel(tc.input)
		if lvl != tc.expected {
			t.Errorf("ParseLevel(%q) = %v, expected %v", tc.input, lvl, tc.expected)
		}
	}
}
