package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

// Comments written by signed-in students under notes and labs: public to
// read, authors delete their own, admins (separate cookie, /admin routes)
// moderate everything.

const adminCommentsLimit = 200

// Anti-spam: one account may create at most socialWriteLimit comments per socialWriteWindow.
var (
	socialWriteLimit  = 10
	socialWriteWindow = 12 * time.Hour
)

// allowWrite enforces the per-user limit; it writes the 429 response itself.
func (h *Handler) allowWrite(w http.ResponseWriter, r *http.Request, userID int64) bool {
	n, err := h.store.CountUserWrites(r.Context(), userID, time.Now().Add(-socialWriteWindow))
	if err != nil {
		httpx.Fail(w, err)
		return false
	}
	if n >= socialWriteLimit {
		hours := int(socialWriteWindow / time.Hour)
		httpx.Error(w, http.StatusTooManyRequests, "rate_limited",
			fmt.Sprintf("Не больше %d сообщений за %d часов. Попробуйте позже", socialWriteLimit, hours))
		return false
	}
	return true
}

func forbidden(w http.ResponseWriter, msg string) {
	httpx.Error(w, http.StatusForbidden, "forbidden", msg)
}

// commentTarget parses {target} and {id} and checks the target accepts comments.
func (h *Handler) commentTarget(w http.ResponseWriter, r *http.Request) (models.CommentTarget, int64, bool) {
	target, ok := models.ParseCommentTarget(chi.URLParam(r, "target"))
	if !ok {
		httpx.Fail(w, httpx.ErrNotFound)
		return "", 0, false
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Fail(w, httpx.ErrNotFound)
		return "", 0, false
	}
	exists, err := h.store.CommentTargetExists(r.Context(), target, id)
	if err != nil {
		httpx.Fail(w, err)
		return "", 0, false
	}
	if !exists {
		httpx.Fail(w, httpx.ErrNotFound)
		return "", 0, false
	}
	return target, id, true
}

func markMine(items []models.Comment, viewer int64) {
	for i := range items {
		items[i].Mine = viewer != 0 && items[i].AuthorID == viewer
	}
}

func (h *Handler) listComments(w http.ResponseWriter, r *http.Request) {
	target, id, ok := h.commentTarget(w, r)
	if !ok {
		return
	}
	items, err := h.store.ListComments(r.Context(), target, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	viewer, _ := userauth.UserID(r.Context())
	markMine(items, viewer)
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) createComment(w http.ResponseWriter, r *http.Request) {
	userID, _ := userauth.UserID(r.Context())
	target, id, ok := h.commentTarget(w, r)
	if !ok {
		return
	}
	var in models.CommentInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	if !h.allowWrite(w, r, userID) {
		return
	}
	c, err := h.store.CreateComment(r.Context(), userID, target, id, &in)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	c.Mine = true
	httpx.JSON(w, http.StatusCreated, c)
}

func (h *Handler) deleteComment(w http.ResponseWriter, r *http.Request) {
	userID, _ := userauth.UserID(r.Context())
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	c, err := h.store.GetComment(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if c.AuthorID != userID {
		forbidden(w, "Можно удалять только свои комментарии")
		return
	}
	if err := h.store.DeleteComment(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- admin moderation ----

func (h *Handler) adminListComments(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListRecentComments(r.Context(), adminCommentsLimit)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) adminDeleteComment(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.store.DeleteComment(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// adminUpdateComment lets moderation fix the text and files of any comment.
// New files are admin uploads with ?scope=social.
func (h *Handler) adminUpdateComment(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var in models.CommentInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	c, err := h.store.UpdateComment(r.Context(), id, &in)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}

// adminSearchStats returns what students search for and what they fail to find.
func (h *Handler) adminSearchStats(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.store.SearchStats(r.Context(), days, limit)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}
