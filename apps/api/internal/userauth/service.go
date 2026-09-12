package userauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/session"
)

type ctxKey struct{}

// Service manages student sessions and WebAuthn ceremonies.
type Service struct {
	store        session.Store
	cookieName   string
	cookieSecure bool
	ttl          time.Duration
	WebAuthn     *webauthn.WebAuthn
}

// Options configures the service.
type Options struct {
	CookieName    string
	CookieSecure  bool
	TTL           time.Duration
	RPID          string
	RPDisplayName string
	RPOrigins     []string
}

// New constructs the service and the WebAuthn relying party.
func New(store session.Store, o Options) (*Service, error) {
	wa, err := webauthn.New(&webauthn.Config{
		RPID:          o.RPID,
		RPDisplayName: o.RPDisplayName,
		RPOrigins:     o.RPOrigins,
	})
	if err != nil {
		return nil, fmt.Errorf("webauthn config: %w", err)
	}
	return &Service{store: store, cookieName: o.CookieName, cookieSecure: o.CookieSecure, ttl: o.TTL, WebAuthn: wa}, nil
}

// Issue creates a session for the user and sets the cookie.
func (s *Service) Issue(ctx context.Context, w http.ResponseWriter, userID int64) error {
	tok, err := session.NewToken()
	if err != nil {
		return err
	}
	if err := s.store.Put(ctx, "user:"+tok, strconv.FormatInt(userID, 10), s.ttl); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name: s.cookieName, Value: tok, Path: "/", HttpOnly: true, Secure: s.cookieSecure,
		SameSite: http.SameSiteLaxMode, MaxAge: int(s.ttl.Seconds()),
	})
	return nil
}

// Clear removes the session referenced by the cookie and expires it.
func (s *Service) Clear(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(s.cookieName); err == nil && c.Value != "" {
		_ = s.store.Remove(ctx, "user:"+c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name: s.cookieName, Value: "", Path: "/", HttpOnly: true, Secure: s.cookieSecure,
		SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}

// Middleware resolves the session cookie into a user id on the context.
// It never rejects: handlers decide whether a user is required.
func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(s.cookieName)
		if err == nil && c.Value != "" {
			if raw, ok, err := s.store.Fetch(r.Context(), "user:"+c.Value); err == nil && ok {
				if id, err := strconv.ParseInt(raw, 10, 64); err == nil && id > 0 {
					r = r.WithContext(context.WithValue(r.Context(), ctxKey{}, id))
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

// UserID returns the signed-in user id from the context.
func UserID(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(ctxKey{}).(int64)
	return id, ok && id > 0
}

// Require rejects requests without a student session.
func Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := UserID(r.Context()); !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Войдите, чтобы продолжить")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---- WebAuthn ceremonies ----

// Ceremony is the server-side state between begin and finish calls.
// UserID is set for registration (passkeys are only added to existing accounts).
type Ceremony struct {
	Session webauthn.SessionData `json:"session"`
	UserID  int64                `json:"userId,omitempty"`
}

const ceremonyTTL = 5 * time.Minute

// SaveCeremony stores the ceremony and returns its id.
func (s *Service) SaveCeremony(ctx context.Context, c Ceremony) (string, error) {
	id, err := session.NewToken()
	if err != nil {
		return "", err
	}
	raw, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	if err := s.store.Put(ctx, "webauthn:"+id, string(raw), ceremonyTTL); err != nil {
		return "", err
	}
	return id, nil
}

// ErrCeremonyNotFound is returned for unknown or expired ceremony ids.
var ErrCeremonyNotFound = errors.New("ceremony not found")

// TakeCeremony loads and deletes the ceremony (single use).
func (s *Service) TakeCeremony(ctx context.Context, id string) (Ceremony, error) {
	raw, ok, err := s.store.Fetch(ctx, "webauthn:"+id)
	if err != nil {
		return Ceremony{}, err
	}
	if !ok {
		return Ceremony{}, ErrCeremonyNotFound
	}
	_ = s.store.Remove(ctx, "webauthn:"+id)
	var c Ceremony
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return Ceremony{}, err
	}
	return c, nil
}

// WAUser adapts a models.User (plus credentials) to the webauthn.User interface.
type WAUser struct {
	Handle      []byte
	Name        string
	Credentials []webauthn.Credential
}

func (u WAUser) WebAuthnID() []byte                         { return u.Handle }
func (u WAUser) WebAuthnName() string                       { return u.Name }
func (u WAUser) WebAuthnDisplayName() string                { return u.Name }
func (u WAUser) WebAuthnCredentials() []webauthn.Credential { return u.Credentials }

// FromUser builds a WAUser from a stored account and its passkeys.
func FromUser(u models.User, passkeys []models.Passkey) WAUser {
	creds := make([]webauthn.Credential, 0, len(passkeys))
	for _, p := range passkeys {
		var c webauthn.Credential
		if err := json.Unmarshal(p.Credential, &c); err == nil {
			creds = append(creds, c)
		}
	}
	return WAUser{Handle: u.WebauthnID, Name: u.Name, Credentials: creds}
}
