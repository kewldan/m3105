package bot

import (
	"fmt"
	"html"
	"math"
	"strconv"
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

// newUserMessage tells the admin about a new student account.
// claimedMessage tells the admin who picked whom in the course list.
func claimedMessage(site string, u models.User, st models.Student) string {
	status := fmt.Sprintf("✅ Выбрал себя в списке: <b>%s</b>, %s.", esc(st.FullName), esc(st.GroupName))
	return userCard(site, "👤 <b>Новый студент на сайте</b>", u, status)
}

// unclaimedMessage replaces claimedMessage after the admin pressed the button.
func unclaimedMessage(site string, u models.User) string {
	return userCard(site, "↩️ <b>Выбор отменён</b>", u, "Аккаунт снова должен выбрать себя в списке.")
}

func userCard(site, title string, u models.User, status string) string {
	var b strings.Builder
	b.WriteString(title + "\n\n")
	b.WriteString("Telegram: <b>" + esc(u.TelegramName) + "</b>")
	if u.TelegramUsername != "" {
		fmt.Fprintf(&b, " · <a href=\"https://t.me/%s\">@%s</a>", esc(u.TelegramUsername), esc(u.TelegramUsername))
	}
	b.WriteString("\n\n" + status)
	fmt.Fprintf(&b, "\n\n<a href=\"%s/admin/users\">Открыть «Студентов» в админке</a>", strings.TrimRight(site, "/"))
	return b.String()
}

var editVerbs = map[string]string{"create": "создал(а)", "update": "изменил(а)", "delete": "удалил(а)"}

var editKinds = map[string]string{"labs": "лабу", "notes": "конспект", "quizzes": "квиз", "events": "событие", "practice": "сдачу"}

// editedMessage is the admin's note about an editor's change.
func editedMessage(site string, e models.Edit) string {
	var b strings.Builder
	fmt.Fprintf(&b, "✏️ <b>%s</b> %s %s\n%s", esc(e.ActorName), editVerbs[e.Action], editKinds[e.Entity], esc(e.Title))
	if len(e.Audience) > 0 {
		b.WriteString("\nДля: " + esc(strings.Join(e.Audience, ", ")))
	}
	fmt.Fprintf(&b, "\n\n<a href=\"%s/admin/journal\">Журнал правок</a>", strings.TrimRight(site, "/"))
	return b.String()
}

// fmtScore prints 11.04 as "11,04" and 12 as "12".
func fmtScore(v float64) string {
	return strings.ReplaceAll(strconv.FormatFloat(math.Round(v*100)/100, 'f', -1, 64), ".", ",")
}

func fmtPart(v *float64) string {
	if v == nil {
		return "—"
	}
	return fmtScore(*v)
}

func gradesURL(site string, sourceID int64) string {
	return fmt.Sprintf("%s/grades?source=%d", strings.TrimRight(site, "/"), sourceID)
}

func gradeTitle(title, subject string) string {
	if title != "" {
		return title
	}
	return subject
}

// gradeChangeMessage tells a student their score moved, part by part, and
// what happened to their labs: accepted without the theory, a new plus, a
// later deadline stage. Empty when there is nothing to tell.
func gradeChangeMessage(site string, c store.GradeChange) string {
	var lines []string
	for _, col := range c.Columns {
		before, after := c.NotifiedParts[col.Key], c.Parts[col.Key]
		if fmtPart(before) != fmtPart(after) {
			lines = append(lines, fmt.Sprintf("• %s: %s → %s", esc(col.Label), fmtPart(before), fmtPart(after)))
		}
		cells, ok := c.Details[col.Key]
		if !ok || !c.Scheme.Enabled() {
			continue
		}
		lines = append(lines, labChanges(col, c.Scheme.Lab(c.NotifiedDetails[col.Key], col.Max), c.Scheme.Lab(cells, col.Max))...)
	}
	diff := c.Total - c.NotifiedTotal
	if len(lines) == 0 && math.Abs(diff) < 0.005 {
		return ""
	}
	var sb strings.Builder
	title := esc(gradeTitle(c.Title, c.SubjectName))
	switch {
	case math.Abs(diff) < 0.005:
		fmt.Fprintf(&sb, "📝 <b>%s</b>: <b>%s</b>", title, fmtScore(c.Total))
	case diff > 0:
		fmt.Fprintf(&sb, "📈 <b>%s</b>: %s → <b>%s</b> (+%s)", title, fmtScore(c.NotifiedTotal), fmtScore(c.Total), fmtScore(diff))
	default:
		fmt.Fprintf(&sb, "📉 <b>%s</b>: %s → <b>%s</b> (−%s)", title, fmtScore(c.NotifiedTotal), fmtScore(c.Total), fmtScore(-diff))
	}
	sb.WriteString("\n")
	for _, l := range lines {
		sb.WriteString(l + "\n")
	}
	fmt.Fprintf(&sb, "\n<a href=\"%s\">Рейтинг и разбивка на сайте</a>", gradesURL(site, c.SourceID))
	return sb.String()
}

// labChanges describes what changed in a lab block that the score alone
// does not show; the score line covers a passed theory.
func labChanges(col models.GradeColumn, before, after models.GradeLab) []string {
	var out []string
	label := esc(col.Label)
	if after.Status == models.LabAccepted && before.Status != models.LabAccepted {
		line := "• " + label + " принята, осталось сдать теормин"
		if after.Potential != nil {
			line += " — на кону " + fmtScore(*after.Potential)
		}
		out = append(out, line)
	}
	if after.Plus != before.Plus {
		out = append(out, fmt.Sprintf("• %s: плюсиков %s → %s", label, fmtScore(before.Plus), fmtScore(after.Plus)))
	}
	if after.Minus != before.Minus {
		out = append(out, fmt.Sprintf("• %s: минусов %s → %s", label, fmtScore(before.Minus), fmtScore(after.Minus)))
	}
	if after.Stage != nil && *after.Stage > 0 && (before.Stage == nil || *before.Stage < *after.Stage) {
		out = append(out, fmt.Sprintf("• %s: просрочка, %d-я ступень — лаба даст ×%s", label, *after.Stage, fmtScore(*after.Factor)))
	}
	return out
}

// gradeLine is one subject in the /grades answer.
type gradeLine struct {
	Source models.GradeSource
	Row    store.MyGradeRow
}

func gradesMessage(site string, lines []gradeLine, linked bool) string {
	root := strings.TrimRight(site, "/")
	if !linked {
		return "🎓 Баллы видны, когда к аккаунту привязан номер ИСУ: <a href=\"" + root + "/me\">укажи его в профиле</a>.\n\nАккаунт на сайте создаётся входом через Telegram."
	}
	if len(lines) == 0 {
		return "🎓 Пока ни в одной таблице с баллами нет строки с твоим номером ИСУ. Проверить номер: <a href=\"" + root + "/me\">профиль</a>."
	}
	var sb strings.Builder
	sb.WriteString("🎓 <b>Твои баллы</b>\n")
	for _, l := range lines {
		fmt.Fprintf(&sb, "\n<b>%s</b> — %s из %s (%s)\n", esc(l.Source.Label()), fmtScore(l.Row.Total), fmtScore(l.Source.MaxTotal), models.Letter(l.Row.Total, l.Source.MaxTotal))
		fmt.Fprintf(&sb, "Место: %d из %d в группе, %d из %d на курсе\n", l.Row.GroupRank, l.Row.GroupSize, l.Row.CourseRank, l.Row.CourseSize)
		var parts []string
		for _, col := range l.Source.Columns {
			if v := l.Row.Parts[col.Key]; v != nil {
				parts = append(parts, esc(col.Label)+": "+fmtScore(*v))
			}
		}
		if len(parts) > 0 {
			sb.WriteString(strings.Join(parts, " · ") + "\n")
		}
		if l.Source.Scheme.Enabled() {
			sb.WriteString(pendingTheory(l.Source, l.Row.Details))
		}
	}
	sb.WriteString("\n<a href=\"" + root + "/grades\">Рейтинг на сайте</a>")
	return sb.String()
}

// pendingTheory lists accepted labs that wait for the theory, with what
// passing it would give.
func pendingTheory(src models.GradeSource, details map[string]models.LabCells) string {
	labs := src.Scheme.Labs(src.Columns, details)
	var items []string
	sum := 0.0
	for _, col := range src.Columns {
		lab, ok := labs[col.Key]
		if !ok || lab.Status != models.LabAccepted {
			continue
		}
		item := esc(col.Label)
		if lab.Potential != nil {
			item += " (" + fmtScore(*lab.Potential) + ")"
			sum += *lab.Potential
		}
		items = append(items, item)
	}
	if len(items) == 0 {
		return ""
	}
	out := "⏳ Ждут теормина: " + strings.Join(items, ", ")
	if sum > 0 {
		out += " — на кону " + fmtScore(sum)
	}
	return out + "\n"
}

func practiceURL(site string, sessionID int64) string {
	return site + "/practice?session=" + strconv.FormatInt(sessionID, 10)
}

func practiceTitle(sess models.PracticeSession, loc *time.Location) string {
	name := sess.SubjectShortName
	if name == "" {
		name = sess.SubjectName
	}
	return fmt.Sprintf("«%s», %s", esc(name), fmtWhen(sess.StartsAt, loc))
}

func swapRequestMessage(site string, sess models.PracticeSession, loc *time.Location, from string, theirs, yours SwapPlace) string {
	return fmt.Sprintf("🔁 <b>%s</b> предлагает поменяться местами в очереди на сдачу %s:\n"+
		"ваше %d-е место (лаба №%d) на %d-е (лаба №%d).\n\nОтветьте кнопками ниже или на сайте: %s",
		esc(from), practiceTitle(sess, loc), yours.Place, yours.Lab, theirs.Place, theirs.Lab, practiceURL(site, sess.ID))
}

func swapAcceptedMessage(site string, sess models.PracticeSession, loc *time.Location, with string, place int) string {
	return fmt.Sprintf("✅ Обмен с <b>%s</b> состоялся: теперь вы %d-е в очереди на сдачу %s.\n%s",
		esc(with), place, practiceTitle(sess, loc), practiceURL(site, sess.ID))
}

func swapDeclinedMessage(site string, sess models.PracticeSession, loc *time.Location, with string) string {
	return fmt.Sprintf("❌ Обмен не состоялся: <b>%s</b> отказывается меняться местами в очереди на сдачу %s.\n%s",
		esc(with), practiceTitle(sess, loc), practiceURL(site, sess.ID))
}

// swapDoneMessage replaces the request after the receiver agreed in Telegram.
func swapDoneMessage(site string, sess models.PracticeSession, loc *time.Location, with string, place int) string {
	return fmt.Sprintf("✅ Вы поменялись местами с <b>%s</b>: теперь вы %d-е в очереди на сдачу %s.\n%s",
		esc(with), place, practiceTitle(sess, loc), practiceURL(site, sess.ID))
}

// swapRefusedMessage replaces the request after the receiver said no in Telegram.
func swapRefusedMessage(site string, sess models.PracticeSession, loc *time.Location, with string) string {
	return fmt.Sprintf("Вы отказались меняться местами с <b>%s</b> в очереди на сдачу %s.\n%s",
		esc(with), practiceTitle(sess, loc), practiceURL(site, sess.ID))
}

func practicePlace(sess models.PracticeSession, loc *time.Location) string {
	s := fmtWhen(sess.StartsAt, loc)
	if sess.Location != "" {
		s += ", " + esc(sess.Location)
	}
	return s
}

// practiceCanceledMessage tells a signed-up student their session will not
// take place. moved is where their signups went; otherwise next, if any, is
// where they can sign up instead.
func practiceCanceledMessage(site string, sess models.PracticeSession, loc *time.Location, moved, next *models.PracticeSession) string {
	var sb strings.Builder
	sb.WriteString("❌ Сдача " + practiceTitle(sess, loc) + " отменена")
	if sess.CancelReason != "" {
		sb.WriteString(": " + esc(sess.CancelReason))
	}
	sb.WriteString(".\n\n")
	switch {
	case moved != nil:
		sb.WriteString("Ваша запись перенесена на " + practicePlace(*moved, loc) + ".\n" + practiceURL(site, moved.ID))
	case next != nil:
		sb.WriteString("Ближайшая сдача — " + practicePlace(*next, loc) + ", запишитесь заново.\n" + practiceURL(site, next.ID))
	default:
		sb.WriteString("Запишитесь на другую сдачу: " + site + "/practice")
	}
	return sb.String()
}

// practiceMovedMessage tells a signed-up student the session changed time or room.
func practiceMovedMessage(site string, before, after models.PracticeSession, loc *time.Location) string {
	return fmt.Sprintf("📅 Сдача %s перенесена: теперь %s. Ваша запись в силе.\n%s",
		practiceTitle(before, loc), practicePlace(after, loc), practiceURL(site, after.ID))
}

// practiceRestoredMessage: a canceled session is back.
func practiceRestoredMessage(site string, sess models.PracticeSession, loc *time.Location) string {
	return fmt.Sprintf("✅ Сдача %s снова в расписании, ваша запись в силе.\n%s",
		practiceTitle(sess, loc), practiceURL(site, sess.ID))
}
