package bot

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// AdminNotifier sends service messages to the admin's chat.
type AdminNotifier struct {
	api    *Client
	chatID int64
	site   string
	log    *slog.Logger
}

// NewAdminNotifier returns nil when the token or the chat is not configured;
// methods of a nil notifier do nothing.
func NewAdminNotifier(token string, chatID int64, site string) *AdminNotifier {
	if token == "" || chatID == 0 {
		return nil
	}
	return &AdminNotifier{api: NewClient(token), chatID: chatID, site: site, log: slog.Default().With("component", "admin-notify")}
}

// Claimed reports that a student picked themselves in the course list. It does
// not block the caller: the message goes out in the background and a failure is
// only logged. The button under it takes the pick back.
func (n *AdminNotifier) Claimed(u models.User, st models.Student) {
	if n == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		opts := SendOptions{DisablePreview: true, ReplyMarkup: unclaimKeyboard(u.ID)}
		if err := n.api.SendHTML(ctx, n.chatID, claimedMessage(n.site, u, st), opts); err != nil {
			n.log.Warn("claimed", "user", u.ID, "err", err)
		}
	}()
}

// Edited tells the admin what an editor changed, with a link to the journal.
// Like Claimed, it does not block the caller.
func (n *AdminNotifier) Edited(e models.Edit) {
	if n == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := n.api.SendHTML(ctx, n.chatID, editedMessage(n.site, e), SendOptions{DisablePreview: true}); err != nil {
			n.log.Warn("edited", "edit", e.ID, "err", err)
		}
	}()
}

const (
	unclaimPrefix = "unclaim:"
	// approvePrefix is the button of the old manual confirmation, still under older messages.
	approvePrefix = "approve:"
)

func unclaimKeyboard(userID int64) map[string]any {
	return map[string]any{"inline_keyboard": [][]map[string]string{
		{{"text": "↩️ Это не он — отвязать", "callback_data": unclaimPrefix + strconv.FormatInt(userID, 10)}},
	}}
}

// callback handles inline buttons: taking a pick back (only from the admin chat:
// the button lives in a message sent there, a forged callback is refused) and
// answers to swap requests in the practice queue.
func (b *Bot) callback(ctx context.Context, q *CallbackQuery) {
	var answer, fallback string
	var err error
	switch {
	case strings.HasPrefix(q.Data, swapAcceptPrefix), strings.HasPrefix(q.Data, swapDeclinePrefix):
		answer, err = b.swapFromButton(ctx, q)
		fallback = "Не получилось, ответьте на сайте"
	case strings.HasPrefix(q.Data, approvePrefix):
		answer = "Подтверждать больше не нужно: студенты сами выбирают себя в списке"
		if q.Message != nil {
			err = b.api.RemoveKeyboard(ctx, q.Message.Chat.ID, q.Message.ID)
		}
	default:
		answer, err = b.unclaimFromButton(ctx, q)
		fallback = "Не получилось, отвяжи в админке"
	}
	if err != nil {
		b.log.Warn("callback", "data", q.Data, "err", err)
		if answer == "" {
			answer = fallback
		}
	}
	if err := b.api.AnswerCallback(ctx, q.ID, answer); err != nil {
		b.log.Warn("answer callback", "err", err)
	}
}

// unclaimFromButton takes back the pick from the "unclaim:<id>" button and
// returns the toast for the admin.
func (b *Bot) unclaimFromButton(ctx context.Context, q *CallbackQuery) (string, error) {
	raw, ok := strings.CutPrefix(q.Data, unclaimPrefix)
	if !ok {
		return "", nil
	}
	if b.opts.AdminChatID == 0 || q.Message == nil || q.Message.Chat.ID != b.opts.AdminChatID {
		return "Отвязывать может только админ", nil
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return "", fmt.Errorf("bad user id %q", raw)
	}
	chat, msg := q.Message.Chat.ID, q.Message.ID
	user, now, err := b.store.UnclaimUser(ctx, id)
	if errors.Is(err, httpx.ErrNotFound) {
		return "Аккаунт уже удалён", b.api.RemoveKeyboard(ctx, chat, msg)
	}
	if err != nil {
		return "", err
	}
	answer := "Уже отвязан"
	if now {
		answer = "Отвязан: " + user.TelegramName
		b.log.Info("user unclaimed from telegram", "user", user.ID)
	}
	return answer, b.api.EditHTML(ctx, chat, msg, unclaimedMessage(b.opts.SiteURL, user), SendOptions{DisablePreview: true})
}
