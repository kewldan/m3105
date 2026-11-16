package badges

import (
	"fmt"
	"math"
	"strings"
	"unicode/utf8"
)

// gh is a GitHub-like palette.
type gh struct {
	bg, border, accent, text, muted, track string
	// tiers colour places from the top quarter to the bottom one.
	tiers [4]string
}

var (
	ghDark = gh{"#0d1117", "#30363d", "#4493f8", "#e6edf3", "#9198a1", "#21262d",
		[4]string{"#3fb950", "#d29922", "#db6d28", "#f85149"}}
	ghLight = gh{"#ffffff", "#d0d7de", "#0969da", "#1f2328", "#59636e", "#eaeef2",
		[4]string{"#1a7f37", "#9a6700", "#bc4c00", "#d1242f"}}
)

func anyMedian(c Card) bool {
	for _, s := range c.Subjects {
		if _, ok := s.medianFrac(); ok {
			return true
		}
	}
	return false
}

// classic: header, then a bar per subject with the group median tick.
func classic(t gh) func(Card) string {
	return func(c Card) string {
		k := len(c.Subjects)
		const w = 495.0
		h := float64(154 + 66*(k-1))
		var b svg
		b.open(w, h, c.label())
		b.rect(0.5, 0.5, w-1, h-1, fmt.Sprintf(`rx="6" fill="%s" stroke="%s"`, t.bg, t.border))
		b.text(25, 38, font(sans, 18, `font-weight="600" fill="`+t.accent+`"`), join("Баллы", c.Group))
		b.text(470, 38, font(sans, 18, `text-anchor="end" font-weight="600" fill="`+t.text+`"`), "Σ "+ru(c.total()))
		b.text(25, 58, font(sans, 12, `fill="`+t.muted+`"`), clip(join(c.Name, org, c.date()), 52))
		if anyMedian(c) {
			b.rect(366, 49, 2, 11, `fill="`+t.text+`"`)
			b.text(470, 58, font(sans, 12, `text-anchor="end" fill="`+t.muted+`"`), "медиана группы")
		}
		for i, s := range c.Subjects {
			y := float64(96 + 66*i)
			b.text(25, y, font(sans, 14, `font-weight="600" fill="`+t.text+`"`), clip(s.Name, 38))
			b.textRaw(470, y, font(sans, 14, `text-anchor="end" fill="`+t.muted+`"`),
				fmt.Sprintf(`<tspan font-weight="700" fill="%s">%s</tspan> / %s`, t.text, ru(s.Score), ru(s.max())))
			b.rect(25, y+9, 445, 8, `rx="4" fill="`+t.track+`"`)
			if f := s.frac(); f > 0 {
				b.rect(25, y+9, math.Max(8, 445*f), 8, `rx="4" fill="`+t.accent+`"`)
			}
			if m, ok := s.medianFrac(); ok {
				b.rect(25+445*m-1, y+5, 2, 16, `fill="`+t.text+`"`)
			}
			b.text(25, y+37, font(sans, 12, `fill="`+t.muted+`"`), placeLine(s))
		}
		return b.done()
	}
}

// rings: a progress ring per subject.
func rings(t gh) func(Card) string {
	return func(c Card) string {
		k := len(c.Subjects)
		w := math.Max(495, float64(165*k))
		col := w / float64(k)
		const h, r = 232.0, 40.0
		circ := 2 * math.Pi * r
		var b svg
		b.open(w, h, c.label())
		b.rect(0.5, 0.5, w-1, h-1, fmt.Sprintf(`rx="6" fill="%s" stroke="%s"`, t.bg, t.border))
		b.text(25, 38, font(sans, 18, `font-weight="600" fill="`+t.accent+`"`), "Баллы за семестр")
		b.text(w-25, 38, font(sans, 12, `text-anchor="end" fill="`+t.muted+`"`), join(org, c.Group, c.date()))
		for i, s := range c.Subjects {
			cx := col * (float64(i) + 0.5)
			b.p(`<circle cx="%s" cy="112" r="40" fill="none" stroke="%s" stroke-width="9"/>`, n(cx), t.track)
			if f := s.frac(); f > 0 {
				b.p(`<circle cx="%s" cy="112" r="40" fill="none" stroke="%s" stroke-width="9" stroke-linecap="round" stroke-dasharray="%.1f %.1f" transform="rotate(-90 %s 112)"/>`,
					n(cx), t.accent, f*circ, circ, n(cx))
			}
			mid := `text-anchor="middle" `
			b.text(cx, 115, font(sans, 20, mid+`font-weight="700" fill="`+t.text+`"`), ru(s.Score))
			b.text(cx, 131, font(sans, 10, mid+`fill="`+t.muted+`"`), "из "+ru(s.max()))
			b.text(cx, 184, font(sans, 13, mid+`font-weight="600" fill="`+t.text+`"`), clip(s.short(), 20))
			b.text(cx, 202, font(sans, 11, mid+`fill="`+t.muted+`"`), shortPlace(s, ""))
		}
		return b.done()
	}
}

