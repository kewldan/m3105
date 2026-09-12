package bot

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

// Options configure the bot.
type Options struct {
	Token string
	// SiteURL is the public site origin used in links.
	SiteURL string
	// DigestHour is the local hour (0-23) when the daily deadline digest goes out.
	DigestHour int
	// DigestWindow is how far ahead the digest looks for deadlines.
	DigestWindow time.Duration
	// Poll enables long polling for commands; notifications work regardless.
	Poll bool
}

// Bot ties the Telegram client to the store.
type Bot struct {
	api   *Client
	store *store.Store
	opts  Options
	log   *slog.Logger
}

// New builds a bot; returns nil when no token is configured.
func New(st *store.Store, opts Options) *Bot {
	if opts.Token == "" {
		return nil
	}
	if opts.DigestWindow <= 0 {
		opts.DigestWindow = 3 * 24 * time.Hour
	}
	if opts.DigestHour < 0 || opts.DigestHour > 23 {
		opts.DigestHour = 10
	}
	return &Bot{api: NewClient(opts.Token), store: st, opts: opts, log: slog.Default().With("component", "bot")}
}

var commands = []Command{
	{Command: "start", Description: "Меню и подписка на уведомления"},
	{Command: "deadlines", Description: "Ближайшие дедлайны несданных лаб"},
	{Command: "labs", Description: "Все лабы семестра"},
	{Command: "notify", Description: "Включить или выключить уведомления"},
	{Command: "help", Description: "Что умеет бот"},
}

const (
	btnDeadlines = "📅 Дедлайны"
	btnLabs      = "🧪 Лабы"
	btnNotify    = "🔔 Уведомления"
	btnSite      = "🌐 Сайт"
)

var menu = map[string]any{
	"keyboard": [][]map[string]string{
		{{"text": btnDeadlines}, {"text": btnLabs}},
		{{"text": btnNotify}, {"text": btnSite}},
	},
	"resize_keyboard": true,
	"is_persistent":   true,
}

// Run polls for commands and runs the notification scheduler until ctx ends.
func (b *Bot) Run(ctx context.Context) {
	if err := b.api.SetCommands(ctx, commands); err != nil {
		b.log.Warn("set commands", "err", err)
	}
	go b.schedule(ctx)
	if !b.opts.Poll {
		<-ctx.Done()
		return
	}
	var offset int64
	for ctx.Err() == nil {
		updates, err := b.api.GetUpdates(ctx, offset, 50)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			b.log.Warn("poll", "err", err)
			select {
			case <-time.After(5 * time.Second):
			case <-ctx.Done():
			}
			continue
		}
		for _, u := range updates {
			offset = u.ID + 1
			if u.Message == nil || u.Message.From == nil || u.Message.Chat.Type != "private" {
				continue
			}
			b.handle(ctx, u.Message)
		}
	}
}

func (b *Bot) handle(ctx context.Context, m *Message) {
	text := strings.TrimSpace(m.Text)
	cmd := text
	if i := strings.IndexAny(cmd, " \n"); i > 0 {
		cmd = cmd[:i]
	}
	if at := strings.Index(cmd, "@"); strings.HasPrefix(cmd, "/") && at > 0 {
		cmd = cmd[:at]
	}
	var err error
	switch cmd {
	case "/start":
		err = b.start(ctx, m)
	case "/deadlines", btnDeadlines:
		err = b.deadlines(ctx, m.Chat.ID, m.From.ID)
	case "/labs", btnLabs:
		err = b.labs(ctx, m.Chat.ID, m.From.ID)
	case "/notify", btnNotify:
		err = b.toggle(ctx, m)
	case "/help":
		err = b.api.SendHTML(ctx, m.Chat.ID, helpText(b.opts.SiteURL), SendOptions{ReplyMarkup: menu, DisablePreview: true})
	case btnSite:
		err = b.api.SendHTML(ctx, m.Chat.ID, "🌐 "+strings.TrimRight(b.opts.SiteURL, "/"), SendOptions{})
	default:
		err = b.api.SendHTML(ctx, m.Chat.ID, "Не понял. Нажми кнопку внизу или отправь /help.", SendOptions{ReplyMarkup: menu})
	}
	if err != nil {
		b.log.Warn("handle", "cmd", cmd, "chat", m.Chat.ID, "err", err)
	}
}

