package store

import (
	"context"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// ---- comments ----

const commentCols = `c.id, c.target_type, c.target_id, c.body, c.created_at, c.updated_at,
	u.id AS author_id, ` + userNameExpr + ` AS author_name, u.photo_url AS author_photo_url`

const commentFrom = ` FROM comments c JOIN users u ON u.id = c.user_id`

// Where a comment lives, for the moderation list: the public page path and a title.
const commentTargetCols = `,
	CASE c.target_type
		WHEN 'note' THEN (SELECT n.title FROM notes n WHERE n.id = c.target_id)
		WHEN 'lab' THEN (SELECT l.title FROM labs l WHERE l.id = c.target_id)
		WHEN 'post' THEN (SELECT COALESCE(NULLIF(p.title, ''), left(p.body, 60)) FROM posts p WHERE p.id = c.target_id)
	END AS target_title,
	CASE c.target_type
		WHEN 'note' THEN (SELECT '/notes/' || s.slug || '/' || n.slug FROM notes n JOIN subjects s ON s.id = n.subject_id WHERE n.id = c.target_id)
		WHEN 'lab' THEN (SELECT '/labs/' || s.slug || '/' || l.slug FROM labs l JOIN subjects s ON s.id = l.subject_id WHERE l.id = c.target_id)
		WHEN 'post' THEN (SELECT CASE p.kind WHEN 'shawarma' THEN '/shawarma' ELSE '/jokes' END || '#post-' || p.id FROM posts p WHERE p.id = c.target_id)
	END AS target_path`

// CommentTargetExists reports whether comments can be attached to the target:
// notes and labs must be published, posts must exist.
func (s *Store) CommentTargetExists(ctx context.Context, target models.CommentTarget, id int64) (bool, error) {
	var q string
	switch target {
	case models.TargetNote:
		q = `SELECT EXISTS (SELECT 1 FROM notes WHERE id = $1 AND status = 'published')`
	case models.TargetLab:
		q = `SELECT EXISTS (SELECT 1 FROM labs WHERE id = $1 AND status = 'published')`
	case models.TargetPost:
		q = `SELECT EXISTS (SELECT 1 FROM posts WHERE id = $1)`
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

// CreateComment inserts a comment by the user.
func (s *Store) CreateComment(ctx context.Context, userID int64, target models.CommentTarget, targetID int64, body string) (models.Comment, error) {
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO comments (target_type, target_id, user_id, body) VALUES ($1,$2,$3,$4) RETURNING id`,
		target, targetID, userID, body).Scan(&id)
	if err != nil {
		return models.Comment{}, wrap(err)
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

// ---- posts ----

// postCols needs $1 = viewer id (0 for anonymous) to compute "liked".
const postCols = `p.id, p.kind, p.title, p.body, p.address, p.price, p.rating, p.created_at, p.updated_at,
	u.id AS author_id, ` + userNameExpr + ` AS author_name, u.photo_url AS author_photo_url,
	(SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id)::int AS likes_count,
	(SELECT count(*) FROM comments c WHERE c.target_type = 'post' AND c.target_id = p.id)::int AS comments_count,
	EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS liked`

const postFrom = ` FROM posts p JOIN users u ON u.id = p.user_id`

// PostFilter narrows and orders feed listings.
type PostFilter struct {
	Kind models.PostKind // empty = all kinds (admin)
	Top  bool            // order by likes instead of recency
}

// ListPosts returns posts for the viewer (0 = anonymous).
func (s *Store) ListPosts(ctx context.Context, viewerID int64, f PostFilter) ([]models.Post, error) {
	q := `SELECT ` + postCols + postFrom + ` WHERE 1=1`
	args := []any{viewerID}
	if f.Kind != "" {
		args = append(args, f.Kind)
		q += ` AND p.kind = $` + itoa(len(args))
	}
	if f.Top {
		q += ` ORDER BY likes_count DESC, p.created_at DESC`
	} else {
		q += ` ORDER BY p.created_at DESC`
	}
	return many[models.Post](ctx, s.db, q, args...)
}

// GetPost fetches one post for the viewer (0 = anonymous).
func (s *Store) GetPost(ctx context.Context, viewerID, id int64) (models.Post, error) {
	return one[models.Post](ctx, s.db, `SELECT `+postCols+postFrom+` WHERE p.id = $2`, viewerID, id)
}

// CreatePost inserts a post by the user.
func (s *Store) CreatePost(ctx context.Context, userID int64, in *models.PostInput) (models.Post, error) {
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO posts (kind, user_id, title, body, address, price, rating)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, in.Kind, userID, in.Title, in.Body, in.Address, in.Price, in.Rating).Scan(&id)
	if err != nil {
		return models.Post{}, wrap(err)
	}
	return s.GetPost(ctx, userID, id)
}

// UpdatePost rewrites the editable fields; the kind never changes.
func (s *Store) UpdatePost(ctx context.Context, viewerID, id int64, in *models.PostInput) (models.Post, error) {
	if err := s.exec(ctx, `UPDATE posts SET title = $2, body = $3, address = $4, price = $5, rating = $6, updated_at = now()
		WHERE id = $1`, id, in.Title, in.Body, in.Address, in.Price, in.Rating); err != nil {
		return models.Post{}, err
	}
	return s.GetPost(ctx, viewerID, id)
}

// DeletePost removes a post together with its comments.
func (s *Store) DeletePost(ctx context.Context, id int64) error {
	if err := s.DeleteCommentsOf(ctx, models.TargetPost, id); err != nil {
		return err
	}
	return s.exec(ctx, `DELETE FROM posts WHERE id = $1`, id)
}

// SetLike adds or removes the user's like; idempotent.
func (s *Store) SetLike(ctx context.Context, postID, userID int64, on bool) error {
	var err error
	if on {
		_, err = s.db.Exec(ctx, `INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, postID, userID)
	} else {
		_, err = s.db.Exec(ctx, `DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, postID, userID)
	}
	if err != nil {
		return wrap(err)
	}
	return nil
}

// PostExists reports whether a post exists.
func (s *Store) PostExists(ctx context.Context, id int64) (bool, error) {
	var ok bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM posts WHERE id = $1)`, id).Scan(&ok)
	if err != nil {
		return false, wrap(err)
	}
	if !ok {
		return false, httpx.ErrNotFound
	}
	return true, nil
}

// CountUserWrites returns how many comments and posts the user created since the given moment
// (anti-spam limit).
func (s *Store) CountUserWrites(ctx context.Context, userID int64, since time.Time) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT (SELECT count(*) FROM comments WHERE user_id = $1 AND created_at >= $2)
		+ (SELECT count(*) FROM posts WHERE user_id = $1 AND created_at >= $2)`, userID, since).Scan(&n)
	if err != nil {
		return 0, wrap(err)
	}
	return n, nil
}
