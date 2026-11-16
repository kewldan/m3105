package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// setPracticeResult marks who got a grade for a defense or a theory min and
// when; the answer is the session's list with the marks, as in signups.
func (h *Handler) setPracticeResult(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var in models.PracticeResultInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.store.SetPracticeResult(r.Context(), id, principal(r.Context()).ActorID(), &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.writeAdminSignups(w, r, id)
}

// practiceStats sums the marks up per subject: how many defenses and theory
// mins are taken per session. ?subject= narrows it to one subject; an editor
// sees the sessions of their zone.
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