func helpText(site string) string {
	return "🤖 <b>Бот группы М3105</b>\n\n" +
		"• Сообщает о новых лабах сразу после публикации.\n" +
		"• Каждое утро напоминает о несданных лабах, у которых дедлайн в ближайшие дни.\n" +
		"• /deadlines — дедлайны несданных лаб, /labs — все лабы семестра.\n" +
		"• /notify — включить или выключить уведомления.\n\n" +
		"Если войти на <a href=\"" + strings.TrimRight(site, "/") + "/login\">сайте</a> через Telegram и отмечать сданные лабы, бот перестанет напоминать о них."
}

func (b *Bot) start(ctx context.Context, m *Message) error {
	chat, err := b.store.UpsertBotChat(ctx, m.Chat.ID, m.From.ID, m.From.FirstName, m.From.Username)
	if err != nil {
		return err
	}
	var sb strings.Builder
	sb.WriteString("👋 Привет, " + esc(chat.FirstName) + "!\n\n")
	sb.WriteString("Я бот группы М3105. Уведомления включены: пришлю новую лабу, как только её опубликуют, и напомню о дедлайнах несданных.\n\n")
	if user, err := b.store.GetUserByTelegramID(ctx, m.From.ID); err == nil {
		sb.WriteString("Аккаунт на сайте: <b>" + esc(user.Name) + "</b>. Лабы, отмеченные сданными, в напоминания не попадают.")
	} else if errors.Is(err, httpx.ErrNotFound) {
		sb.WriteString("Аккаунт на сайте пока не привязан: <a href=\"" + strings.TrimRight(b.opts.SiteURL, "/") + "/login\">войди через Telegram</a>, чтобы отмечать сданные лабы.")
	} else {
		return err
	}
	return b.api.SendHTML(ctx, m.Chat.ID, sb.String(), SendOptions{ReplyMarkup: menu, DisablePreview: true})
}

func (b *Bot) toggle(ctx context.Context, m *Message) error {
	chat, err := b.store.GetBotChat(ctx, m.Chat.ID)
	if errors.Is(err, httpx.ErrNotFound) {
		chat, err = b.store.UpsertBotChat(ctx, m.Chat.ID, m.From.ID, m.From.FirstName, m.From.Username)
		if err != nil {
			return err
		}
		return b.api.SendHTML(ctx, m.Chat.ID, "🔔 Уведомления включены.", SendOptions{ReplyMarkup: menu})
	}
	if err != nil {
		return err
	}
	chat, err = b.store.SetBotChatSubscribed(ctx, m.Chat.ID, !chat.Subscribed)
	if err != nil {
		return err
	}
	if chat.Subscribed {
		return b.api.SendHTML(ctx, m.Chat.ID, "🔔 Уведомления включены.", SendOptions{ReplyMarkup: menu})
	}
	return b.api.SendHTML(ctx, m.Chat.ID, "🔕 Уведомления выключены. Команды по-прежнему работают, включить обратно: /notify.", SendOptions{ReplyMarkup: menu})
}

func (b *Bot) site(ctx context.Context) (time.Time, *time.Location) {
	loc := time.UTC
	if st, err := b.store.GetSettings(ctx); err == nil {
		if l, err := time.LoadLocation(st.Timezone); err == nil {
			loc = l
		}
	}
	return time.Now().In(loc), loc
}

func (b *Bot) linked(ctx context.Context, telegramID int64) bool {
	_, err := b.store.GetUserByTelegramID(ctx, telegramID)
	return err == nil
}

func (b *Bot) deadlines(ctx context.Context, chatID, telegramID int64) error {
	now, loc := b.site(ctx)
	from := now.Add(-30 * 24 * time.Hour)
	labs, err := b.store.ListLabsForTelegramUser(ctx, telegramID, &from, nil)
	if err != nil {
		return err
	}
	msg := deadlinesMessage(b.opts.SiteURL, labs, now, loc, b.linked(ctx, telegramID))
	return b.api.SendHTML(ctx, chatID, msg, SendOptions{ReplyMarkup: menu, DisablePreview: true})
}

