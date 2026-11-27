package bot

import (
	"context"
	"errors"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
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
	// AdminChatID is the only chat allowed to press inline buttons (account approval).
	AdminChatID int64
	// Reports renders practice reports for the refresh button; nil without WEB_URL.
	Reports *Reports
}

// Bot ties the Telegram client to the store.
type Bot struct {
	api   *Client
	c     *courier
	store *store.Store
	opts  Options
	log   *slog.Logger
	// prunedAt is when old broadcasts were last dropped from the journal.
	prunedAt time.Time
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
	api, log := NewClient(opts.Token), slog.Default().With("component", "bot")
	return &Bot{api: api, c: &courier{api: api, store: st, log: log}, store: st, opts: opts, log: log}
}

var commands = []Command{
	{Command: "start", Description: "Меню и подписка на уведомления"},
	{Command: "deadlines", Description: "Ближайшие дедлайны несданных лаб"},
	{Command: "labs", Description: "Все лабы семестра"},
	{Command: "grades", Description: "Мои баллы и место в рейтинге"},
	{Command: "notify", Description: "Включить или выключить уведомления"},
	{Command: "help", Description: "Что умеет бот"},
}

const (
	btnDeadlines = "📅 Дедлайны"
	btnLabs      = "🧪 Лабы"
	btnNotify    = "🔔 Уведомления"
	btnGrades    = "🎓 Баллы"
	btnSite      = "🌐 Сайт"
)

var menu = map[string]any{
	"keyboard": [][]map[string]string{
		{{"text": btnDeadlines}, {"text": btnLabs}, {"text": btnGrades}},
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
			if u.CallbackQuery != nil {
				b.callback(ctx, u.CallbackQuery)
				continue
			}
			if u.Message == nil || u.Message.From == nil || u.Message.Chat.Type != "private" {
				continue
			}
			b.handle(ctx, u.Message)
		}
	}
}

// parseCommand returns the dispatch key for an incoming message: for slash
// commands it is the bare command without arguments and bot mention, for
// everything else (reply-keyboard buttons) the trimmed text as is.
func parseCommand(text string) string {
	cmd := strings.TrimSpace(text)
	if !strings.HasPrefix(cmd, "/") {
		return cmd
	}
	if i := strings.IndexAny(cmd, " \n"); i > 0 {
		cmd = cmd[:i]
	}
	if at := strings.Index(cmd, "@"); at > 0 {
		cmd = cmd[:at]
	}
	return cmd
}

func (b *Bot) handle(ctx context.Context, m *Message) {
	cmd := parseCommand(m.Text)
	var err error
	switch cmd {
	case "/start":
		err = b.start(ctx, m)
	case "/deadlines", btnDeadlines:
		err = b.deadlines(ctx, m.Chat.ID, m.From.ID)
	case "/labs", btnLabs:
		err = b.labs(ctx, m.Chat.ID, m.From.ID)
	case "/grades", btnGrades:
		err = b.grades(ctx, m.Chat.ID, m.From.ID)
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
	return "🤖 <b>Учебный бот</b>\n\n" +
		"• Сообщает о новых лабах сразу после публикации.\n" +
		"• Каждое утро напоминает о несданных лабах, у которых дедлайн в ближайшие дни.\n" +
		"• /deadlines — дедлайны несданных лаб, /labs — все лабы семестра.\n" +
		"• /grades — баллы и место в рейтинге; когда баллы в таблице меняются, бот пишет сам.\n" +
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
	sb.WriteString("Я учебный бот. Уведомления включены: пришлю новую лабу, как только её опубликуют, и напомню о дедлайнах несданных.\n\n")
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
		b.notifyGrades(ctx)
		b.pruneJournal(ctx)
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
		// Mark first: a crash mid-broadcast must not repeat the announcement to
		// everyone. The journal shows who got it before the crash.
		if err := b.store.MarkLabAnnounced(ctx, lab.ID); err != nil {
			b.log.Warn("mark announced", "lab", lab.ID, "err", err)
			continue
		}
		msg := newLabMessage(b.opts.SiteURL, lab, now, loc)
		chats := chats
		if len(lab.Audience) > 0 {
			if chats, err = b.store.ListBotChatsForLab(ctx, lab.ID); err != nil {
				b.log.Warn("lab chats", "lab", lab.ID, "err", err)
				continue
			}
		}
		labID := lab.ID
		id := b.c.open(ctx, store.NewBroadcast{
			Kind: models.BroadcastLab, Key: "lab:" + strconv.FormatInt(lab.ID, 10),
			Title: announceTitle(lab), RefType: "lab", RefID: &labID,
		})
		sent := 0
		for _, chat := range chats {
			if b.send(ctx, id, chat.ChatID, msg) {
				sent++
			}
		}
		if id != 0 {
			unreachable, err := b.store.LabUnreachable(ctx, lab.ID)
			if err != nil {
				b.log.Warn("lab unreachable", "lab", lab.ID, "err", err)
			}
			for _, r := range unreachable {
				b.c.skip(ctx, id, r, r.Reason, msg)
			}
		}
		b.log.Info("announced lab", "lab", lab.ID, "title", lab.Title, "chats", sent)
	}
}

