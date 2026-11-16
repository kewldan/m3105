package store

import (
	"context"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// changeRow is a grade change with the session it is put down to.
type changeRow struct {
	SessionID  int64      `db:"session_id"`
	FullName   string     `db:"full_name"`
	Group      string     `db:"group_name"`
	Part       string     `db:"part"`
	Label      string     `db:"label"`
	Kind       string     `db:"kind"`
	DetectedAt time.Time  `db:"detected_at"`
	PrevSyncAt *time.Time `db:"prev_synced_at"`
}

// statsSession is a session with its subject and signup counts.
type statsSession struct {
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
	TheorySigned     int        `db:"theory_signed"`
}

// changeWindow is how long after a session's start grade changes are still
// put down to it: teachers fill the sheet the same evening or a few days later.
const changeWindow = "7 days"

// PracticeStats sums the grade sheet up per subject: how many defenses and
// theory mins get graded per session and how long one takes. A change goes
// to the latest session of the sheet's subject that started (up to 15 minutes
// later) before it was seen, at most a week before, and is meant for the
// student's group. subjectID 0 is every subject; within keeps the sessions of
// an editor's zone (nil — all).
func (s *Store) PracticeStats(ctx context.Context, subjectID int64, within []string, now time.Time) ([]models.PracticeStatsSubject, error) {
	args := []any{}
	filter := ``
	if subjectID > 0 {
		args = append(args, subjectID)
		filter += ` AND ps.subject_id = $` + itoa(len(args))
	}
	filter += audienceWithin("ps", within, &args)
	changes, err := many[changeRow](ctx, s.db, `SELECT * FROM (
			SELECT (SELECT ps.id FROM practice_sessions ps
					WHERE ps.subject_id = gs.subject_id AND ps.canceled_at IS NULL
						AND ps.starts_at - interval '15 minutes' <= c.detected_at
						AND ps.starts_at > c.detected_at - interval '`+changeWindow+`'
						AND (ps.audience = '{}' OR ps.audience && audience_scope(c.group_name))`+filter+`
					ORDER BY ps.starts_at DESC, ps.id DESC LIMIT 1) AS session_id,
				c.full_name, c.group_name, c.part, c.kind, c.detected_at, c.prev_synced_at,
				COALESCE((SELECT col->>'label' FROM jsonb_array_elements(gs.columns) col WHERE col->>'key' = c.part LIMIT 1), c.part) AS label
			FROM grade_changes c JOIN grade_sources gs ON gs.id = c.source_id) x
		WHERE session_id IS NOT NULL ORDER BY detected_at, full_name`, args...)
	if err != nil {
		return nil, err
	}
	ids := []int64{}
	bySession := map[int64][]changeRow{}
	for _, c := range changes {
		if _, ok := bySession[c.SessionID]; !ok {
			ids = append(ids, c.SessionID)
		}
		bySession[c.SessionID] = append(bySession[c.SessionID], c)
	}
	sessions, err := many[statsSession](ctx, s.db, `SELECT ps.id, ps.subject_id, s.name AS subject_name, s.short_name AS subject_short_name,
			s.color AS subject_color, s.theory_min, ps.starts_at, ps.ends_at, ps.location, ps.capacity, ps.audience,
			(SELECT count(*) FROM practice_signups g WHERE g.session_id = ps.id)::int AS lab_signed,
			(SELECT count(*) FROM practice_theory_signups t WHERE t.session_id = ps.id)::int AS theory_signed
		FROM practice_sessions ps JOIN subjects s ON s.id = ps.subject_id
		WHERE ps.id = ANY($1) ORDER BY s.name, ps.subject_id, ps.starts_at DESC`, ids)
	if err != nil {
		return nil, err
	}
	out := []models.PracticeStatsSubject{}
	for _, r := range sessions {
		if len(out) == 0 || out[len(out)-1].SubjectID != r.SubjectID {
			out = append(out, models.PracticeStatsSubject{
				SubjectID: r.SubjectID, SubjectName: r.SubjectName, SubjectShortName: r.SubjectShortName,
				SubjectColor: r.SubjectColor, TheoryMin: r.TheoryMin, Sessions: []models.PracticeStatsSession{},
			})
		}
		minutes := models.SessionMinutes(r.StartsAt, r.EndsAt)
		sess := models.PracticeStatsSession{
			ID: r.ID, StartsAt: r.StartsAt, EndsAt: r.EndsAt, Location: r.Location, Capacity: r.Capacity, Audience: r.Audience,
			Minutes: minutes, Finished: !r.StartsAt.Add(time.Duration(minutes) * time.Minute).After(now),
			Changes: []models.PracticeChange{},
		}
		graded := map[string]int{}
		seen := map[string][]time.Time{}
		for _, c := range bySession[r.ID] {
			in := models.InSession(r.StartsAt, minutes, c.DetectedAt)
			sess.Changes = append(sess.Changes, models.PracticeChange{
				Name: models.ShortName(c.FullName), Group: c.Group, Part: c.Part, Label: c.Label, Kind: c.Kind,
				DetectedAt: c.DetectedAt, PrevSyncAt: c.PrevSyncAt, InSession: in,
			})
			graded[c.Kind]++
			if in {
				seen[c.Kind] = append(seen[c.Kind], c.DetectedAt)
			}
		}
		sess.Labs = models.NewThroughput(r.StartsAt, r.LabSigned, graded[models.ChangeLab], seen[models.ChangeLab])
		sess.Theory = models.NewThroughput(r.StartsAt, r.TheorySigned, graded[models.ChangeTheory], seen[models.ChangeTheory])
		subj := &out[len(out)-1]
		subj.Sessions = append(subj.Sessions, sess)
	}
	for i := range out {
		out[i].Labs = models.SummarizeThroughput(out[i].Sessions, func(s models.PracticeStatsSession) models.Throughput { return s.Labs })
		out[i].Theory = models.SummarizeThroughput(out[i].Sessions, func(s models.PracticeStatsSession) models.Throughput { return s.Theory })
	}
	return out, nil
}
