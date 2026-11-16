package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const resultCols = `r.session_id, r.user_id, ` + userNameExpr + ` AS user_name, u.group_name AS user_group, r.lab_id, l.number AS lab_number,
	r.kind, r.passed, r.graded_at, NULLIF(COALESCE(NULLIF(m.display_name, ''), m.name), '') AS marked_by_name`

const resultFrom = ` FROM practice_results r JOIN users u ON u.id = r.user_id JOIN labs l ON l.id = r.lab_id
	LEFT JOIN users m ON m.id = r.marked_by`

// ListPracticeResults returns the marks of a session in the order they were put.
func (s *Store) ListPracticeResults(ctx context.Context, sessionID int64) ([]models.PracticeResult, error) {
	return many[models.PracticeResult](ctx, s.db, `SELECT `+resultCols+resultFrom+`
		WHERE r.session_id = $1 ORDER BY r.graded_at, l.number`, sessionID)
}

// SetPracticeResult marks a defense or a theory min of a session as passed or
// not (in.Passed), or clears the mark (nil). The student need not be signed
// up: they may have dropped out of the list or come without a signup. A new
// mark replaces the old one with its time. markedBy is the editor; nil is the admin.
func (s *Store) SetPracticeResult(ctx context.Context, sessionID int64, markedBy *int64, in *models.PracticeResultInput) error {
	if in.Passed == nil {
		_, err := s.db.Exec(ctx, `DELETE FROM practice_results WHERE session_id = $1 AND user_id = $2 AND lab_id = $3 AND kind = $4`,
			sessionID, in.UserID, in.LabID, in.Kind)
		return wrap(err)
	}
	return s.inTx(ctx, func(tx pgx.Tx) error {
		var subjectID int64
		var theoryMin bool
		if err := tx.QueryRow(ctx, `SELECT ps.subject_id, s.theory_min FROM practice_sessions ps JOIN subjects s ON s.id = ps.subject_id
			WHERE ps.id = $1`, sessionID).Scan(&subjectID, &theoryMin); err != nil {
			return wrap(err)
		}
		if in.Kind == models.ResultTheory && !theoryMin {
			return &httpx.ValidationError{Fields: map[string]string{"kind": "У этого предмета нет теормина"}}
		}
		var labOK, userOK bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM labs WHERE id = $1 AND subject_id = $2),
			EXISTS(SELECT 1 FROM users WHERE id = $3)`, in.LabID, subjectID, in.UserID).Scan(&labOK, &userOK); err != nil {
			return wrap(err)
		}
		if !labOK {
			return &httpx.ValidationError{Fields: map[string]string{"labId": "Лаба не относится к этому предмету"}}
		}
		if !userOK {
			return &httpx.ValidationError{Fields: map[string]string{"userId": "Студент не найден"}}
		}
		_, err := tx.Exec(ctx, `INSERT INTO practice_results (session_id, user_id, lab_id, kind, passed, graded_at, marked_by)
			VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), $7)
			ON CONFLICT (session_id, user_id, lab_id, kind) DO UPDATE
			SET passed = EXCLUDED.passed, graded_at = EXCLUDED.graded_at, marked_by = EXCLUDED.marked_by`,
			sessionID, in.UserID, in.LabID, in.Kind, *in.Passed, in.At, markedBy)
		return wrap(err)
	})
}

// statsRow is a session with marks, with both kinds counted.
type statsRow struct {
	ID               int64      `db:"id"`
	SubjectID        int64      `db:"subject_id"`
	SubjectName      string     `db:"subject_name"`
	SubjectShortName string     `db:"subject_short_name"`
	SubjectColor     string     `db:"subject_color"`
	TheoryMin        bool       `db:"theory_min"`
	StartsAt         time.Time  `db:"starts_at"`
	EndsAt           *time.Time `db:"ends_at"`
	Location         string     `db:"location"`
	Capacity         *int       `db:"capacity"`
	Audience         []string   `db:"audience"`
	LabSigned        int        `db:"lab_signed"`
	LabLeft          int        `db:"lab_left"`
	LabAttempts      int        `db:"lab_attempts"`
	LabPassed        int        `db:"lab_passed"`
	LabFirst         *time.Time `db:"lab_first"`
	LabLast          *time.Time `db:"lab_last"`
	TheorySigned     int        `db:"theory_signed"`
	TheoryLeft       int        `db:"theory_left"`
	TheoryAttempts   int        `db:"theory_attempts"`
	TheoryPassed     int        `db:"theory_passed"`
	TheoryFirst      *time.Time `db:"theory_first"`
	TheoryLast       *time.Time `db:"theory_last"`
}

// PracticeStats sums up the marks per subject: how many defenses and theory
// mins are taken per session and how long one takes. subjectID 0 is every
// subject; within keeps the sessions of an editor's zone (nil — all).
func (s *Store) PracticeStats(ctx context.Context, subjectID int64, within []string, now time.Time) ([]models.PracticeStatsSubject, error) {
	args := []any{}
	q := `WITH agg AS (
			SELECT session_id, kind, count(*) AS attempts, count(*) FILTER (WHERE passed) AS passed,
				min(graded_at) AS first, max(graded_at) AS last
			FROM practice_results GROUP BY session_id, kind)
		SELECT ps.id, ps.subject_id, s.name AS subject_name, s.short_name AS subject_short_name, s.color AS subject_color,
			s.theory_min, ps.starts_at, ps.ends_at, ps.location, ps.capacity, ps.audience,
			(SELECT count(*) FROM practice_signups g WHERE g.session_id = ps.id)::int AS lab_signed,
			(SELECT count(*) FROM practice_signups g WHERE g.session_id = ps.id AND NOT EXISTS (
				SELECT 1 FROM practice_results x WHERE x.session_id = g.session_id AND x.user_id = g.user_id
					AND x.lab_id = g.lab_id AND x.kind = 'lab'))::int AS lab_left,
			COALESCE(al.attempts, 0)::int AS lab_attempts, COALESCE(al.passed, 0)::int AS lab_passed,
			al.first AS lab_first, al.last AS lab_last,
			(SELECT count(*) FROM practice_theory_signups t WHERE t.session_id = ps.id)::int AS theory_signed,
			(SELECT count(*) FROM practice_theory_signups t WHERE t.session_id = ps.id AND NOT EXISTS (
				SELECT 1 FROM practice_results x WHERE x.session_id = t.session_id AND x.user_id = t.user_id
					AND x.lab_id = t.lab_id AND x.kind = 'theory'))::int AS theory_left,
			COALESCE(at.attempts, 0)::int AS theory_attempts, COALESCE(at.passed, 0)::int AS theory_passed,
			at.first AS theory_first, at.last AS theory_last
		FROM practice_sessions ps JOIN subjects s ON s.id = ps.subject_id
		LEFT JOIN agg al ON al.session_id = ps.id AND al.kind = 'lab'
		LEFT JOIN agg at ON at.session_id = ps.id AND at.kind = 'theory'
		WHERE (al.session_id IS NOT NULL OR at.session_id IS NOT NULL)`
	if subjectID > 0 {
		args = append(args, subjectID)
		q += ` AND ps.subject_id = $` + itoa(len(args))
	}
	q += audienceWithin("ps", within, &args)
	q += ` ORDER BY s.name, ps.subject_id, ps.starts_at DESC`
	rows, err := many[statsRow](ctx, s.db, q, args...)
	if err != nil {
		return nil, err
	}
	out := []models.PracticeStatsSubject{}
	for _, r := range rows {
		if len(out) == 0 || out[len(out)-1].SubjectID != r.SubjectID {
			out = append(out, models.PracticeStatsSubject{
				SubjectID: r.SubjectID, SubjectName: r.SubjectName, SubjectShortName: r.SubjectShortName,
				SubjectColor: r.SubjectColor, TheoryMin: r.TheoryMin, Sessions: []models.PracticeStatsSession{},
			})
		}
		sess := models.PracticeStatsSession{
			ID: r.ID, StartsAt: r.StartsAt, EndsAt: r.EndsAt, Location: r.Location, Capacity: r.Capacity, Audience: r.Audience,
			Minutes: models.SessionMinutes(r.StartsAt, r.EndsAt),
		}
		sess.Finished = !sess.StartsAt.Add(time.Duration(sess.Minutes) * time.Minute).After(now)
		sess.Labs = models.NewThroughput(r.StartsAt, sess.Minutes, r.LabSigned, r.LabLeft, r.LabAttempts, r.LabPassed, r.LabFirst, r.LabLast)
		sess.Theory = models.NewThroughput(r.StartsAt, sess.Minutes, r.TheorySigned, r.TheoryLeft, r.TheoryAttempts, r.TheoryPassed, r.TheoryFirst, r.TheoryLast)
		subj := &out[len(out)-1]
		subj.Sessions = append(subj.Sessions, sess)
	}
	for i := range out {
		out[i].Labs = models.SummarizeThroughput(out[i].Sessions, func(s models.PracticeStatsSession) models.Throughput { return s.Labs })
		out[i].Theory = models.SummarizeThroughput(out[i].Sessions, func(s models.PracticeStatsSession) models.Throughput { return s.Theory })
	}
	return out, nil
}