// announceTitle names a lab announcement in the journal.
func announceTitle(lab models.Lab) string {
	return "Новая лаба: " + lab.SubjectName + " — " + labTitle(lab)
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
	if len(chats) == 0 {
		return
	}
	id := b.c.open(ctx, store.NewBroadcast{
		Kind: models.BroadcastDigest, Key: "digest:" + today, Title: "Дайджест дедлайнов " + now.Format("02.01.2006"),
	})
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
			b.send(ctx, id, chat.ChatID, msg)
		} else {
			chatID := chat.ChatID
			b.c.skip(ctx, id, Recipient{ChatID: &chatID}, "Нет несданных лаб с близким дедлайном", "")
		}
	}
}

// send delivers a notification and records it in the journal under the
// broadcast; a blocked bot unsubscribes the chat. Reports success.
func (b *Bot) send(ctx context.Context, broadcastID, chatID int64, msg string) bool {
	err := b.c.deliver(ctx, broadcastID, Recipient{ChatID: &chatID}, msg, nil)
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

// journalKeep is how long broadcasts stay in the journal.
const journalKeep = 180 * 24 * time.Hour

// pruneJournal drops old broadcasts, at most once a day.
func (b *Bot) pruneJournal(ctx context.Context) {
	if time.Since(b.prunedAt) < 24*time.Hour {
		return
	}
	b.prunedAt = time.Now()
	if n, err := b.store.PruneBroadcasts(ctx, time.Now().Add(-journalKeep)); err != nil {
		b.log.Warn("prune broadcasts", "err", err)
	} else if n > 0 {
		b.log.Info("pruned broadcasts", "count", n)
	}
}

func (b *Bot) grades(ctx context.Context, chatID, telegramID int64) error {
	isu, err := b.store.GetUserISUByTelegramID(ctx, telegramID)
	if err != nil && !errors.Is(err, httpx.ErrNotFound) {
		return err
	}
	rows, err := b.store.ListGradesByISU(ctx, isu)
	if err != nil {
		return err
	}
	sources, err := b.store.ListShownGradeSources(ctx)
	if err != nil {
		return err
	}
	var lines []gradeLine
	for _, r := range rows {
		for _, s := range sources {
			if s.ID == r.SourceID {
				lines = append(lines, gradeLine{Source: s, Row: r})
			}
		}
	}
	return b.api.SendHTML(ctx, chatID, gradesMessage(b.opts.SiteURL, lines, isu != ""), SendOptions{ReplyMarkup: menu, DisablePreview: true})
}

// notifyGrades tells students about score changes found by the last sync.
func (b *Bot) notifyGrades(ctx context.Context) {
	changes, err := b.store.ListGradeChanges(ctx)
	if err != nil {
		b.log.Warn("grade changes", "err", err)
		return
	}
	// One broadcast per score sheet and pass of the scheduler.
	broadcasts := map[int64]int64{}
	for _, c := range changes {
		// Mark first, like lab announcements: a crash must not repeat the message.
		if err := b.store.MarkGradeNotified(ctx, c); err != nil {
			b.log.Warn("mark grade notified", "source", c.SourceID, "err", err)
			continue
		}
		// Поменялась только незаметная ячейка блока лабы — писать не о чем.
		msg := gradeChangeMessage(b.opts.SiteURL, c)
		if msg == "" {
			continue
		}
		id, ok := broadcasts[c.SourceID]
		if !ok {
			source := c.SourceID
			title := "Баллы: " + c.SubjectName
			if c.Title != "" && c.Title != c.SubjectName {
				title += " — " + c.Title
			}
			id = b.c.open(ctx, store.NewBroadcast{Kind: models.BroadcastGrades, Title: title, RefType: "grade_source", RefID: &source})
			broadcasts[c.SourceID] = id
		}
		b.send(ctx, id, c.ChatID, msg)
	}
}
