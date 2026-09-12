package api

import (
	"errors"
	"net/http"

	"github.com/kewldan/edu3105/apps/api/internal/auth"
	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

type loginRequest struct {
	Password string `json:"password"`
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var in loginRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	token, err := h.auth.Login(r.Context(), auth.ClientIP(r), in.Password)
	switch {
	case errors.Is(err, auth.ErrTooManyAttempts):
		httpx.Error(w, http.StatusTooManyRequests, "rate_limited", "Слишком много попыток. Попробуйте позже")
		return
	case errors.Is(err, auth.ErrBadPassword):
		httpx.Error(w, http.StatusUnauthorized, "bad_password", "Неверный пароль")
		return
	case err != nil:
		httpx.Fail(w, err)
		return
	}
	h.auth.SetCookie(w, token)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	_ = h.auth.Logout(r.Context(), r)
	h.auth.ClearCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) adminMe(w http.ResponseWriter, r *http.Request) {
	if !h.auth.Authenticated(r.Context(), r) {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Не авторизован")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"authenticated": true, "role": "admin"})
}
