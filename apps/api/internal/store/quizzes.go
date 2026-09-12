package store

import (
	"context"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const quizCols = `q.id, q.subject_id, q.note_id, q.slug, q.title, q.description, q.questions, q.shuffle_questions, q.shuffle_options,
	q.status, q.created_at, q.updated_at, COALESCE(s.slug, '') AS subject_slug, COALESCE(s.name, '') AS subject_name,
	COALESCE(s.short_name, '') AS subject_short_name, COALESCE(s.color, '') AS subject_color, COALESCE(s.icon, '') AS subject_icon,
	COALESCE(n.slug, '') AS note_slug, COALESCE(n.title, '') AS note_title`

const quizListCols = `q.id, q.subject_id, q.note_id, q.slug, q.title, q.description, '[]'::jsonb AS questions, q.shuffle_questions, q.shuffle_options,
	q.status, q.created_at, q.updated_at, COALESCE(s.slug, '') AS subject_slug, COALESCE(s.name, '') AS subject_name,
	COALESCE(s.short_name, '') AS subject_short_name, COALESCE(s.color, '') AS subject_color, COALESCE(s.icon, '') AS subject_icon,
	COALESCE(n.slug, '') AS note_slug, COALESCE(n.title, '') AS note_title, jsonb_array_length(q.questions) AS questions_count`

// QuizSummary is a quiz row without questions but with a question counter.
type QuizSummary struct {
	models.Quiz
	QuestionsCount int `db:"questions_count" json:"questionsCount"`
}

// QuizFilter narrows quiz listings.
type QuizFilter struct {
	SubjectSlug   string
	NoteID        *int64
	PublishedOnly bool
}

const quizFrom = ` FROM quizzes q LEFT JOIN subjects s ON s.id = q.subject_id LEFT JOIN notes n ON n.id = q.note_id`

// ListQuizzes returns quiz summaries.
func (s *Store) ListQuizzes(ctx context.Context, f QuizFilter) ([]QuizSummary, error) {
	q := `SELECT ` + quizListCols + quizFrom + ` WHERE 1=1`
	args := []any{}
	if f.SubjectSlug != "" {
		args = append(args, f.SubjectSlug)
		q += ` AND s.slug = $` + itoa(len(args))
	}
	if f.NoteID != nil {
		args = append(args, *f.NoteID)
		q += ` AND q.note_id = $` + itoa(len(args))
	}
	if f.PublishedOnly {
		q += ` AND q.status = 'published'`
	}
	q += ` ORDER BY s.position, s.name, q.title`
	return many[QuizSummary](ctx, s.db, q, args...)
}

// GetQuiz fetches a quiz by id including questions.
func (s *Store) GetQuiz(ctx context.Context, id int64) (models.Quiz, error) {
	return one[models.Quiz](ctx, s.db, `SELECT `+quizCols+quizFrom+` WHERE q.id = $1`, id)
}

// GetQuizBySlug fetches a quiz by slug.
func (s *Store) GetQuizBySlug(ctx context.Context, slug string, publishedOnly bool) (models.Quiz, error) {
	q := `SELECT ` + quizCols + quizFrom + ` WHERE q.slug = $1`
	if publishedOnly {
		q += ` AND q.status = 'published'`
	}
	return one[models.Quiz](ctx, s.db, q, slug)
}

func (s *Store) quizSlugFree(ctx context.Context, excludeID int64) func(string) (bool, error) {
	return func(slug string) (bool, error) {
		return s.slugTaken(ctx, `SELECT EXISTS(SELECT 1 FROM quizzes WHERE slug = $1 AND id <> $2)`, slug, excludeID)
	}
}

func boolOr(v *bool, def bool) bool {
	if v == nil {
		return def
	}
	return *v
}

// noteSubject returns the subject of a note so quizzes always follow their note.
func (s *Store) noteSubject(ctx context.Context, noteID *int64) (*int64, error) {
	if noteID == nil {
		return nil, nil
	}
	var subjectID int64
	if err := s.db.QueryRow(ctx, `SELECT subject_id FROM notes WHERE id = $1`, *noteID).Scan(&subjectID); err != nil {
		return nil, &httpx.ValidationError{Fields: map[string]string{"noteId": "Конспект не найден"}}
	}
	return &subjectID, nil
}

// CreateQuiz inserts a quiz.
func (s *Store) CreateQuiz(ctx context.Context, in *models.QuizInput) (models.Quiz, error) {
	slug, err := uniqueSlug(in.Slug, s.quizSlugFree(ctx, 0))
	if err != nil {
		return models.Quiz{}, err
	}
	if in.SubjectID, err = s.noteSubject(ctx, in.NoteID); err != nil {
		return models.Quiz{}, err
	}
	var id int64
	err = s.db.QueryRow(ctx, `INSERT INTO quizzes (subject_id, note_id, slug, title, description, questions, shuffle_questions, shuffle_options, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
		in.SubjectID, in.NoteID, slug, in.Title, in.Description, in.Questions, boolOr(in.ShuffleQuestions, true), boolOr(in.ShuffleOptions, true), in.Status).Scan(&id)
	if err != nil {
		return models.Quiz{}, wrap(err)
	}
	return s.GetQuiz(ctx, id)
}

// UpdateQuiz replaces a quiz's fields.
func (s *Store) UpdateQuiz(ctx context.Context, id int64, in *models.QuizInput) (models.Quiz, error) {
	slug, err := uniqueSlug(in.Slug, s.quizSlugFree(ctx, id))
	if err != nil {
		return models.Quiz{}, err
	}
	if in.SubjectID, err = s.noteSubject(ctx, in.NoteID); err != nil {
		return models.Quiz{}, err
	}
	if err := s.exec(ctx, `UPDATE quizzes SET subject_id=$1, note_id=$2, slug=$3, title=$4, description=$5, questions=$6,
		shuffle_questions=$7, shuffle_options=$8, status=$9, updated_at=now() WHERE id = $10`,
		in.SubjectID, in.NoteID, slug, in.Title, in.Description, in.Questions, boolOr(in.ShuffleQuestions, true), boolOr(in.ShuffleOptions, true), in.Status, id); err != nil {
		return models.Quiz{}, err
	}
	return s.GetQuiz(ctx, id)
}

// DeleteQuiz removes a quiz.
func (s *Store) DeleteQuiz(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM quizzes WHERE id = $1`, id)
}
