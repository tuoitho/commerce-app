package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func clearEnv() func() {
	keys := []string{
		"APP_ENV",
		"HTTP_PORT",
		"DB_URL",
		"JWT_ACCESS_SECRET",
		"ACCESS_TOKEN_TTL",
		"REFRESH_TOKEN_TTL",
		"COOKIE_SECURE",
		"ADMIN_BOOTSTRAP_EMAIL",
		"ADMIN_BOOTSTRAP_PASSWORD",
		"LOG_LEVEL",
		"ORDER_CONFIRM_TIMEOUT",
		"SHIPPING_FEE_VND",
	}

	saved := make(map[string]string)
	for _, k := range keys {
		if v, ok := os.LookupEnv(k); ok {
			saved[k] = v
		}
		os.Unsetenv(k)
	}

	return func() {
		for _, k := range keys {
			os.Unsetenv(k)
			if v, ok := saved[k]; ok {
				os.Setenv(k, v)
			}
		}
	}
}

func TestConfig_Defaults(t *testing.T) {
	restore := clearEnv()
	defer restore()

	os.Setenv("DB_URL", "postgres://localhost:5432/commerce")
	os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")

	cfg, err := LoadWithFile("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.AppEnv != "development" {
		t.Errorf("expected AppEnv 'development', got %q", cfg.AppEnv)
	}
	if cfg.HTTPPort != 8080 {
		t.Errorf("expected HTTPPort 8080, got %d", cfg.HTTPPort)
	}
	if cfg.AccessTokenTTL != 15*time.Minute {
		t.Errorf("expected AccessTokenTTL 15m, got %v", cfg.AccessTokenTTL)
	}
	if cfg.RefreshTokenTTL != 720*time.Hour {
		t.Errorf("expected RefreshTokenTTL 720h, got %v", cfg.RefreshTokenTTL)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("expected LogLevel 'info', got %q", cfg.LogLevel)
	}
	if cfg.CookieSecure != false {
		t.Errorf("expected CookieSecure false for development, got %v", cfg.CookieSecure)
	}
	if cfg.AdminBootstrapEmail != "" || cfg.AdminBootstrapPassword != "" {
		t.Errorf("expected empty admin credentials, got email=%q password=%q", cfg.AdminBootstrapEmail, cfg.AdminBootstrapPassword)
	}
	if cfg.OrderConfirmTimeout != 1*time.Minute {
		t.Errorf("expected OrderConfirmTimeout 1m, got %v", cfg.OrderConfirmTimeout)
	}
	if cfg.ShippingFeeVND != "0" {
		t.Errorf("expected ShippingFeeVND '0', got %q", string(cfg.ShippingFeeVND))
	}
}

func TestConfig_ProductionCookieSecureDefault(t *testing.T) {
	restore := clearEnv()
	defer restore()

	os.Setenv("APP_ENV", "production")
	os.Setenv("DB_URL", "postgres://localhost:5432/commerce")
	os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")

	cfg, err := LoadWithFile("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.CookieSecure != true {
		t.Errorf("expected CookieSecure true in production by default, got %v", cfg.CookieSecure)
	}
}

