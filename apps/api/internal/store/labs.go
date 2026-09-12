package store

import (
	"context"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const labCols = `l.id, l.subject_id, l.number, l.slug, l.title, l.summary, l.content, l.requirements, l.submission,
	l.variants, l.materials, l.deadline_at, l.deadline_note, l.max_score, l.teacher, l.status, l.created_at, l.updated_at,
	s.slug AS subject_slug, s.name AS subject_name, s.short_name AS subject_short_name, s.color AS subject_color, s.icon AS subject_icon`

const labListCols = `l.id, l.subject_id, l.number, l.slug, l.title, l.summary, '' AS content, '' AS requirements, '' AS submission,
	'' AS variants, l.materials, l.deadline_at, l.deadline_note, l.max_score, l.teacher, l.status, l.created_at, l.updated_at,
	s.slug AS subject_slug, s.name AS subject_name, s.short_name AS subject_short_name, s.color AS subject_color, s.icon AS subject_icon`

// LabFilter narrows lab listings.
type LabFilter struct {
	SubjectID     *int64
	SubjectSlug   string
	PublishedOnly bool
}

// ListLabs returns labs (without long MDX bodies) matching the filter.
func (s *Store) ListLabs(ctx context.Context, f LabFilter) ([]models.Lab, error) {
	q := `SELECT ` + labListCols + ` FROM labs l JOIN subjects s ON s.id = l.subject_id WHERE 1=1`
	args := []any{}
	if f.SubjectID != nil {
		args = append(args, *f.SubjectID)
		q += ` AND l.subject_id = $` + itoa(len(args))
	}
	if f.SubjectSlug != "" {
		args = append(args, f.SubjectSlug)
		q += ` AND s.slug = $` + itoa(len(args))
	}
	if f.PublishedOnly {
		q += ` AND l.status = 'published'`
	}
	q += ` ORDER BY s.position, s.name, l.number, l.title`
	return many[models.Lab](ctx, s.db, q, args...)
}

// GetLab fetches a lab by id including full content.
func (s *Store) GetLab(ctx context.Context, id int64) (models.Lab, error) {
	return one[models.Lab](ctx, s.db, `SELECT `+labCols+` FROM labs l JOIN subjects s ON s.id = l.subject_id WHERE l.id = $1`, id)
}

// GetLabBySlugs fetches a lab by subject and lab slug.
func (s *Store) GetLabBySlugs(ctx context.Context, subjectSlug, labSlug string, publishedOnly bool) (models.Lab, error) {
	q := `SELECT ` + labCols + ` FROM labs l JOIN subjects s ON s.id = l.subject_id WHERE s.slug = $1 AND l.slug = $2`
	if publishedOnly {
		q += ` AND l.status = 'published'`
	}
	return one[models.Lab](ctx, s.db, q, subjectSlug, labSlug)
}

func (s *Store) labSlugFree(ctx context.Context, subjectID, excludeID int64) func(string) (bool, error) {
	return func(slug string) (bool, error) {
		return s.slugTaken(ctx, `SELECT EXISTS(SELECT 1 FROM labs WHERE subject_id = $1 AND slug = $2 AND id <> $3)`, subjectID, slug, excludeID)
	}
}

// CreateLab inserts a lab.
func (s *Store) CreateLab(ctx context.Context, in *models.LabInput) (models.Lab, error) {
	slug, err := uniqueSlug(in.Slug, s.labSlugFree(ctx, in.SubjectID, 0))
	if err != nil {
		return models.Lab{}, err
	}
	var id int64
	err = s.db.QueryRow(ctx, `INSERT INTO labs (subject_id, number, slug, title, summary, content, requirements, submission,
		variants, materials, deadline_at, deadline_note, max_score, teacher, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
		in.SubjectID, in.Number, slug, in.Title, in.Summary, in.Content, in.Requirements, in.Submission,
		in.Variants, in.Materials, in.DeadlineAt, in.DeadlineNote, in.MaxScore, in.Teacher, in.Status).Scan(&id)
	if err != nil {
		return models.Lab{}, wrap(err)
	}
	return s.GetLab(ctx, id)
}

// UpdateLab replaces a lab's fields.
func (s *Store) UpdateLab(ctx context.Context, id int64, in *models.LabInput) (models.Lab, error) {
	slug, err := uniqueSlug(in.Slug, s.labSlugFree(ctx, in.SubjectID, id))
	if err != nil {
		return models.Lab{}, err
	}
	if err := s.exec(ctx, `UPDATE labs SET subject_id=$1, number=$2, slug=$3, title=$4, summary=$5, content=$6,
		requirements=$7, submission=$8, variants=$9, materials=$10, deadline_at=$11, deadline_note=$12, max_score=$13,
		teacher=$14, status=$15, updated_at=now() WHERE id = $16`,
		in.SubjectID, in.Number, slug, in.Title, in.Summary, in.Content, in.Requirements, in.Submission,
		in.Variants, in.Materials, in.DeadlineAt, in.DeadlineNote, in.MaxScore, in.Teacher, in.Status, id); err != nil {
		return models.Lab{}, err
	}
	return s.GetLab(ctx, id)
}

// DeleteLab removes a lab.
func (s *Store) DeleteLab(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM labs WHERE id = $1`, id)
}

// ListLabDeadlines returns published labs with a deadline inside [from, to].
func (s *Store) ListLabDeadlines(ctx context.Context, from, to time.Time, subjectSlug string) ([]models.Lab, error) {
	q := `SELECT ` + labListCols + ` FROM labs l JOIN subjects s ON s.id = l.subject_id
		WHERE l.status = 'published' AND l.deadline_at IS NOT NULL AND l.deadline_at >= $1 AND l.deadline_at <= $2`
	args := []any{from, to}
	if subjectSlug != "" {
		args = append(args, subjectSlug)
		q += ` AND s.slug = $3`
	}
	q += ` ORDER BY l.deadline_at`
	return many[models.Lab](ctx, s.db, q, args...)
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b []byte
	for i > 0 {
		b = append([]byte{byte('0' + i%10)}, b...)
		i /= 10
	}
	return string(b)
}
