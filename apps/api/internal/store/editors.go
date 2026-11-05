package store

import (
	"context"
	"encoding/json"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const editorRoleCols = `r.id, r.user_id, ` + userNameExpr + ` AS user_name, u.group_name AS user_group, ` + userPhotoExpr + ` AS photo_url,
	r.scope, (SELECT COALESCE(NULLIF(g.display_name, ''), g.name) FROM users g WHERE g.id = r.granted_by) AS granted_by_name, r.created_at`

// ListEditorRoles returns roles; with a zone only roles whose scope is inside it.
func (s *Store) ListEditorRoles(ctx context.Context, zone []string) ([]models.EditorRole, error) {
	q := `SELECT ` + editorRoleCols + ` FROM editor_roles r JOIN users u ON u.id = r.user_id`
	args := []any{}
	if zone != nil {
		args = append(args, zone)
		q += ` WHERE r.scope = ANY($1::text[])`
	}
	q += ` ORDER BY r.scope, user_name`
	return many[models.EditorRole](ctx, s.db, q, args...)
}

// GetEditorRole fetches one role.
func (s *Store) GetEditorRole(ctx context.Context, id int64) (models.EditorRole, error) {
	return one[models.EditorRole](ctx, s.db, `SELECT `+editorRoleCols+` FROM editor_roles r JOIN users u ON u.id = r.user_id WHERE r.id = $1`, id)
}

// CreateEditorRole grants a role; granting the same one twice is a conflict.
func (s *Store) CreateEditorRole(ctx context.Context, in models.EditorRoleInput, grantedBy *int64) (models.EditorRole, error) {
	var id int64
	if err := s.db.QueryRow(ctx, `INSERT INTO editor_roles (user_id, scope, granted_by) VALUES ($1, $2, $3) RETURNING id`,
		in.UserID, in.Scope, grantedBy).Scan(&id); err != nil {
		return models.EditorRole{}, wrap(err)
	}
	return s.GetEditorRole(ctx, id)
}

// DeleteEditorRole revokes a role.
func (s *Store) DeleteEditorRole(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM editor_roles WHERE id = $1`, id)
}

// EditorScopes returns the roles a user holds.
func (s *Store) EditorScopes(ctx context.Context, userID int64) ([]string, error) {
	rows, err := s.db.Query(ctx, `SELECT scope FROM editor_roles WHERE user_id = $1 ORDER BY scope`, userID)
	if err != nil {
		return nil, wrap(err)
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var sc string
		if err := rows.Scan(&sc); err != nil {
			return nil, err
		}
		out = append(out, sc)
	}
	return out, rows.Err()
}

// ZoneOf expands roles to every token they cover: the scopes themselves and
// the groups of each stream (from the course list).
func (s *Store) ZoneOf(ctx context.Context, scopes []string) ([]string, error) {
	var zone []string
	err := s.db.QueryRow(ctx, `SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}') FROM (
		SELECT unnest($1::text[]) AS t
		UNION SELECT 'group:' || st.group_name FROM students st WHERE 'stream:' || st.stream = ANY($1::text[])
	) z`, scopes).Scan(&zone)
	return zone, wrap(err)
}

// ListEditorCandidates returns confirmed students; with a zone only students of
// its groups and streams.
func (s *Store) ListEditorCandidates(ctx context.Context, zone []string) ([]models.EditorCandidate, error) {
	q := `SELECT u.id, ` + userNameExpr + ` AS name, u.group_name FROM users u WHERE u.approved_at IS NOT NULL AND u.group_name <> ''`
	args := []any{}
	if zone != nil {
		args = append(args, zone)
		q += ` AND audience_scope(u.group_name) && $1::text[]`
	}
	q += ` ORDER BY u.group_name, name`
	return many[models.EditorCandidate](ctx, s.db, q, args...)
}

// NewEdit is a journal entry to write.
type NewEdit struct {
	ActorID   *int64
	ActorName string
	Entity    string
	EntityID  int64
	Action    string
	Title     string
	Audience  []string
	Before    any
	After     any
}

func asJSON(v any) ([]byte, error) {
	if v == nil {
		return nil, nil
	}
	return json.Marshal(v)
}

// CreateEdit writes a journal entry.
func (s *Store) CreateEdit(ctx context.Context, e NewEdit) (models.Edit, error) {
	before, err := asJSON(e.Before)
	if err != nil {
		return models.Edit{}, err
	}
	after, err := asJSON(e.After)
	if err != nil {
		return models.Edit{}, err
	}
	if e.Audience == nil {
		e.Audience = []string{}
	}
	return one[models.Edit](ctx, s.db, `INSERT INTO edits (actor_id, actor_name, entity, entity_id, action, title, audience, before, after)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING `+editCols,
		e.ActorID, e.ActorName, e.Entity, e.EntityID, e.Action, e.Title, e.Audience, before, after)
}

const editCols = `id, actor_id, actor_name, entity, entity_id, action, title, audience, before, after, reverted_at, created_at`

// EditFilter narrows the journal.
type EditFilter struct {
	// Within keeps entries about content addressed only to an editor's zone.
	Within []string
	Entity string
	Limit  int
}

// ListEdits returns the newest journal entries first.
func (s *Store) ListEdits(ctx context.Context, f EditFilter) ([]models.Edit, error) {
	q := `SELECT ` + editCols + ` FROM edits e WHERE 1=1`
	args := []any{}
	q += audienceWithin("e", f.Within, &args)
	if f.Entity != "" {
		args = append(args, f.Entity)
		q += ` AND e.entity = $` + itoa(len(args))
	}
	limit := f.Limit
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	q += ` ORDER BY e.created_at DESC, e.id DESC LIMIT ` + itoa(limit)
	return many[models.Edit](ctx, s.db, q, args...)
}

// GetEdit fetches one entry.
func (s *Store) GetEdit(ctx context.Context, id int64) (models.Edit, error) {
	return one[models.Edit](ctx, s.db, `SELECT `+editCols+` FROM edits WHERE id = $1`, id)
}

// MarkEditReverted remembers that an entry was undone.
func (s *Store) MarkEditReverted(ctx context.Context, id int64) error {
	return s.exec(ctx, `UPDATE edits SET reverted_at = now() WHERE id = $1`, id)
}
