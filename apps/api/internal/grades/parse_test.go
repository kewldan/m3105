package grades

import (
	"encoding/csv"
	"strings"
	"testing"

	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

func records(t *testing.T, s string) [][]string {
	t.Helper()
	r := csv.NewReader(strings.NewReader(s))
	r.FieldsPerRecord = -1
	out, err := r.ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	return out
}

var src = models.GradeSource{NameColumn: "ФИО", IDColumn: "ИСУ", TotalColumn: "Итог", Columns: []models.GradeColumn{
	{Key: "lab1", Header: "1"}, {Key: "lab2", Header: "2"}, {Key: "exam", Header: "Экзамен"},
}}

func TestParseTab(t *testing.T) {
	rows, err := ParseTab(records(t, "Программирование,,,\n"+
		",ФИО, github,-,+,D,12,1,-,+,D,12,2,Экзамен,Итог,ИСУ\n"+
		`1,Иванов  Иван Иванович,ivan,2,,0,12,"11,04",,,,,0,,"11,04",100001`+"\n"+
		`2,Петров Пётр,petr,,,,,,,,,,,,,`+"\n"+
		",,,,,,,,,,,,,,,\n"+
		`Среднее,,,,,,,,,,,,,,"5,5",`+"\n"), src, "M3105")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d rows: %+v", len(rows), rows)
	}
	a, b := rows[0], rows[1]
	if a.FullName != "Иванов Иван Иванович" || a.ISU != "100001" || a.RowKey != "100001" || a.Group != "М3105" || a.Total != 11.04 {
		t.Fatalf("row 1: %+v", a)
	}
	if *a.Parts["lab1"] != 11.04 || *a.Parts["lab2"] != 0 || a.Parts["exam"] != nil {
		t.Fatalf("row 1 parts: %+v", a.Parts)
	}
	if b.ISU != "" || b.RowKey != "name:петров пётр" || b.Total != 0 {
		t.Fatalf("row 2: %+v", b)
	}

	if _, err := ParseTab(records(t, ",,2,3\n,M3101,5,0\n"), src, "Статистика"); err != ErrNoHeader {
		t.Fatalf("service tab: %v", err)
	}
}

func TestParseNumber(t *testing.T) {
	for in, want := range map[string]float64{"11,04": 11.04, "12": 12, " 1 234,5 ": 1234.5, "−3": -3, "74,1": 74.1} {
		if got := ParseNumber(in); got == nil || *got != want {
			t.Errorf("%q: got %v, want %v", in, got, want)
		}
	}
	for _, in := range []string{"", "н/я", "#REF!"} {
		if got := ParseNumber(in); got != nil {
			t.Errorf("%q: got %v, want nil", in, *got)
		}
	}
}

func TestParseTabs(t *testing.T) {
	html := `items.push({name: "M3101", pageUrl: "https:\/\/docs.google.com\/x?headers\x3dtrue&gid=770184490", gid: "770184490",initialSheet: ("770184490" == gid)});` +
		`items.push({name: "Стат", pageUrl: "x", gid: "1799829153",initialSheet: false});`
	tabs := ParseTabs(html)
	if len(tabs) != 2 || tabs[0] != (Tab{Name: "M3101", GID: "770184490"}) || tabs[1].Name != "Стат" {
		t.Fatalf("tabs: %+v", tabs)
	}
}

func TestMatchByName(t *testing.T) {
	users := []models.User{
		{ID: 1, Name: "Иван Иванов", GroupName: "М3105"},
		{ID: 2, Name: "Пётр Сидоров", GroupName: "М3105"},   // ё в таблице записана через е
		{ID: 3, Name: "Анна Кузнецова", GroupName: "М3104"}, // в таблице она в другой группе
		{ID: 4, Name: "Олег", GroupName: "М3105"},           // одно слово — не сопоставляем
		{ID: 5, Name: "Мария Смирнова", GroupName: "М3105"}, // две тёзки в группе
		{ID: 6, Name: "Дмитрий Орлов", GroupName: "М3105"},  // два аккаунта на одну строку
		{ID: 7, Name: "Орлов Дмитрий", GroupName: "М3105"},
	}
	rows := []store.GradeCandidate{
		{ISU: "1", FullName: "Иванов Иван Иванович", Group: "М3105"},
		{ISU: "2", FullName: "Сидоров Петр Петрович", Group: "М3105"},
		{ISU: "3", FullName: "Кузнецова Анна Сергеевна", Group: "М3105"},
		{ISU: "4", FullName: "Олег Олегов", Group: "М3105"},
		{ISU: "5", FullName: "Смирнова Мария Ивановна", Group: "М3105"},
		{ISU: "6", FullName: "Смирнова Мария Петровна", Group: "М3105"},
		{ISU: "7", FullName: "Орлов Дмитрий Андреевич", Group: "М3105"},
	}
	got := MatchByName(users, rows)
	if len(got) != 2 || got[1] != "1" || got[2] != "2" {
		t.Fatalf("matches: %v", got)
	}
}
