package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/bot"
	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// sendPracticeReport sends the admin a picture of who defends at the session
// (rendered by the web app with takumi) with a refresh button. Synchronous:
// the admin sees whether it went out.
func (h *Handler) sendPracticeReport(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	sess, err := h.store.GetPracticeSession(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	sc, err := h.site(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	switch err := h.admin.PracticeReport(ctx, sess, sc.Loc); {
	case errors.Is(err, bot.ErrReportUnavailable):
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable",
			"Отчёт не настроен: нужны TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID и WEB_URL")
	case err != nil:
		slog.Warn("practice report", "session", id, "err", err)
		httpx.Error(w, http.StatusBadGateway, "report_failed", "Не получилось отправить отчёт: "+err.Error())
	default:
		httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}
