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

// NewUser reports a freshly created student account. It does not block the caller:
// the message goes out in the background and a failure is only logged.
func (n *AdminNotifier) NewUser(u models.User) {
	if n == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		opts := SendOptions{DisablePreview: true}
		if !u.Approved {
			opts.ReplyMarkup = approveKeyboard(u.ID)
		}
		if err := n.api.SendHTML(ctx, n.chatID, newUserMessage(n.site, u), opts); err != nil {
			n.log.Warn("new user", "user", u.ID, "err", err)
		}
	}()
}

const approvePrefix = "approve:"

func approveKeyboard(userID int64) map[string]any {
	return map[string]any{"inline_keyboard": [][]map[string]string{
		{{"text": "✅ Подтвердить", "callback_data": approvePrefix + strconv.FormatInt(userID, 10)}},
	}}
}

// callback handles inline buttons. Only the admin chat may press them: the button
// lives in a message sent there, and a forged callback from elsewhere is refused.
func (b *Bot) callback(ctx context.Context, q *CallbackQuery) {
	answer, err := b.approveFromButton(ctx, q)
	if err != nil {
		b.log.Warn("callback", "data", q.Data, "err", err)
		if answer == "" {
			answer = "Не получилось, подтверди в админке"
		}
	}
	if err := b.api.AnswerCallback(ctx, q.ID, answer); err != nil {
		b.log.Warn("answer callback", "err", err)
	}
}

// approveFromButton confirms the account from the "approve:<id>" button and
// returns the toast for the admin.
func (b *Bot) approveFromButton(ctx context.Context, q *CallbackQuery) (string, error) {
	raw, ok := strings.CutPrefix(q.Data, approvePrefix)
	if !ok {
		return "", nil
	}
	if b.opts.AdminChatID == 0 || q.Message == nil || q.Message.Chat.ID != b.opts.AdminChatID {
		return "Подтверждать может только админ", nil
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return "", fmt.Errorf("bad user id %q", raw)
	}
	st, err := b.store.GetSettings(ctx)
	if err != nil {
		return "", err
	}
	chat, msg := q.Message.Chat.ID, q.Message.ID
	user, now, err := b.store.ApproveUser(ctx, id, st.DefaultApprovalGroup())
	if errors.Is(err, httpx.ErrNotFound) {
		return "Аккаунт уже удалён", b.api.RemoveKeyboard(ctx, chat, msg)
	}
	if err != nil {
		return "", err
	}
	answer := "Уже подтверждён"
	if now {
		answer = "Подтверждён: " + user.Name
		b.log.Info("user approved from telegram", "user", user.ID)
	}
	return answer, b.api.EditHTML(ctx, chat, msg, approvedUserMessage(b.opts.SiteURL, user, now), SendOptions{DisablePreview: true})
}
