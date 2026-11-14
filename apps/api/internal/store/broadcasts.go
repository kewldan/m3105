package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// NewBroadcast opens a bot mailing. A non-empty Key makes it reusable: the
// scheduler's later passes (new subscribers, retries after a restart) add
// recipients to the same broadcast.
type NewBroadcast struct {
	Kind    string
	Key     string
	Title   string
	RefType string
	RefID   *int64
}

// OpenBroadcast creates the broadcast or returns the one with the same key.
func (s *Store) OpenBroadcast(ctx context.Context, b NewBroadcast) (int64, error) {
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO broadcasts (kind, key, title, ref_type, ref_id)
		VALUES ($1, NULLIF($2, ''), $3, $4, $5)
		ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title
		RETURNING id`, b.Kind, b.Key, b.Title, b.RefType, b.RefID).Scan(&id)
	return id, wrap(err)
}

// NewDelivery is a recipient added to a broadcast. UserID is looked up by the
// chat when missing (a private chat id is the Telegram user id), Recipient
// falls back to the bot chat's name.
type NewDelivery struct {
	BroadcastID int64
	UserID      *int64
	ChatID      *int64
	Recipient   string
	Status      string
	Error       string
	Text        string
	Markup      any
}

// AddDelivery records a recipient; a pending one is finished by FinishDelivery.
func (s *Store) AddDelivery(ctx context.Context, d NewDelivery) (int64, error) {
	var markup []byte
	if d.Markup != nil {
		var err error
		if markup, err = json.Marshal(d.Markup); err != nil {
			return 0, err
		}
	}
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO broadcast_deliveries
		(broadcast_id, user_id, chat_id, recipient, status, error, text, markup, attempts)
		VALUES ($1, COALESCE($2, (SELECT id FROM users WHERE telegram_id = $3)), $3,
			COALESCE(NULLIF($4, ''), (SELECT NULLIF(concat_ws(' ', NULLIF(first_name, ''), '@' || NULLIF(username, '')), '')
				FROM bot_chats WHERE chat_id = $3), ''),
			$5, $6, $7, $8, CASE WHEN $5 IN ('sent', 'failed') THEN 1 ELSE 0 END)
		RETURNING id`, d.BroadcastID, d.UserID, d.ChatID, d.Recipient, d.Status, d.Error, d.Text, markup).Scan(&id)
	return id, wrap(err)
}

// FinishDelivery stores the outcome of a send attempt.
func (s *Store) FinishDelivery(ctx context.Context, id int64, status, errText string) error {
	return s.exec(ctx, `UPDATE broadcast_deliveries SET status = $2, error = $3, attempts = attempts + 1,
		updated_at = now() WHERE id = $1`, id, status, errText)
}

const broadcastCols = `b.id, b.kind, b.title, b.ref_type, b.ref_id, b.created_at,
	COALESCE(d.last_at, b.created_at) AS last_at, COALESCE(d.total, 0) AS total, COALESCE(d.sent, 0) AS sent,
	COALESCE(d.failed, 0) AS failed, COALESCE(d.skipped, 0) AS skipped, COALESCE(d.pending, 0) AS pending
	FROM broadcasts b LEFT JOIN LATERAL (SELECT max(updated_at) AS last_at, count(*) AS total,
		count(*) FILTER (WHERE status = 'sent') AS sent, count(*) FILTER (WHERE status = 'failed') AS failed,
		count(*) FILTER (WHERE status = 'skipped') AS skipped, count(*) FILTER (WHERE status = 'pending') AS pending
		FROM broadcast_deliveries WHERE broadcast_id = b.id) d ON true`

// BroadcastFilter narrows the broadcast list.
type BroadcastFilter struct {
	Kind string
	// Limit caps the list, newest first; 0 means 200.
	Limit int
}

// ListBroadcasts returns recent broadcasts with their counters.
func (s *Store) ListBroadcasts(ctx context.Context, f BroadcastFilter) ([]models.Broadcast, error) {
	if f.Limit <= 0 || f.Limit > 1000 {
		f.Limit = 200
	}
	return many[models.Broadcast](ctx, s.db, `SELECT `+broadcastCols+`
		WHERE $1 = '' OR b.kind = $1 ORDER BY b.created_at DESC, b.id DESC LIMIT $2`, f.Kind, f.Limit)
}

