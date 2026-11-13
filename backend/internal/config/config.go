package config

import (
	"errors"
	"fmt"
	"net/url"
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
	MinioEndpoint          string
	MinioAccessKey         string
	MinioSecretKey         string
	MinioBucket            string
	MinioChatBucket        string
	MinioUseSSL            bool

	MediaMTXAPIURL          string
	MediaMTXWebRTCPublicURL string
	MediaMTXHLSPublicURL    string
	LiveSignalPollInterval  time.Duration
	LiveSignalTimeout       time.Duration
}

const (
	defaultAppEnv              = "development"
	defaultHTTPPort            = 18080
	defaultAccessTokenTTL      = 15 * time.Minute
	defaultRefreshTokenTTL     = 720 * time.Hour
	defaultLogLevel            = "info"
	defaultOrderConfirmTimeout = 30 * time.Minute
	defaultShippingFeeVND      = domain.MoneyVND("0")
	defaultMinioBucket         = "product-review-media"
	defaultMinioChatBucket     = "chat-media"
	defaultMinioUseSSL         = false

	defaultMediaMTXAPIURL          = "http://127.0.0.1:9997"
	defaultMediaMTXWebRTCPublicURL = "http://localhost:8889"
	defaultMediaMTXHLSPublicURL    = "http://localhost:8888"
	defaultLiveSignalPollInterval  = 5 * time.Second
	defaultLiveSignalTimeout       = 10 * time.Minute
	minLiveSignalPollInterval      = time.Second
	maxLiveSignalPollInterval      = time.Minute
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
		"MINIO_CHAT_BUCKET",
		"MINIO_USE_SSL",
		"MEDIAMTX_API_URL",
		"MEDIAMTX_WEBRTC_PUBLIC_URL",
		"MEDIAMTX_HLS_PUBLIC_URL",
		"LIVE_SIGNAL_POLL_INTERVAL",
		"LIVE_SIGNAL_TIMEOUT",
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

	// 12. MINIO_ENDPOINT (Required)
	minioEndpoint := strings.TrimSpace(v.GetString("MINIO_ENDPOINT"))
	if minioEndpoint == "" {
		return nil, fmt.Errorf("config: MINIO_ENDPOINT is required")
	}
	cfg.MinioEndpoint = minioEndpoint

	// 13. MINIO_ACCESS_KEY (Required)
	minioAccessKey := strings.TrimSpace(v.GetString("MINIO_ACCESS_KEY"))
	if minioAccessKey == "" {
		return nil, fmt.Errorf("config: MINIO_ACCESS_KEY is required")
	}
	cfg.MinioAccessKey = minioAccessKey

	// 14. MINIO_SECRET_KEY (Required)
	minioSecretKey := strings.TrimSpace(v.GetString("MINIO_SECRET_KEY"))
	if minioSecretKey == "" {
		return nil, fmt.Errorf("config: MINIO_SECRET_KEY is required")
	}
	cfg.MinioSecretKey = minioSecretKey

	// 15. MINIO_BUCKET
	minioBucket := strings.TrimSpace(v.GetString("MINIO_BUCKET"))
	if minioBucket == "" {
		cfg.MinioBucket = defaultMinioBucket
	} else {
		cfg.MinioBucket = minioBucket
	}

	// 16. MINIO_CHAT_BUCKET
	minioChatBucket := strings.TrimSpace(v.GetString("MINIO_CHAT_BUCKET"))
	if minioChatBucket == "" {
		cfg.MinioChatBucket = defaultMinioChatBucket
	} else {
		cfg.MinioChatBucket = minioChatBucket
	}

	// 17. MINIO_USE_SSL
	if v.IsSet("MINIO_USE_SSL") {
		rawMinioSSL := strings.TrimSpace(v.GetString("MINIO_USE_SSL"))
		if rawMinioSSL != "" {
			useSSL, err := strconv.ParseBool(rawMinioSSL)
			if err != nil {
				return nil, fmt.Errorf("config: MINIO_USE_SSL must be a boolean, got %q", rawMinioSSL)
			}
			cfg.MinioUseSSL = useSSL
		} else {
			cfg.MinioUseSSL = defaultMinioUseSSL
		}
	} else {
		cfg.MinioUseSSL = defaultMinioUseSSL
	}

	// 18. MEDIAMTX_API_URL, MEDIAMTX_WEBRTC_PUBLIC_URL, MEDIAMTX_HLS_PUBLIC_URL
	var err error
	if cfg.MediaMTXAPIURL, err = httpURLSetting(v, "MEDIAMTX_API_URL", defaultMediaMTXAPIURL); err != nil {
		return nil, err
	}
	if cfg.MediaMTXWebRTCPublicURL, err = httpURLSetting(v, "MEDIAMTX_WEBRTC_PUBLIC_URL", defaultMediaMTXWebRTCPublicURL); err != nil {
		return nil, err
	}
	if cfg.MediaMTXHLSPublicURL, err = httpURLSetting(v, "MEDIAMTX_HLS_PUBLIC_URL", defaultMediaMTXHLSPublicURL); err != nil {
		return nil, err
	}

	// 19. LIVE_SIGNAL_POLL_INTERVAL
	if cfg.LiveSignalPollInterval, err = durationSetting(v, "LIVE_SIGNAL_POLL_INTERVAL", defaultLiveSignalPollInterval); err != nil {
		return nil, err
	}
	if cfg.LiveSignalPollInterval < minLiveSignalPollInterval || cfg.LiveSignalPollInterval > maxLiveSignalPollInterval {
		return nil, fmt.Errorf("config: LIVE_SIGNAL_POLL_INTERVAL must be between 1s and 60s, got %s", cfg.LiveSignalPollInterval)
	}

	// 20. LIVE_SIGNAL_TIMEOUT
	if cfg.LiveSignalTimeout, err = durationSetting(v, "LIVE_SIGNAL_TIMEOUT", defaultLiveSignalTimeout); err != nil {
		return nil, err
	}
	if cfg.LiveSignalTimeout <= 0 {
		return nil, fmt.Errorf("config: LIVE_SIGNAL_TIMEOUT must be greater than zero, got %s", cfg.LiveSignalTimeout)
	}

	return cfg, nil
}

// httpURLSetting reads an absolute http(s) URL, trimming any trailing slash so
// callers can append paths directly.
func httpURLSetting(v *viper.Viper, key, fallback string) (string, error) {
	raw := strings.TrimSpace(v.GetString(key))
	if raw == "" {
		return fallback, nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "", fmt.Errorf("config: %s must be an absolute http(s) URL, got %q", key, raw)
	}
	return strings.TrimRight(raw, "/"), nil
}

func durationSetting(v *viper.Viper, key string, fallback time.Duration) (time.Duration, error) {
	raw := strings.TrimSpace(v.GetString(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("config: %s must be a duration (e.g. 5s, 10m), got %q", key, raw)
	}
	return value, nil
}
