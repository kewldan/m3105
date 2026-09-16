// Package auth implements the single-admin password login and session cookie.
package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/session"
)

// Service issues and validates admin sessions.
type Service struct {
	store        session.Store
	passwordHash [32]byte
	// apiTokenHash is the hash of the optional bearer token; hasAPIToken is
	// false when no token is configured and bearer auth is disabled.
	apiTokenHash [32]byte
	hasAPIToken  bool
	cookieName   string
	cookieSecure bool
	ttl          time.Duration
	rateMax      int
	rateWindow   time.Duration
}

// Options configures the auth service.
type Options struct {
	Password string
	// APIToken enables `Authorization: Bearer <token>` for admin routes; empty disables it.
	APIToken     string
	CookieName   string
	CookieSecure bool
	TTL          time.Duration
	RateMax      int
	RateWindow   time.Duration
}

// New constructs the auth service.
func New(store session.Store, o Options) *Service {
	return &Service{
		store:        store,
		passwordHash: sha256.Sum256([]byte(o.Password)),
		apiTokenHash: sha256.Sum256([]byte(o.APIToken)),
		hasAPIToken:  o.APIToken != "",
		cookieName:   o.CookieName,
		cookieSecure: o.CookieSecure,
		ttl:          o.TTL,
		rateMax:      o.RateMax,
		rateWindow:   o.RateWindow,
	}
}

// ErrTooManyAttempts is returned when the login rate limit is exceeded.
var ErrTooManyAttempts = errors.New("too many attempts")

// ErrBadPassword is returned on a wrong password.
var ErrBadPassword = errors.New("bad password")

// Login verifies the password and returns a new session token.
func (s *Service) Login(ctx context.Context, ip, password string) (string, error) {
	n, err := s.store.Hit(ctx, "ratelimit:login:"+ip, s.rateWindow)
	if err != nil {
		slog.Warn("rate limit store unavailable", "err", err)
	} else if n > int64(s.rateMax) {
		return "", ErrTooManyAttempts
	}
	got := sha256.Sum256([]byte(password))
	if subtle.ConstantTimeCompare(got[:], s.passwordHash[:]) != 1 {
		return "", ErrBadPassword
	}
	return s.store.Create(ctx, s.ttl)
}

// Logout removes the session referenced by the request cookie.
func (s *Service) Logout(ctx context.Context, r *http.Request) error {
	c, err := r.Cookie(s.cookieName)
	if err != nil || c.Value == "" {
		// r.Cookie ошибается только отсутствием куки: выходить просто не из чего.
		return nil //nolint:nilerr // нет куки — нет и сессии
	}
	return s.store.Delete(ctx, c.Value)
}

// BearerAuthenticated reports whether the request carries the configured API
// token in the Authorization header.
func (s *Service) BearerAuthenticated(r *http.Request) bool {
	if !s.hasAPIToken {
		return false
	}
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		return false
	}
	got := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return subtle.ConstantTimeCompare(got[:], s.apiTokenHash[:]) == 1
}

// Authenticated reports whether the request carries the API token or a valid
// session cookie.
func (s *Service) Authenticated(ctx context.Context, r *http.Request) bool {
	if s.BearerAuthenticated(r) {
		return true
	}
	c, err := r.Cookie(s.cookieName)
	if err != nil || c.Value == "" {
		return false
	}
	ok, err := s.store.Exists(ctx, c.Value)
	if err != nil {
		slog.Warn("session lookup failed", "err", err)
		return false
	}
	return ok
}

// SetCookie writes the session cookie to the response.
func (s *Service) SetCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(s.ttl.Seconds()),
	})
}

// ClearCookie expires the session cookie.
func (s *Service) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// Require is a middleware that rejects unauthenticated requests with 401.
func (s *Service) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.Authenticated(r.Context(), r) {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Требуется вход в админку")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ClientIP extracts the caller IP, honoring the proxy-populated RemoteAddr.
func ClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		return strings.TrimSpace(r.RemoteAddr)
	}
	return host
}