func (b *Bot) labs(ctx context.Context, chatID, telegramID int64) error {
	now, loc := b.site(ctx)
	labs, err := b.store.ListLabsForTelegramUser(ctx, telegramID, nil, nil)
	if err != nil {
		return err
	}
	// Group by subject in the site's subject order: the query sorts by deadline, so regroup here.
	sorted := make([]store.BotLab, 0, len(labs))
	seen := map[string]bool{}
	for _, l := range labs {
		if seen[l.SubjectSlug] {
			continue
		}
		seen[l.SubjectSlug] = true
		for _, m := range labs {
			if m.SubjectSlug == l.SubjectSlug {
				sorted = append(sorted, m)
			}
		}
	}
	return b.api.SendHTML(ctx, chatID, labsMessage(b.opts.SiteURL, sorted, now, loc), SendOptions{ReplyMarkup: menu, DisablePreview: true})
}

// schedule announces new labs and sends the daily digest.
func (b *Bot) schedule(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		b.announceNewLabs(ctx)
		b.sendDigests(ctx)
		select {
		case <-ticker.C:
		case <-ctx.Done():
			return
		}
	}
}

func (b *Bot) announceNewLabs(ctx context.Context) {
	labs, err := b.store.ListUnannouncedLabs(ctx)
	if err != nil {
		b.log.Warn("unannounced labs", "err", err)
		return
	}
	if len(labs) == 0 {
		return
	}
	chats, err := b.store.ListSubscribedBotChats(ctx)
	if err != nil {
		b.log.Warn("subscribers", "err", err)
		return
	}
	now, loc := b.site(ctx)
	for _, lab := range labs {
		// Mark first: a crash mid-broadcast must not repeat the announcement to everyone.
		if err := b.store.MarkLabAnnounced(ctx, lab.ID); err != nil {
			b.log.Warn("mark announced", "lab", lab.ID, "err", err)
			continue
		}
		msg := newLabMessage(b.opts.SiteURL, lab, now, loc)
		sent := 0
		for _, chat := range chats {
			if b.send(ctx, chat.ChatID, msg) {
				sent++
			}
		}
		b.log.Info("announced lab", "lab", lab.ID, "title", lab.Title, "chats", sent)
	}
}

func (b *Bot) sendDigests(ctx context.Context) {
	now, loc := b.site(ctx)
	if now.Hour() != b.opts.DigestHour {
		return
	}
	today := now.Format("2006-01-02")
	chats, err := b.store.ListBotChatsForDigest(ctx, today)
	if err != nil {
		b.log.Warn("digest chats", "err", err)
		return
	}
	for _, chat := range chats {
		from := now.Add(-30 * 24 * time.Hour)
		to := now.Add(b.opts.DigestWindow)
		labs, err := b.store.ListLabsForTelegramUser(ctx, chat.TelegramID, &from, &to)
		if err != nil {
			b.log.Warn("digest labs", "chat", chat.ChatID, "err", err)
			continue
		}
		if err := b.store.MarkBotDigestSent(ctx, chat.ChatID, today); err != nil {
			b.log.Warn("mark digest", "chat", chat.ChatID, "err", err)
			continue
		}
		if msg := digestMessage(b.opts.SiteURL, labs, now, loc, b.opts.DigestWindow); msg != "" {
			b.send(ctx, chat.ChatID, msg)
		}
	}
}

// send delivers a notification; a blocked bot unsubscribes the chat. Reports success.
func (b *Bot) send(ctx context.Context, chatID int64, msg string) bool {
	err := b.api.SendHTML(ctx, chatID, msg, SendOptions{DisablePreview: true})
	if err == nil {
		time.Sleep(50 * time.Millisecond) // stay well under Telegram's broadcast rate limit
		return true
	}
	var apiErr *APIError
	if errors.As(err, &apiErr) && apiErr.Blocked() {
		if _, e := b.store.SetBotChatSubscribed(ctx, chatID, false); e == nil {
			b.log.Info("chat unsubscribed (blocked)", "chat", chatID)
		}
		return false
	}
	b.log.Warn("send", "chat", chatID, "err", err)
	return false
}
