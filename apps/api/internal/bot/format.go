package bot

import (
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

var ruWeekdays = [...]string{"вс", "пн", "вт", "ср", "чт", "пт", "сб"}
var ruMonths = [...]string{"янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"}

func plural(n int, one, few, many string) string {
	n10, n100 := n%10, n%100
	switch {
	case n10 == 1 && n100 != 11:
		return one
	case n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20):
		return few
	default:
		return many
	}
}

// fmtWhen renders a deadline in the site timezone: "пн, 15 сен, 23:59".
func fmtWhen(t time.Time, loc *time.Location) string {
	t = t.In(loc)
	return fmt.Sprintf("%s, %d %s, %02d:%02d", ruWeekdays[t.Weekday()], t.Day(), ruMonths[t.Month()-1], t.Hour(), t.Minute())
}

// fmtRelative says how far a deadline is, by calendar days in the site timezone.
func fmtRelative(deadline, now time.Time, loc *time.Location) string {
	d := deadline.In(loc)
	n := now.In(loc)
	dayD := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, loc)
	dayN := time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, loc)
	days := int(dayD.Sub(dayN).Hours() / 24)
	switch {
	case deadline.Before(now):
		late := -days
		if late == 0 {
			return "просрочено сегодня"
		}
		return fmt.Sprintf("просрочено на %d %s", late, plural(late, "день", "дня", "дней"))
	case days == 0:
		left := int(deadline.Sub(now).Hours())
		if left < 1 {
			return "меньше часа"
		}
		return fmt.Sprintf("сегодня, через %d %s", left, plural(left, "час", "часа", "часов"))
	case days == 1:
		return "завтра"
	default:
		return fmt.Sprintf("через %d %s", days, plural(days, "день", "дня", "дней"))
	}
}

func labURL(site string, l models.Lab) string {
	return strings.TrimRight(site, "/") + "/labs/" + l.SubjectSlug + "/" + l.Slug
}

func labTitle(l models.Lab) string {
	return fmt.Sprintf("Лаба %d. %s", l.Number, l.Title)
}

func esc(s string) string { return html.EscapeString(s) }

// newLabMessage announces a freshly published lab.
func newLabMessage(site string, l models.Lab, now time.Time, loc *time.Location) string {
	var b strings.Builder
	fmt.Fprintf(&b, "🆕 <b>Новая лаба по предмету «%s»</b>\n\n", esc(l.SubjectName))
	fmt.Fprintf(&b, "<a href=\"%s\">%s</a>\n", labURL(site, l), esc(labTitle(l)))
	if l.Summary != "" {
		fmt.Fprintf(&b, "%s\n", esc(l.Summary))
	}
	if l.DeadlineAt != nil {
		fmt.Fprintf(&b, "\n⏰ Дедлайн: %s (%s)", fmtWhen(*l.DeadlineAt, loc), fmtRelative(*l.DeadlineAt, now, loc))
		if l.DeadlineNote != "" {
			fmt.Fprintf(&b, "\n%s", esc(l.DeadlineNote))
		}
	} else {
		b.WriteString("\n⏰ Дедлайн пока не назначен")
	}
	if l.MaxScore != nil {
		fmt.Fprintf(&b, "\n🏆 До %d %s", *l.MaxScore, plural(*l.MaxScore, "балла", "баллов", "баллов"))
	}
	return b.String()
}

func labLine(site string, l store.BotLab, now time.Time, loc *time.Location) string {
	mark := "🔹"
	if l.Done {
		mark = "✅"
	}
	line := fmt.Sprintf("%s <a href=\"%s\">%s</a> · %s", mark, labURL(site, l.Lab), esc(labTitle(l.Lab)), esc(l.SubjectShortName))
	if l.DeadlineAt != nil {
		line += fmt.Sprintf("\n    %s · %s", fmtWhen(*l.DeadlineAt, loc), fmtRelative(*l.DeadlineAt, now, loc))
	}
	return line
}

// deadlinesMessage lists pending (not done) labs: overdue first, then upcoming.
// linked tells whether a site account is attached, so "done" marks are meaningful.
func deadlinesMessage(site string, labs []store.BotLab, now time.Time, loc *time.Location, linked bool) string {
	var overdue, upcoming []store.BotLab
	for _, l := range labs {
		if l.Done || l.DeadlineAt == nil {
			continue
		}
		if l.DeadlineAt.Before(now) {
			overdue = append(overdue, l)
		} else {
			upcoming = append(upcoming, l)
		}
	}
	var b strings.Builder
	b.WriteString("📅 <b>Дедлайны несданных лаб</b>\n")
	if len(overdue) == 0 && len(upcoming) == 0 {
		b.WriteString("\nВсё сдано, ближайших дедлайнов нет 🎉")
	}
	if len(overdue) > 0 {
		b.WriteString("\n<b>Просрочено</b>\n")
		for _, l := range overdue {
			b.WriteString(labLine(site, l, now, loc) + "\n")
		}
	}
	if len(upcoming) > 0 {
		b.WriteString("\n<b>Впереди</b>\n")
		for _, l := range upcoming {
			b.WriteString(labLine(site, l, now, loc) + "\n")
		}
	}
	if !linked {
		fmt.Fprintf(&b, "\n<i>Войди на <a href=\"%s/login\">сайте</a> через Telegram и отмечай сданные лабы, тогда бот перестанет напоминать о них.</i>", strings.TrimRight(site, "/"))
	}
	return b.String()
}

// digestMessage is the daily reminder: overdue labs and those due within the window.
func digestMessage(site string, labs []store.BotLab, now time.Time, loc *time.Location, window time.Duration) string {
	var items []store.BotLab
	for _, l := range labs {
		if l.Done || l.DeadlineAt == nil {
			continue
		}
		if l.DeadlineAt.Before(now.Add(window)) {
			items = append(items, l)
		}
	}
	if len(items) == 0 {
		return ""
	}
	var b strings.Builder
	days := int(window.Hours() / 24)
	fmt.Fprintf(&b, "⏰ <b>Напоминание: %d %s с дедлайном в ближайшие %d %s</b>\n\n", len(items), plural(len(items), "лаба", "лабы", "лаб"), days, plural(days, "день", "дня", "дней"))
	for _, l := range items {
		b.WriteString(labLine(site, l, now, loc) + "\n")
	}
	return b.String()
}

// labsMessage lists every published lab grouped by subject.
func labsMessage(site string, labs []store.BotLab, now time.Time, loc *time.Location) string {
	if len(labs) == 0 {
		return "🧪 Опубликованных лаб пока нет."
	}
	var b strings.Builder
	b.WriteString("🧪 <b>Лабы семестра</b>\n")
	current := ""
	for _, l := range labs {
		if l.SubjectName != current {
			current = l.SubjectName
			fmt.Fprintf(&b, "\n<b>%s</b>\n", esc(current))
		}
		b.WriteString(labLine(site, l, now, loc) + "\n")
	}
	return b.String()
}
