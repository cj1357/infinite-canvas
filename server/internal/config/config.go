package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr                string
	AppEnv              string
	DatabaseURL         string
	CookieName          string
	CookieDomain        string
	CookieSecure        bool
	SessionTTL          time.Duration
	CORSOrigins         []string
	BootstrapAdminEmail string
	ModelGatewayProvider string
	ModelGatewayBaseURL string
	ModelGatewayInternalURL string
	ModelGatewayToken string
	ModelGatewayTimeout time.Duration
	StorageProvider     string
	MaxUploadBytes      int64
	Storage             StorageConfig
}

type StorageConfig struct {
	Provider        string
	LocalDir        string
	MaxUploadBytes  int64
	R2Endpoint      string
	R2AccessKey     string
	R2SecretKey     string
	R2Bucket        string
	R2PublicBaseURL string
}

func Load() Config {
	sessionDays := intEnv("SESSION_TTL_DAYS", 30)
	gatewayTimeoutSeconds := intEnv("MODEL_GATEWAY_TIMEOUT_SECONDS", 600)
	storageProvider := strings.ToLower(env("STORAGE_PROVIDER", "local"))
	maxUploadBytes := int64Env("MAX_UPLOAD_BYTES", 50*1024*1024)
	return Config{
		Addr:                env("SERVER_ADDR", ":8080"),
		AppEnv:              env("APP_ENV", "development"),
		DatabaseURL:         env("DATABASE_URL", ""),
		CookieName:          env("SESSION_COOKIE_NAME", "ic_session"),
		CookieDomain:        env("SESSION_COOKIE_DOMAIN", ""),
		CookieSecure:        boolEnv("SESSION_COOKIE_SECURE", false),
		SessionTTL:          time.Duration(sessionDays) * 24 * time.Hour,
		CORSOrigins:         csvEnv("CORS_ORIGINS"),
		BootstrapAdminEmail: strings.ToLower(strings.TrimSpace(env("BOOTSTRAP_ADMIN_EMAIL", ""))),
		ModelGatewayProvider: strings.ToLower(env("MODEL_GATEWAY_PROVIDER", "newapi")),
		ModelGatewayBaseURL: strings.TrimRight(env("MODEL_GATEWAY_BASE_URL", ""), "/"),
		ModelGatewayInternalURL: strings.TrimRight(env("MODEL_GATEWAY_INTERNAL_URL", ""), "/"),
		ModelGatewayToken: env("MODEL_GATEWAY_TOKEN", ""),
		ModelGatewayTimeout: time.Duration(gatewayTimeoutSeconds) * time.Second,
		StorageProvider:     storageProvider,
		MaxUploadBytes:      maxUploadBytes,
		Storage: StorageConfig{
			Provider:        storageProvider,
			LocalDir:        env("LOCAL_STORAGE_DIR", "data/media"),
			MaxUploadBytes:  maxUploadBytes,
			R2Endpoint:      env("R2_ENDPOINT", ""),
			R2AccessKey:     env("R2_ACCESS_KEY_ID", ""),
			R2SecretKey:     env("R2_SECRET_ACCESS_KEY", ""),
			R2Bucket:        env("R2_BUCKET", ""),
			R2PublicBaseURL: strings.TrimRight(env("R2_PUBLIC_BASE_URL", ""), "/"),
		},
	}
}

func env(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func intEnv(key string, fallback int) int {
	value, err := strconv.Atoi(env(key, ""))
	if err != nil {
		return fallback
	}
	return value
}

func int64Env(key string, fallback int64) int64 {
	value, err := strconv.ParseInt(env(key, ""), 10, 64)
	if err != nil {
		return fallback
	}
	return value
}

func boolEnv(key string, fallback bool) bool {
	value := strings.ToLower(env(key, ""))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes"
}

func csvEnv(key string) []string {
	raw := env(key, "")
	if raw == "" {
		return nil
	}
	items := strings.Split(raw, ",")
	result := make([]string, 0, len(items))
	for _, item := range items {
		if value := strings.TrimSpace(item); value != "" {
			result = append(result, value)
		}
	}
	return result
}
