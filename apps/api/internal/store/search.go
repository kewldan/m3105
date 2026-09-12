package store

import (
	"context"
	"strings"
)

// SearchResult is one hit in the site-wide search.
type SearchResult struct {
	Kind     string `db:"kind" json:"kind"`
	Title    string `db:"title" json:"title"`
	Subtitle string `db:"subtitle" json:"subtitle"`
	Path     string `db:"path" json:"path"`
}

// Search runs a case-insensitive substring search across published content.
func (s *Store) Search(ctx context.Context, query string, limit int) ([]SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []SearchResult{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	pattern := "%" + strings.NewReplacer("%", "\\%", "_", "\\_").Replace(query) + "%"
	q := `
	SELECT * FROM (
		SELECT 'lab' AS kind, l.title, s.name AS subtitle, '/labs/' || s.slug || '/' || l.slug AS path
		FROM labs l JOIN subjects s ON s.id = l.subject_id
		WHERE l.status = 'published' AND (l.title ILIKE $1 OR l.summary ILIKE $1 OR l.content ILIKE $1)
		UNION ALL
		SELECT 'note', n.title, s.name, '/notes/' || s.slug || '/' || n.slug
		FROM notes n JOIN subjects s ON s.id = n.subject_id
		WHERE n.status = 'published' AND (n.title ILIKE $1 OR n.summary ILIKE $1 OR n.content ILIKE $1)
		UNION ALL
		SELECT 'quiz', q.title, s.name || ' · ' || n.title, '/notes/' || s.slug || '/' || n.slug || '#quiz'
		FROM quizzes q JOIN notes n ON n.id = q.note_id JOIN subjects s ON s.id = n.subject_id
		WHERE q.status = 'published' AND n.status = 'published' AND (q.title ILIKE $1 OR q.description ILIKE $1)
		UNION ALL
		SELECT 'faq', f.question, COALESCE(NULLIF(f.category, ''), 'ЧаВо'), '/faq#faq-' || f.id
		FROM faq_items f WHERE f.question ILIKE $1 OR f.answer ILIKE $1
		UNION ALL
		SELECT 'page', p.title, 'Страница', '/p/' || p.slug
		FROM pages p WHERE p.status = 'published' AND (p.title ILIKE $1 OR p.content ILIKE $1)
		UNION ALL
		SELECT 'subject', s.name, 'Предмет', '/subjects/' || s.slug
		FROM subjects s WHERE s.name ILIKE $1 OR s.short_name ILIKE $1 OR s.teacher ILIKE $1
	) hits LIMIT $2`
	return many[SearchResult](ctx, s.db, q, pattern, limit)
}
