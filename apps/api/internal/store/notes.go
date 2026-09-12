package store

import (
	"context"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const quizzesCountCol = `(SELECT count(*) FROM quizzes q WHERE q.note_id = n.id AND q.status = 'published')::int AS quizzes_count`

const noteCols = `n.id, n.subject_id, n.number, n.slug, n.title, n.summary, n.content, n.lecture_date, n.status, n.created_at, n.updated_at,
	` + quizzesCountCol + `, s.slug AS subject_slug, s.name AS subject_name, s.short_name AS subject_short_name, s.color AS subject_color, s.icon AS subject_icon`

const noteListCols = `n.id, n.subject_id, n.number, n.slug, n.title, n.summary, '' AS content, n.lecture_date, n.status, n.created_at, n.updated_at,
	` + quizzesCountCol + `, s.slug AS subject_slug, s.name AS subject_name, s.short_name AS subject_short_name, s.color AS subject_color, s.icon AS subject_icon`

// NoteFilter narrows note listings.
type NoteFilter struct {
	SubjectID     *int64
	SubjectSlug   string
	PublishedOnly bool
	Limit         int
}

// ListNotes returns notes without bodies.
func (s *Store) ListNotes(ctx context.Context, f NoteFilter) ([]models.Note, error) {
	q := `SELECT ` + noteListCols + ` FROM notes n JOIN subjects s ON s.id = n.subject_id WHERE 1=1`
	args := []any{}
	if f.SubjectID != nil {
		args = append(args, *f.SubjectID)
		q += ` AND n.subject_id = $` + itoa(len(args))
	}
	if f.SubjectSlug != "" {
		args = append(args, f.SubjectSlug)
		q += ` AND s.slug = $` + itoa(len(args))
	}
	if f.PublishedOnly {
		q += ` AND n.status = 'published'`
	}
	if f.Limit > 0 {
		q += ` ORDER BY n.updated_at DESC LIMIT ` + itoa(f.Limit)
	} else {
		q += ` ORDER BY s.position, s.name, n.number, n.title`
	}
	return many[models.Note](ctx, s.db, q, args...)
}

// GetNote fetches a note by id.
func (s *Store) GetNote(ctx context.Context, id int64) (models.Note, error) {
	return one[models.Note](ctx, s.db, `SELECT `+noteCols+` FROM notes n JOIN subjects s ON s.id = n.subject_id WHERE n.id = $1`, id)
}

// GetNoteBySlugs fetches a note by subject and note slug.
func (s *Store) GetNoteBySlugs(ctx context.Context, subjectSlug, noteSlug string, publishedOnly bool) (models.Note, error) {
	q := `SELECT ` + noteCols + ` FROM notes n JOIN subjects s ON s.id = n.subject_id WHERE s.slug = $1 AND n.slug = $2`
	if publishedOnly {
		q += ` AND n.status = 'published'`
	}
	return one[models.Note](ctx, s.db, q, subjectSlug, noteSlug)
}

func (s *Store) noteSlugFree(ctx context.Context, subjectID, excludeID int64) func(string) (bool, error) {
	return func(slug string) (bool, error) {
		return s.slugTaken(ctx, `SELECT EXISTS(SELECT 1 FROM notes WHERE subject_id = $1 AND slug = $2 AND id <> $3)`, subjectID, slug, excludeID)
	}
}

// CreateNote inserts a note.
func (s *Store) CreateNote(ctx context.Context, in *models.NoteInput) (models.Note, error) {
	slug, err := uniqueSlug(in.Slug, s.noteSlugFree(ctx, in.SubjectID, 0))
	if err != nil {
		return models.Note{}, err
	}
	var id int64
	err = s.db.QueryRow(ctx, `INSERT INTO notes (subject_id, number, slug, title, summary, content, lecture_date, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
		in.SubjectID, in.Number, slug, in.Title, in.Summary, in.Content, in.LectureDate, in.Status).Scan(&id)
	if err != nil {
		return models.Note{}, wrap(err)
	}
	return s.GetNote(ctx, id)
}

// UpdateNote replaces a note's fields.
func (s *Store) UpdateNote(ctx context.Context, id int64, in *models.NoteInput) (models.Note, error) {
	slug, err := uniqueSlug(in.Slug, s.noteSlugFree(ctx, in.SubjectID, id))
	if err != nil {
		return models.Note{}, err
	}
	if err := s.exec(ctx, `UPDATE notes SET subject_id=$1, number=$2, slug=$3, title=$4, summary=$5, content=$6, lecture_date=$7,
		status=$8, updated_at=now() WHERE id = $9`,
		in.SubjectID, in.Number, slug, in.Title, in.Summary, in.Content, in.LectureDate, in.Status, id); err != nil {
		return models.Note{}, err
	}
	return s.GetNote(ctx, id)
}

// DeleteNote removes a note.
func (s *Store) DeleteNote(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM notes WHERE id = $1`, id)
}