func TestConfig_EnvOverridesDotEnvFile(t *testing.T) {
	restore := clearEnv()
	defer restore()

	tempDir := t.TempDir()
	envPath := filepath.Join(tempDir, ".env")
	envContent := `
APP_ENV=production
HTTP_PORT=9090
DB_URL=postgres://file-url:5432/db
JWT_ACCESS_SECRET=file-secret-key-that-is-at-least-32-chars-long
LOG_LEVEL=debug
`
	if err := os.WriteFile(envPath, []byte(envContent), 0600); err != nil {
		t.Fatalf("failed to write temp .env: %v", err)
	}

	// Environment variable overrides file value
	os.Setenv("HTTP_PORT", "3000")
	os.Setenv("LOG_LEVEL", "warn")

	cfg, err := LoadWithFile(envPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.HTTPPort != 3000 {
		t.Errorf("expected HTTPPort 3000 from env override, got %d", cfg.HTTPPort)
	}
	if cfg.LogLevel != "warn" {
		t.Errorf("expected LogLevel 'warn' from env override, got %q", cfg.LogLevel)
	}
	if cfg.AppEnv != "production" {
		t.Errorf("expected AppEnv 'production' from file, got %q", cfg.AppEnv)
	}
	if cfg.DBURL != "postgres://file-url:5432/db" {
		t.Errorf("expected DBURL from file, got %q", cfg.DBURL)
	}
}

func TestConfig_MissingDotEnvFileContinues(t *testing.T) {
	restore := clearEnv()
	defer restore()

	os.Setenv("DB_URL", "postgres://localhost:5432/commerce")
	os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")

	cfg, err := LoadWithFile("non_existent_file.env")
	if err != nil {
		t.Fatalf("expected missing .env to be ignored, got error: %v", err)
	}
	if cfg.DBURL != "postgres://localhost:5432/commerce" {
		t.Errorf("expected DBURL from env, got %q", cfg.DBURL)
	}
}

func TestConfig_ValidationFailures(t *testing.T) {
	tests := []struct {
		name        string
		env         map[string]string
		errContains string
	}{
		{
			name: "missing DB_URL",
			env: map[string]string{
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
			},
			errContains: "DB_URL is required",
		},
		{
			name: "missing JWT_ACCESS_SECRET",
			env: map[string]string{
				"DB_URL": "postgres://localhost:5432/commerce",
			},
			errContains: "JWT_ACCESS_SECRET is required",
		},
		{
			name: "short JWT_ACCESS_SECRET",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "short-secret",
			},
			errContains: "JWT_ACCESS_SECRET must be at least 32 characters",
		},
		{
			name: "invalid HTTP_PORT",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"HTTP_PORT":         "not-a-number",
			},
			errContains: "HTTP_PORT must be an integer",
		},
		{
			name: "invalid ACCESS_TOKEN_TTL",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"ACCESS_TOKEN_TTL":  "invalid-duration",
			},
			errContains: "ACCESS_TOKEN_TTL must be a duration",
		},
		{
			name: "invalid REFRESH_TOKEN_TTL",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"REFRESH_TOKEN_TTL": "100xyz",
			},
			errContains: "REFRESH_TOKEN_TTL must be a duration",
		},
		{
			name: "invalid COOKIE_SECURE",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"COOKIE_SECURE":     "not-a-bool",
			},
			errContains: "COOKIE_SECURE must be a boolean",
		},
		{
			name: "invalid LOG_LEVEL",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"LOG_LEVEL":         "verbose",
			},
			errContains: "LOG_LEVEL must be one of debug, info, warn, error",
		},
		{
			name: "invalid ORDER_CONFIRM_TIMEOUT",
			env: map[string]string{
				"DB_URL":                "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET":     "super-secret-key-that-is-at-least-32-chars-long",
				"ORDER_CONFIRM_TIMEOUT": "invalid-duration",
			},
			errContains: "ORDER_CONFIRM_TIMEOUT must be a duration",
		},
		{
			name: "invalid non-canonical SHIPPING_FEE_VND with negative amount",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"SHIPPING_FEE_VND":  "-5000",
			},
			errContains: "SHIPPING_FEE_VND must be a valid canonical VND amount",
		},
		{
			name: "invalid non-canonical SHIPPING_FEE_VND with decimal",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"SHIPPING_FEE_VND":  "15000.50",
			},
			errContains: "SHIPPING_FEE_VND must be a valid canonical VND amount",
		},
		{
			name: "invalid non-canonical SHIPPING_FEE_VND with leading zero",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"SHIPPING_FEE_VND":  "015000",
			},
			errContains: "SHIPPING_FEE_VND must be a valid canonical VND amount",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			restore := clearEnv()
			defer restore()

			for k, v := range tt.env {
				os.Setenv(k, v)
			}

			_, err := LoadWithFile("")
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.errContains)
			}
			if !strings.Contains(err.Error(), tt.errContains) {
				t.Errorf("expected error containing %q, got %q", tt.errContains, err.Error())
			}
		})
	}
}

func TestConfig_LogLevelParsing(t *testing.T) {
	validLevels := []string{"debug", "DEBUG", "Info", "WARN", "error", "ERROR"}
	for _, lvl := range validLevels {
		t.Run(lvl, func(t *testing.T) {
			restore := clearEnv()
			defer restore()

			os.Setenv("DB_URL", "postgres://localhost:5432/commerce")
			os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")
			os.Setenv("LOG_LEVEL", lvl)

			cfg, err := LoadWithFile("")
			if err != nil {
				t.Fatalf("unexpected error for log level %q: %v", lvl, err)
			}
			if cfg.LogLevel != strings.ToLower(lvl) {
				t.Errorf("expected LogLevel %q, got %q", strings.ToLower(lvl), cfg.LogLevel)
			}
		})
	}
}

func TestConfig_OrderPlacementConfigs(t *testing.T) {
	restore := clearEnv()
	defer restore()

	os.Setenv("DB_URL", "postgres://localhost:5432/commerce")
	os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")
	os.Setenv("ORDER_CONFIRM_TIMEOUT", "45m")
	os.Setenv("SHIPPING_FEE_VND", "30000")

	cfg, err := LoadWithFile("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.OrderConfirmTimeout != 45*time.Minute {
		t.Errorf("expected OrderConfirmTimeout 45m, got %v", cfg.OrderConfirmTimeout)
	}
	if cfg.ShippingFeeVND != "30000" {
		t.Errorf("expected ShippingFeeVND '30000', got %q", string(cfg.ShippingFeeVND))
	}
}

