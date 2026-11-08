package store

import (
	"context"
	"slices"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/schedule"
)

const ruleCols = `r.id, r.subject_id, r.weekday, to_char(r.start_time, 'HH24:MI') AS start_time,
	COALESCE(to_char(r.end_time, 'HH24:MI'), '') AS end_time, r.weeks, r.starts_on, r.ends_on,
	r.location, r.capacity, r.note, r.audience, r.created_at, r.updated_at,
	s.slug AS subject_slug, s.name AS subject_name, s.short_name AS subject_short_name, s.color AS subject_color, s.icon AS subject_icon,
	(SELECT count(*) FROM practice_sessions x WHERE x.rule_id = r.id)::int AS sessions_count,
	(SELECT count(*) FROM practice_sessions x WHERE x.rule_id = r.id AND x.starts_at > now() AND x.canceled_at IS NULL)::int AS upcoming_count,
	(SELECT count(*) FROM practice_sessions x WHERE x.rule_id = r.id AND x.canceled_at IS NOT NULL)::int AS canceled_count,
	ARRAY(SELECT x.starts_at FROM practice_sessions x WHERE x.rule_id = r.id AND x.starts_at > now() AND x.canceled_at IS NULL
		ORDER BY x.starts_at LIMIT 3) AS next`

const ruleFrom = ` FROM practice_rules r JOIN subjects s ON s.id = r.subject_id`

// ListPracticeRules returns the rules; a non-nil zone keeps those addressed
// only to it (see audienceWithin).
func (s *Store) ListPracticeRules(ctx context.Context, zone []string) ([]models.PracticeRule, error) {
	args := []any{}
	q := `SELECT ` + ruleCols + ruleFrom + ` WHERE 1=1` + audienceWithin("r", zone, &args) + ` ORDER BY s.name, r.weekday, r.start_time, r.id`
	return many[models.PracticeRule](ctx, s.db, q, args...)
}

// GetPracticeRule fetches one rule.
func (s *Store) GetPracticeRule(ctx context.Context, id int64) (models.PracticeRule, error) {
	return one[models.PracticeRule](ctx, s.db, `SELECT `+ruleCols+ruleFrom+` WHERE r.id = $1`, id)
}

// RuleSave is a rule with the slots it expands to and the moment that splits
// the past (never touched) from the future.
type RuleSave struct {
	In    *models.PracticeRuleInput
	Slots []schedule.Slot
	Now   time.Time
	Loc   *time.Location
}

// planSession is a session the plan looks at.
type planSession struct {
	ID         int64
	RuleID     *int64
	OccursOn   *time.Time
	LocalDay   time.Time
	SubjectID  int64
	StartsAt   time.Time
	EndsAt     *time.Time
	Location   string
	Capacity   *int
	Note       string
	Audience   []string
	Overridden bool
	Canceled   bool
	Signups    int
}

type planStep struct {
	models.PracticeRulePlanItem
	slot *schedule.Slot
	// overridden is what an adopted session gets.
	overridden bool
}

func sameTime(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Equal(*b)
}

func sameInt(a, b *int) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func sameSet(a, b []string) bool {
	x, y := slices.Clone(a), slices.Clone(b)
	slices.Sort(x)
	slices.Sort(y)
	return slices.Equal(slices.Compact(x), slices.Compact(y))
}

// matches: the session already has what the slot and the rule ask for.
func (p planSession) matches(in *models.PracticeRuleInput, sl schedule.Slot, withAudience bool) bool {
	return p.StartsAt.Equal(sl.StartsAt) && sameTime(p.EndsAt, sl.EndsAt) && p.Location == in.Location &&
		sameInt(p.Capacity, in.Capacity) && p.Note == in.Note &&
		(!withAudience || (p.SubjectID == in.SubjectID && sameSet(p.Audience, in.Audience)))
}

