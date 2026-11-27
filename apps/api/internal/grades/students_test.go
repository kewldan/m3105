package grades

import (
	"testing"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// Таблица алгебры одной группы: заголовок в две строки (ФИО объединена по
// вертикали), одна вкладка «Sheet1», вместо ИСУ — фамилия с инициалами.
const algebraSheet = "ФИО,Контрольная 1,,,,\n" +
	",\"Сумма\n[21 балл]\",\"1 (с. р.)\n[2 балла]\",\"2 (с. р.)\n[2 балла]\",\"1\n[2]\",\"2a\n[1]\"\n" +
	"Морозов А. И.,9,0,2,1,1\n" +
	"Невский Е. Д.,6.5,,,0.5,--\n" +
	"Седых В.А.,12,1,2,0,1\n"

func TestParseTabTwoRowHeader(t *testing.T) {
	src := models.GradeSource{NameColumn: "ФИО", TotalColumn: "Сумма", Columns: []models.GradeColumn{
		{Key: "sr1", Header: "1 (с. р.)"}, {Key: "sr2", Header: "2 (с. р.)"},
		{Key: "t1", Header: "1 [2]"}, {Key: "t2a", Header: "2a"},
	}}
	group := TabGroup("Sheet1", ParseTitle("<title>M3104. Алгебра - Google Drive</title>"))
	rows, err := ParseTab(records(t, algebraSheet), src, group)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("rows: %+v", rows)
	}
	m := rows[0]
	if m.FullName != "Морозов А. И." || m.Group != "М3104" || m.Total != 9 || m.RowKey != "name:морозов а. и." {
		t.Errorf("row: %+v", m)
	}
	for key, want := range map[string]float64{"sr1": 0, "sr2": 2, "t1": 1, "t2a": 1} {
		if v := m.Parts[key]; v == nil || *v != want {
			t.Errorf("%s = %v, want %v", key, v, want)
		}
	}
	if n := rows[1]; n.Parts["sr1"] != nil || n.Parts["t2a"] != nil || *n.Parts["t1"] != 0.5 {
		t.Errorf("пустые и «--» — null: %+v", n.Parts)
	}

	students := []models.Student{
		{ISU: "400001", FullName: "Морозов Артур Иванович", GroupName: "М3104"},
		{ISU: "400002", FullName: "Невский Егор Дмитриевич", GroupName: "М3104"},
		{ISU: "400003", FullName: "Невский Егор Денисович", GroupName: "М3104"}, // тёзка по инициалам
		{ISU: "400004", FullName: "Седых Виктория Алексеевна", GroupName: "М3104"},
		{ISU: "500001", FullName: "Морозов Андрей Ильич", GroupName: "М3105"}, // другая группа
	}
	FillFromCourse(rows, students)
	if rows[0].ISU != "400001" || rows[0].RowKey != "400001" || rows[0].FullName != "Морозов Артур Иванович" {
		t.Errorf("Морозов: %+v", rows[0])
	}
	if rows[1].ISU != "" || rows[1].FullName != "Невский Е. Д." {
		t.Errorf("двух кандидатов не сопоставляем: %+v", rows[1])
	}
	if rows[2].ISU != "400004" {
		t.Errorf("«В.А.» без пробела: %+v", rows[2])
	}
}

func TestTabGroup(t *testing.T) {
	cases := []struct{ tab, title, want string }{
		{"M3105", "Баллы М3104", "M3105"},
		{"Sheet1", "M3104. Алгебра", "М3104"},
		{"Лист1", "Английский М3104, М3105", "Лист1"},
		{"Sheet1", "Алгебра", "Sheet1"},
		{"Sheet1", "XM31045", "Sheet1"},
	}
	for _, c := range cases {
		if got := models.NormalizeGroup(TabGroup(c.tab, c.title)); got != models.NormalizeGroup(c.want) {
			t.Errorf("TabGroup(%q, %q) = %q, want %q", c.tab, c.title, got, c.want)
		}
	}
	if got := ParseTitle("<html><title>M3104. Алгебра &amp; геометрия - Google Таблицы</title>"); got != "M3104. Алгебра & геометрия" {
		t.Errorf("title: %q", got)
	}
}