// scoreboard: big numbers in columns.
func scoreboard(t gh) func(Card) string {
	return func(c Card) string {
		k := float64(len(c.Subjects))
		w := math.Max(840, 64+k*237.3+(k-1)*32)
		col := (w - 64 - (k-1)*32) / k
		const h = 252.0
		var b svg
		b.open(w, h, c.label())
		b.rect(0.5, 0.5, w-1, h-1, fmt.Sprintf(`rx="10" fill="%s" stroke="%s"`, t.bg, t.border))
		b.text(32, 44, font(sans, 12, `font-weight="600" letter-spacing="1.5" fill="`+t.muted+`"`),
			upper(join(c.Name, "баллы за семестр")))
		b.textRaw(w-32, 44, font(sans, 12, `text-anchor="end" fill="`+t.muted+`"`),
			fmt.Sprintf(`%s · <tspan font-weight="700" fill="%s">Σ %s</tspan>`, esc(join(org, c.Group, c.date())), t.text, ru(c.total())))
		b.p(`<path d="M32 60 H%s" stroke="%s"/>`, n(w-32), t.border)
		for i, s := range c.Subjects {
			x := 32 + float64(i)*(col+32)
			b.text(x, 88, font(sans, 14, `font-weight="600" fill="`+t.muted+`"`), clip(s.Name, int(col/8.5)))
			b.textRaw(x, 138, font(sans, 16, `fill="`+t.text+`"`),
				fmt.Sprintf(`<tspan font-size="48" font-weight="700" letter-spacing="-1">%s</tspan><tspan font-size="16" fill="%s" dx="6">/ %s</tspan>`,
					ru(s.Score), t.muted, ru(s.max())))
			b.rect(x, 156, col, 6, `rx="3" fill="`+t.track+`"`)
			f := s.frac()
			if f > 0 {
				b.rect(x, 156, col*f, 6, `rx="3" fill="`+t.accent+`"`)
			}
			if m, ok := s.medianFrac(); ok {
				b.rect(x+col*m-1, 152, 2, 14, `fill="`+t.text+`"`)
			}
			b.p(`<circle cx="%s" cy="159" r="6" fill="%s" stroke="%s" stroke-width="2.5"/>`, n(x+col*f), t.accent, t.bg)
			if s.Group.known() {
				b.textRaw(x, 190, font(sans, 13, `fill="`+t.text+`"`),
					fmt.Sprintf(`<tspan font-weight="700">%d место</tspan> в группе из %d`, s.Group.Rank, s.Group.Size))
			}
			if s.Course.known() {
				b.text(x, 210, font(sans, 12, `fill="`+t.muted+`"`),
					fmt.Sprintf("%d из %d на курсе · топ-%d%%", s.Course.Rank, s.Course.Size, s.Course.top()))
			}
		}
		legend := "полоса — баллы"
		if anyMedian(c) {
			legend += " · ┃ медиана группы"
		}
		b.text(w-32, 238, font(sans, 11, `text-anchor="end" fill="`+t.muted+`"`), legend)
		return b.done()
	}
}

// contrib: a GitHub contribution grid, a cell per 2 % of the maximum.
type cells struct{ empty, partial, below, above string }

var (
	contribDark  = cells{"#151b23", "#0e4429", "#26a641", "#39d353"}
	contribLight = cells{"#ebedf0", "#9be9a8", "#30a14e", "#216e39"}
)