const planCols = `ps.id, ps.rule_id, ps.occurs_on, (ps.starts_at AT TIME ZONE $1)::date AS local_day, ps.subject_id, ps.starts_at,
	ps.ends_at, ps.location, ps.capacity, ps.note, ps.audience, ps.overridden, ps.canceled_at IS NOT NULL AS canceled,
	(SELECT count(*) FROM practice_signups g WHERE g.session_id = ps.id)::int AS signups`

func scanPlan(rows pgx.Rows) ([]planSession, error) {
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (planSession, error) {
		var p planSession
		return p, r.Scan(&p.ID, &p.RuleID, &p.OccursOn, &p.LocalDay, &p.SubjectID, &p.StartsAt, &p.EndsAt, &p.Location,
			&p.Capacity, &p.Note, &p.Audience, &p.Overridden, &p.Canceled, &p.Signups)
	})
}

// planRule works out what saving the rule does to each date: its own sessions
// follow it, one-off sessions of the subject for the same audience on its dates
// join it, the missing dates get new sessions. The past is never changed
// (though a past one-off still joins the rule, as history).
func planRule(ctx context.Context, q querier, ruleID *int64, rs RuleSave) ([]planStep, error) {
	in := rs.In
	tz := rs.Loc.String()
	own := map[string]planSession{}
	var ownList []planSession
	if ruleID != nil {
		rows, err := q.Query(ctx, `SELECT `+planCols+` FROM practice_sessions ps WHERE ps.rule_id = $2 ORDER BY ps.starts_at`, tz, *ruleID)
		if err != nil {
			return nil, wrap(err)
		}
		if ownList, err = scanPlan(rows); err != nil {
			return nil, wrap(err)
		}
		for _, p := range ownList {
			if p.OccursOn != nil {
				own[p.OccursOn.Format(time.DateOnly)] = p
			}
		}
	}
	days := make([]time.Time, len(rs.Slots))
	for i, sl := range rs.Slots {
		days[i] = sl.Day
	}
	loose := map[string]planSession{}
	rows, err := q.Query(ctx, `SELECT `+planCols+` FROM practice_sessions ps
		WHERE ps.rule_id IS NULL AND ps.subject_id = $2 AND ps.audience @> $3 AND ps.audience <@ $3
			AND (ps.starts_at AT TIME ZONE $1)::date = ANY($4::date[])
		ORDER BY ps.starts_at, ps.id`, tz, in.SubjectID, nonNil(in.Audience), days)
	if err != nil {
		return nil, wrap(err)
	}
	looseList, err := scanPlan(rows)
	if err != nil {
		return nil, wrap(err)
	}
	for _, p := range looseList {
		k := p.LocalDay.Format(time.DateOnly)
		if _, ok := loose[k]; !ok {
			loose[k] = p
		}
	}

	var out []planStep
	inRule := map[string]bool{}
	for i := range rs.Slots {
		sl := rs.Slots[i]
		k := sl.Key()
		inRule[k] = true
		st := planStep{PracticeRulePlanItem: models.PracticeRulePlanItem{Day: k, StartsAt: sl.StartsAt, EndsAt: sl.EndsAt}, slot: &rs.Slots[i]}
		past := !sl.StartsAt.After(rs.Now)
		if p, ok := own[k]; ok {
			st.SessionID, st.Signups, st.StartsAt, st.EndsAt = &p.ID, p.Signups, p.StartsAt, p.EndsAt
			switch {
			case past || !p.StartsAt.After(rs.Now):
				st.Action = models.PlanPast
			case p.Canceled:
				st.Action = models.PlanCanceled
			case p.Overridden:
				st.Action = models.PlanManual
			case p.matches(in, sl, true):
				st.Action = models.PlanKeep
			default:
				st.Action = models.PlanUpdate
				st.StartsAt, st.EndsAt = sl.StartsAt, sl.EndsAt
			}
			out = append(out, st)
			continue
		}
		if p, ok := loose[k]; ok {
			st.SessionID, st.Signups, st.StartsAt, st.EndsAt = &p.ID, p.Signups, p.StartsAt, p.EndsAt
			st.Action = models.PlanAdopt
			st.overridden = !p.matches(in, sl, false)
			st.Differs = st.overridden
			out = append(out, st)
			continue
		}
		if past {
			continue
		}
		st.Action = models.PlanCreate
		out = append(out, st)
	}
	for _, p := range ownList {
		if p.OccursOn == nil || inRule[p.OccursOn.Format(time.DateOnly)] || !p.StartsAt.After(rs.Now) {
			continue
		}
		st := planStep{PracticeRulePlanItem: models.PracticeRulePlanItem{
			Day: p.OccursOn.Format(time.DateOnly), StartsAt: p.StartsAt, EndsAt: p.EndsAt, SessionID: &p.ID, Signups: p.Signups,
		}}
		switch {
		case p.Signups == 0:
			st.Action = models.PlanDelete
		case p.Overridden:
			st.Action = models.PlanDetach
		case p.Canceled:
			st.Action = models.PlanCanceled
		default:
			st.Action = models.PlanCancel
		}
		out = append(out, st)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Day < out[j].Day })
	return out, nil
}

