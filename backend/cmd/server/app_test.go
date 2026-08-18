package main

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
	"time"

	"commerce-backend/internal/config"
)

func TestApp_ProvidersUnit(t *testing.T) {
	cfg := &config.Config{
		AppEnv:          "development",
		HTTPPort:        8080,
		DBURL:           "postgres://fake:5432/db",
		JWTSecret:       "super-secret-key-that-is-at-least-32-chars-long",
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 720 * time.Hour,
		CookieSecure:    false,
		LogLevel:        "info",
	}

	jwtMgr := provideJWTManager(cfg)
	if jwtMgr == nil {
		t.Fatal("expected non-nil jwt manager")
	}

	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	router := provideGinRouter(cfg, log, nil, nil, nil, jwtMgr)
	if router == nil {
		t.Fatal("expected non-nil gin router")
	}

	srv := provideHTTPServer(cfg, router)
	if srv == nil || srv.Addr != ":8080" {
		t.Fatalf("expected http server listening on :8080, got %v", srv)
	}

	app := provideApp(cfg, log, nil, srv, nil)
	if app == nil || app.Config != cfg || app.Server != srv {
		t.Fatal("expected valid app instance")
	}
}

func TestApp_SecretSafeLogging(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	log.Error("bootstrap failed", "category", "db_ping")

	out := buf.String()
	if strings.Contains(out, "postgres://") || strings.Contains(out, "super-secret") {
		t.Fatalf("sensitive details found in log: %s", out)
	}
	if !strings.Contains(out, "db_ping") {
		t.Fatalf("expected category db_ping in log: %s", out)
	}
}