func contrib(t gh, p cells) func(Card) string {
	return func(c Card) string {
		k := len(c.Subjects)
		const w = 495.0
		h := float64(232 + 46*(k-3))
		h = math.Max(h, 140)
		var b svg
		b.open(w, h, c.label())
		b.rect(0.5, 0.5, w-1, h-1, fmt.Sprintf(`rx="6" fill="%s" stroke="%s"`, t.bg, t.border))
		b.text(25, 36, font(sans, 16, `font-weight="600" fill="`+t.text+`"`), join("Баллы", c.Group))
		b.text(470, 36, font(sans, 12, `text-anchor="end" fill="`+t.muted+`"`), join("Σ "+ru(c.total()), c.date()))
		for i, s := range c.Subjects {
			top := float64(62 + 46*i)
			b.text(25, top+10, font(sans, 13, `font-weight="600" fill="`+t.text+`"`), clip(s.short(), 14))
			sub := ru(s.Score) + "/" + ru(s.max())
			if s.Group.known() {
				sub += " · №" + s.Group.slash()
			}
			b.text(25, top+26, font(sans, 11, `fill="`+t.muted+`"`), sub)
			unit := s.max() / 50
			v := s.Score / unit
			for cell := range 50 {
				fill := p.empty
				switch {
				case float64(cell+1) <= v:
					fill = p.below
					if s.Median > 0 && float64(cell)*unit >= s.Median {
						fill = p.above
					}
				case float64(cell) < v:
					fill = p.partial
				}
				x := 146 + 13*float64(cell/2)
				y := top + 13*float64(cell%2)
				b.rect(x, y, 11, 11, `rx="2" fill="`+fill+`"`)
			}
		}
		legend := "1 клетка = 2% максимума"
		if len(c.Subjects) > 0 && allMax(c, c.Subjects[0].max()) {
			legend = "1 клетка = " + ru(c.Subjects[0].max()/50) + " балла"
		}
		if anyMedian(c) {
			legend += " · ярче — выше медианы группы"
		}
		b.text(25, h-13, font(sans, 11, `fill="`+t.muted+`"`), legend)
		for i, f := range []string{p.empty, p.partial, p.below, p.above} {
			b.rect(407+13*float64(i), h-22, 11, 11, `rx="2" fill="`+f+`"`)
		}
		return b.done()
	}
}

func allMax(c Card, m float64) bool {
	for _, s := range c.Subjects {
		if s.max() != m {
			return false
		}
	}
	return true
}

// terminal: a shell window printing a table.
func terminal(c Card) string {
	t := ghDark
	k := len(c.Subjects)
	const w = 495.0
	line := float64(114 + 24*(k-1) + 14)
	h := line + 86
	var b svg
	b.open(w, h, c.label())
	b.rect(0.5, 0.5, w-1, h-1, fmt.Sprintf(`rx="8" fill="%s" stroke="%s"`, t.bg, t.border))
	b.p(`<path d="M1 30 H494" stroke="%s"/>`, t.border)
	for i, col := range []string{"#f85149", "#d29922", "#3fb950"} {
		b.p(`<circle cx="%d" cy="15.5" r="5" fill="%s"/>`, 18+18*i, col)
	}
	b.text(247.5, 20, font(mono, 11, `text-anchor="middle" fill="`+t.muted+`"`), "m3105.ru/grades")
	prompt := fmt.Sprintf(`<tspan fill="%s">%s@itmo</tspan><tspan fill="%s">:~$</tspan>`, t.tiers[0], esc(c.handle()), t.muted)
	b.textRaw(20, 58, font(mono, 13, `fill="`+t.text+`"`), prompt+" grades --group "+esc(c.Group))
	head := font(mono, 11, `fill="`+t.muted+`"`)
	b.text(20, 88, head, "ПРЕДМЕТ")
	b.text(262, 88, `text-anchor="end" `+head, "БАЛЛ")
	b.text(360, 88, `text-anchor="end" `+head, "ГРУППА")
	b.text(475, 88, `text-anchor="end" `+head, "КУРС")
	for i, s := range c.Subjects {
		y := float64(114 + 24*i)
		b.text(20, y, font(mono, 13, `fill="`+t.text+`"`), clip(s.short(), 22))
		b.text(262, y, font(mono, 13, `text-anchor="end" font-weight="700" fill="`+t.text+`"`), fx(s.Score))
		b.text(360, y, font(mono, 13, `text-anchor="end" fill="`+t.tiers[s.Group.tier()]+`"`), s.Group.slash())
		b.text(475, y, font(mono, 13, `text-anchor="end" fill="`+t.tiers[s.Course.tier()]+`"`), s.Course.slash())
	}
	b.p(`<path d="M20 %s H475" stroke="%s" stroke-dasharray="3 3"/>`, n(line), t.border)
	b.text(20, line+22, font(mono, 13, `fill="`+t.muted+`"`), "итого")
	b.text(262, line+22, font(mono, 13, `text-anchor="end" font-weight="700" fill="`+t.tiers[0]+`"`), fx(c.total()))
	b.text(475, line+22, font(mono, 11, `text-anchor="end" fill="`+t.muted+`"`), "обновлено "+c.date())
	b.textRaw(20, line+54, font(mono, 13, `fill="`+t.text+`"`), prompt+`<tspan dx="6">█</tspan>`)
	return b.done()
}

