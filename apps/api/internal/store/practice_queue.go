package store

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/queue"
)

// QueuedSignup is a defense in its place in the queue.
type QueuedSignup struct {
	models.SignupRow
	// Missed is how many sessions in a row the defense was left in the reserve.
	Missed int
	Late   bool
}

type carry struct{ missed, place int }

// maxCarryChain bounds how far back the misses are counted.
const maxCarryChain = 20

// reserveOf maps the defenses beyond the capacity of a stored session to their
// 1-based place in its reserve.
func reserveOf(ctx context.Context, q querier, sessionID int64, capacity int) (map[queue.Key]int, error) {
	rows, err := q.Query(ctx, `SELECT user_id, lab_id, row_number() OVER (ORDER BY queue_pos, id) FROM practice_signups WHERE session_id = $1`, sessionID)
	if err != nil {
		return nil, wrap(err)
	}
	defer rows.Close()
	out := map[queue.Key]int{}
	for rows.Next() {
		var k queue.Key
		var pos int
		if err := rows.Scan(&k.UserID, &k.LabID, &pos); err != nil {
			return nil, wrap(err)
		}
		if pos > capacity {
			out[k] = pos - capacity
		}
	}
	return out, wrap(rows.Err())
}

// carriedFrom finds defenses left in the reserve of the subject's previous
// session and counts how many sessions in a row (going back) each was left out.
// Only a stored (frozen or manual) order counts: a session still being
// reshuffled has no reserve yet, and it ends the chain.
func carriedFrom(ctx context.Context, q querier, sess models.PracticeSession) (map[queue.Key]carry, error) {
	type prev struct {
		id       int64
		capacity *int
		stored   bool
	}
	rows, err := q.Query(ctx, `SELECT id, capacity, queue_manual OR queue_frozen_at IS NOT NULL FROM practice_sessions
		WHERE subject_id = $1 AND starts_at < $2 ORDER BY starts_at DESC, id DESC LIMIT $3`, sess.SubjectID, sess.StartsAt, maxCarryChain)
	if err != nil {
		return nil, wrap(err)
	}
	prevs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (prev, error) {
		var p prev
		return p, r.Scan(&p.id, &p.capacity, &p.stored)
	})
	if err != nil {
		return nil, wrap(err)
	}
	out := map[queue.Key]carry{}
	for i, p := range prevs {
		if p.capacity == nil || !p.stored {
			break
		}
		reserve, err := reserveOf(ctx, q, p.id, *p.capacity)
		if err != nil {
			return nil, err
		}
		if i == 0 {
			for k, place := range reserve {
				out[k] = carry{missed: 1, place: place}
			}
			continue
		}
		// Продолжаем цепочку только для тех, кто был в резерве и на этой сдаче.
		alive := false
		for k, c := range out {
			if c.missed != i {
				continue
			}
			if _, ok := reserve[k]; ok {
				c.missed++
				out[k] = c
				alive = true
			}
		}
		if !alive {
			break
		}
	}
	return out, nil
}

// orderSession puts a session's signup rows (given in queue_pos order) into
// hand-in order: a stored order is kept as is, otherwise the rules apply.
func orderSession(ctx context.Context, q querier, sess models.PracticeSession, rows []models.SignupRow, loc *time.Location) ([]QueuedSignup, error) {
	carried, err := carriedFrom(ctx, q, sess)
	if err != nil {
		return nil, err
	}
	freeze := queue.FreezeAt(sess.StartsAt, loc)
	out := make([]QueuedSignup, 0, len(rows))
	for _, r := range rows {
		out = append(out, QueuedSignup{SignupRow: r, Missed: carried[queue.Key{UserID: r.UserID, LabID: r.LabID}].missed, Late: r.CreatedAt.After(freeze)})
	}
	if sess.QueueManual || sess.QueueFrozen {
		return out, nil
	}
	entries := make([]queue.Entry, 0, len(rows))
	byKey := map[queue.Key]QueuedSignup{}
	for _, r := range out {
		k := queue.Key{UserID: r.UserID, LabID: r.LabID}
		byKey[k] = r
		c := carried[k]
		entries = append(entries, queue.Entry{UserID: r.UserID, LabID: r.LabID, Lab: r.LabNumber, Missed: c.missed, ReservePlace: c.place, Late: r.Late, SignedAt: r.CreatedAt})
	}
	ordered := out[:0:0]
	for _, k := range queue.Order(sess.ID, entries) {
		ordered = append(ordered, byKey[k])
	}
	return ordered, nil
}