// PreviewPracticeRule says what saving the rule would do; ruleID is nil for a new one.
func (s *Store) PreviewPracticeRule(ctx context.Context, ruleID *int64, rs RuleSave) ([]models.PracticeRulePlanItem, error) {
	steps, err := planRule(ctx, s.db, ruleID, rs)
	if err != nil {
		return nil, err
	}
	out := make([]models.PracticeRulePlanItem, len(steps))
	for i, st := range steps {
		out[i] = st.PracticeRulePlanItem
	}
	return out, nil
}

// RemovedFromRule is the reason of a session canceled by an edit of its rule.
const RemovedFromRule = "Занятие убрано из расписания"

func applyPlan(ctx context.Context, tx pgx.Tx, ruleID int64, rs RuleSave, steps []planStep) (canceled []int64, err error) {
	in := rs.In
	for _, st := range steps {
		switch st.Action {
		case models.PlanCreate:
			_, err = tx.Exec(ctx, `INSERT INTO practice_sessions (subject_id, starts_at, ends_at, location, capacity, note, audience, rule_id, occurs_on)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
				in.SubjectID, st.slot.StartsAt, st.slot.EndsAt, in.Location, in.Capacity, in.Note, nonNil(in.Audience), ruleID, st.slot.Day)
		case models.PlanUpdate:
			_, err = tx.Exec(ctx, `UPDATE practice_sessions SET subject_id=$2, starts_at=$3, ends_at=$4, location=$5, capacity=$6, note=$7,
				audience=$8, updated_at=now() WHERE id = $1`,
				*st.SessionID, in.SubjectID, st.slot.StartsAt, st.slot.EndsAt, in.Location, in.Capacity, in.Note, nonNil(in.Audience))
		case models.PlanAdopt:
			_, err = tx.Exec(ctx, `UPDATE practice_sessions SET rule_id=$2, occurs_on=$3, overridden=$4 WHERE id = $1`,
				*st.SessionID, ruleID, st.slot.Day, st.overridden)
		case models.PlanDelete:
			_, err = tx.Exec(ctx, `DELETE FROM practice_sessions WHERE id = $1`, *st.SessionID)
		case models.PlanDetach:
			_, err = tx.Exec(ctx, `UPDATE practice_sessions SET rule_id = NULL, occurs_on = NULL WHERE id = $1`, *st.SessionID)
		case models.PlanCancel:
			if err = cancelIn(ctx, tx, *st.SessionID, RemovedFromRule); err == nil {
				canceled = append(canceled, *st.SessionID)
			}
		}
		if err != nil {
			return nil, wrap(err)
		}
	}
	return canceled, nil
}

func cancelIn(ctx context.Context, tx pgx.Tx, id int64, reason string) error {
	if _, err := tx.Exec(ctx, `UPDATE practice_sessions SET canceled_at = COALESCE(canceled_at, now()), cancel_reason = $2,
		updated_at = now() WHERE id = $1`, id, reason); err != nil {
		return wrap(err)
	}
	_, err := tx.Exec(ctx, `DELETE FROM practice_swaps WHERE session_id = $1`, id)
	return wrap(err)
}

func writeRule(ctx context.Context, tx pgx.Tx, id *int64, in *models.PracticeRuleInput) (int64, error) {
	end := &in.EndTime
	if in.EndTime == "" {
		end = nil
	}
	args := []any{in.SubjectID, in.Weekday, in.StartTime, end, in.Weeks, in.StartsOn, in.EndsOn, in.Location, in.Capacity, in.Note, nonNil(in.Audience)}
	if id == nil {
		var newID int64
		err := tx.QueryRow(ctx, `INSERT INTO practice_rules (subject_id, weekday, start_time, end_time, weeks, starts_on, ends_on, location, capacity, note, audience)
			VALUES ($1,$2,$3::time,$4::time,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, args...).Scan(&newID)
		return newID, wrap(err)
	}
	tag, err := tx.Exec(ctx, `UPDATE practice_rules SET subject_id=$1, weekday=$2, start_time=$3::time, end_time=$4::time, weeks=$5,
		starts_on=$6, ends_on=$7, location=$8, capacity=$9, note=$10, audience=$11, updated_at=now() WHERE id = $12`, append(args, *id)...)
	if err != nil {
		return 0, wrap(err)
	}
	if tag.RowsAffected() == 0 {
		return 0, httpx.ErrNotFound
	}
	return *id, nil
}

// SavePracticeRule creates (id nil) or updates a rule and brings its sessions
// in line with it. It returns the sessions it canceled because they had
// signups, so that the students get a message.
func (s *Store) SavePracticeRule(ctx context.Context, id *int64, rs RuleSave) (models.PracticeRule, []int64, error) {
	var canceled []int64
	var ruleID int64
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		var err error
		if ruleID, err = writeRule(ctx, tx, id, rs.In); err != nil {
			return err
		}
		steps, err := planRule(ctx, tx, &ruleID, rs)
		if err != nil {
			return err
		}
		canceled, err = applyPlan(ctx, tx, ruleID, rs, steps)
		return err
	})
	if err != nil {
		return models.PracticeRule{}, nil, err
	}
	rule, err := s.GetPracticeRule(ctx, ruleID)
	return rule, canceled, err
}