var neonColors = []string{"#ff2bd6", "#00f0ff", "#b6ff3b", "#ffb400"}

// neon: synthwave glow over a perspective grid.
func neon(c Card) string {
	k := len(c.Subjects)
	const w = 495.0
	h := float64(284 + 60*(k-3))
	h = math.Max(h, 164)
	horizon := h - 32
	var b svg
	b.open(w, h, c.label())
	b.p(`<defs><filter id="g" x="-20%%" y="-50%%" width="140%%" height="200%%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`)
	b.rect(0.5, 0.5, w-1, h-1, `rx="8" fill="#0a0614" stroke="#2a1747"`)
	for i, d := range []float64{0, 7, 20, 39} {
		b.p(`<path d="M1 %s H494" stroke="#3b1d6e" opacity="%.2f"/>`, n(horizon+d), 0.9-0.15*float64(i))
	}
	for i := range 17 {
		b.p(`<path d="M%s %s L%s %s" stroke="#3b1d6e" opacity="0.6"/>`,
			n(135.5+14*float64(i)), n(horizon), n(-232.5+60*float64(i)), n(h-1))
	}
	b.text(25, 42, font(sans, 18, `font-weight="800" fill="#00f0ff" letter-spacing="3" filter="url(#g)"`), strings.TrimSuffix("БАЛЛЫ // "+c.Group, " // "))
	b.text(470, 42, font(sans, 18, `text-anchor="end" font-weight="800" fill="#ff2bd6" letter-spacing="1" filter="url(#g)"`), "Σ "+ru(c.total()))
	for i, s := range c.Subjects {
		col := neonColors[i%len(neonColors)]
		y := float64(82 + 60*i)
		b.text(25, y, font(sans, 12, `font-weight="600" fill="#e9d9ff" letter-spacing="2"`), clip(upper(s.Name), 30))
		b.text(470, y+2, font(sans, 22, `text-anchor="end" font-weight="800" fill="`+col+`" filter="url(#g)"`), ru(s.Score))
		b.p(`<path d="M25 %s H470" stroke="#2a1747" stroke-width="3" stroke-linecap="round"/>`, n(y+13))
		if f := s.frac(); f > 0 {
			b.p(`<path d="M25 %s H%s" stroke="%s" stroke-width="3" stroke-linecap="round" filter="url(#g)"/>`, n(y+13), n(25+445*f), col)
		}
		b.text(25, y+32, font(sans, 11, `fill="#a58fd0"`), shortPlace(s, " курса"))
	}
	return b.done()
}

var pixelColors = []string{"#5ce65c", "#4cc9f0", "#ffd166", "#ff6b6b"}

