package models

import (
	"fmt"
	"math"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// GradeScheme describes labs graded with modifiers, as in the programming
// course: next to each lab's total the sheet has a block of columns — the
// theory score, pluses, minuses and the deadline stage — and the lab gives
// theory × (1 + BonusPercent% × (pluses − minuses)) × LateFactors[stage].
//
// A breakdown column is a lab when the columns right to its left are titled
// with these headers (in any order, empty titles skipped); the run ends at
// the first other title, so the same "+" of every lab never gets mixed up.
// The zero value means the source has no labs.
type GradeScheme struct {
	// Theory is the header of the theory score column ("12"); required.
	Theory string `json:"theory"`
	// Plus, Minus and Late are the other block headers; empty — no such column.
	Plus  string `json:"plus"`
	Minus string `json:"minus"`
	Late  string `json:"late"`
	// BonusPercent is what one plus adds and one minus takes, in percent.
	BonusPercent float64 `json:"bonusPercent"`
	// LateFactors[n] multiplies the lab at deadline stage n (0 — on time);
	// later stages take the last factor.
	LateFactors []float64 `json:"lateFactors"`
}

// Enabled tells whether the source's breakdown has labs.
func (s GradeScheme) Enabled() bool { return s.Theory != "" }

// Headers maps each block header to its cell role.
func (s GradeScheme) Headers() map[string]string {
	out := map[string]string{}
	for role, h := range map[string]string{"theory": s.Theory, "plus": s.Plus, "minus": s.Minus, "late": s.Late} {
		if h != "" {
			out[h] = role
		}
	}
	return out
}

func (s *GradeScheme) validate(ve *httpx.ValidationError) {
	if s.LateFactors == nil {
		s.LateFactors = []float64{}
	}
	if !s.Enabled() {
		if s.Plus != "" || s.Minus != "" || s.Late != "" {
			ve.Add("scheme", "Укажите заголовок столбца с баллами за теормин")
		}
		*s = GradeScheme{LateFactors: []float64{}}
		return
	}
	seen := map[string]bool{}
	for _, h := range []string{s.Theory, s.Plus, s.Minus, s.Late} {
		if h != "" && seen[h] {
			ve.Add("scheme", fmt.Sprintf("Заголовок %q повторяется", h))
		}
		seen[h] = true
	}
	if s.BonusPercent < 0 || s.BonusPercent > 100 {
		ve.Add("scheme", "Плюсик — от 0 до 100%")
	}
	if len(s.LateFactors) > 10 {
		ve.Add("scheme", "Не больше 10 ступеней просрочки")
	}
	for _, f := range s.LateFactors {
		if f < 0 || f > 1 {
			ve.Add("scheme", "Коэффициенты просрочки — от 0 до 1")
			break
		}
	}
}

// LabCells are a lab block's cells of one student; nil — the cell is empty.
type LabCells struct {
	Theory *float64 `json:"theory,omitempty"`
	Plus   *float64 `json:"plus,omitempty"`
	Minus  *float64 `json:"minus,omitempty"`
	Late   *float64 `json:"late,omitempty"`
}

// LabStatus is how far a student got with a lab.
type LabStatus string

const (
	// LabNone: nothing in the block yet.
	LabNone LabStatus = "none"
	// LabAccepted: the lab is accepted (a deadline stage or modifiers are
	// set), but the theory is not passed, so it gives no points yet.
	LabAccepted LabStatus = "accepted"
	// LabDone: the theory score is in.
	LabDone LabStatus = "done"
)

// GradeLab is a lab block worked out by the scheme.
type GradeLab struct {
	Status LabStatus `json:"status"`
	// Theory is the theory score; nil until passed.
	Theory *float64 `json:"theory,omitempty"`
	// Plus and Minus may be fractional: a teacher gives half a minus.
	Plus  float64 `json:"plus,omitempty"`
	Minus float64 `json:"minus,omitempty"`
	// Stage is the deadline stage, nil when the cell is empty.
	Stage *int `json:"stage,omitempty"`
	// Factor is the multiplier of the stage.
	Factor *float64 `json:"factor,omitempty"`
	// Points is what the scheme gives for a done lab.
	Points *float64 `json:"points,omitempty"`
	// Potential is what an accepted lab gives once the theory is passed in full.
	Potential *float64 `json:"potential,omitempty"`
	// Bonus is what pluses and minuses changed (negative when minuses win).
	Bonus float64 `json:"bonus,omitempty"`
	// LateLoss is what the deadline stage took.
	LateLoss float64 `json:"lateLoss,omitempty"`
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func count(v *float64) float64 {
	if v == nil || *v < 0 {
		return 0
	}
	return *v
}

// factor is the multiplier at a deadline stage.
func (s GradeScheme) factor(stage int) float64 {
	if len(s.LateFactors) == 0 {
		return 1
	}
	return s.LateFactors[min(max(stage, 0), len(s.LateFactors)-1)]
}

// Lab works out one block; max is the most the lab gives with no modifiers.
func (s GradeScheme) Lab(c LabCells, maxPoints float64) GradeLab {
	l := GradeLab{Status: LabNone, Theory: c.Theory, Plus: count(c.Plus), Minus: count(c.Minus)}
	f := 1.0
	if c.Late != nil {
		stage := int(math.Round(count(c.Late)))
		f = s.factor(stage)
		l.Stage, l.Factor = &stage, &f
	}
	// Сколько минусов ни набери, ниже нуля лаба не опускается.
	mod := max(0, 1+s.BonusPercent/100*(l.Plus-l.Minus))
	switch {
	case c.Theory != nil:
		t := *c.Theory
		l.Status = LabDone
		points := round2(t * mod * f)
		l.Points = &points
		l.Bonus = round2(t * (mod - 1) * f)
		l.LateLoss = round2(t * (1 - f))
	case c.Late != nil || l.Plus > 0 || l.Minus > 0:
		l.Status = LabAccepted
		if maxPoints > 0 {
			p := round2(maxPoints * mod * f)
			l.Potential = &p
		}
	}
	return l
}

// Labs works out every lab block of a row; empty without a scheme.
func (s GradeScheme) Labs(cols []GradeColumn, details map[string]LabCells) map[string]GradeLab {
	out := map[string]GradeLab{}
	if !s.Enabled() {
		return out
	}
	for _, c := range cols {
		if cells, ok := details[c.Key]; ok {
			out[c.Key] = s.Lab(cells, c.Max)
		}
	}
	return out
}
