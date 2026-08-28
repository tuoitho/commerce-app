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
		"MINIO_ENDPOINT",
		"MINIO_ACCESS_KEY",
		"MINIO_SECRET_KEY",
		"MINIO_BUCKET",
		"MINIO_USE_SSL",
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
	os.Setenv("MINIO_ENDPOINT", "localhost:19000")
	os.Setenv("MINIO_ACCESS_KEY", "minioadmin")
	os.Setenv("MINIO_SECRET_KEY", "miniopassword")

	cfg, err := LoadWithFile("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.AppEnv != "development" {
		t.Errorf("expected AppEnv 'development', got %q", cfg.AppEnv)
	}
	if cfg.HTTPPort != 18080 {
		t.Errorf("expected HTTPPort 18080, got %d", cfg.HTTPPort)
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
	if cfg.OrderConfirmTimeout != 30*time.Minute {
		t.Errorf("expected OrderConfirmTimeout 30m, got %v", cfg.OrderConfirmTimeout)
	}
	if cfg.ShippingFeeVND != "0" {
		t.Errorf("expected ShippingFeeVND '0', got %q", string(cfg.ShippingFeeVND))
	}
	if cfg.MinioEndpoint != "localhost:19000" {
		t.Errorf("expected MinioEndpoint 'localhost:19000', got %q", cfg.MinioEndpoint)
	}
	if cfg.MinioAccessKey != "minioadmin" {
		t.Errorf("expected MinioAccessKey 'minioadmin', got %q", cfg.MinioAccessKey)
	}
	if cfg.MinioSecretKey != "miniopassword" {
		t.Errorf("expected MinioSecretKey 'miniopassword', got %q", cfg.MinioSecretKey)
	}
	if cfg.MinioBucket != "product-review-media" {
		t.Errorf("expected MinioBucket 'product-review-media', got %q", cfg.MinioBucket)
	}
	if cfg.MinioUseSSL != false {
		t.Errorf("expected MinioUseSSL false, got %v", cfg.MinioUseSSL)
	}
}