// pixel: a retro game HUD with segmented health bars.
func pixel(c Card) string {
	k := len(c.Subjects)
	const w = 495.0
	h := float64(300 + 66*(k-3))
	h = math.Max(h, 168)
	var b svg
	b.open(w, h, c.label())
	b.rect(0, 0, w, h, `fill="#10141f"`)
	b.rect(4, 4, w-8, h-8, `fill="none" stroke="#f2f2e9" stroke-width="4"`)
	b.rect(12, 12, w-24, h-24, `fill="none" stroke="#3a4257" stroke-width="2"`)
	b.text(26, 42, font(mono, 14, `font-weight="700" fill="#f2f2e9" letter-spacing="1"`), "PLAYER: "+clip(upper(c.handle()), 20))
	b.text(469, 42, font(mono, 14, `text-anchor="end" font-weight="700" fill="#ffd166" letter-spacing="1"`),
		join(fmt.Sprintf("LVL %d", level(c.Group)), c.Group))
	const segs, segW = 20, 18.4
	step := (443 - segW) / (segs - 1)
	for i, s := range c.Subjects {
		col := pixelColors[i%len(pixelColors)]
		y := float64(78 + 66*i)
		b.text(26, y, font(mono, 13, `font-weight="700" fill="#f2f2e9" letter-spacing="1"`), clip(upper(s.short()), 24))
		b.text(469, y, font(mono, 13, `text-anchor="end" font-weight="700" fill="`+col+`"`), fx(s.Score)+"/"+ru(s.max()))
		v := s.frac() * segs
		for j := range segs {
			fill, op := "#262d3d", "1"
			switch {
			case float64(j+1) <= v:
				fill = col
			case float64(j) < v:
				fill, op = col, "0.4"
			}
			b.rect(26+step*float64(j), y+8, segW, 14, fmt.Sprintf(`fill="%s" opacity="%s"`, fill, op))
		}
		b.text(26, y+40, font(mono, 11, `fill="#9aa3b5" letter-spacing="0.5"`),
			"RANK #"+s.Group.slash()+" · COURSE #"+s.Course.slash())
	}
	b.text(26, h-24, font(mono, 14, `font-weight="700" fill="#f2f2e9" letter-spacing="1"`),
		"SCORE "+fmt.Sprintf("%06.2f", c.total()))
	b.text(469, h-24, font(mono, 14, `text-anchor="end" font-weight="700" fill="#ffd166" letter-spacing="1"`), "► CONTINUE?")
	return b.done()
}

var brutalColors = []string{"#ff5ca8", "#3d7bff", "#00b86b", "#ffd400"}

// brutal: thick outlines, a hard shadow and loud rank boxes.
func brutal(c Card) string {
	k := len(c.Subjects)
	const w = 495.0
	h := float64(292 + 72*(k-3))
	h = math.Max(h, 148)
	var b svg
	b.open(w, h, c.label())
	b.rect(0, 0, w, h, `fill="#f4f0e6"`)
	b.rect(14, 14, 473, h-22, `fill="#000"`)
	b.rect(8, 8, 473, h-22, `fill="#fff" stroke="#000" stroke-width="3"`)
	b.rect(8, 8, 473, 52, `fill="#ffd400" stroke="#000" stroke-width="3"`)
	b.text(24, 43, font(black, 22, `font-weight="900" fill="#000"`), strings.TrimSpace("БАЛЛЫ "+c.Group))
	b.text(465, 43, font(black, 22, `text-anchor="end" font-weight="900" fill="#000"`), "Σ "+ru(c.total()))
	for i, s := range c.Subjects {
		y := float64(72 * i)
		b.text(24, 90+y, font(black, 14, `font-weight="900" fill="#000"`), clip(upper(s.Name), 26))
		b.text(24, 112+y, font(helv, 11, `font-weight="700" fill="#000" letter-spacing="0.5"`),
			upper(s.Group.slash()+" в группе · "+s.Course.slash()+" на курсе"))
		b.text(398, 108+y, font(black, 32, `text-anchor="end" font-weight="900" fill="#000"`), ru(s.Score))
		b.rect(410, 76+y, 56, 40, `fill="`+brutalColors[i%len(brutalColors)]+`" stroke="#000" stroke-width="3"`)
		rank := "—"
		if s.Group.known() {
			rank = fmt.Sprintf("#%d", s.Group.Rank)
		}
		b.text(438, 103+y, font(black, 18, `text-anchor="middle" font-weight="900" fill="#000"`), rank)
		if i < k-1 {
			b.p(`<path d="M8 %s H481" stroke="#000" stroke-width="3"/>`, n(132+y))
		}
	}
	return b.done()
}

