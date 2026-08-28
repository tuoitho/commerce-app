package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/viper"

	"commerce-backend/internal/domain"
)

type Config struct {
	AppEnv                 string
	HTTPPort               int
	DBURL                  string
	JWTSecret              string
	AccessTokenTTL         time.Duration
	RefreshTokenTTL        time.Duration
	CookieSecure           bool
	AdminBootstrapEmail    string
	AdminBootstrapPassword string
	LogLevel               string
	OrderConfirmTimeout    time.Duration
	ShippingFeeVND         domain.MoneyVND
	MinIOEndpoint          string
	MinIOAccessKey         string
	MinIOSecretKey         string
	MinIOBucket            string
	MinIOUseSSL            bool
	MinIORequestTimeout    time.Duration
	MinIOReconcilerInterval time.Duration
	MinIOGracePeriod       time.Duration
}

const (
	defaultAppEnv                  = "development"
	defaultHTTPPort                = 8080
	defaultAccessTokenTTL          = 15 * time.Minute
	defaultRefreshTokenTTL         = 720 * time.Hour
	defaultLogLevel                = "info"
	defaultOrderConfirmTimeout     = 1 * time.Minute
	defaultShippingFeeVND          = domain.MoneyVND("0")
	defaultMinIOEndpoint           = "localhost:9000"
	defaultMinIOAccessKey          = "minioadmin"
	defaultMinIOSecretKey          = "minioadmin"
	defaultMinIOBucket             = "product-reviews"
	defaultMinIOUseSSL             = false
	defaultMinIORequestTimeout     = 10 * time.Second
	defaultMinIOReconcilerInterval = 15 * time.Minute
	defaultMinIOGracePeriod        = 60 * time.Minute
)

var allowedLogLevels = map[string]bool{
	"debug": true,
	"info":  true,
	"warn":  true,
	"error": true,
}

// Load loads configuration from environment variables and an optional .env file at the default location.
func Load() (*Config, error) {
	return LoadWithFile(".env")
}

