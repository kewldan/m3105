// Command cpplint serves C++ style checks (clang-format and clang-tidy) to
// the API. It runs in its own container without secrets or outbound network:
// the tools parse untrusted code and quote what they read.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/cpplint"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	parallel, _ := strconv.Atoi(os.Getenv("CPPLINT_PARALLEL"))
	if parallel <= 0 {
		parallel = 2
	}
	checker, err := cpplint.Find(parallel)
	if err != nil {
		slog.Error("cpplint", "err", err)
		os.Exit(1)
	}
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	srv := &http.Server{
		Addr:              addr,
		Handler:           cpplint.Server(checker),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
	}
	go func() {
		slog.Info("listening", "addr", addr, "parallel", parallel)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server", "err", err)
			stop()
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown", "err", err)
	}
}
