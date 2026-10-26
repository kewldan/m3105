package bot

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

const (
	swapAcceptPrefix  = "swap_ok:"
	swapDeclinePrefix = "swap_no:"
)

func swapKeyboard(swapID int64) map[string]any {
	id := strconv.FormatInt(swapID, 10)
	return map[string]any{"inline_keyboard": [][]map[string]string{{
		{"text": "✅ Согласиться", "callback_data": swapAcceptPrefix + id},
		{"text": "❌ Отказаться", "callback_data": swapDeclinePrefix + id},
	}}}
}

// swapFromButton answers a swap request from the buttons under it. The button
// counts only for the asked student: the store checks the account that pressed it.
func (b *Bot) swapFromButton(ctx context.Context, q *CallbackQuery) (string, error) {
	raw, accept := strings.CutPrefix(q.Data, swapAcceptPrefix)
	if !accept {
		raw = strings.TrimPrefix(q.Data, swapDeclinePrefix)
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return "", errors.New("bad swap id " + strconv.Quote(raw))
	}
	user, err := b.store.GetUserByTelegramID(ctx, q.From.ID)
	if errors.Is(err, httpx.ErrNotFound) {
		return "Этот Telegram не привязан к аккаунту на сайте", nil
	}
	if err != nil {
		return "", err
	}
	if !user.Approved {
		return "Аккаунт ещё не подтверждён", nil
	}

	var res store.SwapResult
	if accept {
		res, err = b.store.AcceptSwap(ctx, id, user.ID)
	} else {
		res, err = b.store.DeleteSwap(ctx, id, user.ID)
	}
	var ve *httpx.ValidationError
	switch {
	case errors.Is(err, httpx.ErrNotFound):
		b.dropKeyboard(ctx, q)
		return "Запрос уже неактуален: его отозвали или на него ответили", nil
	case errors.As(err, &ve):
		b.dropKeyboard(ctx, q)
		return ve.Fields["_"], nil
	case err != nil:
		return "", err
	}

	sess, err := b.store.GetPracticeSession(ctx, res.SessionID)
	if err != nil {
		return "", err
	}
	_, loc := b.site(ctx)
	queues, err := b.store.Queues(ctx, []models.PracticeSession{sess}, loc)
	if err != nil {
		return "", err
	}
	q2 := queues[sess.ID]
	sender := queueName(q2, res.FromUserID)
	me := queueName(q2, user.ID)
	senderChat := b.telegramOf(ctx, res.FromUserID)

	var text, toSender, answer string
	if accept {
		text = swapDoneMessage(b.opts.SiteURL, sess, loc, sender, queuePlace(q2, res.ToUserID, res.ToLabID))
		toSender = swapAcceptedMessage(b.opts.SiteURL, sess, loc, me, queuePlace(q2, res.FromUserID, res.FromLabID))
		answer = "Поменялись местами"
	} else {
		text = swapRefusedMessage(b.opts.SiteURL, sess, loc, sender)
		toSender = swapDeclinedMessage(b.opts.SiteURL, sess, loc, me)
		answer = "Обмен отклонён"
	}
	if q.Message != nil {
		if err := b.api.EditHTML(ctx, q.Message.Chat.ID, q.Message.ID, text, SendOptions{DisablePreview: true}); err != nil {
			b.log.Warn("edit swap message", "err", err)
		}
	}
	if senderChat != nil {
		if err := b.api.SendHTML(ctx, *senderChat, toSender, SendOptions{DisablePreview: true}); err != nil {
			b.log.Warn("swap answer to sender", "user", res.FromUserID, "err", err)
		}
	}
	return answer, nil
}

func (b *Bot) dropKeyboard(ctx context.Context, q *CallbackQuery) {
	if q.Message == nil {
		return
	}
	if err := b.api.RemoveKeyboard(ctx, q.Message.Chat.ID, q.Message.ID); err != nil {
		b.log.Warn("remove swap keyboard", "err", err)
	}
}

func (b *Bot) telegramOf(ctx context.Context, userID int64) *int64 {
	u, err := b.store.GetUser(ctx, userID)
	if err != nil {
		return nil
	}
	return u.TelegramID
}

// queuePlace is the 1-based place of a defense, 0 if it is gone.
func queuePlace(q []store.QueuedSignup, userID, labID int64) int {
	for i, r := range q {
		if r.UserID == userID && r.LabID == labID {
			return i + 1
		}
	}
	return 0
}

func queueName(q []store.QueuedSignup, userID int64) string {
	for _, r := range q {
		if r.UserID == userID {
			return r.UserName
		}
	}
	return "одногруппник"
}
