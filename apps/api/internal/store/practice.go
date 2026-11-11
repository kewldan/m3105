package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/queue"
)

const practiceCols = `ps.id, ps.subject_id, ps.starts_at, ps.ends_at, ps.location, ps.capacity, ps.note, ps.created_at, ps.updated_at, ps.audience,
	s.slug AS subject_slug, s.name AS subject_name, s.short_name AS subject_short_name, s.color AS subject_color, s.icon AS subject_icon,
	(SELECT count(DISTINCT g.user_id) FROM practice_signups g WHERE g.session_id = ps.id)::int AS signups_count,
	s.theory_min AS subject_theory_min,
	(SELECT count(*) FROM practice_theory_signups t WHERE t.session_id = ps.id)::int AS theory_count,
	ps.queue_manual, (ps.queue_frozen_at IS NOT NULL) AS queue_frozen,
	ps.rule_id, ps.occurs_on, ps.overridden, (ps.canceled_at IS NOT NULL) AS canceled, ps.cancel_reason`

const practiceFrom = ` FROM practice_sessions ps JOIN subjects s ON s.id = ps.subject_id`

// PracticeFilter narrows session listings.
type PracticeFilter struct {
	SubjectSlug string
	From        *time.Time
	To          *time.Time
	// For is the viewer's group (see LabFilter.For).
	For string
	// Within keeps sessions addressed only to an editor's zone.
	Within []string
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
	q += audienceIn("ps", f.For, &args)
	q += audienceWithin("ps", f.Within, &args)
	q += ` ORDER BY ps.starts_at`
	return many[models.PracticeSession](ctx, s.db, q, args...)
}

// GetPracticeSession fetches one session.
func (s *Store) GetPracticeSession(ctx context.Context, id int64) (models.PracticeSession, error) {
	return one[models.PracticeSession](ctx, s.db, `SELECT `+practiceCols+practiceFrom+` WHERE ps.id = $1`, id)
}

// CreatePracticeSession inserts a session.
func (s *Store) CreatePracticeSession(ctx context.Context, in *models.PracticeSessionInput) (models.PracticeSession, error) {
	canceled := in.Canceled != nil && *in.Canceled
	reason := ""
	if canceled {
		reason = in.CancelReason
	}
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO practice_sessions (subject_id, starts_at, ends_at, location, capacity, note, audience, canceled_at, cancel_reason)
		VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN now() END,$9) RETURNING id`,
		in.SubjectID, in.StartsAt, in.EndsAt, in.Location, in.Capacity, in.Note, nonNil(in.Audience), canceled, reason).Scan(&id)
	if err != nil {
		return models.PracticeSession{}, wrap(err)
	}
	return s.GetPracticeSession(ctx, id)
}

// UpdatePracticeSession replaces a session's fields. A session of a rule that
// changes becomes overridden: later edits of the rule leave it alone.
// in.Canceled cancels or restores it; nil keeps it as it is.
func (s *Store) UpdatePracticeSession(ctx context.Context, id int64, in *models.PracticeSessionInput) (models.PracticeSession, error) {
	if err := s.exec(ctx, `UPDATE practice_sessions SET
		overridden = overridden OR (rule_id IS NOT NULL AND
			(subject_id, starts_at, ends_at, location, capacity, note) IS DISTINCT FROM ($1::bigint, $2::timestamptz, $3::timestamptz, $4::text, $5::int, $6::text)),
		subject_id=$1, starts_at=$2, ends_at=$3, location=$4, capacity=$5, note=$6, audience=$7,
		canceled_at = CASE WHEN $8::boolean IS NULL THEN canceled_at WHEN $8 THEN COALESCE(canceled_at, now()) END,
		cancel_reason = CASE WHEN $8::boolean IS NULL THEN cancel_reason WHEN $8 THEN $9 ELSE '' END,
		updated_at=now() WHERE id = $10`,
		in.SubjectID, in.StartsAt, in.EndsAt, in.Location, in.Capacity, in.Note, nonNil(in.Audience), in.Canceled, in.CancelReason, id); err != nil {
		return models.PracticeSession{}, err
	}
	return s.GetPracticeSession(ctx, id)
}

// DeletePracticeSession removes a session and its signups.
func (s *Store) DeletePracticeSession(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM practice_sessions WHERE id = $1`, id)
}

