package bot

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

// ErrReportUnavailable means the report cannot be sent: no bot token,
// ADMIN_CHAT_ID or WEB_URL.
var ErrReportUnavailable = errors.New("practice report is not configured")

// Reports fetches the "who defends" picture of a practice session from the web
// app, which renders it with takumi (GET /api/practice-report?id=…).
type Reports struct {
	url   string
	token string
	hc    *http.Client
}

// NewReports returns nil without a web URL. The token is the shared
// REVALIDATE_TOKEN; outside production the web app accepts requests without it.
func NewReports(webURL, token string) *Reports {
	webURL = strings.TrimRight(webURL, "/")
	if webURL == "" {
		return nil
	}
	return &Reports{url: webURL + "/api/practice-report?id=", token: token, hc: &http.Client{Timeout: 20 * time.Second}}
}

// Render returns the PNG of the session report.
func (r *Reports) Render(ctx context.Context, sessionID int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.url+strconv.FormatInt(sessionID, 10), nil)
	if err != nil {
		return nil, err
	}
	if r.token != "" {
		req.Header.Set("Authorization", "Bearer "+r.token)
	}
	res, err := r.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("render report: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 10<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK || !strings.HasPrefix(res.Header.Get("Content-Type"), "image/") {
		return nil, fmt.Errorf("render report: %d %s", res.StatusCode, strings.TrimSpace(string(body[:min(len(body), 200)])))
	}
	return body, nil
}

const reportPrefix = "report:"

var ruMonthsFull = [...]string{"января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"}

// reportCaption goes under the picture: what, when, where and a link to the queue.
func reportCaption(site string, sess models.PracticeSession, loc *time.Location) string {
	t := sess.StartsAt.In(loc)
	name := sess.SubjectShortName
	if name == "" {
		name = sess.SubjectName
	}
	line := fmt.Sprintf("%d %s, %02d:%02d", t.Day(), ruMonthsFull[t.Month()-1], t.Hour(), t.Minute())
	if sess.Location != "" {
		line += " · ауд. " + esc(sess.Location)
	}
	caption := "📋 <b>Кто сдаёт: " + esc(name) + "</b>\n" + line
	if sess.Canceled {
		caption += "\n❌ Занятие отменено"
	}
	return caption + "\n<a href=\"" + practiceURL(strings.TrimRight(site, "/"), sess.ID) + "\">Очередь на сайте</a>"
}

func reportKeyboard(sessionID int64) map[string]any {
	return map[string]any{"inline_keyboard": [][]map[string]string{
		{{"text": "🔄 Обновить", "callback_data": reportPrefix + strconv.FormatInt(sessionID, 10)}},
	}}
}

// PracticeReport renders the session report and sends it to the admin chat
// with a refresh button. Unlike other admin messages it is synchronous: the
// admin asked for it and waits for the result.
func (n *AdminNotifier) PracticeReport(ctx context.Context, sess models.PracticeSession, loc *time.Location) error {
	if n == nil || n.reports == nil {
		return ErrReportUnavailable
	}
	png, err := n.reports.Render(ctx, sess.ID)
	if err != nil {
		return err
	}
	id := sess.ID
	b := n.c.open(ctx, store.NewBroadcast{Kind: models.BroadcastAdmin,
		Title: "Админу: отчёт — " + sessionLabel(sess, loc), RefType: "practice", RefID: &id})
	chat := n.chatID
	if err := n.c.deliverPhoto(ctx, b, Recipient{ChatID: &chat, Name: "Админ"}, png,
		reportCaption(n.site, sess, loc), reportKeyboard(sess.ID)); err != nil {
		// Ошибка сети несёт URL с токеном бота: наружу — только описание.
		return errors.New(describeSendError(err))
	}
	return nil
}

// deliverPhoto is deliver for a picture; the journal keeps its caption. A
// retry from the journal resends only the caption.
func (c *courier) deliverPhoto(ctx context.Context, broadcastID int64, r Recipient, png []byte, caption string, markup any) error {
	id := c.record(ctx, broadcastID, r, models.DeliveryPending, "", caption, markup)
	err := c.api.SendPhoto(ctx, *r.ChatID, png, caption, markup)
	c.finish(ctx, id, err)
	return err
}

// refreshReport redraws the report under the "report:<id>" button with fresh
// data, only in the admin chat.
func (b *Bot) refreshReport(ctx context.Context, q *CallbackQuery) (string, error) {
	if b.opts.AdminChatID == 0 || q.Message == nil || q.Message.Chat.ID != b.opts.AdminChatID {
		return "Обновлять может только админ", nil
	}
	if b.opts.Reports == nil {
		return "Не настроен WEB_URL", nil
	}
	id, err := strconv.ParseInt(strings.TrimPrefix(q.Data, reportPrefix), 10, 64)
	if err != nil {
		return "", fmt.Errorf("bad session id %q", q.Data)
	}
	chat, msg := q.Message.Chat.ID, q.Message.ID
	sess, err := b.store.GetPracticeSession(ctx, id)
	if errors.Is(err, httpx.ErrNotFound) {
		return "Сдачу удалили", b.api.RemoveKeyboard(ctx, chat, msg)
	}
	if err != nil {
		return "", err
	}
	png, err := b.opts.Reports.Render(ctx, id)
	if err != nil {
		return "", err
	}
	_, loc := b.site(ctx)
	caption, keyboard := reportCaption(b.opts.SiteURL, sess, loc), reportKeyboard(id)
	if err := b.api.EditPhoto(ctx, chat, msg, png, caption, keyboard); err != nil {
		var apiErr *APIError
		if errors.As(err, &apiErr) && strings.Contains(apiErr.Description, "not modified") {
			return "Ничего не поменялось", nil
		}
		// Сообщение без фото (повтор из журнала шлёт только подпись) — пришлём новое.
		if err := b.api.SendPhoto(ctx, chat, png, caption, keyboard); err != nil {
			return "", err
		}
	}
	return "Обновлено", nil
}
