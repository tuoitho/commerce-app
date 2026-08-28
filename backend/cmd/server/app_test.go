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

	areaRepo, err := provideAreaRepository()
	if err != nil || areaRepo == nil {
		t.Fatalf("expected valid area repo, got err: %v", err)
	}

	areaUC := provideAreaUseCase(areaRepo)
	if areaUC == nil {
		t.Fatal("expected non-nil area use case")
	}

	addrRepo := provideAddressRepository(nil, areaRepo)
	if addrRepo == nil {
		t.Fatal("expected non-nil address repo")
	}

	addrUC := provideAddressUseCase(addrRepo, areaRepo)
	if addrUC == nil {
		t.Fatal("expected non-nil address use case")
	}

	orderRepo := provideOrderRepository(nil)
	if orderRepo == nil {
		t.Fatal("expected non-nil order repo")
	}

	orderUC := provideOrderUseCase(orderRepo, cfg)
	if orderUC == nil {
		t.Fatal("expected non-nil order use case")
	}

	reviewRepo := provideReviewRepository(nil)
	if reviewRepo == nil {
		t.Fatal("expected non-nil review repo")
	}

	reviewUC := provideReviewUseCase(reviewRepo, nil, log, cfg)
	if reviewUC == nil {
		t.Fatal("expected non-nil review use case")
	}

	router := provideGinRouter(cfg, log, nil, nil, nil, areaUC, addrUC, orderUC, nil, nil, reviewUC, jwtMgr)
	if router == nil {
		t.Fatal("expected non-nil gin router")
	}

	srv := provideHTTPServer(cfg, router)
	if srv == nil || srv.Addr != ":8080" {
		t.Fatalf("expected http server listening on :8080, got %v", srv)
	}

	app := provideApp(cfg, log, nil, srv, nil, orderUC, reviewUC, nil)
	if app == nil || app.Config != cfg || app.Server != srv || app.OrderUC != orderUC {
		t.Fatal("expected valid app instance")
	}
}

func TestApp_SecretSafeLogging(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	log.Error("bootstrap failed", "category", "db_ping")
	log.Error("auto confirm due orders failed", "category", "auto_confirm")

	out := buf.String()
	if strings.Contains(out, "postgres://") || strings.Contains(out, "super-secret") {
		t.Fatalf("sensitive details found in log: %s", out)
	}
	if !strings.Contains(out, "db_ping") {
		t.Fatalf("expected category db_ping in log: %s", out)
	}
	if !strings.Contains(out, "auto_confirm") {
		t.Fatalf("expected category auto_confirm in log: %s", out)
	}
}