func nonNil(a []string) []string {
	if a == nil {
		return []string{}
	}
	return a
}

const signupCols = `g.session_id, g.user_id, ` + userNameExpr + ` AS user_name, ` + userPhotoExpr + ` AS photo_url, u.group_name AS user_group, g.lab_id, l.number AS lab_number, l.title AS lab_title,
	l.slug AS lab_slug, s.slug AS subject_slug, g.created_at, g.not_reached_at IS NOT NULL AS not_reached, false AS theory`

const signupFrom = ` FROM practice_signups g JOIN users u ON u.id = g.user_id JOIN labs l ON l.id = g.lab_id JOIN subjects s ON s.id = l.subject_id`

// theoryCols and theoryFrom read theory-min signups as SignupRow (Theory set).
const theoryCols = `g.session_id, g.user_id, ` + userNameExpr + ` AS user_name, ` + userPhotoExpr + ` AS photo_url, u.group_name AS user_group, g.lab_id, l.number AS lab_number, l.title AS lab_title,
	l.slug AS lab_slug, s.slug AS subject_slug, g.created_at, false AS not_reached, true AS theory`

const theoryFrom = ` FROM practice_theory_signups g JOIN users u ON u.id = g.user_id JOIN labs l ON l.id = g.lab_id JOIN subjects s ON s.id = l.subject_id`

// ListSignupsForSessions returns signup rows for the given sessions.
func (s *Store) ListSignupsForSessions(ctx context.Context, sessionIDs []int64) ([]models.SignupRow, error) {
	if len(sessionIDs) == 0 {
		return []models.SignupRow{}, nil
	}
	return many[models.SignupRow](ctx, s.db, `SELECT `+signupCols+signupFrom+` WHERE g.session_id = ANY($1) ORDER BY g.queue_pos, g.id`, sessionIDs)
}

// ListTheorySignups returns theory-min signups of the given sessions: by
// session, then in the order students signed up, then by lab number.
func (s *Store) ListTheorySignups(ctx context.Context, sessionIDs []int64) ([]models.SignupRow, error) {
	if len(sessionIDs) == 0 {
		return []models.SignupRow{}, nil
	}
	return many[models.SignupRow](ctx, s.db, `SELECT `+theoryCols+theoryFrom+`
		WHERE g.session_id = ANY($1)
		ORDER BY g.session_id, min(g.created_at) OVER (PARTITION BY g.session_id, g.user_id), g.user_id, l.number`, sessionIDs)
}

// ListUserSignups returns everything a user signed up for, defenses and
// theory mins (Theory) alike.
func (s *Store) ListUserSignups(ctx context.Context, userID int64) ([]models.SignupRow, error) {
	return many[models.SignupRow](ctx, s.db, `SELECT * FROM (SELECT `+signupCols+signupFrom+` WHERE g.user_id = $1
		UNION ALL SELECT `+theoryCols+theoryFrom+` WHERE g.user_id = $1) x ORDER BY created_at, lab_number`, userID)
}

// ListSubjectLabRefs returns published labs of a subject for signup pickers.
func (s *Store) ListSubjectLabRefs(ctx context.Context, subjectID int64) ([]models.LabRef, error) {
	return many[models.LabRef](ctx, s.db, `SELECT l.id, l.number, l.title, l.slug, s.slug AS subject_slug FROM labs l JOIN subjects s ON s.id = l.subject_id
		WHERE l.subject_id = $1 AND l.status = 'published' ORDER BY l.number, l.title`, subjectID)
}