// Queues returns the queue of every given session.
func (s *Store) Queues(ctx context.Context, sessions []models.PracticeSession, loc *time.Location) (map[int64][]QueuedSignup, error) {
	ids := make([]int64, 0, len(sessions))
	for _, sess := range sessions {
		ids = append(ids, sess.ID)
	}
	rows, err := s.ListSignupsForSessions(ctx, ids)
	if err != nil {
		return nil, err
	}
	bySession := map[int64][]models.SignupRow{}
	for _, r := range rows {
		bySession[r.SessionID] = append(bySession[r.SessionID], r)
	}
	out := map[int64][]QueuedSignup{}
	for _, sess := range sessions {
		q, err := orderSession(ctx, s.db, sess, bySession[sess.ID], loc)
		if err != nil {
			return nil, err
		}
		out[sess.ID] = q
	}
	return out, nil
}

func writeQueue(ctx context.Context, tx pgx.Tx, sessionID int64, keys []queue.Key) error {
	users := make([]int64, len(keys))
	labs := make([]int64, len(keys))
	pos := make([]int64, len(keys))
	for i, k := range keys {
		users[i], labs[i], pos[i] = k.UserID, k.LabID, int64(i+1)
	}
	_, err := tx.Exec(ctx, `UPDATE practice_signups g SET queue_pos = v.pos
		FROM unnest($2::bigint[], $3::bigint[], $4::bigint[]) AS v(uid, lab, pos)
		WHERE g.session_id = $1 AND g.user_id = v.uid AND g.lab_id = v.lab`, sessionID, users, labs, pos)
	return wrap(err)
}

// FreezeQueues stores the order of every session whose freeze time has passed,
// oldest first, so a session's carry-over sees the previous one already frozen.
// Called on every read of the queue: cheap when there is nothing to freeze.
func (s *Store) FreezeQueues(ctx context.Context, loc *time.Location) error {
	due, err := many[models.PracticeSession](ctx, s.db, `SELECT `+practiceCols+practiceFrom+`
		WHERE NOT ps.queue_manual AND ps.queue_frozen_at IS NULL AND ps.starts_at <= now() + interval '2 days'
		ORDER BY ps.starts_at, ps.id`)
	if err != nil {
		return err
	}
	now := time.Now()
	for _, sess := range due {
		if queue.FreezeAt(sess.StartsAt, loc).After(now) {
			continue
		}
		if err := s.freeze(ctx, sess.ID, loc); err != nil {
			return err
		}
		slog.Info("practice queue frozen", "session", sess.ID)
	}
	return nil
}

func (s *Store) freeze(ctx context.Context, sessionID int64, loc *time.Location) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	sess, err := one[models.PracticeSession](ctx, tx, `SELECT `+practiceCols+practiceFrom+` WHERE ps.id = $1 FOR UPDATE OF ps`, sessionID)
	if err != nil {
		return err
	}
	if sess.QueueManual || sess.QueueFrozen {
		return nil
	}
	rows, err := many[models.SignupRow](ctx, tx, `SELECT `+signupCols+signupFrom+` WHERE g.session_id = $1 ORDER BY g.queue_pos, g.id`, sessionID)
	if err != nil {
		return err
	}
	ordered, err := orderSession(ctx, tx, sess, rows, loc)
	if err != nil {
		return err
	}
	keys := make([]queue.Key, len(ordered))
	for i, r := range ordered {
		keys[i] = queue.Key{UserID: r.UserID, LabID: r.LabID}
	}
	if err := writeQueue(ctx, tx, sessionID, keys); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE practice_sessions SET queue_frozen_at = now() WHERE id = $1`, sessionID); err != nil {
		return wrap(err)
	}
	return wrap(tx.Commit(ctx))
}
