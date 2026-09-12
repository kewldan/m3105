package store

import (
	"context"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const faqCols = `id, question, answer, category, position, created_at, updated_at`

// ListFAQ returns all FAQ items ordered by category and position.
func (s *Store) ListFAQ(ctx context.Context) ([]models.FAQItem, error) {
	return many[models.FAQItem](ctx, s.db, `SELECT `+faqCols+` FROM faq_items ORDER BY position, id`)
}

// GetFAQ fetches one item.
func (s *Store) GetFAQ(ctx context.Context, id int64) (models.FAQItem, error) {
	return one[models.FAQItem](ctx, s.db, `SELECT `+faqCols+` FROM faq_items WHERE id = $1`, id)
}

// CreateFAQ inserts an item.
func (s *Store) CreateFAQ(ctx context.Context, in *models.FAQInput) (models.FAQItem, error) {
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO faq_items (question, answer, category, position) VALUES ($1,$2,$3,$4) RETURNING id`,
		in.Question, in.Answer, in.Category, in.Position).Scan(&id)
	if err != nil {
		return models.FAQItem{}, wrap(err)
	}
	return s.GetFAQ(ctx, id)
}

// UpdateFAQ replaces an item's fields.
func (s *Store) UpdateFAQ(ctx context.Context, id int64, in *models.FAQInput) (models.FAQItem, error) {
	if err := s.exec(ctx, `UPDATE faq_items SET question=$1, answer=$2, category=$3, position=$4, updated_at=now() WHERE id = $5`,
		in.Question, in.Answer, in.Category, in.Position, id); err != nil {
		return models.FAQItem{}, err
	}
	return s.GetFAQ(ctx, id)
}

// DeleteFAQ removes an item.
func (s *Store) DeleteFAQ(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM faq_items WHERE id = $1`, id)
}
