package students

import (
	"strings"
	"testing"
)

func TestParseTabs(t *testing.T) {
	text := "ИСУ ID\tФИО\tПоток\tГруппа\tПрофиль\n" +
		"561586\tМорозов Артур Иванович\t1\tM3104\tТоп-ИТ ПРО\r\n" +
		"409214\tНазаров Аркадий Дмитриевич\t1\tМ3104\t\n" +
		"\n" +
		"12\tБез Номера\t1\tM3104\t\n" +
		"561586\tМорозов Артур Иванович\t1\tM3105\tТоп-ИТ ПРО\n"
	rows, skipped := Parse(text)
	if len(rows) != 2 || skipped != 1 {
		t.Fatalf("rows %+v skipped %d", rows, skipped)
	}
	// The repeated number keeps the later row; the group gets a Cyrillic "М".
	if rows[0].ISU != "561586" || rows[0].FullName != "Морозов Артур Иванович" || rows[0].GroupName != "М3105" {
		t.Fatalf("first row %+v", rows[0])
	}
	if rows[1].GroupName != "М3104" {
		t.Fatalf("second row %+v", rows[1])
	}
}

func TestParseHTML(t *testing.T) {
	page := `<table><thead><tr><th>ИСУ ID</th><th>ФИО</th><th>Группа</th></tr></thead>
<tbody><tr class="x"><td>558064</td><td><a href="#">Муковоз Максим&nbsp;Александрович</a></td><td>M3104</td></tr>
<TR><TD>505122</TD><TD>Невский Егор Дмитриевич</TD><TD>M3104</TD></TR></tbody></table>`
	rows, skipped := Parse(page)
	if len(rows) != 2 || skipped != 0 {
		t.Fatalf("rows %+v skipped %d", rows, skipped)
	}
	if rows[0].FullName != "Муковоз Максим Александрович" {
		t.Fatalf("name %q", rows[0].FullName)
	}
}

func TestParseQuotedPrintable(t *testing.T) {
	page := "Content-Transfer-Encoding: quoted-printable\n\n<tr><td>558064</td><td>=D0=98=D0=B2=D0=B0=D0=BD =D0=9F=D0=B5=\n=D1=82=D1=80=D0=BE=D0=B2</td><td>M3104</td></tr>"
	rows, _ := Parse(page)
	if len(rows) != 1 || rows[0].FullName != "Иван Петров" {
		t.Fatalf("rows %+v", rows)
	}
}

func TestParseCSV(t *testing.T) {
	rows, _ := Parse(strings.Join([]string{"isu,name,group", "558064,Иванов Иван,М3105", "558065;Петров Пётр;m3105"}, "\n"))
	if len(rows) != 2 || rows[1].GroupName != "М3105" {
		t.Fatalf("rows %+v", rows)
	}
}
