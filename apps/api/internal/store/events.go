package store

import (
	"context"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const eventCols = `e.id, e.title, e.kind, e.subject_id, e.starts_at, e.ends_at, e.all_day, e.location, e.description, e.url,
	e.created_at, e.updated_at, COALESCE(s.slug, '') AS subject_slug, COALESCE(s.name, '') AS subject_name,
	COALESCE(s.short_name, '') AS subject_short_name, COALESCE(s.color, '') AS subject_color, COALESCE(s.icon, '') AS subject_icon`

// ListEvents returns events, optionally restricted to a time window and subject.
func (s *Store) ListEvents(ctx context.Context, from, to *time.Time, subjectSlug string) ([]models.Event, error) {
	q := `SELECT ` + eventCols + ` FROM events e LEFT JOIN subjects s ON s.id = e.subject_id WHERE 1=1`
	args := []any{}
	if from != nil {
		args = append(args, *from)
		q += ` AND COALESCE(e.ends_at, e.starts_at) >= $` + itoa(len(args))
	}
	if to != nil {
		args = append(args, *to)
		q += ` AND e.starts_at <= $` + itoa(len(args))
	}
	if subjectSlug != "" {
		args = append(args, subjectSlug)
		q += ` AND s.slug = $` + itoa(len(args))
	}
	q += ` ORDER BY e.starts_at`
	return many[models.Event](ctx, s.db, q, args...)
}

// GetEvent fetches an event by id.
func (s *Store) GetEvent(ctx context.Context, id int64) (models.Event, error) {
	return one[models.Event](ctx, s.db, `SELECT `+eventCols+` FROM events e LEFT JOIN subjects s ON s.id = e.subject_id WHERE e.id = $1`, id)
}

// CreateEvent inserts an event.
func (s *Store) CreateEvent(ctx context.Context, in *models.EventInput) (models.Event, error) {
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO events (title, kind, subject_id, starts_at, ends_at, all_day, location, description, url)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
		in.Title, in.Kind, in.SubjectID, in.StartsAt, in.EndsAt, in.AllDay, in.Location, in.Description, in.URL).Scan(&id)
	if err != nil {
		return models.Event{}, wrap(err)
	}
	return s.GetEvent(ctx, id)
}

// UpdateEvent replaces an event's fields.
func (s *Store) UpdateEvent(ctx context.Context, id int64, in *models.EventInput) (models.Event, error) {
	if err := s.exec(ctx, `UPDATE events SET title=$1, kind=$2, subject_id=$3, starts_at=$4, ends_at=$5, all_day=$6,
		location=$7, description=$8, url=$9, updated_at=now() WHERE id = $10`,
		in.Title, in.Kind, in.SubjectID, in.StartsAt, in.EndsAt, in.AllDay, in.Location, in.Description, in.URL, id); err != nil {
		return models.Event{}, err
	}
	return s.GetEvent(ctx, id)
}

// DeleteEvent removes an event.
func (s *Store) DeleteEvent(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM events WHERE id = $1`, id)
}
