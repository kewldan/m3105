package store

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/queue"
)

// Пропуск и обмены работают только по сохранённому порядку (заморожен или
// выставлен админом): до заморозки места считаются на лету и их нечем закрепить.
var errQueueNotStored = &httpx.ValidationError{Fields: map[string]string{"_": "Очередь ещё не зафиксирована: места окончательные с 20:00 накануне"}}

// lockStoredQueue locks the session row and checks its order is stored and
// the session has not ended (a swap accepted from Telegram comes without the
// handler's checks).
func lockStoredQueue(ctx context.Context, tx pgx.Tx, sessionID int64) error {
	var stored, over bool
	if err := tx.QueryRow(ctx, `SELECT queue_manual OR queue_frozen_at IS NOT NULL, coalesce(ends_at, starts_at) < now()
		FROM practice_sessions WHERE id = $1 FOR UPDATE`, sessionID).Scan(&stored, &over); err != nil {
		return wrap(err)
	}
	if over {
		return &httpx.ValidationError{Fields: map[string]string{"_": "Эта сдача уже прошла"}}
	}
	if !stored {
		return errQueueNotStored
	}
	return nil
}

func dropSwapsOf(ctx context.Context, tx pgx.Tx, signupIDs []int64) error {
	_, err := tx.Exec(ctx, `DELETE FROM practice_swaps WHERE from_signup_id = ANY($1) OR to_signup_id = ANY($1)`, signupIDs)
	return wrap(err)
}

