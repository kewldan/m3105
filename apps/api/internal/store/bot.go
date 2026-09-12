package store

import (
	"context"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// BotChat is a Telegram private chat that talked to the bot.
type BotChat struct {
	ChatID       int64     `db:"chat_id"`
	TelegramID   int64     `db:"telegram_id"`
	FirstName    string    `db:"first_name"`
	Username     string    `db:"username"`
	Subscribed   bool      `db:"subscribed"`
	DigestSentOn string    `db:"digest_sent_on"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
}

const botChatCols = `chat_id, telegram_id, first_name, username, subscribed, digest_sent_on, created_at, updated_at`

// UpsertBotChat records a chat after /start and (re)enables its notifications.
func (s *Store) UpsertBotChat(ctx context.Context, chatID, telegramID int64, firstName, username string) (BotChat, error) {
	return one[BotChat](ctx, s.db, `INSERT INTO bot_chats (chat_id, telegram_id, first_name, username)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (chat_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id, first_name = EXCLUDED.first_name,
			username = EXCLUDED.username, subscribed = true, updated_at = now()
		RETURNING `+botChatCols, chatID, telegramID, firstName, username)
}

// GetBotChat fetches one chat.
func (s *Store) GetBotChat(ctx context.Context, chatID int64) (BotChat, error) {
	return one[BotChat](ctx, s.db, `SELECT `+botChatCols+` FROM bot_chats WHERE chat_id = $1`, chatID)
}

// SetBotChatSubscribed toggles notifications for a chat.
func (s *Store) SetBotChatSubscribed(ctx context.Context, chatID int64, on bool) (BotChat, error) {
	return one[BotChat](ctx, s.db, `UPDATE bot_chats SET subscribed = $2, updated_at = now() WHERE chat_id = $1 RETURNING `+botChatCols, chatID, on)
}

// DeleteBotChat forgets a chat (the user blocked the bot).
func (s *Store) DeleteBotChat(ctx context.Context, chatID int64) error {
	_, err := s.db.Exec(ctx, `DELETE FROM bot_chats WHERE chat_id = $1`, chatID)
	return wrap(err)
}

// ListSubscribedBotChats returns chats that want notifications.
func (s *Store) ListSubscribedBotChats(ctx context.Context) ([]BotChat, error) {
	return many[BotChat](ctx, s.db, `SELECT `+botChatCols+` FROM bot_chats WHERE subscribed ORDER BY chat_id`)
}

// ListBotChatsForDigest returns subscribed chats that have not received the digest for the given local date.
func (s *Store) ListBotChatsForDigest(ctx context.Context, date string) ([]BotChat, error) {
	return many[BotChat](ctx, s.db, `SELECT `+botChatCols+` FROM bot_chats WHERE subscribed AND digest_sent_on <> $1 ORDER BY chat_id`, date)
}

// MarkBotDigestSent records that the chat got (or did not need) today's digest.
func (s *Store) MarkBotDigestSent(ctx context.Context, chatID int64, date string) error {
	_, err := s.db.Exec(ctx, `UPDATE bot_chats SET digest_sent_on = $2, updated_at = now() WHERE chat_id = $1`, chatID, date)
	return wrap(err)
}

// ListUnannouncedLabs returns published labs that were never broadcast.
func (s *Store) ListUnannouncedLabs(ctx context.Context) ([]models.Lab, error) {
	return many[models.Lab](ctx, s.db, `SELECT `+labListCols+` FROM labs l JOIN subjects s ON s.id = l.subject_id
		WHERE l.status = 'published' AND NOT EXISTS (SELECT 1 FROM bot_announced_labs a WHERE a.lab_id = l.id)
		ORDER BY l.updated_at`)
}

// MarkLabAnnounced remembers that a lab was broadcast.
func (s *Store) MarkLabAnnounced(ctx context.Context, labID int64) error {
	_, err := s.db.Exec(ctx, `INSERT INTO bot_announced_labs (lab_id) VALUES ($1) ON CONFLICT DO NOTHING`, labID)
	return wrap(err)
}

// BotLab is a lab row with the viewer's completion flag.
type BotLab struct {
	models.Lab
	Done bool `db:"done"`
}

// ListLabsForTelegramUser returns published labs with a deadline in [from, to], marking the ones the
// site account linked to telegramID has completed. Without a linked account nothing is marked done.
func (s *Store) ListLabsForTelegramUser(ctx context.Context, telegramID int64, from, to *time.Time) ([]BotLab, error) {
	q := `SELECT ` + labListCols + `,
		EXISTS (SELECT 1 FROM lab_completions c JOIN users u ON u.id = c.user_id WHERE u.telegram_id = $1 AND c.lab_id = l.id) AS done
		FROM labs l JOIN subjects s ON s.id = l.subject_id WHERE l.status = 'published'`
	args := []any{telegramID}
	if from != nil {
		args = append(args, *from)
		q += ` AND l.deadline_at >= $` + itoa(len(args))
	}
	if to != nil {
		args = append(args, *to)
		q += ` AND l.deadline_at <= $` + itoa(len(args))
	}
	q += ` ORDER BY l.deadline_at NULLS LAST, s.position, l.number`
	return many[BotLab](ctx, s.db, q, args...)
}
