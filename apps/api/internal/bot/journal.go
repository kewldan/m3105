package bot

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

// Recipient is who a notification goes to.
type Recipient = store.Recipient

// errNoChat is returned for a recipient without Telegram: nothing was sent.
var errNoChat = errors.New("no telegram chat")

// courier sends notifications and writes every send into the broadcast
// journal (broadcasts + broadcast_deliveries). A journal failure is logged
// and never stops the message itself.
type courier struct {
	api   *Client
	store *store.Store
	log   *slog.Logger
}

// open starts a broadcast; 0 means the journal is unavailable.
func (c *courier) open(ctx context.Context, b store.NewBroadcast) int64 {
	if c.store == nil {
		return 0
	}
	id, err := c.store.OpenBroadcast(context.WithoutCancel(ctx), b)
	if err != nil {
		c.log.Warn("open broadcast", "kind", b.Kind, "err", err)
		return 0
	}
	return id
}

// record adds a delivery row; 0 when there is no journal.
func (c *courier) record(ctx context.Context, broadcastID int64, r Recipient, status, reason, text string, markup any) int64 {
	if c.store == nil || broadcastID == 0 {
		return 0
	}
	id, err := c.store.AddDelivery(context.WithoutCancel(ctx), store.NewDelivery{
		BroadcastID: broadcastID, UserID: r.UserID, ChatID: r.ChatID, Recipient: r.Name,
		Status: status, Error: reason, Text: text, Markup: markup,
	})
	if err != nil {
		c.log.Warn("record delivery", "broadcast", broadcastID, "err", err)
		return 0
	}
	return id
}

// skip records a recipient the message is not sent to, and why.
func (c *courier) skip(ctx context.Context, broadcastID int64, r Recipient, reason, text string) {
	c.record(ctx, broadcastID, r, models.DeliverySkipped, reason, text, nil)
}

// deliver sends the message and records the outcome. The delivery is written
// as pending before the send, so a crash mid-broadcast stays visible.
func (c *courier) deliver(ctx context.Context, broadcastID int64, r Recipient, text string, markup any) error {
	if r.ChatID == nil {
		reason := r.Reason
		if reason == "" {
			reason = "Telegram не привязан к аккаунту"
		}
		c.skip(ctx, broadcastID, r, reason, text)
		return errNoChat
	}
	id := c.record(ctx, broadcastID, r, models.DeliveryPending, "", text, markup)
	err := c.api.SendHTML(ctx, *r.ChatID, text, SendOptions{DisablePreview: true, ReplyMarkup: markup})
	c.finish(ctx, id, err)
	return err
}

// finish stores the result of a send attempt.
func (c *courier) finish(ctx context.Context, deliveryID int64, err error) {
	if c.store == nil || deliveryID == 0 {
		return
	}
	status, reason := models.DeliverySent, ""
	if err != nil {
		status, reason = models.DeliveryFailed, describeSendError(err)
	}
	if e := c.store.FinishDelivery(context.WithoutCancel(ctx), deliveryID, status, reason); e != nil {
		c.log.Warn("finish delivery", "delivery", deliveryID, "err", e)
	}
}

// RetryResult counts what a retry managed to resend.
type RetryResult struct {
	Retried int `json:"retried"`
	Sent    int `json:"sent"`
	Failed  int `json:"failed"`
}

// retry resends the broadcast's failed deliveries (and ones stuck in pending)
// with the same text and buttons.
func (c *courier) retry(ctx context.Context, broadcastID int64) (RetryResult, error) {
	var res RetryResult
	list, err := c.store.ListRetryDeliveries(ctx, broadcastID, 5*time.Minute)
	if err != nil {
		return res, err
	}
	for i, d := range list {
		if i > 0 {
			// Stay under Telegram's rate limit; a deadline leaves the rest for the next retry.
			select {
			case <-time.After(50 * time.Millisecond):
			case <-ctx.Done():
				return res, nil
			}
		}
		var markup any
		if len(d.Markup) > 0 && string(d.Markup) != "null" {
			markup = json.RawMessage(d.Markup)
		}
		sendErr := c.api.SendHTML(ctx, *d.ChatID, d.Text, SendOptions{DisablePreview: true, ReplyMarkup: markup})
		c.finish(ctx, d.ID, sendErr)
		res.Retried++
		if sendErr != nil {
			res.Failed++
		} else {
			res.Sent++
		}
	}
	return res, nil
}

// describeSendError turns a send failure into a reason for the admin. Network
// errors lose the request URL: it carries the bot token.
func describeSendError(err error) string {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		d := strings.ToLower(apiErr.Description)
		label := "Ошибка Telegram"
		switch {
		case strings.Contains(d, "bot was blocked"):
			label = "Бот заблокирован"
		case strings.Contains(d, "initiate conversation"):
			label = "Не запускал бота"
		case strings.Contains(d, "user is deactivated"):
			label = "Аккаунт Telegram удалён"
		case strings.Contains(d, "chat not found"):
			label = "Чат не найден"
		case apiErr.Code == 401:
			label = "Неверный токен бота"
		case apiErr.Code == 429:
			label = "Лимит Telegram"
		}
		return label + ": " + apiErr.Error()
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return "Не дождались ответа Telegram"
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		err = urlErr.Err
	}
	return "Сеть: " + err.Error()
}

// sessionLabel names a practice session in broadcast titles.
func sessionLabel(sess models.PracticeSession, loc *time.Location) string {
	if loc == nil {
		loc = time.UTC
	}
	label := sess.SubjectName + ", " + sess.StartsAt.In(loc).Format("02.01 15:04")
	if sess.Location != "" {
		label += ", " + sess.Location
	}
	return label
}

func practiceBroadcast(kind, title string, sess models.PracticeSession, loc *time.Location) store.NewBroadcast {
	id := sess.ID
	return store.NewBroadcast{Kind: kind, Title: title + ": " + sessionLabel(sess, loc), RefType: "practice", RefID: &id}
}
