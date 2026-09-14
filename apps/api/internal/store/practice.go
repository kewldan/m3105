package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const practiceCols = `ps.id, ps.subject_id, ps.starts_at, ps.ends_at, ps.location, ps.capacity, ps.note, ps.created_at, ps.updated_at,
	s.slug AS subject_slug, s.name AS subject_name, s.short_name AS subject_short_name, s.color AS subject_color, s.icon AS subject_icon,
	(SELECT count(DISTINCT g.user_id) FROM practice_signups g WHERE g.session_id = ps.id)::int AS signups_count`

const practiceFrom = ` FROM practice_sessions ps JOIN subjects s ON s.id = ps.subject_id`

// PracticeFilter narrows session listings.
type PracticeFilter struct {
	SubjectSlug string
	From        *time.Time
	To          *time.Time
}

// ListPracticeSessions returns sessions ordered by start time.
func (s *Store) ListPracticeSessions(ctx context.Context, f PracticeFilter) ([]models.PracticeSession, error) {
	q := `SELECT ` + practiceCols + practiceFrom + ` WHERE 1=1`
	args := []any{}
	if f.SubjectSlug != "" {
		args = append(args, f.SubjectSlug)
		q += ` AND s.slug = $` + itoa(len(args))
	}
	if f.From != nil {
		args = append(args, *f.From)
		q += ` AND COALESCE(ps.ends_at, ps.starts_at + interval '90 minutes') >= $` + itoa(len(args))
	}
	if f.To != nil {
		args = append(args, *f.To)
		q += ` AND ps.starts_at <= $` + itoa(len(args))
	}
	q += ` ORDER BY ps.starts_at`
	return many[models.PracticeSession](ctx, s.db, q, args...)
}

// GetPracticeSession fetches one session.
func (s *Store) GetPracticeSession(ctx context.Context, id int64) (models.PracticeSession, error) {
	return one[models.PracticeSession](ctx, s.db, `SELECT `+practiceCols+practiceFrom+` WHERE ps.id = $1`, id)
}

// CreatePracticeSession inserts a session.
func (s *Store) CreatePracticeSession(ctx context.Context, in *models.PracticeSessionInput) (models.PracticeSession, error) {
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO practice_sessions (subject_id, starts_at, ends_at, location, capacity, note)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, in.SubjectID, in.StartsAt, in.EndsAt, in.Location, in.Capacity, in.Note).Scan(&id)
	if err != nil {
		return models.PracticeSession{}, wrap(err)
	}
	return s.GetPracticeSession(ctx, id)
}

// UpdatePracticeSession replaces a session's fields.
func (s *Store) UpdatePracticeSession(ctx context.Context, id int64, in *models.PracticeSessionInput) (models.PracticeSession, error) {
	if err := s.exec(ctx, `UPDATE practice_sessions SET subject_id=$1, starts_at=$2, ends_at=$3, location=$4, capacity=$5, note=$6,
		updated_at=now() WHERE id = $7`, in.SubjectID, in.StartsAt, in.EndsAt, in.Location, in.Capacity, in.Note, id); err != nil {
		return models.PracticeSession{}, err
	}
	return s.GetPracticeSession(ctx, id)
}

// DeletePracticeSession removes a session and its signups.
func (s *Store) DeletePracticeSession(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM practice_sessions WHERE id = $1`, id)
}

const signupCols = `g.session_id, g.user_id, ` + userNameExpr + ` AS user_name, u.photo_url, g.lab_id, l.number AS lab_number, l.title AS lab_title,
	l.slug AS lab_slug, s.slug AS subject_slug, g.created_at`

const signupFrom = ` FROM practice_signups g JOIN users u ON u.id = g.user_id JOIN labs l ON l.id = g.lab_id JOIN subjects s ON s.id = l.subject_id`

// ListSignupsForSessions returns signup rows for the given sessions.
func (s *Store) ListSignupsForSessions(ctx context.Context, sessionIDs []int64) ([]models.SignupRow, error) {
	if len(sessionIDs) == 0 {
		return []models.SignupRow{}, nil
	}
	return many[models.SignupRow](ctx, s.db, `SELECT `+signupCols+signupFrom+` WHERE g.session_id = ANY($1) ORDER BY g.created_at, l.number`, sessionIDs)
}

// ListUserSignups returns everything a user signed up for.
func (s *Store) ListUserSignups(ctx context.Context, userID int64) ([]models.SignupRow, error) {
	return many[models.SignupRow](ctx, s.db, `SELECT `+signupCols+signupFrom+` WHERE g.user_id = $1 ORDER BY g.created_at, l.number`, userID)
}

// ListSubjectLabRefs returns published labs of a subject for signup pickers.
func (s *Store) ListSubjectLabRefs(ctx context.Context, subjectID int64) ([]models.LabRef, error) {
	return many[models.LabRef](ctx, s.db, `SELECT l.id, l.number, l.title, l.slug, s.slug AS subject_slug FROM labs l JOIN subjects s ON s.id = l.subject_id
		WHERE l.subject_id = $1 AND l.status = 'published' ORDER BY l.number, l.title`, subjectID)
}

// ErrSessionFull is returned when the capacity would be exceeded.
var ErrSessionFull = errors.New("session is full")

// ReplaceSignups sets the user's labs for a session (empty list removes the signup).
// Capacity is enforced on distinct users inside a transaction.
func (s *Store) ReplaceSignups(ctx context.Context, sessionID, userID int64, labIDs []int64) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var subjectID int64
	var capacity *int
	if err := tx.QueryRow(ctx, `SELECT subject_id, capacity FROM practice_sessions WHERE id = $1 FOR UPDATE`, sessionID).Scan(&subjectID, &capacity); err != nil {
		return wrap(err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM practice_signups WHERE session_id = $1 AND user_id = $2`, sessionID, userID); err != nil {
		return wrap(err)
	}
	if len(labIDs) > 0 {
		if capacity != nil {
			var others int
			if err := tx.QueryRow(ctx, `SELECT count(DISTINCT user_id) FROM practice_signups WHERE session_id = $1`, sessionID).Scan(&others); err != nil {
				return wrap(err)
			}
			if others >= *capacity {
				return ErrSessionFull
			}
		}
		for _, labID := range labIDs {
			var ok bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM labs WHERE id = $1 AND subject_id = $2 AND status = 'published')`, labID, subjectID).Scan(&ok); err != nil {
				return wrap(err)
			}
			if !ok {
				return &httpx.ValidationError{Fields: map[string]string{"labIds": "Лаба не относится к этому предмету"}}
			}
			if _, err := tx.Exec(ctx, `INSERT INTO practice_signups (session_id, user_id, lab_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, sessionID, userID, labID); err != nil {
				return wrap(err)
			}
		}
	}
	return wrap(tx.Commit(ctx))
}
