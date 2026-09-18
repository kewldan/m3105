package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// attachmentURL must match the route that serves files (GET /api/v1/files/{id}/{name}).
const attachmentURL = `'/api/v1/files/' || a.id || '/' || a.slug`

const attachmentCols = `a.id, ` + attachmentURL + ` AS url, a.name, a.content_type, a.size, a.width, a.height, a.created_at`

// attachmentsOf is a subquery with the files of one comment or post as a JSON
// array in display order; pgx decodes it straight into []models.Attachment.
func attachmentsOf(column, ref string) string {
	return `COALESCE((SELECT json_agg(json_build_object('id', a.id, 'url', ` + attachmentURL + `,
		'name', a.name, 'contentType', a.content_type, 'size', a.size, 'width', a.width, 'height', a.height,
		'createdAt', a.created_at) ORDER BY a.position, a.created_at)
		FROM attachments a WHERE a.` + column + ` = ` + ref + `), '[]'::json)`
}

const attachmentPlace = `CASE WHEN a.comment_id IS NOT NULL THEN 'comment' WHEN a.post_id IS NOT NULL THEN 'post'
	WHEN a.scope = 'content' THEN 'content' ELSE 'pending' END`

// Attachment scopes: files linked from MDX texts vs. files of comments and posts.
const (
	ScopeContent = "content"
	ScopeSocial  = "social"
)

// NewAttachment is a checked upload to record.
type NewAttachment struct {
	ID, Name, Slug, ContentType, SHA256 string
	Size                                int64
	Width, Height                       int
	// UserID is the student who uploaded it; nil for admin uploads.
	UserID *int64
	// Scope is ScopeContent for admin files meant for texts, ScopeSocial otherwise.
	Scope string
}

func nullIfZero(v int) *int {
	if v == 0 {
		return nil
	}
	return &v
}

// CreateAttachment records an uploaded file.
func (s *Store) CreateAttachment(ctx context.Context, in NewAttachment) (models.Attachment, error) {
	_, err := s.db.Exec(ctx, `INSERT INTO attachments (id, name, slug, content_type, size, width, height, sha256, user_id, scope)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		in.ID, in.Name, in.Slug, in.ContentType, in.Size, nullIfZero(in.Width), nullIfZero(in.Height), in.SHA256, in.UserID, in.Scope)
	if err != nil {
		return models.Attachment{}, wrap(err)
	}
	return s.GetAttachment(ctx, in.ID)
}

// GetAttachment fetches one file.
func (s *Store) GetAttachment(ctx context.Context, id string) (models.Attachment, error) {
	return one[models.Attachment](ctx, s.db, `SELECT `+attachmentCols+` FROM attachments a WHERE a.id = $1`, id)
}

// ContentAttachmentBySHA finds an identical file for texts, so re-uploading it
// (say, `content.ts note push` twice) reuses it instead of storing a copy.
// Files of comments and posts are never shared: they die with their owner.
func (s *Store) ContentAttachmentBySHA(ctx context.Context, sha string) (models.Attachment, error) {
	return one[models.Attachment](ctx, s.db, `SELECT `+attachmentCols+` FROM attachments a
		WHERE a.scope = 'content' AND a.sha256 = $1 ORDER BY a.created_at LIMIT 1`, sha)
}

// AttachmentAccess is what serving a file needs to decide who may see it.
type AttachmentAccess struct {
	models.Attachment
	UserID *int64                 `db:"user_id"`
	Place  models.AttachmentPlace `db:"place"`
	// Visibility of the post the file belongs to, directly or via a comment.
	Visibility models.PostVisibility `db:"visibility"`
}

// GetAttachmentAccess loads a file with its owner and visibility.
func (s *Store) GetAttachmentAccess(ctx context.Context, id string) (AttachmentAccess, error) {
	return one[AttachmentAccess](ctx, s.db, `SELECT `+attachmentCols+`, a.user_id, `+attachmentPlace+` AS place,
		COALESCE(p.visibility, pc.visibility, 'public') AS visibility
		FROM attachments a
		LEFT JOIN posts p ON p.id = a.post_id
		LEFT JOIN comments c ON c.id = a.comment_id
		LEFT JOIN posts pc ON c.target_type = 'post' AND pc.id = c.target_id
		WHERE a.id = $1`, id)
}

// CountUserUploads returns how many files the student uploaded since the given moment.
func (s *Store) CountUserUploads(ctx context.Context, userID int64, since time.Time) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM attachments WHERE user_id = $1 AND created_at >= $2`, userID, since).Scan(&n)
	return n, wrap(err)
}

