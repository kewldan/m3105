// Package config loads service configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/files"
)

// Config holds all runtime settings for the API service.
type Config struct {
	Addr          string
	DatabaseURL   string
	ValkeyAddr    string
	ValkeyPass    string
	AdminPassword string
	// AdminAPIToken, if set, authenticates admin requests via `Authorization: Bearer`
	// without a login and session — for scripts and automation.
	AdminAPIToken string
	SessionTTL    time.Duration
	CookieName    string
	CookieSecure  bool
	PublicURL     string
	Env           string
	LoginRateMax  int
	LoginRateWin  time.Duration

	// Student accounts.
	UserCookieName      string
	TelegramBotToken    string
	TelegramBotUsername string
	// TelegramBotID is the numeric prefix of the token; public, used by the Login JS API.
	TelegramBotID string
	RPID          string
	RPOrigins     []string
	DevLogin      bool

	// Telegram bot notifications.
	BotPoll       bool
	BotDigestHour int

	// Сброс кеша фронтенда: адрес Next во внутренней сети и общий секрет.
	// Пусто — кеш живёт только по TTL.
	WebURL          string
	RevalidateToken string

	// Вложения: S3 (MinIO в docker-compose) или локальный каталог для разработки.
	Files files.Config
	// Превью картинок через imgproxy во внутренней сети; пусто — отдаются оригиналы.
	Imgproxy files.ImgproxyConfig
}

// Load reads configuration from the environment and validates required values.
func Load() (Config, error) {
	cfg := Config{
		Addr:          getenv("ADDR", ":8080"),
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		ValkeyAddr:    os.Getenv("VALKEY_ADDR"),
		ValkeyPass:    os.Getenv("VALKEY_PASSWORD"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
		AdminAPIToken: os.Getenv("ADMIN_API_TOKEN"),
		CookieName:    getenv("SESSION_COOKIE", "edu_session"),
		PublicURL:     getenv("PUBLIC_URL", "http://localhost:3000"),
		Env:           getenv("APP_ENV", "development"),
		LoginRateMax:  getenvInt("LOGIN_RATE_MAX", 10),
	}
	cfg.SessionTTL = getenvDuration("SESSION_TTL", 30*24*time.Hour)
	cfg.UserCookieName = getenv("USER_COOKIE", "edu_user")
	cfg.TelegramBotToken = os.Getenv("TELEGRAM_BOT_TOKEN")
	cfg.TelegramBotUsername = strings.TrimPrefix(os.Getenv("TELEGRAM_BOT_USERNAME"), "@")
	if id, _, ok := strings.Cut(cfg.TelegramBotToken, ":"); ok {
		cfg.TelegramBotID = id
	}
	if u, err := url.Parse(cfg.PublicURL); err == nil && u.Host != "" {
		cfg.RPID = getenv("WEBAUTHN_RP_ID", u.Hostname())
		cfg.RPOrigins = []string{u.Scheme + "://" + u.Host}
	} else {
		cfg.RPID = getenv("WEBAUTHN_RP_ID", "localhost")
		cfg.RPOrigins = []string{"http://localhost:3000"}
	}
	if extra := os.Getenv("WEBAUTHN_ORIGINS"); extra != "" {
		cfg.RPOrigins = strings.Split(extra, ",")
	}
	cfg.DevLogin = getenvBool("DEV_LOGIN", cfg.Env != "production")
	cfg.BotPoll = getenvBool("BOT_POLL", true)
	cfg.BotDigestHour = getenvInt("BOT_DIGEST_HOUR", 10)
	cfg.WebURL = os.Getenv("WEB_URL")
	cfg.RevalidateToken = os.Getenv("REVALIDATE_TOKEN")
	cfg.LoginRateWin = getenvDuration("LOGIN_RATE_WINDOW", 15*time.Minute)
	cfg.CookieSecure = getenvBool("COOKIE_SECURE", cfg.Env == "production")
	cfg.Files = files.Config{
		S3: files.S3Config{
			Endpoint:  os.Getenv("S3_ENDPOINT"),
			AccessKey: os.Getenv("S3_ACCESS_KEY"),
			SecretKey: os.Getenv("S3_SECRET_KEY"),
			Bucket:    getenv("S3_BUCKET", "edu3105"),
			Region:    getenv("S3_REGION", "us-east-1"),
			UseSSL:    getenvBool("S3_USE_SSL", false),
		},
		Dir: os.Getenv("FILES_DIR"),
	}
	cfg.Imgproxy = files.ImgproxyConfig{
		URL:  os.Getenv("IMGPROXY_URL"),
		Key:  os.Getenv("IMGPROXY_KEY"),
		Salt: os.Getenv("IMGPROXY_SALT"),
	}

	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}
	if cfg.AdminPassword == "" {
		return cfg, errors.New("ADMIN_PASSWORD is required")
	}
	if len(cfg.AdminPassword) < 8 {
		return cfg, errors.New("ADMIN_PASSWORD must be at least 8 characters")
	}
	if cfg.AdminAPIToken != "" && len(cfg.AdminAPIToken) < 32 {
		return cfg, errors.New("ADMIN_API_TOKEN must be at least 32 characters")
	}
	if cfg.Files.S3.Endpoint != "" && (cfg.Files.S3.AccessKey == "" || cfg.Files.S3.SecretKey == "") {
		return cfg, errors.New("S3_ENDPOINT needs S3_ACCESS_KEY and S3_SECRET_KEY")
	}
	if strings.Contains(cfg.Files.S3.Endpoint, "://") {
		return cfg, errors.New("S3_ENDPOINT is host:port without a scheme; use S3_USE_SSL for https")
	}
	if cfg.Imgproxy.URL != "" && cfg.Env == "production" && (cfg.Imgproxy.Key == "" || cfg.Imgproxy.Salt == "") {
		return cfg, errors.New("IMGPROXY_URL needs IMGPROXY_KEY and IMGPROXY_SALT in production")
	}
	if _, err := files.NewResizer(cfg.Imgproxy, cfg.Files); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getenvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func getenvBool(key string, def bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

func getenvDuration(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid duration for %s: %v, using default\n", key, err)
		return def
	}
	return d
}
