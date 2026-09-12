package store

import (
	"context"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const pageCols = `id, slug, title, summary, content, position, show_in_nav, status, created_at, updated_at`
const pageListCols = `id, slug, title, summary, '' AS content, position, show_in_nav, status, created_at, updated_at`

// ListPages returns pages (without bodies).
func (s *Store) ListPages(ctx context.Context, publishedOnly bool) ([]models.Page, error) {
	q := `SELECT ` + pageListCols + ` FROM pages`
	if publishedOnly {
		q += ` WHERE status = 'published'`
	}
	q += ` ORDER BY position, title`
	return many[models.Page](ctx, s.db, q)
}

// GetPage fetches a page by id.
func (s *Store) GetPage(ctx context.Context, id int64) (models.Page, error) {
	return one[models.Page](ctx, s.db, `SELECT `+pageCols+` FROM pages WHERE id = $1`, id)
}

// GetPageBySlug fetches a page by slug.
func (s *Store) GetPageBySlug(ctx context.Context, slug string, publishedOnly bool) (models.Page, error) {
	q := `SELECT ` + pageCols + ` FROM pages WHERE slug = $1`
	if publishedOnly {
		q += ` AND status = 'published'`
	}
	return one[models.Page](ctx, s.db, q, slug)
}

func (s *Store) pageSlugFree(ctx context.Context, excludeID int64) func(string) (bool, error) {
	return func(slug string) (bool, error) {
		return s.slugTaken(ctx, `SELECT EXISTS(SELECT 1 FROM pages WHERE slug = $1 AND id <> $2)`, slug, excludeID)
	}
}

// CreatePage inserts a page.
func (s *Store) CreatePage(ctx context.Context, in *models.PageInput) (models.Page, error) {
	slug, err := uniqueSlug(in.Slug, s.pageSlugFree(ctx, 0))
	if err != nil {
		return models.Page{}, err
	}
	var id int64
	err = s.db.QueryRow(ctx, `INSERT INTO pages (slug, title, summary, content, position, show_in_nav, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		slug, in.Title, in.Summary, in.Content, in.Position, in.ShowInNav, in.Status).Scan(&id)
	if err != nil {
		return models.Page{}, wrap(err)
	}
	return s.GetPage(ctx, id)
}

// UpdatePage replaces a page's fields.
func (s *Store) UpdatePage(ctx context.Context, id int64, in *models.PageInput) (models.Page, error) {
	slug, err := uniqueSlug(in.Slug, s.pageSlugFree(ctx, id))
	if err != nil {
		return models.Page{}, err
	}
	if err := s.exec(ctx, `UPDATE pages SET slug=$1, title=$2, summary=$3, content=$4, position=$5, show_in_nav=$6, status=$7,
		updated_at=now() WHERE id = $8`,
		slug, in.Title, in.Summary, in.Content, in.Position, in.ShowInNav, in.Status, id); err != nil {
		return models.Page{}, err
	}
	return s.GetPage(ctx, id)
}

// DeletePage removes a page.
func (s *Store) DeletePage(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM pages WHERE id = $1`, id)
}