// fileRefs finds links to files in every MDX text: one pass over the texts
// instead of a search per file.
const fileRefs = `WITH refs AS (
	SELECT m[1] AS id, 'note' AS type, n.title, '/notes/' || s.slug || '/' || n.slug AS path
		FROM notes n JOIN subjects s ON s.id = n.subject_id, regexp_matches(n.content, 'files/([a-z2-7]{26})', 'g') AS m
	UNION ALL SELECT m[1], 'lab', l.title, '/labs/' || s.slug || '/' || l.slug
		FROM labs l JOIN subjects s ON s.id = l.subject_id, regexp_matches(l.content, 'files/([a-z2-7]{26})', 'g') AS m
	UNION ALL SELECT m[1], 'page', pg.title, '/p/' || pg.slug
		FROM pages pg, regexp_matches(pg.content, 'files/([a-z2-7]{26})', 'g') AS m
	UNION ALL SELECT m[1], 'faq', f.question, '/faq'
		FROM faq_items f, regexp_matches(f.answer, 'files/([a-z2-7]{26})', 'g') AS m
	UNION ALL SELECT m[1], 'subject', s.name, '/subjects/' || s.slug
		FROM subjects s, regexp_matches(s.description, 'files/([a-z2-7]{26})', 'g') AS m
), used AS (
	SELECT id, jsonb_agg(DISTINCT jsonb_build_object('type', type, 'title', title, 'path', path)) AS used_in
	FROM refs GROUP BY id
)`

// ListAttachments returns the newest files of every kind for the admin list.
func (s *Store) ListAttachments(ctx context.Context, limit int) ([]models.AdminAttachment, error) {
	return many[models.AdminAttachment](ctx, s.db, fileRefs+`
		SELECT `+attachmentCols+`, `+attachmentPlace+` AS place,
			CASE WHEN u.id IS NOT NULL THEN `+userNameExpr+` END AS author_name,
			CASE WHEN a.post_id IS NOT NULL THEN COALESCE(NULLIF(p.title, ''), left(p.body, 60))
				WHEN a.comment_id IS NOT NULL THEN `+commentTargetTitle+` END AS target_title,
			CASE WHEN a.post_id IS NOT NULL THEN `+postPath+`
				WHEN a.comment_id IS NOT NULL THEN `+commentTargetPath+` END AS target_path,
			COALESCE(used.used_in, '[]'::jsonb) AS used_in
		FROM attachments a
		LEFT JOIN users u ON u.id = a.user_id
		LEFT JOIN posts p ON p.id = a.post_id
		LEFT JOIN comments c ON c.id = a.comment_id
		LEFT JOIN used ON used.id = a.id
		ORDER BY a.created_at DESC, a.id LIMIT $1`, limit)
}

// DeleteAttachment removes the row; the object goes with the next GC run, and
// the file stops being served right away because serving checks the row.
func (s *Store) DeleteAttachment(ctx context.Context, id string) error {
	return s.exec(ctx, `DELETE FROM attachments WHERE id = $1`, id)
}

// DeleteStaleUploads drops comment and post uploads that were never attached.
func (s *Store) DeleteStaleUploads(ctx context.Context, before time.Time) (int64, error) {
	tag, err := s.db.Exec(ctx, `DELETE FROM attachments
		WHERE scope = 'social' AND comment_id IS NULL AND post_id IS NULL AND created_at < $1`, before)
	if err != nil {
		return 0, wrap(err)
	}
	return tag.RowsAffected(), nil
}

// AttachmentIDs returns the id of every recorded file.
func (s *Store) AttachmentIDs(ctx context.Context) (map[string]bool, error) {
	rows, err := s.db.Query(ctx, `SELECT id FROM attachments`)
	if err != nil {
		return nil, wrap(err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, wrap(err)
	}
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	return set, nil
}

// attachTo moves pending uploads of the uploader (nil = admin) onto a comment
// or post and orders them as listed. Files already on this target may stay in
// the list; anything else (someone else's file, a file on another post, a file
// for texts) fails the whole write. column is a constant from the caller,
// never user input.
func attachTo(ctx context.Context, tx pgx.Tx, column string, targetID int64, uploader *int64, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	tag, err := tx.Exec(ctx, `UPDATE attachments SET `+column+` = $1, position = array_position($2::text[], id)
		WHERE id = ANY($2::text[]) AND (`+column+` = $1 OR (scope = 'social' AND comment_id IS NULL AND post_id IS NULL
			AND user_id IS NOT DISTINCT FROM $3::bigint))`,
		targetID, ids, uploader)
	if err != nil {
		return wrap(err)
	}
	if tag.RowsAffected() != int64(len(ids)) {
		return &httpx.ValidationError{Fields: map[string]string{
			"attachmentIds": "Файл не найден или уже прикреплён — загрузите его заново",
		}}
	}
	return nil
}

// syncAttachments makes ids the complete file list of a comment or post:
// dropped files are deleted, new ones must be the uploader's pending uploads.
func syncAttachments(ctx context.Context, tx pgx.Tx, column string, targetID int64, uploader *int64, ids []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM attachments WHERE `+column+` = $1 AND NOT (id = ANY($2::text[]))`,
		targetID, ids); err != nil {
		return wrap(err)
	}
	return attachTo(ctx, tx, column, targetID, uploader, ids)
}
