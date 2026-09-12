package bot

import (
	"strings"
	"testing"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

var msk = time.FixedZone("MSK", 3*3600)

func lab(id int64, title string, deadline time.Time, done bool) store.BotLab {
	return store.BotLab{Lab: models.Lab{ID: id, Number: int(id), Title: title, Slug: "l", SubjectSlug: "s",
		SubjectName: "Прога", SubjectShortName: "Прога", DeadlineAt: &deadline}, Done: done}
}

func TestFmtRelative(t *testing.T) {
	now := time.Date(2026, 9, 12, 12, 0, 0, 0, msk)
	cases := map[string]time.Time{
		"сегодня, через 11 часов": time.Date(2026, 9, 12, 23, 59, 0, 0, msk),
		"завтра":               time.Date(2026, 9, 13, 9, 0, 0, 0, msk),
		"через 3 дня":          time.Date(2026, 9, 15, 23, 59, 0, 0, msk),
		"через 5 дней":         time.Date(2026, 9, 17, 0, 0, 0, 0, msk),
		"просрочено на 1 день": time.Date(2026, 9, 11, 23, 59, 0, 0, msk),
		"просрочено сегодня":   time.Date(2026, 9, 12, 8, 0, 0, 0, msk),
	}
	for want, at := range cases {
		if got := fmtRelative(at, now, msk); got != want {
			t.Errorf("fmtRelative(%v) = %q, want %q", at, got, want)
		}
	}
	if got := fmtWhen(time.Date(2026, 9, 14, 23, 59, 0, 0, msk), msk); got != "пн, 14 сен, 23:59" {
		t.Errorf("fmtWhen = %q", got)
	}
}

func TestDeadlinesMessage(t *testing.T) {
	now := time.Date(2026, 9, 12, 12, 0, 0, 0, msk)
	labs := []store.BotLab{
		lab(1, "Сдано", now.Add(24*time.Hour), true),
		lab(2, "Просрочка <b>", now.Add(-48*time.Hour), false),
		lab(3, "Скоро", now.Add(72*time.Hour), false),
	}
	msg := deadlinesMessage("https://m3105.ru/", labs, now, msk, false)
	for _, want := range []string{"Просрочено", "Впереди", "Лаба 2. Просрочка &lt;b&gt;", "Лаба 3. Скоро", "https://m3105.ru/labs/s/l", "Войди на"} {
		if !strings.Contains(msg, want) {
			t.Errorf("message lacks %q:\n%s", want, msg)
		}
	}
	if strings.Contains(msg, "Сдано") {
		t.Errorf("done lab must be hidden:\n%s", msg)
	}
	if got := deadlinesMessage("x", nil, now, msk, true); !strings.Contains(got, "Всё сдано") || strings.Contains(got, "Войди") {
		t.Errorf("empty message: %s", got)
	}
}

func TestDigestMessage(t *testing.T) {
	now := time.Date(2026, 9, 12, 10, 0, 0, 0, msk)
	labs := []store.BotLab{
		lab(1, "Далеко", now.Add(10*24*time.Hour), false),
		lab(2, "Рядом", now.Add(30*time.Hour), false),
		lab(3, "Готово", now.Add(30*time.Hour), true),
	}
	msg := digestMessage("https://m3105.ru", labs, now, msk, 72*time.Hour)
	if !strings.Contains(msg, "1 лаба с дедлайном в ближайшие 3 дня") || !strings.Contains(msg, "Рядом") || strings.Contains(msg, "Далеко") || strings.Contains(msg, "Готово") {
		t.Errorf("digest: %s", msg)
	}
	if digestMessage("x", labs[2:], now, msk, 72*time.Hour) != "" {
		t.Error("digest with nothing pending must be empty")
	}
}

func TestNewLabMessage(t *testing.T) {
	now := time.Date(2026, 9, 12, 10, 0, 0, 0, msk)
	l := lab(4, "Архиватор", now.Add(14*24*time.Hour), false).Lab
	score := 12
	l.MaxScore = &score
	l.Summary = "Сжатие & кодирование"
	msg := newLabMessage("https://m3105.ru", l, now, msk)
	for _, want := range []string{"Новая лаба", "Лаба 4. Архиватор", "Сжатие &amp; кодирование", "через 14 дней", "До 12 баллов"} {
		if !strings.Contains(msg, want) {
			t.Errorf("lacks %q:\n%s", want, msg)
		}
	}
}

func TestSplitMessage(t *testing.T) {
	long := strings.Repeat("строка\n", 1000)
	parts := splitMessage(long, 4000)
	if len(parts) < 2 {
		t.Fatalf("expected split, got %d parts", len(parts))
	}
	for _, p := range parts {
		if len(p) > 4000 {
			t.Errorf("part too long: %d", len(p))
		}
	}
}

func TestParseCommand(t *testing.T) {
	cases := map[string]string{
		"/start":              "/start",
		"  /labs  ":           "/labs",
		"/deadlines@edu_bot":  "/deadlines",
		"/notify@edu_bot off": "/notify",
		"/help\nтекст":        "/help",
		btnDeadlines:          btnDeadlines,
		" " + btnLabs + " ":   btnLabs,
		btnNotify:             btnNotify,
		btnSite:               btnSite,
		"привет бот":          "привет бот",
	}
	for in, want := range cases {
		if got := parseCommand(in); got != want {
			t.Errorf("parseCommand(%q) = %q, want %q", in, got, want)
		}
	}
}
