package config

import (
	"os"
	"testing"
)

func TestConfig_AdminBootstrapEnv(t *testing.T) {
	os.Setenv("DB_URL", "postgres://user:pass@localhost:5432/db")
	os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")
	os.Setenv("ADMIN_BOOTSTRAP_EMAIL", "admin@domain.com")
	os.Setenv("ADMIN_BOOTSTRAP_PASSWORD", "adminpassword123")
	defer func() {
		os.Unsetenv("DB_URL")
		os.Unsetenv("JWT_ACCESS_SECRET")
		os.Unsetenv("ADMIN_BOOTSTRAP_EMAIL")
		os.Unsetenv("ADMIN_BOOTSTRAP_PASSWORD")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.AdminBootstrapEmail != "admin@domain.com" {
		t.Fatalf("expected AdminBootstrapEmail admin@domain.com, got %s", cfg.AdminBootstrapEmail)
	}
	if cfg.AdminBootstrapPassword != "adminpassword123" {
		t.Fatalf("expected AdminBootstrapPassword adminpassword123, got %s", cfg.AdminBootstrapPassword)
	}
}

func TestConfig_AdminBootstrapEnv_DefaultEmpty(t *testing.T) {
	os.Setenv("DB_URL", "postgres://user:pass@localhost:5432/db")
	os.Setenv("JWT_ACCESS_SECRET", "super-secret-key-that-is-at-least-32-chars-long")
	os.Unsetenv("ADMIN_BOOTSTRAP_EMAIL")
	os.Unsetenv("ADMIN_BOOTSTRAP_PASSWORD")
	defer func() {
		os.Unsetenv("DB_URL")
		os.Unsetenv("JWT_ACCESS_SECRET")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.AdminBootstrapEmail != "" {
		t.Fatalf("expected empty AdminBootstrapEmail, got %s", cfg.AdminBootstrapEmail)
	}
	if cfg.AdminBootstrapPassword != "" {
		t.Fatalf("expected empty AdminBootstrapPassword, got %s", cfg.AdminBootstrapPassword)
	}
}