// GetBroadcast returns one broadcast with its counters.
func (s *Store) GetBroadcast(ctx context.Context, id int64) (models.Broadcast, error) {
	return one[models.Broadcast](ctx, s.db, `SELECT `+broadcastCols+` WHERE b.id = $1`, id)
}

const deliveryCols = `d.id, d.broadcast_id, d.user_id, d.chat_id,
	COALESCE(` + userNameExpr + `, NULLIF(d.recipient, ''), d.chat_id::text, '') AS recipient,
	COALESCE(u.group_name, '') AS group_name, d.status, d.error, d.text, d.markup, d.attempts, d.created_at, d.updated_at
	FROM broadcast_deliveries d LEFT JOIN users u ON u.id = d.user_id`

// ListDeliveries returns a broadcast's recipients: problems first, then by name.
func (s *Store) ListDeliveries(ctx context.Context, broadcastID int64) ([]models.BroadcastDelivery, error) {
	return many[models.BroadcastDelivery](ctx, s.db, `SELECT `+deliveryCols+` WHERE d.broadcast_id = $1
		ORDER BY CASE d.status WHEN 'failed' THEN 0 WHEN 'pending' THEN 1 WHEN 'skipped' THEN 2 ELSE 3 END,
			recipient, d.id`, broadcastID)
}

// ListRetryDeliveries returns what a retry should resend: failed deliveries
// and ones stuck in pending (the process died mid-send) for over staleAfter.
func (s *Store) ListRetryDeliveries(ctx context.Context, broadcastID int64, staleAfter time.Duration) ([]models.BroadcastDelivery, error) {
	return many[models.BroadcastDelivery](ctx, s.db, `SELECT `+deliveryCols+` WHERE d.broadcast_id = $1
		AND d.chat_id IS NOT NULL AND d.text <> ''
		AND (d.status = 'failed' OR d.status = 'pending' AND d.updated_at < now() - make_interval(secs => $2))
		ORDER BY d.id`, broadcastID, staleAfter.Seconds())
}

// PruneBroadcasts drops broadcasts created before the cutoff.
func (s *Store) PruneBroadcasts(ctx context.Context, before time.Time) (int64, error) {
	tag, err := s.db.Exec(ctx, `DELETE FROM broadcasts WHERE created_at < $1`, before)
	return tag.RowsAffected(), wrap(err)
}

// Recipient is who a bot notification goes to. ChatID nil means the account
// has no Telegram; Reason explains a recipient that is skipped up front.
type Recipient struct {
	UserID *int64 `db:"user_id"`
	ChatID *int64 `db:"chat_id"`
	Name   string `db:"name"`
	Reason string `db:"reason"`
}

// UserRecipient is a site account as a notification recipient.
func (s *Store) UserRecipient(ctx context.Context, userID int64) (Recipient, error) {
	return one[Recipient](ctx, s.db, `SELECT u.id AS user_id, u.telegram_id AS chat_id, `+userNameExpr+` AS name
		FROM users u WHERE u.id = $1`, userID)
}

// LabUnreachable lists confirmed students the lab is meant for who will not
// get its announcement: they never started the bot or turned notifications off.
func (s *Store) LabUnreachable(ctx context.Context, labID int64) ([]Recipient, error) {
	return many[Recipient](ctx, s.db, `SELECT u.id AS user_id, u.telegram_id AS chat_id, `+userNameExpr+` AS name,
		CASE WHEN EXISTS (SELECT 1 FROM bot_chats c WHERE c.telegram_id = u.telegram_id)
			THEN 'Уведомления выключены' ELSE 'Не запускал бота' END AS reason
		FROM users u JOIN labs l ON l.id = $1
		WHERE u.approved_at IS NOT NULL
			AND NOT EXISTS (SELECT 1 FROM bot_chats c WHERE c.telegram_id = u.telegram_id AND c.subscribed)
			AND (l.audience = '{}' OR COALESCE(u.group_name, '') = '' OR l.audience && audience_scope(u.group_name))
		ORDER BY name`, labID)
}
