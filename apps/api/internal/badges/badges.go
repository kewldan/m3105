// Package badges draws a student's scores as SVG cards and shields-style
// badges for a GitHub README. Every style is a function of Card; layouts
// follow the mock-ups and stretch to any number of subjects.
package badges

import (
	"fmt"
	"hash/fnv"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// Place is a rank among Size people, 1 is the best; zero is unknown.
type Place struct {
	Rank int
	Size int
}

func (p Place) known() bool { return p.Rank > 0 && p.Size > 0 }

// top is the share of people at or above the place, in percent, rounded up.
func (p Place) top() int {
	if !p.known() {
		return 0
	}
	return max(1, min(100, int(math.Ceil(float64(p.Rank)*100/float64(p.Size)))))
}

// tier buckets the place by quarters: 0 is the top quarter, 3 the bottom.
func (p Place) tier() int {
	if !p.known() {
		return 1
	}
	q := float64(p.Rank) / float64(p.Size)
	switch {
	case q <= 0.25:
		return 0
	case q <= 0.5:
		return 1
	case q <= 0.75:
		return 2
	}
	return 3
}

func (p Place) slash() string {
	if !p.known() {
		return "—"
	}
	return fmt.Sprintf("%d/%d", p.Rank, p.Size)
}

// Subject is one score sheet on the card.
type Subject struct {
	Name   string // full: «Дискретная математика»
	Short  string // «Дискретка»; empty falls back to Name
	Score  float64
	Max    float64
	Group  Place
	Course Place
	// Median is the group's median score; 0 is unknown.
	Median float64
}

func (s Subject) short() string {
	if s.Short != "" {
		return s.Short
	}
	return s.Name
}

func (s Subject) max() float64 {
	if s.Max > 0 {
		return s.Max
	}
	return 100
}

func (s Subject) frac() float64 { return clamp01(s.Score / s.max()) }

func (s Subject) medianFrac() (float64, bool) {
	if s.Median <= 0 {
		return 0, false
	}
	return clamp01(s.Median / s.max()), true
}

// Card is everything a style may draw.
type Card struct {
	// Name is «Фамилия Имя»; empty hides it.
	Name string
	// Handle is a nickname for prompts and signatures (Telegram username).
	Handle string
	Group  string
	// Date is when the scores were last synced, in the site's time zone.
	Date time.Time
	// Closed: the semester is over.
	Closed   bool
	Subjects []Subject
	// NoTotal hides the sum on the shields row.
	NoTotal bool
	// Seed makes decorative noise (the receipt's barcode) stable per student.
	Seed string
}

func (c Card) total() float64 {
	var t float64
	for _, s := range c.Subjects {
		t += s.Score
	}
	return t
}

func (c Card) handle() string {
	if c.Handle != "" {
		return c.Handle
	}
	return "student"
}

func (c Card) date() string { return c.Date.Format("02.01.2006") }

func (c Card) label() string {
	var b strings.Builder
	b.WriteString("Баллы")
	if c.Name != "" {
		b.WriteString(" " + c.Name + ",")
	}
	if c.Group != "" {
		b.WriteString(" " + c.Group)
	}
	b.WriteString(":")
	for i, s := range c.Subjects {
		if i > 0 {
			b.WriteString(",")
		}
		fmt.Fprintf(&b, " %s %s из %s", s.Name, ru(s.Score), ru(s.max()))
	}
	return b.String()
}

// Style is a badge design the API serves at /badges/{Name}.
type Style struct {
	Name   string
	Title  string
	render func(Card) string
}

// styles in the order the site's builder shows them.
var styles = []Style{
	{"dark", "Классика · тёмная", classic(ghDark)},
	{"light", "Классика · светлая", classic(ghLight)},
	{"rings-dark", "Кольца · тёмная", rings(ghDark)},
	{"rings-light", "Кольца · светлая", rings(ghLight)},
	{"scoreboard-dark", "Табло · тёмная", scoreboard(ghDark)},
	{"scoreboard-light", "Табло · светлая", scoreboard(ghLight)},
	{"contrib-dark", "Сетка вкладов · тёмная", contrib(ghDark, contribDark)},
	{"contrib-light", "Сетка вкладов · светлая", contrib(ghLight, contribLight)},
	{"terminal", "Терминал", terminal},
	{"neon", "Неон", neon},
	{"pixel", "Пиксельный HUD", pixel},
	{"brutal", "Брутализм", brutal},
	{"swiss", "Швейцарский постер", swiss},
	{"gradebook", "Зачётка", gradebook},
	{"receipt", "Чек", receipt},
	{"shields", "Бейджи shields.io", shields},
}

// Styles lists every design.
func Styles() []Style { return styles }

// Render draws the card in the named style; false when there is no such style.
// A card without subjects becomes a message badge.
func Render(style string, c Card) ([]byte, bool) {
	for _, s := range styles {
		if s.Name == style {
			if len(c.Subjects) == 0 {
				return Message("нет баллов"), true
			}
			return []byte(s.render(c)), true
		}
	}
	return nil, false
}

// Message is a shields-style «m3105 | text» badge for errors.
func Message(text string) []byte {
	var b svg
	parts := []shield{{label: "m3105", value: text, color: "#e05d44"}}
	return []byte(b.shields(parts, "m3105: "+text))
}

// ---- drawing helpers ----

const (
	sans  = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif`
	mono  = `ui-monospace, SFMono-Regular, Menlo, 'JetBrains Mono', Consolas, 'DejaVu Sans Mono', monospace`
	serif = `Georgia, 'Times New Roman', 'DejaVu Serif', serif`
	helv  = `'Helvetica Neue', Helvetica, Arial, sans-serif`
	black = `'Arial Black', 'Helvetica Neue', Arial, sans-serif`
	verd  = `Verdana, Geneva, 'DejaVu Sans', sans-serif`
	// org is the university on the cards.
	org = "ИТМО"
)

type svg struct{ strings.Builder }

func (b *svg) p(format string, a ...any) {
	fmt.Fprintf(b, format, a...)
	b.WriteByte('\n')
}

func (b *svg) open(w, h float64, label string) {
	b.p(`<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="0 0 %s %s" role="img" aria-label="%s">`,
		n(w), n(h), n(w), n(h), esc(label))
	b.p(`<title>%s</title>`, esc(label))
}

func (b *svg) done() string {
	b.p(`</svg>`)
	return b.String()
}

// text writes a <text> element; attrs are raw, body is escaped.
func (b *svg) text(x, y float64, attrs, body string) {
	b.p(`<text x="%s" y="%s" %s>%s</text>`, n(x), n(y), attrs, esc(body))
}

// textRaw is text whose body is already markup (tspans).
func (b *svg) textRaw(x, y float64, attrs, body string) {
	b.p(`<text x="%s" y="%s" %s>%s</text>`, n(x), n(y), attrs, body)
}

func (b *svg) rect(x, y, w, h float64, attrs string) {
	b.p(`<rect x="%s" y="%s" width="%s" height="%s" %s/>`, n(x), n(y), n(w), n(h), attrs)
}

func font(family string, size float64, extra string) string {
	s := fmt.Sprintf(`font-family="%s" font-size="%s"`, family, n(size))
	if extra != "" {
		s += " " + extra
	}
	return s
}

var escaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")

func esc(s string) string { return escaper.Replace(s) }

// n formats a coordinate: one decimal at most.
func n(f float64) string { return strconv.FormatFloat(math.Round(f*10)/10, 'f', -1, 64) }

// ru is a score as Russians write it: «26,4», «31,83», «100».
func ru(v float64) string {
	return strings.Replace(strconv.FormatFloat(math.Round(v*100)/100, 'f', -1, 64), ".", ",", 1)
}

// fx is a score with two decimals, for monospace columns: «26.40».
func fx(v float64) string { return strconv.FormatFloat(v, 'f', 2, 64) }

func clamp01(f float64) float64 {
	if math.IsNaN(f) || f < 0 {
		return 0
	}
	return min(f, 1)
}

// clip shortens s to at most k runes with an ellipsis.
func clip(s string, k int) string {
	r := []rune(s)
	if len(r) <= k {
		return s
	}
	return strings.TrimSpace(string(r[:k-1])) + "…"
}

func upper(s string) string { return strings.ToUpper(s) }

func join(parts ...string) string {
	out := parts[:0:0]
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, " · ")
}

// placeLine is «4 место в группе из 22 · 27 из 445 на курсе (топ-7%)».
func placeLine(s Subject) string {
	var parts []string
	if s.Group.known() {
		parts = append(parts, fmt.Sprintf("%d место в группе из %d", s.Group.Rank, s.Group.Size))
	}
	if s.Course.known() {
		parts = append(parts, fmt.Sprintf("%d из %d на курсе (топ-%d%%)", s.Course.Rank, s.Course.Size, s.Course.top()))
	}
	return join(parts...)
}

// shortPlace is «4/22 в группе · топ-7%».
func shortPlace(s Subject, suffix string) string {
	var parts []string
	if s.Group.known() {
		parts = append(parts, s.Group.slash()+" в группе")
	}
	if s.Course.known() {
		parts = append(parts, fmt.Sprintf("топ-%d%%%s", s.Course.top(), suffix))
	}
	return join(parts...)
}

// level is the course year from an ITMO group code: «М3105» → 1.
func level(group string) int {
	r := []rune(group)
	if len(r) >= 3 && unicode.IsDigit(r[2]) && r[2] != '0' {
		return int(r[2] - '0')
	}
	return 1
}

func disciplines(k int) string {
	switch k {
	case 1:
		return "за одну дисциплину"
	case 2:
		return "за две дисциплины"
	case 3:
		return "за три дисциплины"
	case 4:
		return "за четыре дисциплины"
	}
	return fmt.Sprintf("за %d дисциплин", k)
}

func season(t time.Time) string {
	if m := t.Month(); m >= time.February && m <= time.August {
		return fmt.Sprintf("весенний семестр %d", t.Year())
	}
	y := t.Year()
	if t.Month() == time.January {
		y--
	}
	return fmt.Sprintf("осенний семестр %d", y)
}

func seed(s string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(s))
	return h.Sum64()
}
