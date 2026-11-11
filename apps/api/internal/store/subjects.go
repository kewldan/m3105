package store

import (
	"context"
	"strings"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const subjectCols = `s.id, s.slug, s.name, s.short_name, s.color, s.icon, s.lecturer, s.practice_teacher, s.theory_min, s.description, s.links, s.position, s.created_at, s.updated_at, s.audience`

// SubjectWithCounts adds published-content counters for public listings.
type SubjectWithCounts struct {
	models.Subject
	LabsCount    int `db:"labs_count" json:"labsCount"`
	NotesCount   int `db:"notes_count" json:"notesCount"`
	QuizzesCount int `db:"quizzes_count" json:"quizzesCount"`
}

// ListSubjects returns all subjects ordered by position and name.
func (s *Store) ListSubjects(ctx context.Context) ([]models.Subject, error) {
	return many[models.Subject](ctx, s.db, `SELECT `+subjectCols+` FROM subjects s ORDER BY s.position, s.name`)
}

// ListSubjectsWithCounts returns subjects with published counters. With a
// viewer group only subjects and content for it are listed and counted.
func (s *Store) ListSubjectsWithCounts(ctx context.Context, viewerGroup string) ([]SubjectWithCounts, error) {
	args := []any{}
	labs := audienceIn("l", viewerGroup, &args)
	notes := strings.ReplaceAll(labs, "l.audience", "n.audience")
	quizzes := `AND (q.note_id IS NULL OR EXISTS (SELECT 1 FROM notes n WHERE n.id = q.note_id` + notes + `))`
	subjects := strings.Replace(labs, " AND ", " WHERE ", 1)
	subjects = strings.ReplaceAll(subjects, "l.audience", "s.audience")
	return many[SubjectWithCounts](ctx, s.db, `SELECT `+subjectCols+`,
		(SELECT count(*) FROM labs l WHERE l.subject_id = s.id AND l.status = 'published'`+labs+`)::int AS labs_count,
		(SELECT count(*) FROM notes n WHERE n.subject_id = s.id AND n.status = 'published'`+notes+`)::int AS notes_count,
		(SELECT count(*) FROM quizzes q WHERE q.subject_id = s.id AND q.status = 'published' `+quizzes+`)::int AS quizzes_count
		FROM subjects s`+subjects+` ORDER BY s.position, s.name`, args...)
}

// GetSubject fetches a subject by id.
func (s *Store) GetSubject(ctx context.Context, id int64) (models.Subject, error) {
	return one[models.Subject](ctx, s.db, `SELECT `+subjectCols+` FROM subjects s WHERE s.id = $1`, id)
}

// GetSubjectBySlug fetches a subject by slug.
func (s *Store) GetSubjectBySlug(ctx context.Context, slug string) (models.Subject, error) {
	return one[models.Subject](ctx, s.db, `SELECT `+subjectCols+` FROM subjects s WHERE s.slug = $1`, slug)
}

func (s *Store) subjectSlugFree(ctx context.Context, excludeID int64) func(string) (bool, error) {
	return func(slug string) (bool, error) {
		return s.slugTaken(ctx, `SELECT EXISTS(SELECT 1 FROM subjects WHERE slug = $1 AND id <> $2)`, slug, excludeID)
	}
}

// CreateSubject inserts a subject.
func (s *Store) CreateSubject(ctx context.Context, in *models.SubjectInput) (models.Subject, error) {
	slug, err := uniqueSlug(in.Slug, s.subjectSlugFree(ctx, 0))
	if err != nil {
		return models.Subject{}, err
	}
	var id int64
	err = s.db.QueryRow(ctx, `INSERT INTO subjects (slug, name, short_name, color, icon, lecturer, practice_teacher, description, links, position, theory_min)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
		slug, in.Name, in.ShortName, in.Color, in.Icon, in.Lecturer, in.PracticeTeacher, in.Description, in.Links, in.Position, in.TheoryMin).Scan(&id)
	if err != nil {
		return models.Subject{}, wrap(err)
	}
	if err := s.setAudience(ctx, "subjects", id, in.Audience); err != nil {
		return models.Subject{}, err
	}
	return s.GetSubject(ctx, id)
}

// UpdateSubject replaces a subject's fields.
func (s *Store) UpdateSubject(ctx context.Context, id int64, in *models.SubjectInput) (models.Subject, error) {
	slug, err := uniqueSlug(in.Slug, s.subjectSlugFree(ctx, id))
	if err != nil {
		return models.Subject{}, err
	}
	if err := s.exec(ctx, `UPDATE subjects SET slug=$1, name=$2, short_name=$3, color=$4, icon=$5, lecturer=$6, practice_teacher=$7,
		description=$8, links=$9, position=$10, theory_min=$11, updated_at=now() WHERE id = $12`,
		slug, in.Name, in.ShortName, in.Color, in.Icon, in.Lecturer, in.PracticeTeacher, in.Description, in.Links, in.Position, in.TheoryMin, id); err != nil {
		return models.Subject{}, err
	}
	if err := s.setAudience(ctx, "subjects", id, in.Audience); err != nil {
		return models.Subject{}, err
	}
	return s.GetSubject(ctx, id)
}

// DeleteSubject removes a subject and cascades to labs and notes.
func (s *Store) DeleteSubject(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM subjects WHERE id = $1`, id)
}
