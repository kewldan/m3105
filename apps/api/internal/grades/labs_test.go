package grades

import (
	"testing"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// opScheme is the programming course: ±4% per plus or minus, deadline stages
// cut the lab to 85, 65 and 50%.
var opScheme = models.GradeScheme{Theory: "12", Plus: "+", Minus: "-", Late: "D",
	BonusPercent: 4, LateFactors: []float64{1, 0.85, 0.65, 0.5}}

// Разметка как в таблице ОП: у каждой лабы блок «- + D 12» слева от её итога.
const opSheet = ",ФИО, github,-,+,D,12,1,-,+,D,12,2,Live,Итог,ИСУ\n" +
	`1,Иванов Иван,ivan,2,,0,12,"11,04",,6,0,,0,,"11,04",100001` + "\n" +
	`2,Петров Пётр,petr,1,,1,12,"9,792",,,,,,,"9,792",100002` + "\n" +
	`3,Сидоров Сид,sid,,,2,8,"5,2",,,,,,3,"8,2",100003` + "\n"

func opSource() models.GradeSource {
	return models.GradeSource{NameColumn: "ФИО", IDColumn: "ИСУ", TotalColumn: "Итог", Scheme: opScheme,
		Columns: []models.GradeColumn{
			{Key: "lab1", Label: "Лаба 1", Header: "1", Max: 12},
			{Key: "lab2", Label: "Лаба 2", Header: "2", Max: 12},
			{Key: "live", Label: "Live", Header: "Live"},
		}}
}

func TestParseLabBlocks(t *testing.T) {
	src := opSource()
	rows, err := ParseTab(records(t, opSheet), src, "M3105")
	if err != nil || len(rows) != 3 {
		t.Fatalf("rows: %+v, %v", rows, err)
	}
	a := rows[0]
	// Каждой лабе — свой блок, хотя заголовки «-», «+», «D», «12» у всех одинаковые.
	if c := a.Details["lab1"]; *c.Minus != 2 || c.Plus != nil || *c.Late != 0 || *c.Theory != 12 {
		t.Errorf("lab1 cells: %+v", c)
	}
	if c := a.Details["lab2"]; c.Minus != nil || *c.Plus != 6 || *c.Late != 0 || c.Theory != nil {
		t.Errorf("lab2 cells: %+v", c)
	}
	// Слева от Live сразу итог лабы 2 — блока нет, это не лаба.
	if _, ok := a.Details["live"]; ok {
		t.Errorf("live is not a lab: %+v", a.Details)
	}

	labs := src.Scheme.Labs(src.Columns, a.Details)
	if l := labs["lab1"]; l.Status != models.LabDone || *l.Points != 11.04 || l.Bonus != -0.96 || l.LateLoss != 0 {
		t.Errorf("lab1: %+v", l)
	}
	// Лаба принята с шестью плюсами, теормина нет: на кону 12 × 1,24.
	if l := labs["lab2"]; l.Status != models.LabAccepted || *l.Potential != 14.88 || l.Plus != 6 {
		t.Errorf("lab2: %+v", l)
	}

	b := src.Scheme.Labs(src.Columns, rows[1].Details)["lab1"]
	if *b.Points != 9.79 || *b.Factor != 0.85 || b.LateLoss != 1.8 || *b.Stage != 1 {
		t.Errorf("late lab: %+v", b)
	}
	if l := src.Scheme.Labs(src.Columns, rows[1].Details)["lab2"]; l.Status != models.LabNone {
		t.Errorf("empty block: %+v", l)
	}

	if w := CheckScheme(src, rows); len(w) != 0 {
		t.Errorf("sheet agrees with the scheme, got %v", w)
	}
	src.Scheme.LateFactors = []float64{1, 0.9}
	if w := CheckScheme(src, rows); len(w) != 2 {
		t.Errorf("changed factors must disagree twice, got %v", w)
	}
}

func TestLabScheme(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	// Дальше последней ступени коэффициент не падает.
	l := opScheme.Lab(models.LabCells{Late: f(7), Theory: f(12)}, 12)
	if *l.Factor != 0.5 || *l.Points != 6 {
		t.Errorf("past the last stage: %+v", l)
	}
	// Полминуса — тоже минус: 12 × (1 − 0,06).
	if l := opScheme.Lab(models.LabCells{Minus: f(1.5), Theory: f(12)}, 12); *l.Points != 11.28 {
		t.Errorf("half a minus: %+v", l)
	}
	// Минусы не уводят лабу ниже нуля.
	l = opScheme.Lab(models.LabCells{Minus: f(40), Theory: f(12)}, 12)
	if *l.Points != 0 {
		t.Errorf("many minuses: %+v", l)
	}
	if l := opScheme.Lab(models.LabCells{Plus: f(1)}, 0); l.Status != models.LabAccepted || l.Potential != nil {
		t.Errorf("unknown max: %+v", l)
	}
	if got := (models.GradeScheme{}).Labs(nil, map[string]models.LabCells{"a": {}}); len(got) != 0 {
		t.Errorf("no scheme: %+v", got)
	}
}
