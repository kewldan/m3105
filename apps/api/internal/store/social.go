package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// ---- comments ----

var commentCols = `c.id, c.target_type, c.target_id, c.body, c.created_at, c.updated_at,
	u.id AS author_id, ` + userNameExpr + ` AS author_name, ` + userPhotoExpr + ` AS author_photo_url, u.group_name AS author_group,
	` + attachmentsOf("comment_id", "c.id") + ` AS attachments`

const commentFrom = ` FROM comments c JOIN users u ON u.id = c.user_id`

// Where a comment (alias c) lives, for moderation lists: a title and the public page path.
const commentTargetTitle = `CASE c.target_type
		WHEN 'note' THEN (SELECT n.title FROM notes n WHERE n.id = c.target_id)
		WHEN 'lab' THEN (SELECT l.title FROM labs l WHERE l.id = c.target_id)
	END`

const commentTargetPath = `CASE c.target_type
		WHEN 'note' THEN (SELECT '/notes/' || s.slug || '/' || n.slug FROM notes n JOIN subjects s ON s.id = n.subject_id WHERE n.id = c.target_id)
		WHEN 'lab' THEN (SELECT '/labs/' || s.slug || '/' || l.slug FROM labs l JOIN subjects s ON s.id = l.subject_id WHERE l.id = c.target_id)
	END`

const commentTargetCols = `,
	` + commentTargetTitle + ` AS target_title,
	` + commentTargetPath + ` AS target_path`

// CommentTargetExists reports whether comments can be attached to the target:
// notes and labs must be published.
func (s *Store) CommentTargetExists(ctx context.Context, target models.CommentTarget, id int64) (bool, error) {
	var q string
	switch target {
	case models.TargetNote:
		q = `SELECT EXISTS (SELECT 1 FROM notes WHERE id = $1 AND status = 'published')`
	case models.TargetLab:
		q = `SELECT EXISTS (SELECT 1 FROM labs WHERE id = $1 AND status = 'published')`
	default:
		return false, nil
	}
	var ok bool
	err := s.db.QueryRow(ctx, q, id).Scan(&ok)
	return ok, wrap(err)
}

// ListComments returns the comments of one target, oldest first.
func (s *Store) ListComments(ctx context.Context, target models.CommentTarget, id int64) ([]models.Comment, error) {
	return many[models.Comment](ctx, s.db, `SELECT `+commentCols+commentFrom+
		` WHERE c.target_type = $1 AND c.target_id = $2 ORDER BY c.created_at, c.id`, target, id)
}

// GetComment fetches one comment.
func (s *Store) GetComment(ctx context.Context, id int64) (models.Comment, error) {
	return one[models.Comment](ctx, s.db, `SELECT `+commentCols+commentFrom+` WHERE c.id = $1`, id)
}

// CreateComment inserts a comment by the user together with their uploaded files.
func (s *Store) CreateComment(ctx context.Context, userID int64, target models.CommentTarget, targetID int64, in *models.CommentInput) (models.Comment, error) {
	var id int64
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `INSERT INTO comments (target_type, target_id, user_id, body) VALUES ($1,$2,$3,$4) RETURNING id`,
			target, targetID, userID, in.Body).Scan(&id)
		if err != nil {
			return wrap(err)
		}
		return attachTo(ctx, tx, "comment_id", id, &userID, in.AttachmentIDs)
	})
	if err != nil {
		return models.Comment{}, err
	}
	return s.GetComment(ctx, id)
}

// UpdateComment rewrites the text and, when the input carries a list, the
// files of a comment. Only moderation uses it: new files are admin uploads.
func (s *Store) UpdateComment(ctx context.Context, id int64, in *models.CommentInput) (models.Comment, error) {
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE comments SET body = $2, updated_at = now() WHERE id = $1`, id, in.Body)
		if err != nil {
			return wrap(err)
		}
		if tag.RowsAffected() == 0 {
			return httpx.ErrNotFound
		}
		if in.AttachmentIDs == nil {
			return nil
		}
		return syncAttachments(ctx, tx, "comment_id", id, nil, in.AttachmentIDs)
	})
	if err != nil {
		return models.Comment{}, err
	}
	return s.GetComment(ctx, id)
}

// DeleteComment removes a comment by id.
func (s *Store) DeleteComment(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM comments WHERE id = $1`, id)
}

// DeleteCommentsOf removes every comment attached to a target (when the target is deleted).
func (s *Store) DeleteCommentsOf(ctx context.Context, target models.CommentTarget, targetID int64) error {
	_, err := s.db.Exec(ctx, `DELETE FROM comments WHERE target_type = $1 AND target_id = $2`, target, targetID)
	return wrap(err)
}

// ListRecentComments returns the newest comments across all targets for moderation.
func (s *Store) ListRecentComments(ctx context.Context, limit int) ([]models.AdminComment, error) {
	return many[models.AdminComment](ctx, s.db, `SELECT `+commentCols+commentTargetCols+commentFrom+
		` ORDER BY c.created_at DESC, c.id DESC LIMIT $1`, limit)
}

// CountUserWrites returns how many comments the user created since the given moment
// (anti-spam limit).
func (s *Store) CountUserWrites(ctx context.Context, userID int64, since time.Time) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM comments WHERE user_id = $1 AND created_at >= $2`, userID, since).Scan(&n)
	if err != nil {
		return 0, wrap(err)
	}
	return n, nil
}