// swiss: one huge total and a typographic grid of columns.
func swiss(c Card) string {
	k := float64(len(c.Subjects))
	w := math.Max(495, 50+148.33*k)
	col := (w - 50) / k
	const h = 296.0
	var b svg
	b.open(w, h, c.label())
	b.rect(0.5, 0.5, w-1, h-1, `fill="#ffffff" stroke="#d9d9d9"`)
	b.rect(25, 25, 14, 14, `fill="#e30613"`)
	b.text(48, 37, font(helv, 12, `font-weight="700" fill="#111111"`), join(c.Group, org))
	b.text(w-25, 37, font(helv, 12, `text-anchor="end" fill="#5c5c5c"`), c.date())
	b.text(20, 128, font(helv, 86, `font-weight="700" fill="#111111" letter-spacing="-4"`), ru(c.total()))
	b.text(w-25, 112, font(helv, 12, `text-anchor="end" fill="#5c5c5c"`), "сумма баллов")
	b.text(w-25, 128, font(helv, 12, `text-anchor="end" fill="#5c5c5c"`), disciplines(len(c.Subjects)))
	b.rect(25, 150, w-50, 3, `fill="#111111"`)
	for i, s := range c.Subjects {
		x := 25 + float64(i)*col
		b.text(x, 200, font(helv, 36, `font-weight="700" fill="#111111" letter-spacing="-1"`), ru(s.Score))
		b.text(x, 224, font(helv, 13, `font-weight="700" fill="#111111"`), clip(s.short(), int(col/8)))
		if s.Group.known() {
			b.text(x, 246, font(helv, 13, `font-weight="700" fill="#e30613"`), fmt.Sprintf("№%d из %d", s.Group.Rank, s.Group.Size))
		}
		if s.Course.known() {
			b.text(x, 266, font(helv, 11, `fill="#5c5c5c"`), s.Course.slash()+" на курсе")
		}
		if i > 0 {
			b.rect(x-12, 172, 1, 100, `fill="#d9d9d9"`)
		}
	}
	return b.done()
}

// gradebook: a paper record book with a stamp.
func gradebook(c Card) string {
	k := len(c.Subjects)
	const w = 495.0
	itog := float64(140 + 30*(k-1) + 38)
	h := itog + 66
	ink, paper, brown, rule := "#2b2118", "#f6f1e3", "#7a5a2b", "#c9b98f"
	var b svg
	b.open(w, h, c.label())
	b.rect(0.5, 0.5, w-1, h-1, `rx="4" fill="`+paper+`" stroke="`+rule+`"`)
	b.rect(8.5, 8.5, w-17, h-17, `rx="2" fill="none" stroke="`+rule+`" stroke-dasharray="1 3"`)
	b.text(28, 40, font(serif, 11, `font-weight="700" fill="`+brown+`" letter-spacing="3"`), "ЗАЧЁТНАЯ КНИЖКА")
	name := c.Name
	if name == "" {
		name = "Студент " + c.Group
	}
	b.text(28, 68, font(serif, 24, `fill="`+ink+`" font-style="italic"`), clip(name, 24))
	b.text(467, 40, font(serif, 11, `text-anchor="end" fill="`+brown+`" letter-spacing="1"`), join(org, c.Group))
	b.text(467, 60, font(serif, 12, `text-anchor="end" fill="`+brown+`" font-style="italic"`), season(c.Date))
	b.p(`<path d="M28 84 H467 M28 88 H467" stroke="%s"/>`, brown)
	head := `font-weight="700" fill="` + brown + `" letter-spacing="2"`
	b.text(28, 110, font(serif, 10, head), "ДИСЦИПЛИНА")
	b.text(330, 110, font(serif, 10, `text-anchor="end" `+head), "БАЛЛЫ")
	b.text(467, 110, font(serif, 10, `text-anchor="end" `+head), "МЕСТО")
	for i, s := range c.Subjects {
		y := float64(140 + 30*i)
		b.text(28, y, font(serif, 16, `fill="`+ink+`"`), clip(s.Name, 28))
		b.text(330, y, font(serif, 16, `text-anchor="end" font-weight="700" fill="`+ink+`"`), ru(s.Score))
		place := "—"
		if s.Group.known() {
			place = fmt.Sprintf("%d из %d", s.Group.Rank, s.Group.Size)
		}
		b.text(467, y, font(serif, 15, `text-anchor="end" fill="`+ink+`" font-style="italic"`), place)
		b.p(`<path d="M28 %s H467" stroke="%s" stroke-dasharray="2 3"/>`, n(y+10), rule)
	}
	b.text(28, itog, font(serif, 16, `font-weight="700" fill="`+ink+`"`), "Итого")
	b.text(330, itog, font(serif, 16, `text-anchor="end" font-weight="700" fill="`+ink+`"`), ru(c.total()))
	b.p(`<path d="M260 %s H330 M260 %s H330" stroke="%s"/>`, n(itog+8), n(itog+11), ink)
	b.text(28, itog+38, font(serif, 11, `fill="`+brown+`"`), "подпись студента:")
	b.text(130, itog+38, font(serif, 20, `fill="#1d3a8a" font-style="italic"`), clip(c.handle(), 18))
	cy := n(itog + 14)
	b.p(`<g transform="rotate(-14 418 %s)" opacity="0.78"><circle cx="418" cy="%s" r="34" fill="none" stroke="#b3261e" stroke-width="2.5"/><circle cx="418" cy="%s" r="27" fill="none" stroke="#b3261e" stroke-width="1"/>`, cy, cy, cy)
	b.text(418, itog+12, font(serif, 14, `text-anchor="middle" font-weight="700" fill="#b3261e" letter-spacing="1"`), org)
	b.text(418, itog+27, font(serif, 9, `text-anchor="middle" font-weight="700" fill="#b3261e"`), c.Date.Format("02.01.06"))
	b.p(`</g>`)
	return b.done()
}