// DeletePracticeRule removes a rule and its future sessions nobody signed up
// for. The rest (the past and those with signups) stay as one-off sessions.
func (s *Store) DeletePracticeRule(ctx context.Context, id int64) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM practice_sessions ps WHERE ps.rule_id = $1 AND ps.starts_at > now()
			AND NOT EXISTS (SELECT 1 FROM practice_signups g WHERE g.session_id = ps.id)`, id); err != nil {
			return wrap(err)
		}
		if _, err := tx.Exec(ctx, `UPDATE practice_sessions SET occurs_on = NULL, overridden = false WHERE rule_id = $1`, id); err != nil {
			return wrap(err)
		}
		tag, err := tx.Exec(ctx, `DELETE FROM practice_rules WHERE id = $1`, id)
		if err != nil {
			return wrap(err)
		}
		if tag.RowsAffected() == 0 {
			return httpx.ErrNotFound
		}
		return nil
	})
}

// NextPracticeSession is the subject's next session after sess for the same
// audience that is not canceled; nil if there is none.
func (s *Store) NextPracticeSession(ctx context.Context, sess models.PracticeSession) (*models.PracticeSession, error) {
	return nextSession(ctx, s.db, sess)
}

func nextSession(ctx context.Context, q querier, sess models.PracticeSession) (*models.PracticeSession, error) {
	list, err := many[models.PracticeSession](ctx, q, `SELECT `+practiceCols+practiceFrom+`
		WHERE ps.subject_id = $1 AND ps.starts_at > $2 AND ps.id <> $3 AND ps.canceled_at IS NULL
			AND ps.audience @> $4 AND ps.audience <@ $4
		ORDER BY ps.starts_at, ps.id LIMIT 1`, sess.SubjectID, sess.StartsAt, sess.ID, nonNil(sess.Audience))
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return &list[0], nil
}

// CancelPracticeSession cancels a session. With move, its signups go to the
// subject's next session for the same audience (keeping when each was made, so
// the rules see them as early signups) and the target is returned.
func (s *Store) CancelPracticeSession(ctx context.Context, id int64, reason string, move bool) (*models.PracticeSession, error) {
	var target *models.PracticeSession
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		sess, err := one[models.PracticeSession](ctx, tx, `SELECT `+practiceCols+practiceFrom+` WHERE ps.id = $1 FOR UPDATE OF ps`, id)
		if err != nil {
			return err
		}
		if err := cancelIn(ctx, tx, id, reason); err != nil {
			return err
		}
		if !move || sess.SignupsCount == 0 {
			return nil
		}
		if target, err = nextSession(ctx, tx, sess); err != nil {
			return err
		}
		if target == nil {
			return &httpx.ValidationError{Fields: map[string]string{"moveSignups": "Нет следующей сдачи для этой аудитории"}}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO practice_signups (session_id, user_id, lab_id, created_at)
			SELECT $2, user_id, lab_id, created_at FROM practice_signups WHERE session_id = $1 ON CONFLICT DO NOTHING`, id, target.ID); err != nil {
			return wrap(err)
		}
		_, err = tx.Exec(ctx, `DELETE FROM practice_signups WHERE session_id = $1`, id)
		return wrap(err)
	})
	return target, err
}

