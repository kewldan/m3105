package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

// listBroadcasts is the bot's mailing journal: newest first, with counters.
func (h *Handler) listBroadcasts(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	list, err := h.store.ListBroadcasts(r.Context(), store.BroadcastFilter{Kind: r.URL.Query().Get("kind"), Limit: limit})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Handler) broadcastDetail(ctx context.Context, id int64) (models.BroadcastDetail, error) {
	b, err := h.store.GetBroadcast(ctx, id)
	if err != nil {
		return models.BroadcastDetail{}, err
	}
	list, err := h.store.ListDeliveries(ctx, id)
	if err != nil {
		return models.BroadcastDetail{}, err
	}
	return models.BroadcastDetail{Broadcast: b, Deliveries: list}, nil
}

// getBroadcast shows who got the message and who did not, with the reason.
func (h *Handler) getBroadcast(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	d, err := h.broadcastDetail(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, d)
}

// retryBroadcast resends failed deliveries (and ones stuck in pending) with
// the same text and buttons, then answers with the updated broadcast.
func (h *Handler) retryBroadcast(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if h.notify == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "bot_disabled", "Бот не настроен: нет TELEGRAM_BOT_TOKEN")
		return
	}
	if _, err := h.store.GetBroadcast(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	// The request timeout is 30 s; a long resend list stops there and the
	// rest can be retried again.
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	res, err := h.notify.Retry(ctx, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	d, err := h.broadcastDetail(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"retried": res.Retried, "sent": res.Sent, "failed": res.Failed, "broadcast": d})
}