// receipt: a till receipt with a torn edge and a barcode.
func receipt(c Card) string {
	k := len(c.Subjects)
	const w = 300.0
	line := float64(112 + 52*(k-1) + 44)
	h := line + 210
	ink, grey := "#1b1b1b", "#5a5a5a"
	var b svg
	b.open(w, h, c.label())
	var edge strings.Builder
	fmt.Fprintf(&edge, "M0 0 H300 V%s", n(h-8))
	for x := 292; x >= 4; x -= 8 {
		y := h - 1
		if (x/8)%2 == 0 {
			y = h - 8
		}
		fmt.Fprintf(&edge, " L%d %s", x, n(y))
	}
	fmt.Fprintf(&edge, " L0 %s Z", n(h-8))
	b.p(`<path d="%s" fill="#fbfbf7" stroke="#d8d6cc"/>`, edge.String())
	mid := `text-anchor="middle" `
	b.text(150, 40, font(mono, 15, mid+`font-weight="700" fill="`+ink+`" letter-spacing="1"`), org)
	b.text(150, 60, font(mono, 11, mid+`fill="`+ink+`"`), "КАССОВЫЙ ЧЕК № "+c.Group)
	b.text(150, 76, font(mono, 11, mid+`fill="`+ink+`"`), c.date()+"   СТУДЕНТ: "+clip(upper(c.handle()), 14))
	dash := func(y float64) { b.p(`<path d="M18 %s H282" stroke="%s" stroke-dasharray="4 3"/>`, n(y), ink) }
	dash(90)
	best := Place{}
	for i, s := range c.Subjects {
		y := float64(112 + 52*i)
		b.text(18, y, font(mono, 12, `font-weight="700" fill="`+ink+`"`), clip(upper(s.Name), 36))
		b.text(18, y+17, font(mono, 11, `fill="`+grey+`"`), "1 x "+fx(s.Score)+" / "+ru(s.max()))
		b.text(282, y+17, font(mono, 12, `text-anchor="end" font-weight="700" fill="`+ink+`"`), "="+fx(s.Score))
		b.text(32, y+33, font(mono, 11, `fill="`+grey+`"`), "место в группе "+s.Group.slash())
		if s.Course.known() && (!best.known() || s.Course.top() < best.top()) {
			best = s.Course
		}
	}
	dash(line)
	b.text(18, line+26, font(mono, 18, `font-weight="700" fill="`+ink+`"`), "ИТОГО")
	b.text(282, line+26, font(mono, 18, `text-anchor="end" font-weight="700" fill="`+ink+`"`), "="+fx(c.total()))
	b.text(18, line+46, font(mono, 11, `fill="`+grey+`"`), "ЛУЧШЕЕ МЕСТО НА КУРСЕ")
	b.text(282, line+46, font(mono, 11, `text-anchor="end" fill="`+ink+`"`), best.slash())
	b.text(18, line+62, font(mono, 11, `fill="`+grey+`"`), "СЕМЕСТР")
	status := "НЕ ЗАКРЫТ"
	if c.Closed {
		status = "ЗАКРЫТ"
	}
	b.text(282, line+62, font(mono, 11, `text-anchor="end" fill="`+ink+`"`), status)
	dash(line + 76)
	r := seed(c.Seed + c.Group)
	for x := 40.0; x < 258; {
		bw := float64(1 + r%3)
		r = r*6364136223846793005 + 1442695040888963407
		b.rect(x, line+90, bw, 42, `fill="`+ink+`"`)
		x += bw + float64(2+(r>>33)%2)
		r = r*6364136223846793005 + 1442695040888963407
	}
	b.text(150, line+148, font(mono, 11, mid+`fill="`+ink+`"`), "m3105.ru/grades")
	b.text(150, line+166, font(mono, 11, mid+`fill="`+grey+`"`), "ЖДЁМ НА СЛЕДУЮЩЕЙ ЛАБЕ")
	return b.done()
}

