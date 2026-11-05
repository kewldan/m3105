package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

type principalKey struct{}

// principal returns who works in the admin panel; set by requireStaff.
func principal(ctx context.Context) models.Principal {
	p, _ := ctx.Value(principalKey{}).(models.Principal)
	return p
}

// resolvePrincipal finds the admin (password session or API token) or a
// confirmed student with editor roles. ok is false for anyone else.
func (h *Handler) resolvePrincipal(r *http.Request) (models.Principal, bool, error) {
	ctx := r.Context()
	if h.auth.Authenticated(ctx, r) {
		return models.Principal{Admin: true, Scopes: []string{}, Zone: []string{}}, true, nil
	}
	uid, ok := userauth.UserID(ctx)
	if !ok {
		return models.Principal{}, false, nil
	}
	scopes, err := h.store.EditorScopes(ctx, uid)
	if err != nil || len(scopes) == 0 {
		return models.Principal{}, false, err
	}
	user, err := h.store.GetUser(ctx, uid)
	if err != nil {
		return models.Principal{}, false, err
	}
	if !user.Approved {
		return models.Principal{}, false, nil
	}
	zone, err := h.store.ZoneOf(ctx, scopes)
	if err != nil {
		return models.Principal{}, false, err
	}
	return models.Principal{UserID: uid, UserName: user.Name, Scopes: scopes, Zone: zone}, true, nil
}

// requireStaff lets the admin and editors into /admin; what an editor may
// touch is checked per route (adminOnly) and per row (Principal.Covers).
func (h *Handler) requireStaff(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok, err := h.resolvePrincipal(r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Требуется вход в админку")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), principalKey{}, p)))
	})
}

// adminOnly closes a route to editors.
func adminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !principal(r.Context()).Admin {
			httpx.Error(w, http.StatusForbidden, "forbidden", "Этот раздел только для администратора")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func forbiddenZone(w http.ResponseWriter) {
	httpx.Error(w, http.StatusForbidden, "outside_zone",
		"Можно править только материалы для своего потока или группы, не «для всех»")
}

// zoneFilter is nil for the admin (everything) and the zone for an editor.
func zoneFilter(p models.Principal) []string {
	if p.Admin {
		return nil
	}
	return p.Zone
}

// ---- who am I ----

type staffMe struct {
	Authenticated bool              `json:"authenticated"`
	Role          string            `json:"role"`
	Editor        *models.Principal `json:"editor,omitempty"`
}

func (h *Handler) adminMe(w http.ResponseWriter, r *http.Request) {
	p, ok, err := h.resolvePrincipal(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Не авторизован")
		return
	}
	if p.Admin {
		httpx.JSON(w, http.StatusOK, staffMe{Authenticated: true, Role: "admin"})
		return
	}
	httpx.JSON(w, http.StatusOK, staffMe{Authenticated: true, Role: "editor", Editor: &p})
}

// ---- editor roles ----

// mayGrant says whether p can hand out or take back this scope: the admin any,
// a stream editor only groups of their streams.
func mayGrant(p models.Principal, scope string) bool {
	if p.Admin {
		return true
	}
	if !strings.HasPrefix(scope, "group:") || !slices.Contains(p.Zone, scope) {
		return false
	}
	return p.GrantsStreams()
}

func (h *Handler) listEditorRoles(w http.ResponseWriter, r *http.Request) {
	list, err := h.store.ListEditorRoles(r.Context(), zoneFilter(principal(r.Context())))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Handler) listEditorCandidates(w http.ResponseWriter, r *http.Request) {
	list, err := h.store.ListEditorCandidates(r.Context(), zoneFilter(principal(r.Context())))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Handler) grantEditorRole(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	p := principal(ctx)
	var in models.EditorRoleInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	if !mayGrant(p, in.Scope) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Ответственный за поток назначает только ответственных за группы своего потока")
		return
	}
	user, err := h.store.GetUser(ctx, in.UserID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if !user.Approved {
		httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"userId": "Студент ещё не выбрал себя в списке курса"}})
		return
	}
	role, err := h.store.CreateEditorRole(ctx, in, p.ActorID())
	if errors.Is(err, httpx.ErrConflict) {
		httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"userId": "Уже ответственный за это"}})
		return
	}
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, role)
}

func (h *Handler) revokeEditorRole(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	role, err := h.store.GetEditorRole(ctx, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if !mayGrant(principal(ctx), role.Scope) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Снять эту роль может только администратор")
		return
	}
	if err := h.store.DeleteEditorRole(ctx, id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- journal ----

// reverter replays a journal snapshot through the entity's own store calls.
type reverter struct {
	create func(ctx context.Context, raw json.RawMessage) (int64, error)
	update func(ctx context.Context, id int64, raw json.RawMessage) error
	del    func(ctx context.Context, id int64) error
}

// journal writes an entry and tells the admin about an editor's change. A
// failure is logged: the change itself is already saved.
func (h *Handler) journal(ctx context.Context, e store.NewEdit) {
	p := principal(ctx)
	e.ActorID, e.ActorName = p.ActorID(), p.ActorName()
	saved, err := h.store.CreateEdit(ctx, e)
	if err != nil {
		slog.Warn("journal", "entity", e.Entity, "id", e.EntityID, "err", err)
		return
	}
	if !p.Admin {
		h.admin.Edited(saved)
	}
}

func (h *Handler) listJournal(w http.ResponseWriter, r *http.Request) {
	list, err := h.store.ListEdits(r.Context(), store.EditFilter{
		Within: zoneFilter(principal(r.Context())),
		Entity: r.URL.Query().Get("entity"),
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

// revertEdit undoes a journal entry: a create is deleted, an update gets the
// previous version back, a delete is recreated (with a new id). Admin only.
func (h *Handler) revertEdit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	e, err := h.store.GetEdit(ctx, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if e.RevertedAt != nil {
		httpx.Error(w, http.StatusConflict, "already_reverted", "Эту правку уже откатили")
		return
	}
	rv, ok := h.reverters[e.Entity]
	if !ok {
		httpx.Error(w, http.StatusUnprocessableEntity, "not_revertible", "Эту правку не откатить")
		return
	}
	undo := store.NewEdit{Entity: e.Entity, EntityID: e.EntityID, Title: "Откат: " + e.Title, Audience: e.Audience}
	switch e.Action {
	case "create":
		err = rv.del(ctx, e.EntityID)
		if errors.Is(err, httpx.ErrNotFound) {
			err = nil
		}
		undo.Action, undo.Before = "delete", e.After
	case "update":
		err = rv.update(ctx, e.EntityID, e.Before)
		undo.Action, undo.Before, undo.After = "update", e.After, e.Before
	case "delete":
		var newID int64
		newID, err = rv.create(ctx, e.Before)
		undo.Action, undo.EntityID, undo.After = "create", newID, e.Before
	}
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.store.MarkEditReverted(ctx, id); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.journal(ctx, undo)
	if h.revalidator != nil {
		h.revalidator.Tags(tagsForPath("/admin/" + e.Entity)...)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "entityId": undo.EntityID})
}
