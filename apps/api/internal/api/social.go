package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

// Comments and posts written by signed-in students. Reading is public; writing
// needs the student cookie; authors edit and delete their own entries, admins
// (separate cookie, /admin routes) moderate everything.

const adminCommentsLimit = 200

// Anti-spam: one account may create at most socialWriteLimit comments and posts per socialWriteWindow.
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
	// Комментарии к посту «только для своих» не видны анонимам, как и сам пост.
	if target == models.TargetPost {
		if viewer, _ := userauth.UserID(r.Context()); viewer == 0 {
			visibility, err := h.store.PostVisibility(r.Context(), id)
			if err != nil {
				httpx.Fail(w, err)
				return "", 0, false
			}
			if visibility != models.VisiblePublic {
				httpx.Fail(w, httpx.ErrNotFound)
				return "", 0, false
			}
		}
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
	c, err := h.store.CreateComment(r.Context(), userID, target, id, in.Body)
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

// ---- posts ----

func postFilter(r *http.Request) (store.PostFilter, bool) {
	q := r.URL.Query()
	f := store.PostFilter{Top: q.Get("sort") == "top"}
	if raw := q.Get("kind"); raw != "" {
		kind, ok := models.ParsePostKind(raw)
		if !ok {
			return f, false
		}
		f.Kind = kind
	}
	return f, true
}

func (h *Handler) listPosts(w http.ResponseWriter, r *http.Request) {
	f, ok := postFilter(r)
	if !ok {
		httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"kind": "Неизвестный тип поста"}})
		return
	}
	if f.Kind == "" {
		httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"kind": "Укажите тип поста"}})
		return
	}
	viewer, _ := userauth.UserID(r.Context())
	// Посты «только для своих» видит лишь вошедший студент.
	f.IncludeMembers = viewer != 0
	items, err := h.store.ListPosts(r.Context(), viewer, f)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	for i := range items {
		items[i].Mine = viewer != 0 && items[i].AuthorID == viewer
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) createPost(w http.ResponseWriter, r *http.Request) {
	userID, _ := userauth.UserID(r.Context())
	var in models.PostInput
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
	p, err := h.store.CreatePost(r.Context(), userID, &in)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	p.Mine = true
	httpx.JSON(w, http.StatusCreated, p)
}

// ownPost loads the post and checks the caller wrote it.
func (h *Handler) ownPost(w http.ResponseWriter, r *http.Request) (models.Post, int64, bool) {
	userID, _ := userauth.UserID(r.Context())
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return models.Post{}, 0, false
	}
	p, err := h.store.GetPost(r.Context(), userID, id)
	if err != nil {
		httpx.Fail(w, err)
		return models.Post{}, 0, false
	}
	if p.AuthorID != userID {
		forbidden(w, "Можно менять только свои посты")
		return models.Post{}, 0, false
	}
	return p, userID, true
}

// updatePostWith applies the payload to an existing post keeping its kind.
func (h *Handler) updatePostWith(w http.ResponseWriter, r *http.Request, viewer int64, current models.Post) {
	var in models.PostInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	in.Kind = current.Kind
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	p, err := h.store.UpdatePost(r.Context(), viewer, current.ID, &in)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	p.Mine = viewer != 0 && p.AuthorID == viewer
	httpx.JSON(w, http.StatusOK, p)
}

func (h *Handler) updatePost(w http.ResponseWriter, r *http.Request) {
	p, userID, ok := h.ownPost(w, r)
	if !ok {
		return
	}
	h.updatePostWith(w, r, userID, p)
}

func (h *Handler) deletePost(w http.ResponseWriter, r *http.Request) {
	p, _, ok := h.ownPost(w, r)
	if !ok {
		return
	}
	if err := h.store.DeletePost(r.Context(), p.ID); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) setLike(on bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := userauth.UserID(r.Context())
		id, err := httpx.IDParam(r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if _, err := h.store.PostExists(r.Context(), id); err != nil {
			httpx.Fail(w, err)
			return
		}
		if err := h.store.SetLike(r.Context(), id, userID, on); err != nil {
			httpx.Fail(w, err)
			return
		}
		p, err := h.store.GetPost(r.Context(), userID, id)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		p.Mine = p.AuthorID == userID
		httpx.JSON(w, http.StatusOK, p)
	}
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

func (h *Handler) adminListPosts(w http.ResponseWriter, r *http.Request) {
	f, ok := postFilter(r)
	if !ok {
		httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"kind": "Неизвестный тип поста"}})
		return
	}
	f.IncludeMembers = true
	items, err := h.store.ListPosts(r.Context(), 0, f)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) adminUpdatePost(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	p, err := h.store.GetPost(r.Context(), 0, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.updatePostWith(w, r, 0, p)
}

func (h *Handler) adminDeletePost(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.store.DeletePost(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
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
