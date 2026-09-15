// Command devapi runs the API against an embedded PostgreSQL for local
// development without Docker. Data is kept under $TMPDIR/edu3105-devpg.
package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"

	"github.com/kewldan/edu3105/apps/api/internal/api"
	"github.com/kewldan/edu3105/apps/api/internal/auth"
	"github.com/kewldan/edu3105/apps/api/internal/bot"
	"github.com/kewldan/edu3105/apps/api/internal/config"
	"github.com/kewldan/edu3105/apps/api/internal/db"
	"github.com/kewldan/edu3105/apps/api/internal/session"
	"github.com/kewldan/edu3105/apps/api/internal/store"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
	base := filepath.Join(os.TempDir(), "edu3105-devpg")
	port := uint32(54330)
	runtimeDir := filepath.Join(base, "runtime")
	_ = os.RemoveAll(runtimeDir)
	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Version(embeddedpostgres.V17).
		Port(port).
		Username("edu").Password("edu").Database("edu").
		CachePath(filepath.Join(os.TempDir(), "edu3105-embedded-pg", "cache")).
		RuntimePath(runtimeDir).
		DataPath(filepath.Join(base, "data")).
		Logger(io.Discard))
	if err := pg.Start(); err != nil {
		slog.Error("embedded postgres", "err", err)
		os.Exit(1)
	}
	defer func() { _ = pg.Stop() }()

	os.Setenv("DATABASE_URL", fmt.Sprintf("postgres://edu:edu@localhost:%d/edu?sslmode=disable", port))
	if os.Getenv("ADMIN_PASSWORD") == "" {
		os.Setenv("ADMIN_PASSWORD", "dev-password-123")
	}
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}

	sessions := session.NewMemory()
	authSvc := auth.New(sessions, auth.Options{
		Password: cfg.AdminPassword, APIToken: cfg.AdminAPIToken, CookieName: cfg.CookieName, CookieSecure: false,
		TTL: cfg.SessionTTL, RateMax: 100, RateWindow: time.Minute,
	})
	userSvc, err := userauth.New(sessions, userauth.Options{
		CookieName: cfg.UserCookieName, CookieSecure: cfg.CookieSecure, TTL: cfg.SessionTTL,
		RPID: cfg.RPID, RPDisplayName: "М3105", RPOrigins: cfg.RPOrigins,
	})
	if err != nil {
		slog.Error("userauth", "err", err)
		os.Exit(1)
	}
	st := store.New(pool)
	handler := api.New(st, authSvc, userSvc, cfg)
	if tg := bot.New(st, bot.Options{Token: cfg.TelegramBotToken, SiteURL: cfg.PublicURL, DigestHour: cfg.BotDigestHour, Poll: cfg.BotPoll}); tg != nil {
		go tg.Run(ctx)
		slog.Info("telegram bot started", "bot", cfg.TelegramBotUsername, "poll", cfg.BotPoll)
	}
	srv := &http.Server{Addr: cfg.Addr, Handler: handler.Router(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		slog.Info("dev api listening", "addr", cfg.Addr, "password", cfg.AdminPassword)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server", "err", err)
			stop()
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
