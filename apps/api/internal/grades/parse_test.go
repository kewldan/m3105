package grades

import (
	"encoding/csv"
	"errors"
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
	if len(rows) != 1 {
		t.Fatalf("got %d rows: %+v", len(rows), rows)
	}
	a := rows[0]
	if a.FullName != "Иванов Иван Иванович" || a.ISU != "100001" || a.RowKey != "100001" || a.Group != "М3105" || a.Total != 11.04 {
		t.Fatalf("row 1: %+v", a)
	}
	if *a.Parts["lab1"] != 11.04 || *a.Parts["lab2"] != 0 || a.Parts["exam"] != nil {
		t.Fatalf("row 1 parts: %+v", a.Parts)
	}

	// Без столбца ИСУ строка узнаётся по ФИО.
	noID := src
	noID.IDColumn = ""
	rows, err = ParseTab(records(t, "ФИО,Итог\nПетров Пётр,\n"), noID, "M3104")
	if err != nil || len(rows) != 1 || rows[0].RowKey != "name:петров пётр" || rows[0].Total != 0 || rows[0].Group != "М3104" {
		t.Fatalf("row without ISU: %+v, %v", rows, err)
	}

	if _, err := ParseTab(records(t, ",,2,3\n,M3101,5,0\n"), src, "Статистика"); !errors.Is(err, ErrNoHeader) {
		t.Fatalf("service tab: %v", err)
	}
}

// Вёрстка таблицы АиСД: ИСУ в первом столбце без заголовка, группа — строкой
// над студентами, заголовки с пояснениями в скобках и переносами.
func TestParseTabSections(t *testing.T) {
	aisd := models.GradeSource{NameColumn: "ФИО", IDColumn: "#1", TotalColumn: "Итого", Columns: []models.GradeColumn{
		{Key: "lab0", Header: "ЛР0"}, {Key: "lab1", Header: "ЛР1"}, {Key: "t1", Header: "Т1"},
	}}
	rows, err := ParseTab(records(t, ",ФИО,ЛР1 (база),\"Т1\nИнтро\",Итого\n"+
		",max число баллов,6.00,5.00,100.00\n"+
		"M3104,,,,\n"+
		"558001,Иванов Иван Иванович,6.00,4.5,10.5\n"+
		"M3105,,,,\n"+
		"561445,Тенишев Даниил Александрович,,5.00,\n"), aisd, "семестр 1 потоки 1-2")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d rows: %+v", len(rows), rows)
	}
	if rows[0].Group != "М3104" || rows[0].ISU != "558001" || *rows[0].Parts["lab1"] != 6 || *rows[0].Parts["t1"] != 4.5 || rows[0].Total != 10.5 {
		t.Fatalf("row 1: %+v", rows[0])
	}
	if rows[1].Group != "М3105" || rows[1].ISU != "561445" || rows[1].Parts["lab1"] != nil || rows[1].Total != 5 {
		t.Fatalf("row 2: %+v", rows[1])
	}
	if _, ok := rows[1].Parts["lab0"]; ok {
		t.Fatal("a column missing on the tab must not become a part")
	}
}

// Вёрстка таблицы английского: «Total for the semester» и баллы — в строках
// над строкой с ФИО, итог не заполнен, считаем по разбивке.
func TestParseTabStackedHeaders(t *testing.T) {
	eng := models.GradeSource{NameColumn: "FULL NAME", IDColumn: "ISU ID", GroupColumn: "GROUP NUMBER", Columns: []models.GradeColumn{
		{Key: "hw1", Header: "H/W 1"}, {Key: "test1", Header: "Test 1"}, {Key: "mt1", Header: "Module Test 1"},
	}}
	rows, err := ParseTab(records(t, "MANUAL,,,,,weeks 1-16,,,Total for the semester\n"+
		",,,,,\"H/W 1\nW/B\n(min 5, max 7)\",\"Module Test 1\n(min 6)\",\"Test 1\n(min 1, max 4)\",\n"+
		",,,,,,,,,70%\n"+
		"№↓,ISU ID ↓,,FULL NAME ↓,GROUP NUMBER ↓,,,,\n"+
		"17,561445,,Тенишев Даниил Александрович,M3105,0,,4,0\n"+
		",,,,,,,,0\n"), eng, "BARS")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].ISU != "561445" || rows[0].Group != "М3105" || rows[0].Total != 4 ||
		*rows[0].Parts["hw1"] != 0 || *rows[0].Parts["test1"] != 4 || rows[0].Parts["mt1"] != nil {
		t.Fatalf("rows: %+v", rows)
	}
}

func TestFindColumn(t *testing.T) {
	header := []string{"", "ФИО", "ЛР1 (база)", "ЛР10", "Т1\n(интро)", "Итого"}
	for want, idx := range map[string]int{"#1": 0, "фио": 1, "ЛР1": 2, "ЛР10": 3, "т1": 4, "Т1 (интро)": 4, "ЛР2": -1, "": -1} {
		if got := findColumn(header, want); got != idx {
			t.Errorf("%q: got %d, want %d", want, got, idx)
		}
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