// LoadWithFile loads configuration using the specified .env file path if present.
func LoadWithFile(envFile string) (*Config, error) {
	v := viper.New()

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
		"MINIO_SSL",
		"MINIO_REQUEST_TIMEOUT",
		"MINIO_RECONCILER_INTERVAL",
		"MINIO_GRACE_PERIOD",
	}

	for _, key := range keys {
		_ = v.BindEnv(key)
	}

	v.AutomaticEnv()

	if envFile != "" {
		v.SetConfigFile(envFile)
		v.SetConfigType("env")
		if err := v.ReadInConfig(); err != nil {
			var configFileNotFoundErr viper.ConfigFileNotFoundError
			if !errors.Is(err, os.ErrNotExist) && !errors.As(err, &configFileNotFoundErr) {
				return nil, fmt.Errorf("config: read file %q: %w", envFile, err)
			}
		}
	}

	cfg := &Config{}

	// 1. APP_ENV
	appEnv := strings.TrimSpace(v.GetString("APP_ENV"))
	if appEnv == "" {
		appEnv = defaultAppEnv
	}
	cfg.AppEnv = appEnv

	// 2. HTTP_PORT
	if v.IsSet("HTTP_PORT") {
		rawPort := strings.TrimSpace(v.GetString("HTTP_PORT"))
		if rawPort != "" {
			port, err := strconv.Atoi(rawPort)
			if err != nil {
				return nil, fmt.Errorf("config: HTTP_PORT must be an integer, got %q", rawPort)
			}
			cfg.HTTPPort = port
		} else {
			cfg.HTTPPort = defaultHTTPPort
		}
	} else {
		cfg.HTTPPort = defaultHTTPPort
	}

	// 3. DB_URL (Required)
	dbURL := strings.TrimSpace(v.GetString("DB_URL"))
	if dbURL == "" {
		return nil, fmt.Errorf("config: DB_URL is required")
	}
	cfg.DBURL = dbURL

	// 4. JWT_ACCESS_SECRET (Required, >= 32 chars)
	jwtSecret := strings.TrimSpace(v.GetString("JWT_ACCESS_SECRET"))
	if jwtSecret == "" {
		return nil, fmt.Errorf("config: JWT_ACCESS_SECRET is required")
	}
	if len(jwtSecret) < 32 {
		return nil, fmt.Errorf("config: JWT_ACCESS_SECRET must be at least 32 characters")
	}
	cfg.JWTSecret = jwtSecret

	// 5. ACCESS_TOKEN_TTL
	if v.IsSet("ACCESS_TOKEN_TTL") {
		rawAccessTTL := strings.TrimSpace(v.GetString("ACCESS_TOKEN_TTL"))
		if rawAccessTTL != "" {
			ttl, err := time.ParseDuration(rawAccessTTL)
			if err != nil {
				return nil, fmt.Errorf("config: ACCESS_TOKEN_TTL must be a duration (e.g. 15m, 24h), got %q", rawAccessTTL)
			}
			cfg.AccessTokenTTL = ttl
		} else {
			cfg.AccessTokenTTL = defaultAccessTokenTTL
		}
	} else {
		cfg.AccessTokenTTL = defaultAccessTokenTTL
	}

	// 6. REFRESH_TOKEN_TTL
	if v.IsSet("REFRESH_TOKEN_TTL") {
		rawRefreshTTL := strings.TrimSpace(v.GetString("REFRESH_TOKEN_TTL"))
		if rawRefreshTTL != "" {
			ttl, err := time.ParseDuration(rawRefreshTTL)
			if err != nil {
				return nil, fmt.Errorf("config: REFRESH_TOKEN_TTL must be a duration (e.g. 15m, 24h), got %q", rawRefreshTTL)
			}
			cfg.RefreshTokenTTL = ttl
		} else {
			cfg.RefreshTokenTTL = defaultRefreshTokenTTL
		}
	} else {
		cfg.RefreshTokenTTL = defaultRefreshTokenTTL
	}

	// 7. COOKIE_SECURE
	if v.IsSet("COOKIE_SECURE") {
		rawSecure := strings.TrimSpace(v.GetString("COOKIE_SECURE"))
		if rawSecure != "" {
			secure, err := strconv.ParseBool(rawSecure)
			if err != nil {
				return nil, fmt.Errorf("config: COOKIE_SECURE must be a boolean, got %q", rawSecure)
			}
			cfg.CookieSecure = secure
		} else {
			cfg.CookieSecure = cfg.AppEnv == "production"
		}
	} else {
		cfg.CookieSecure = cfg.AppEnv == "production"
	}

	// 8. ADMIN_BOOTSTRAP_EMAIL & ADMIN_BOOTSTRAP_PASSWORD
	cfg.AdminBootstrapEmail = strings.TrimSpace(v.GetString("ADMIN_BOOTSTRAP_EMAIL"))
	cfg.AdminBootstrapPassword = strings.TrimSpace(v.GetString("ADMIN_BOOTSTRAP_PASSWORD"))

	// 9. LOG_LEVEL
	rawLogLevel := strings.TrimSpace(v.GetString("LOG_LEVEL"))
	if rawLogLevel == "" {
		cfg.LogLevel = defaultLogLevel
	} else {
		normalizedLevel := strings.ToLower(rawLogLevel)
		if !allowedLogLevels[normalizedLevel] {
			return nil, fmt.Errorf("config: LOG_LEVEL must be one of debug, info, warn, error, got %q", rawLogLevel)
		}
		cfg.LogLevel = normalizedLevel
	}

	// 10. ORDER_CONFIRM_TIMEOUT
	if v.IsSet("ORDER_CONFIRM_TIMEOUT") {
		rawTimeout := strings.TrimSpace(v.GetString("ORDER_CONFIRM_TIMEOUT"))
		if rawTimeout != "" {
			timeout, err := time.ParseDuration(rawTimeout)
			if err != nil {
				return nil, fmt.Errorf("config: ORDER_CONFIRM_TIMEOUT must be a duration (e.g. 30m, 1h), got %q", rawTimeout)
			}
			cfg.OrderConfirmTimeout = timeout
		} else {
			cfg.OrderConfirmTimeout = defaultOrderConfirmTimeout
		}
	} else {
		cfg.OrderConfirmTimeout = defaultOrderConfirmTimeout
	}

	// 11. SHIPPING_FEE_VND
	if v.IsSet("SHIPPING_FEE_VND") {
		rawFee := strings.TrimSpace(v.GetString("SHIPPING_FEE_VND"))
		if rawFee != "" {
			fee := domain.MoneyVND(rawFee)
			if !fee.IsCanonical() {
				return nil, fmt.Errorf("config: SHIPPING_FEE_VND must be a valid canonical VND amount, got %q", rawFee)
			}
			cfg.ShippingFeeVND = fee
		} else {
			cfg.ShippingFeeVND = defaultShippingFeeVND
		}
	} else {
		cfg.ShippingFeeVND = defaultShippingFeeVND
	}

	// 12. MINIO_ENDPOINT
	minioEndpoint := strings.TrimSpace(v.GetString("MINIO_ENDPOINT"))
	if minioEndpoint == "" {
		minioEndpoint = defaultMinIOEndpoint
	}
	cfg.MinIOEndpoint = minioEndpoint

	// 13. MINIO_ACCESS_KEY
	minioAccessKey := strings.TrimSpace(v.GetString("MINIO_ACCESS_KEY"))
	if minioAccessKey == "" {
		minioAccessKey = defaultMinIOAccessKey
	}
	cfg.MinIOAccessKey = minioAccessKey

	// 14. MINIO_SECRET_KEY
	minioSecretKey := strings.TrimSpace(v.GetString("MINIO_SECRET_KEY"))
	if minioSecretKey == "" {
		minioSecretKey = defaultMinIOSecretKey
	}
	cfg.MinIOSecretKey = minioSecretKey

	// 15. MINIO_BUCKET
	minioBucket := strings.TrimSpace(v.GetString("MINIO_BUCKET"))
	if minioBucket == "" {
		minioBucket = defaultMinIOBucket
	}
	cfg.MinIOBucket = minioBucket

	// 16. MINIO_USE_SSL / MINIO_SSL
	if v.IsSet("MINIO_USE_SSL") || v.IsSet("MINIO_SSL") {
		rawSSL := strings.TrimSpace(v.GetString("MINIO_USE_SSL"))
		if rawSSL == "" {
			rawSSL = strings.TrimSpace(v.GetString("MINIO_SSL"))
		}
		if rawSSL != "" {
			useSSL, err := strconv.ParseBool(rawSSL)
			if err != nil {
				return nil, fmt.Errorf("config: MINIO_USE_SSL must be a boolean, got %q", rawSSL)
			}
			cfg.MinIOUseSSL = useSSL
		} else {
			cfg.MinIOUseSSL = defaultMinIOUseSSL
		}
	} else {
		cfg.MinIOUseSSL = defaultMinIOUseSSL
	}

	// 17. MINIO_REQUEST_TIMEOUT
	if v.IsSet("MINIO_REQUEST_TIMEOUT") {
		rawTimeout := strings.TrimSpace(v.GetString("MINIO_REQUEST_TIMEOUT"))
		if rawTimeout != "" {
			timeout, err := time.ParseDuration(rawTimeout)
			if err != nil {
				return nil, fmt.Errorf("config: MINIO_REQUEST_TIMEOUT must be a duration, got %q", rawTimeout)
			}
			cfg.MinIORequestTimeout = timeout
		} else {
			cfg.MinIORequestTimeout = defaultMinIORequestTimeout
		}
	} else {
		cfg.MinIORequestTimeout = defaultMinIORequestTimeout
	}

	// 18. MINIO_RECONCILER_INTERVAL
	if v.IsSet("MINIO_RECONCILER_INTERVAL") {
		rawInterval := strings.TrimSpace(v.GetString("MINIO_RECONCILER_INTERVAL"))
		if rawInterval != "" {
			interval, err := time.ParseDuration(rawInterval)
			if err != nil {
				return nil, fmt.Errorf("config: MINIO_RECONCILER_INTERVAL must be a duration, got %q", rawInterval)
			}
			cfg.MinIOReconcilerInterval = interval
		} else {
			cfg.MinIOReconcilerInterval = defaultMinIOReconcilerInterval
		}
	} else {
		cfg.MinIOReconcilerInterval = defaultMinIOReconcilerInterval
	}

	// 19. MINIO_GRACE_PERIOD
	if v.IsSet("MINIO_GRACE_PERIOD") {
		rawGrace := strings.TrimSpace(v.GetString("MINIO_GRACE_PERIOD"))
		if rawGrace != "" {
			grace, err := time.ParseDuration(rawGrace)
			if err != nil {
				return nil, fmt.Errorf("config: MINIO_GRACE_PERIOD must be a duration, got %q", rawGrace)
			}
			cfg.MinIOGracePeriod = grace
		} else {
			cfg.MinIOGracePeriod = defaultMinIOGracePeriod
		}
	} else {
		cfg.MinIOGracePeriod = defaultMinIOGracePeriod
	}

	return cfg, nil
}