func TestConfig_ProductionCookieSecureDefault(t *testing.T) {
	restore := clearEnv()
	defer restore()

	os.Setenv("APP_ENV", "production")
	os.Setenv("DB_URL", "postgres://localhost:5432/commerce")
	os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")
	os.Setenv("MINIO_ENDPOINT", "localhost:19000")
	os.Setenv("MINIO_ACCESS_KEY", "minioadmin")
	os.Setenv("MINIO_SECRET_KEY", "miniopassword")

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
MINIO_ENDPOINT=file-minio:9000
MINIO_ACCESS_KEY=file-access-key
MINIO_SECRET_KEY=file-secret-key
MINIO_BUCKET=file-bucket
MINIO_USE_SSL=true
`
	if err := os.WriteFile(envPath, []byte(envContent), 0600); err != nil {
		t.Fatalf("failed to write temp .env: %v", err)
	}

	// Environment variable overrides file value
	os.Setenv("HTTP_PORT", "3000")
	os.Setenv("LOG_LEVEL", "warn")
	os.Setenv("MINIO_ENDPOINT", "env-minio:9000")
	os.Setenv("MINIO_BUCKET", "env-bucket")

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
	if cfg.MinioEndpoint != "env-minio:9000" {
		t.Errorf("expected MinioEndpoint 'env-minio:9000' from env override, got %q", cfg.MinioEndpoint)
	}
	if cfg.MinioAccessKey != "file-access-key" {
		t.Errorf("expected MinioAccessKey 'file-access-key' from file, got %q", cfg.MinioAccessKey)
	}
	if cfg.MinioSecretKey != "file-secret-key" {
		t.Errorf("expected MinioSecretKey 'file-secret-key' from file, got %q", cfg.MinioSecretKey)
	}
	if cfg.MinioBucket != "env-bucket" {
		t.Errorf("expected MinioBucket 'env-bucket' from env override, got %q", cfg.MinioBucket)
	}
	if cfg.MinioUseSSL != true {
		t.Errorf("expected MinioUseSSL true from file, got %v", cfg.MinioUseSSL)
	}
}

func TestConfig_MissingDotEnvFileContinues(t *testing.T) {
	restore := clearEnv()
	defer restore()

	os.Setenv("DB_URL", "postgres://localhost:5432/commerce")
	os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")
	os.Setenv("MINIO_ENDPOINT", "localhost:19000")
	os.Setenv("MINIO_ACCESS_KEY", "minioadmin")
	os.Setenv("MINIO_SECRET_KEY", "miniopassword")

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
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "DB_URL is required",
		},
		{
			name: "missing JWT_ACCESS_SECRET",
			env: map[string]string{
				"DB_URL":           "postgres://localhost:5432/commerce",
				"MINIO_ENDPOINT":   "localhost:19000",
				"MINIO_ACCESS_KEY":  "minioadmin",
				"MINIO_SECRET_KEY":  "miniopassword",
			},
			errContains: "JWT_ACCESS_SECRET is required",
		},
		{
			name: "short JWT_ACCESS_SECRET",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "short-secret",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "JWT_ACCESS_SECRET must be at least 32 characters",
		},
		{
			name: "invalid HTTP_PORT",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"HTTP_PORT":         "not-a-number",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "HTTP_PORT must be an integer",
		},
		{
			name: "invalid ACCESS_TOKEN_TTL",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"ACCESS_TOKEN_TTL":  "invalid-duration",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "ACCESS_TOKEN_TTL must be a duration",
		},
		{
			name: "invalid REFRESH_TOKEN_TTL",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"REFRESH_TOKEN_TTL": "100xyz",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "REFRESH_TOKEN_TTL must be a duration",
		},
		{
			name: "invalid COOKIE_SECURE",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"COOKIE_SECURE":     "not-a-bool",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "COOKIE_SECURE must be a boolean",
		},
		{
			name: "invalid LOG_LEVEL",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"LOG_LEVEL":         "verbose",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "LOG_LEVEL must be one of debug, info, warn, error",
		},
		{
			name: "invalid ORDER_CONFIRM_TIMEOUT",
			env: map[string]string{
				"DB_URL":                "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET":     "super-secret-key-that-is-at-least-32-chars-long",
				"ORDER_CONFIRM_TIMEOUT": "invalid-duration",
				"MINIO_ENDPOINT":        "localhost:19000",
				"MINIO_ACCESS_KEY":       "minioadmin",
				"MINIO_SECRET_KEY":       "miniopassword",
			},
			errContains: "ORDER_CONFIRM_TIMEOUT must be a duration",
		},
		{
			name: "invalid non-canonical SHIPPING_FEE_VND with negative amount",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"SHIPPING_FEE_VND":  "-5000",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "SHIPPING_FEE_VND must be a valid canonical VND amount",
		},
		{
			name: "invalid non-canonical SHIPPING_FEE_VND with decimal",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"SHIPPING_FEE_VND":  "15000.50",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "SHIPPING_FEE_VND must be a valid canonical VND amount",
		},
		{
			name: "invalid non-canonical SHIPPING_FEE_VND with leading zero",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"SHIPPING_FEE_VND":  "015000",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "SHIPPING_FEE_VND must be a valid canonical VND amount",
		},
		{
			name: "missing MINIO_ENDPOINT",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "MINIO_ENDPOINT is required",
		},
		{
			name: "missing MINIO_ACCESS_KEY",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_SECRET_KEY":   "miniopassword",
			},
			errContains: "MINIO_ACCESS_KEY is required",
		},
		{
			name: "missing MINIO_SECRET_KEY",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
			},
			errContains: "MINIO_SECRET_KEY is required",
		},
		{
			name: "invalid MINIO_USE_SSL",
			env: map[string]string{
				"DB_URL":            "postgres://localhost:5432/commerce",
				"JWT_ACCESS_SECRET": "super-secret-key-that-is-at-least-32-chars-long",
				"MINIO_ENDPOINT":    "localhost:19000",
				"MINIO_ACCESS_KEY":   "minioadmin",
				"MINIO_SECRET_KEY":   "miniopassword",
				"MINIO_USE_SSL":     "not-a-bool",
			},
			errContains: "MINIO_USE_SSL must be a boolean",
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
			os.Setenv("MINIO_ENDPOINT", "localhost:19000")
			os.Setenv("MINIO_ACCESS_KEY", "minioadmin")
			os.Setenv("MINIO_SECRET_KEY", "miniopassword")
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
	os.Setenv("MINIO_ENDPOINT", "localhost:19000")
	os.Setenv("MINIO_ACCESS_KEY", "minioadmin")
	os.Setenv("MINIO_SECRET_KEY", "miniopassword")
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

func TestConfig_MinioCustomSettings(t *testing.T) {
	restore := clearEnv()
	defer restore()

	os.Setenv("DB_URL", "postgres://localhost:5432/commerce")
	os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")
	os.Setenv("MINIO_ENDPOINT", "custom-s3.example.com:9000")
	os.Setenv("MINIO_ACCESS_KEY", "custom-access")
	os.Setenv("MINIO_SECRET_KEY", "custom-secret")
	os.Setenv("MINIO_BUCKET", "custom-review-bucket")
	os.Setenv("MINIO_USE_SSL", "true")

	cfg, err := LoadWithFile("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.MinioEndpoint != "custom-s3.example.com:9000" {
		t.Errorf("expected MinioEndpoint 'custom-s3.example.com:9000', got %q", cfg.MinioEndpoint)
	}
	if cfg.MinioAccessKey != "custom-access" {
		t.Errorf("expected MinioAccessKey 'custom-access', got %q", cfg.MinioAccessKey)
	}
	if cfg.MinioSecretKey != "custom-secret" {
		t.Errorf("expected MinioSecretKey 'custom-secret', got %q", cfg.MinioSecretKey)
	}
	if cfg.MinioBucket != "custom-review-bucket" {
		t.Errorf("expected MinioBucket 'custom-review-bucket', got %q", cfg.MinioBucket)
	}
	if cfg.MinioUseSSL != true {
		t.Errorf("expected MinioUseSSL true, got %v", cfg.MinioUseSSL)
	}
}


