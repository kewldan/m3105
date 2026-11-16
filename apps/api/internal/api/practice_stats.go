package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// practiceStats sums the grade sheet changes up per subject: how many
// defenses and theory mins get graded per session. ?subject= narrows it to
// one subject; an editor sees the sessions of their zone.
func (h *Handler) practiceStats(w http.ResponseWriter, r *http.Request) {
	var subjectID int64
	if v := r.URL.Query().Get("subject"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Неверный предмет")
			return
		}
		subjectID = n
	}
	p := principal(r.Context())
	var within []string
	if !p.Admin {
		within = p.Zone
		if within == nil {
			within = []string{}
		}
	}
	stats, err := h.store.PracticeStats(r.Context(), subjectID, within, time.Now())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, stats)
}