// RestorePracticeSession takes a cancellation back.
func (s *Store) RestorePracticeSession(ctx context.Context, id int64) error {
	return s.exec(ctx, `UPDATE practice_sessions SET canceled_at = NULL, cancel_reason = '', updated_at = now() WHERE id = $1`, id)
}

// ResetPracticeSession puts a session of a rule back to what the rule says.
func (s *Store) ResetPracticeSession(ctx context.Context, id int64, loc *time.Location) error {
	tag, err := s.db.Exec(ctx, `UPDATE practice_sessions ps SET
			starts_at = (ps.occurs_on + r.start_time) AT TIME ZONE $2,
			ends_at = CASE WHEN r.end_time IS NULL THEN NULL ELSE (ps.occurs_on + r.end_time) AT TIME ZONE $2 END,
			subject_id = r.subject_id, location = r.location, capacity = r.capacity, note = r.note, audience = r.audience,
			overridden = false, updated_at = now()
		FROM practice_rules r WHERE r.id = ps.rule_id AND ps.id = $1 AND ps.occurs_on IS NOT NULL`, id, loc.String())
	if err != nil {
		return wrap(err)
	}
	if tag.RowsAffected() == 0 {
		return &httpx.ValidationError{Fields: map[string]string{"_": "Это разовая сдача, у неё нет правила"}}
	}
	return nil
}

// PracticeChats are the Telegram chats of the students signed up for a session.
func (s *Store) PracticeChats(ctx context.Context, sessionID int64) ([]int64, error) {
	rows, err := s.db.Query(ctx, `SELECT DISTINCT u.telegram_id FROM practice_signups g JOIN users u ON u.id = g.user_id
		WHERE g.session_id = $1 AND u.telegram_id IS NOT NULL`, sessionID)
	if err != nil {
		return nil, wrap(err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	return ids, wrap(err)
}
