package models

import (
	"encoding/json"
	"slices"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// EditorRole makes a student responsible for a stream ("stream:1") or a group
// ("group:М3105"): they edit content addressed only to that zone.
type EditorRole struct {
	ID        int64     `db:"id" json:"id"`
	UserID    int64     `db:"user_id" json:"userId"`
	UserName  string    `db:"user_name" json:"userName"`
	UserGroup string    `db:"user_group" json:"userGroup"`
	PhotoURL  string    `db:"photo_url" json:"photoUrl"`
	Scope     string    `db:"scope" json:"scope"`
	GrantedBy *string   `db:"granted_by_name" json:"grantedBy"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
}

// EditorRoleInput grants a role.
type EditorRoleInput struct {
	UserID int64  `json:"userId"`
	Scope  string `json:"scope"`
}

// Validate normalises the scope to one audience token.
func (in *EditorRoleInput) Validate() error {
	ve := httpx.NewValidation()
	norm, ok := NormalizeAudience([]string{in.Scope})
	if !ok || len(norm) != 1 {
		ve.Add("scope", "Выберите поток или группу")
	} else {
		in.Scope = norm[0]
	}
	if in.UserID <= 0 {
		ve.Add("userId", "Выберите студента")
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// EditorCandidate is a confirmed student who can be made responsible.
type EditorCandidate struct {
	ID    int64  `db:"id" json:"id"`
	Name  string `db:"name" json:"name"`
	Group string `db:"group_name" json:"group"`
}

// Principal is who works in the admin panel: the admin, or a student with
// editor roles. Zone lists every token the editor may address content to:
// their streams, the groups of those streams and their own groups.
type Principal struct {
	Admin    bool     `json:"-"`
	UserID   int64    `json:"userId,omitempty"`
	UserName string   `json:"userName,omitempty"`
	Scopes   []string `json:"scopes"`
	Zone     []string `json:"zone"`
}

// Covers reports whether content with this audience is the principal's to
// edit: the admin edits anything, an editor only content addressed to their
// zone and nothing "for everyone".
func (p Principal) Covers(audience []string) bool {
	if p.Admin {
		return true
	}
	if len(audience) == 0 {
		return false
	}
	for _, t := range audience {
		if !slices.Contains(p.Zone, t) {
			return false
		}
	}
	return true
}

// ActorID is the user behind an edit; nil for the admin.
func (p Principal) ActorID() *int64 {
	if p.Admin {
		return nil
	}
	id := p.UserID
	return &id
}

// ActorName is how the journal names the principal.
func (p Principal) ActorName() string {
	if p.Admin {
		return "Админ"
	}
	return p.UserName
}

// GrantsStreams reports whether the principal holds a stream role, which lets
// them appoint group editors in that stream.
func (p Principal) GrantsStreams() bool {
	return p.Admin || slices.ContainsFunc(p.Scopes, func(s string) bool { return strings.HasPrefix(s, streamPrefix) })
}

// Edit is a journal entry: a create, update or delete of content.
type Edit struct {
	ID         int64           `db:"id" json:"id"`
	ActorID    *int64          `db:"actor_id" json:"actorId"`
	ActorName  string          `db:"actor_name" json:"actorName"`
	Entity     string          `db:"entity" json:"entity"`
	EntityID   int64           `db:"entity_id" json:"entityId"`
	Action     string          `db:"action" json:"action"`
	Title      string          `db:"title" json:"title"`
	Audience   []string        `db:"audience" json:"audience"`
	Before     json.RawMessage `db:"before" json:"before"`
	After      json.RawMessage `db:"after" json:"after"`
	RevertedAt *time.Time      `db:"reverted_at" json:"revertedAt"`
	CreatedAt  time.Time       `db:"created_at" json:"createdAt"`
}
