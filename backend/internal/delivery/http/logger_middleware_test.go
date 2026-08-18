package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestLoggingMiddleware_RecordsRequestInfo(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	r := gin.New()
	r.Use(LoggingMiddleware(logger))
	r.GET("/api/v1/test-route", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/test-route", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &parsed); err != nil {
		t.Fatalf("failed to parse log json: %v, log output: %s", err, buf.String())
	}

	if parsed["msg"] != "http request" {
		t.Errorf("expected msg 'http request', got %v", parsed["msg"])
	}
	if parsed["method"] != "GET" {
		t.Errorf("expected method 'GET', got %v", parsed["method"])
	}
	if parsed["path"] != "/api/v1/test-route" {
		t.Errorf("expected path '/api/v1/test-route', got %v", parsed["path"])
	}
	if parsed["status"] != float64(200) {
		t.Errorf("expected status 200, got %v", parsed["status"])
	}
}

func TestRecoveryMiddleware_HandlesPanicWithStandardEnvelope(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	r := gin.New()
	r.Use(RecoveryMiddleware(logger))
	r.GET("/panic", func(c *gin.Context) {
		panic("database connection dropped")
	})

	req := httptest.NewRequest(http.MethodGet, "/panic", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d", w.Code)
	}

	var resp ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response envelope: %v", err)
	}

	if resp.Success != false {
		t.Errorf("expected success false, got %v", resp.Success)
	}
	if resp.Error == nil || resp.Error.Code != "internal" {
		t.Errorf("expected error code 'internal', got %v", resp.Error)
	}
	if resp.Message != "Lỗi máy chủ nội bộ" {
		t.Errorf("expected Vietnamese error message, got %q", resp.Message)
	}

	// Verify panic was logged
	out := buf.String()
	if !strings.Contains(out, "panic recovered") || !strings.Contains(out, "database connection dropped") {
		t.Errorf("expected log to contain panic details, got %s", out)
	}
}

func TestWriteError_InternalErrorLogsViaSlog(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	r := gin.New()
	r.Use(LoggingMiddleware(logger))
	r.GET("/internal-error", func(c *gin.Context) {
		writeError(c, errors.New("sql query execution failed: table corrupted"))
	})

	req := httptest.NewRequest(http.MethodGet, "/internal-error", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d", w.Code)
	}

	var resp ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp.Success != false || resp.Error.Code != "internal" {
		t.Errorf("expected internal error envelope, got %+v", resp)
	}

	out := buf.String()
	if !strings.Contains(out, "internal error") || !strings.Contains(out, "sql query execution failed") {
		t.Errorf("expected slog to capture internal error, got %s", out)
	}
}