// shield is one flat badge of the shields row.
type shield struct{ label, value, color string }

var shieldTiers = [4]string{"#4c1", "#dfb317", "#fe7d37", "#e05d44"}

// shields: a row of shields.io-like badges, one per subject plus the sum.
func shields(c Card) string {
	parts := make([]shield, 0, len(c.Subjects)+1)
	for _, s := range c.Subjects {
		v := ru(s.Score) + "/" + ru(s.max())
		if s.Group.known() {
			v += fmt.Sprintf(" · №%d", s.Group.Rank)
		}
		parts = append(parts, shield{strings.ToLower(clip(s.short(), 20)), v, shieldTiers[s.Group.tier()]})
	}
	if !c.NoTotal || len(parts) == 0 {
		parts = append(parts, shield{strings.TrimSpace(c.Group + " Σ"), ru(c.total()), "#007ec6"})
	}
	var b svg
	return b.shields(parts, c.label())
}

func (b *svg) shields(parts []shield, label string) string {
	const gap = 6.0
	type box struct {
		shield
		lw, vw, lt, vt float64
	}
	boxes := make([]box, len(parts))
	total := 0.0
	for i, p := range parts {
		lt, vt := math.Round(verdana(p.label)), math.Round(verdana(p.value))
		boxes[i] = box{p, lt + 12, vt + 12, lt, vt}
		total += lt + vt + 24
	}
	total += gap * float64(len(parts)-1)
	b.open(total, 20, label)
	x := 0.0
	for i, p := range boxes {
		w := p.lw + p.vw
		b.p(`<g transform="translate(%s 0)"><linearGradient id="s%d" x2="0" y2="100%%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`+
			`<clipPath id="r%d"><rect width="%s" height="20" rx="3" fill="#fff"/></clipPath>`+
			`<g clip-path="url(#r%d)"><rect width="%s" height="20" fill="#555"/><rect x="%s" width="%s" height="20" fill="%s"/><rect width="%s" height="20" fill="url(#s%d)"/></g>`,
			n(x), i, i, n(w), i, n(p.lw), n(p.lw), n(p.vw), p.color, n(w), i)
		b.p(`<g fill="#fff" text-anchor="middle" font-family="%s" font-size="11">`, verd)
		for _, t := range []struct {
			cx, tl float64
			s      string
		}{{p.lw / 2, p.lt, p.label}, {p.lw + p.vw/2, p.vt, p.value}} {
			b.p(`<text x="%s" y="15" fill="#010101" fill-opacity=".3" textLength="%s" lengthAdjust="spacingAndGlyphs">%s</text>`, n(t.cx), n(t.tl), esc(t.s))
			b.p(`<text x="%s" y="14" textLength="%s" lengthAdjust="spacingAndGlyphs">%s</text>`, n(t.cx), n(t.tl), esc(t.s))
		}
		b.p(`</g></g>`)
		x += w + gap
	}
	return b.done()
}

// verdana estimates the width of s in Verdana 11px.
func verdana(s string) float64 {
	w := 0.0
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			w += 7
		case r == ',' || r == '.' || r == ':' || r == ';':
			w += 4
		case r == ' ' || r == '·':
			w += 4.5
		case r == '/' || r == '-':
			w += 5
		case r == '№':
			w += 15
		case r == 'Σ':
			w += 7
		case r >= 'а' && r <= 'я' || r == 'ё':
			w += 6.6
		case r >= 'А' && r <= 'Я' || r == 'Ё':
			w += 8
		case r >= 'a' && r <= 'z':
			w += 6.5
		case r >= 'A' && r <= 'Z':
			w += 7.5
		case utf8.RuneLen(r) > 2:
			w += 11
		default:
			w += 7
		}
	}
	return w
}
