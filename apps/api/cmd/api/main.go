// Command api runs the edu3105 backend HTTP service.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	if cfg.Env == "production" {
		slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	} else {
		slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))
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
	slog.Info("database ready")

	var sessions session.Store
	if cfg.ValkeyAddr != "" {
		vk, err := session.NewValkey(ctx, cfg.ValkeyAddr, cfg.ValkeyPass)
		if err != nil {
			slog.Error("valkey", "err", err)
			os.Exit(1)
		}
		sessions = vk
		slog.Info("valkey ready", "addr", cfg.ValkeyAddr)
	} else {
		sessions = session.NewMemory()
		slog.Warn("VALKEY_ADDR not set: using in-memory sessions (development only)")
	}
	defer sessions.Close()

	authSvc := auth.New(sessions, auth.Options{
		Password:     cfg.AdminPassword,
		APIToken:     cfg.AdminAPIToken,
		CookieName:   cfg.CookieName,
		CookieSecure: cfg.CookieSecure,
		TTL:          cfg.SessionTTL,
		RateMax:      cfg.LoginRateMax,
		RateWindow:   cfg.LoginRateWin,
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
	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           handler.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		slog.Info("listening", "addr", cfg.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown", "err", err)
	}
}