// SkipQueue moves all the user's defenses in a stored queue to its end, in the
// order they stood: the same as canceling and signing up again, but the labs
// stay. Pending swaps of these defenses are dropped, their places are gone.
func (s *Store) SkipQueue(ctx context.Context, sessionID, userID int64) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := lockStoredQueue(ctx, tx, sessionID); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT id FROM practice_signups WHERE session_id = $1 AND user_id = $2 ORDER BY queue_pos, id`, sessionID, userID)
	if err != nil {
		return wrap(err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return wrap(err)
	}
	if len(ids) == 0 {
		return &httpx.ValidationError{Fields: map[string]string{"_": "Вы не записаны на эту сдачу"}}
	}
	// По одной строке: порядок nextval внутри одного UPDATE не гарантирован.
	for _, id := range ids {
		if _, err := tx.Exec(ctx, `UPDATE practice_signups SET queue_pos = nextval('practice_queue_seq') WHERE id = $1`, id); err != nil {
			return wrap(err)
		}
	}
	if err := dropSwapsOf(ctx, tx, ids); err != nil {
		return err
	}
	return wrap(tx.Commit(ctx))
}

// ClaimNotReached is «я не успел на прошлой сдаче»: the user's defenses of the
// labs they also brought to the subject's previous session move to the front of
// a stored queue, right after the leading run of carried and earlier claimed
// defenses, and get a mark everybody sees. The rest keep their relative order;
// pending swaps of the moved defenses are dropped, the others follow the new
// places (both sides of such a swap shifted together).
func (s *Store) ClaimNotReached(ctx context.Context, sessionID, userID int64, loc *time.Location) error {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := lockStoredQueue(ctx, tx, sessionID); err != nil {
		return err
	}
	sess, err := one[models.PracticeSession](ctx, tx, `SELECT `+practiceCols+practiceFrom+` WHERE ps.id = $1`, sessionID)
	if err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT g.lab_id FROM practice_signups g WHERE g.user_id = $3 AND g.session_id = (
		SELECT id FROM practice_sessions WHERE subject_id = $1 AND starts_at < $2 ORDER BY starts_at DESC, id DESC LIMIT 1)`,
		sess.SubjectID, sess.StartsAt, userID)
	if err != nil {
		return wrap(err)
	}
	prevLabs, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return wrap(err)
	}
	signups, err := many[models.SignupRow](ctx, tx, `SELECT `+signupCols+signupFrom+` WHERE g.session_id = $1 ORDER BY g.queue_pos, g.id`, sessionID)
	if err != nil {
		return err
	}
	ordered, err := orderSession(ctx, tx, sess, signups, loc)
	if err != nil {
		return err
	}

	var front, mine, rest []queue.Key
	signedUp, leading := false, true
	for _, r := range ordered {
		k := queue.Key{UserID: r.UserID, LabID: r.LabID}
		switch {
		case r.UserID == userID && slices.Contains(prevLabs, r.LabID):
			mine = append(mine, k)
		case leading && (r.Missed > 0 || r.NotReached):
			front = append(front, k)
		default:
			leading = false
			rest = append(rest, k)
		}
		signedUp = signedUp || r.UserID == userID
	}
	if !signedUp {
		return &httpx.ValidationError{Fields: map[string]string{"_": "Вы не записаны на эту сдачу"}}
	}
	if len(mine) == 0 {
		return &httpx.ValidationError{Fields: map[string]string{"_": "На прошлую сдачу вы не записывались с этими лабами"}}
	}

	// Устаревшие обмены всё равно не провести, а остальным подтянем новые места.
	if _, err := tx.Exec(ctx, `DELETE FROM practice_swaps w USING practice_signups f, practice_signups t
		WHERE w.session_id = $1 AND f.id = w.from_signup_id AND t.id = w.to_signup_id
		AND (w.from_pos <> f.queue_pos OR w.to_pos <> t.queue_pos)`, sessionID); err != nil {
		return wrap(err)
	}
	if err := writeQueue(ctx, tx, sessionID, slices.Concat(front, mine, rest)); err != nil {
		return err
	}
	labIDs := make([]int64, len(mine))
	for i, k := range mine {
		labIDs[i] = k.LabID
	}
	rows, err = tx.Query(ctx, `UPDATE practice_signups SET not_reached_at = coalesce(not_reached_at, now())
		WHERE session_id = $1 AND user_id = $2 AND lab_id = ANY($3) RETURNING id`, sessionID, userID, labIDs)
	if err != nil {
		return wrap(err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return wrap(err)
	}
	if err := dropSwapsOf(ctx, tx, ids); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE practice_swaps w SET from_pos = f.queue_pos, to_pos = t.queue_pos
		FROM practice_signups f, practice_signups t
		WHERE w.session_id = $1 AND f.id = w.from_signup_id AND t.id = w.to_signup_id`, sessionID); err != nil {
		return wrap(err)
	}
	return wrap(tx.Commit(ctx))
}

const swapCols = `w.id, w.session_id, f.user_id AS from_user_id, f.lab_id AS from_lab_id, t.user_id AS to_user_id, t.lab_id AS to_lab_id, w.created_at`

const swapFrom = ` FROM practice_swaps w JOIN practice_signups f ON f.id = w.from_signup_id JOIN practice_signups t ON t.id = w.to_signup_id`

// ListSwaps returns the pending swaps of the given sessions that the user sent or got.
func (s *Store) ListSwaps(ctx context.Context, sessionIDs []int64, userID int64) (map[int64][]models.PracticeSwap, error) {
	out := map[int64][]models.PracticeSwap{}
	if len(sessionIDs) == 0 {
		return out, nil
	}
	type row struct {
		models.PracticeSwap
		SessionID int64 `db:"session_id"`
	}
	rows, err := many[row](ctx, s.db, `SELECT `+swapCols+swapFrom+`
		WHERE w.session_id = ANY($1) AND (f.user_id = $2 OR t.user_id = $2) ORDER BY w.created_at, w.id`, sessionIDs, userID)
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		r.Incoming = r.ToUserID == userID
		out[r.SessionID] = append(out[r.SessionID], r.PracticeSwap)
	}
	return out, nil
}

// RequestSwap offers the user's defense in exchange for another student's one
// and returns the request id. Asking again for the same pair refreshes the request.
func (s *Store) RequestSwap(ctx context.Context, sessionID, userID int64, in models.SwapInput) (int64, error) {
	if in.WithUserID == userID {
		return 0, &httpx.ValidationError{Fields: map[string]string{"withLabId": "Нельзя меняться с самим собой"}}
	}
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return 0, wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := lockStoredQueue(ctx, tx, sessionID); err != nil {
		return 0, err
	}
	find := func(uid, labID int64, field, msg string) (id, pos int64, err error) {
		err = tx.QueryRow(ctx, `SELECT id, queue_pos FROM practice_signups WHERE session_id = $1 AND user_id = $2 AND lab_id = $3`, sessionID, uid, labID).Scan(&id, &pos)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, 0, &httpx.ValidationError{Fields: map[string]string{field: msg}}
		}
		return id, pos, wrap(err)
	}
	fromID, fromPos, err := find(userID, in.LabID, "labId", "Этой защиты нет в очереди")
	if err != nil {
		return 0, err
	}
	toID, toPos, err := find(in.WithUserID, in.WithLabID, "withLabId", "Этой защиты уже нет в очереди")
	if err != nil {
		return 0, err
	}
	var id int64
	if err := tx.QueryRow(ctx, `INSERT INTO practice_swaps (session_id, from_signup_id, to_signup_id, from_pos, to_pos) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (from_signup_id, to_signup_id) DO UPDATE SET from_pos = EXCLUDED.from_pos, to_pos = EXCLUDED.to_pos, created_at = now()
		RETURNING id`,
		sessionID, fromID, toID, fromPos, toPos).Scan(&id); err != nil {
		return 0, wrap(err)
	}
	return id, wrap(tx.Commit(ctx))
}

// SwapResult is what an accepted or canceled swap touched.
type SwapResult struct {
	SessionID  int64
	FromUserID int64
	FromLabID  int64
	ToUserID   int64
	ToLabID    int64
}

// AcceptSwap trades the places of the two defenses if the receiver agrees and
// neither has moved since the request. A stale request is dropped and reported.
// Other requests involving these defenses are dropped too: their places changed.
func (s *Store) AcceptSwap(ctx context.Context, swapID, userID int64) (SwapResult, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return SwapResult{}, wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var res SwapResult
	var fromID, toID, fromPos, toPos, fromNow, toNow int64
	err = tx.QueryRow(ctx, `SELECT w.session_id, f.user_id, f.lab_id, t.user_id, t.lab_id, f.id, t.id, w.from_pos, w.to_pos, f.queue_pos, t.queue_pos`+swapFrom+`
		WHERE w.id = $1 AND t.user_id = $2`, swapID, userID).
		Scan(&res.SessionID, &res.FromUserID, &res.FromLabID, &res.ToUserID, &res.ToLabID, &fromID, &toID, &fromPos, &toPos, &fromNow, &toNow)
	if err != nil {
		return SwapResult{}, wrap(err)
	}
	if err := lockStoredQueue(ctx, tx, res.SessionID); err != nil {
		return SwapResult{}, err
	}
	if fromPos != fromNow || toPos != toNow {
		if _, err := tx.Exec(ctx, `DELETE FROM practice_swaps WHERE id = $1`, swapID); err != nil {
			return SwapResult{}, wrap(err)
		}
		if err := tx.Commit(ctx); err != nil {
			return SwapResult{}, wrap(err)
		}
		return SwapResult{}, &httpx.ValidationError{Fields: map[string]string{"_": "Очередь сдвинулась с момента запроса — обмен отменён, попросите заново"}}
	}
	if _, err := tx.Exec(ctx, `UPDATE practice_signups SET queue_pos = CASE id WHEN $1 THEN $4::bigint ELSE $3::bigint END WHERE id IN ($1, $2)`,
		fromID, toID, fromPos, toPos); err != nil {
		return SwapResult{}, wrap(err)
	}
	if err := dropSwapsOf(ctx, tx, []int64{fromID, toID}); err != nil {
		return SwapResult{}, err
	}
	return res, wrap(tx.Commit(ctx))
}

// DeleteSwap cancels a request the user sent or declines one they got.
func (s *Store) DeleteSwap(ctx context.Context, swapID, userID int64) (SwapResult, error) {
	var res SwapResult
	err := s.db.QueryRow(ctx, `DELETE FROM practice_swaps w USING practice_signups f, practice_signups t
		WHERE w.id = $1 AND f.id = w.from_signup_id AND t.id = w.to_signup_id AND (f.user_id = $2 OR t.user_id = $2)
		RETURNING w.session_id, f.user_id, f.lab_id, t.user_id, t.lab_id`, swapID, userID).
		Scan(&res.SessionID, &res.FromUserID, &res.FromLabID, &res.ToUserID, &res.ToLabID)
	return res, wrap(err)
}
