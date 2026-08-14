package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv          string
	HTTPPort        int
	DBURL           string
	JWTSecret       string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	CookieSecure    bool
}

func Load() (*Config, error) {
	cfg := &Config{}

	cfg.AppEnv = envOrDefault("APP_ENV", "development")

	port, err := envInt("HTTP_PORT", 8080)
	if err != nil {
		return nil, err
	}
	cfg.HTTPPort = port

	cfg.DBURL = os.Getenv("DB_URL")
	if cfg.DBURL == "" {
		return nil, fmt.Errorf("config: DB_URL is required")
	}

	cfg.JWTSecret = os.Getenv("JWT_ACCESS_SECRET")
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("config: JWT_ACCESS_SECRET is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("config: JWT_ACCESS_SECRET must be at least 32 characters")
	}

	accessTTL, err := envDuration("ACCESS_TOKEN_TTL", 15*time.Minute)
	if err != nil {
		return nil, err
	}
	cfg.AccessTokenTTL = accessTTL

	refreshTTL, err := envDuration("REFRESH_TOKEN_TTL", 30*24*time.Hour)
	if err != nil {
		return nil, err
	}
	cfg.RefreshTokenTTL = refreshTTL

	var secure bool
	secureVal := strings.TrimSpace(os.Getenv("COOKIE_SECURE"))
	if secureVal == "" {
		secure = cfg.AppEnv == "production"
	} else {
		secure, err = strconv.ParseBool(secureVal)
		if err != nil {
			return nil, fmt.Errorf("config: COOKIE_SECURE must be a boolean, got %q", secureVal)
		}
	}
	cfg.CookieSecure = secure

	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) (int, error) {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("config: %s must be an integer, got %q", key, v)
	}
	return n, nil
}

func envDuration(key string, fallback time.Duration) (time.Duration, error) {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("config: %s must be a duration (e.g. 15m, 24h), got %q", key, v)
	}
	return d, nil
}