// ReplaceSignups sets the user's labs for a session (empty list removes the signup).
// Labs the student keeps keep their place; new ones get the next queue number,
// which puts them at the end of a frozen or manual queue. There is no seat limit:
// defenses beyond the capacity form the reserve.
//
// theoryLabIDs are the labs whose theory min the student comes to; they are
// outside the queue and need the subject's theoryMin. nil keeps them as they are.
func (s *Store) ReplaceSignups(ctx context.Context, sessionID, userID int64, labIDs, theoryLabIDs []int64) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var subjectID int64
	var theoryMin bool
	if err := tx.QueryRow(ctx, `SELECT ps.subject_id, s.theory_min FROM practice_sessions ps JOIN subjects s ON s.id = ps.subject_id
		WHERE ps.id = $1 FOR UPDATE OF ps`, sessionID).Scan(&subjectID, &theoryMin); err != nil {
		return wrap(err)
	}
	if len(theoryLabIDs) > 0 && !theoryMin {
		return &httpx.ValidationError{Fields: map[string]string{"theoryLabIds": "У этого предмета нет теормина"}}
	}
	for field, ids := range map[string][]int64{"labIds": labIDs, "theoryLabIds": theoryLabIDs} {
		for _, labID := range ids {
			var ok bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM labs WHERE id = $1 AND subject_id = $2 AND status = 'published')`, labID, subjectID).Scan(&ok); err != nil {
				return wrap(err)
			}
			if !ok {
				return &httpx.ValidationError{Fields: map[string]string{field: "Лаба не относится к этому предмету"}}
			}
		}
	}
	if labIDs == nil {
		labIDs = []int64{}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM practice_signups WHERE session_id = $1 AND user_id = $2 AND NOT (lab_id = ANY($3))`, sessionID, userID, labIDs); err != nil {
		return wrap(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO practice_signups (session_id, user_id, lab_id)
		SELECT $1, $2, unnest($3::bigint[]) ON CONFLICT DO NOTHING`, sessionID, userID, labIDs); err != nil {
		return wrap(err)
	}
	if theoryLabIDs != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM practice_theory_signups WHERE session_id = $1 AND user_id = $2 AND NOT (lab_id = ANY($3))`, sessionID, userID, theoryLabIDs); err != nil {
			return wrap(err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO practice_theory_signups (session_id, user_id, lab_id)
			SELECT $1, $2, unnest($3::bigint[]) ON CONFLICT DO NOTHING`, sessionID, userID, theoryLabIDs); err != nil {
			return wrap(err)
		}
	}
	return wrap(tx.Commit(ctx))
}

// ReorderSignups sets the queue order of a session by hand. keys must be exactly
// the defenses currently in the queue. The queue becomes manual: later signups
// go to the end.
func (s *Store) ReorderSignups(ctx context.Context, sessionID int64, keys []queue.Key) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SELECT 1 FROM practice_sessions WHERE id = $1 FOR UPDATE`, sessionID); err != nil {
		return wrap(err)
	}
	rows, err := tx.Query(ctx, `SELECT user_id, lab_id FROM practice_signups WHERE session_id = $1`, sessionID)
	if err != nil {
		return wrap(err)
	}
	current, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (queue.Key, error) {
		var k queue.Key
		return k, r.Scan(&k.UserID, &k.LabID)
	})
	if err != nil {
		return wrap(err)
	}
	stale := &httpx.ValidationError{Fields: map[string]string{"entries": "Список устарел, обновите очередь"}}
	have := map[queue.Key]bool{}
	for _, k := range current {
		have[k] = true
	}
	seen := map[queue.Key]bool{}
	for _, k := range keys {
		if !have[k] || seen[k] {
			return stale
		}
		seen[k] = true
	}
	if len(keys) != len(current) {
		return stale
	}
	if err := writeQueue(ctx, tx, sessionID, keys); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE practice_sessions SET queue_manual = true WHERE id = $1`, sessionID); err != nil {
		return wrap(err)
	}
	return wrap(tx.Commit(ctx))
}

// AutoQueue drops the admin's manual order: the queue follows the rules again
// (and is frozen anew if its freeze time has passed). «Not reached» marks go
// too: the rules do not know them.
func (s *Store) AutoQueue(ctx context.Context, sessionID int64) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tag, err := tx.Exec(ctx, `UPDATE practice_sessions SET queue_manual = false, queue_frozen_at = NULL WHERE id = $1`, sessionID)
	if err != nil {
		return wrap(err)
	}
	if tag.RowsAffected() == 0 {
		return httpx.ErrNotFound
	}
	if _, err := tx.Exec(ctx, `UPDATE practice_signups SET not_reached_at = NULL WHERE session_id = $1`, sessionID); err != nil {
		return wrap(err)
	}
	return wrap(tx.Commit(ctx))
}
