package badges

import (
	"bytes"
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func sample(k int) Card {
	all := []Subject{
		{Name: "Программирование", Short: "Прога", Score: 26.4, Max: 100, Group: Place{4, 22}, Course: Place{27, 445}, Median: 22.3},
		{Name: "АиСД", Score: 31.83, Max: 100, Group: Place{4, 22}, Course: Place{181, 555}, Median: 29},
		{Name: "Дискретная математика", Short: "Дискретка", Score: 22.9, Max: 100, Group: Place{9, 23}, Course: Place{124, 221}, Median: 20},
		{Name: "Английский <язык> & \"речь\"", Score: 0, Max: 40},
		{Name: "Матанализ", Short: "Матан", Score: 100, Max: 100, Group: Place{1, 23}, Course: Place{1, 500}, Median: 50},
		{Name: "Очень длинное название дисциплины, которое не влезет в карточку", Score: 55.5, Max: 60, Group: Place{20, 22}, Course: Place{400, 445}},
	}
	return Card{Name: "Тенишев Даниил", Handle: "kewldan", Group: "М3105", Seed: "561445",
		Date: time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC), Subjects: all[:k]}
}

func wellFormed(t *testing.T, name string, out []byte) {
	t.Helper()
	d := xml.NewDecoder(bytes.NewReader(out))
	for {
		_, err := d.Token()
		if err == io.EOF {
			return
		}
		if err != nil {
			t.Fatalf("%s: not well-formed XML: %v\n%s", name, err, out)
		}
	}
}

func TestRenderAllStyles(t *testing.T) {
	dir := os.Getenv("BADGES_OUT") // BADGES_OUT=/tmp/x go test ./internal/badges — посмотреть глазами
	for _, k := range []int{1, 3, 6} {
		c := sample(k)
		for _, s := range Styles() {
			out, ok := Render(s.Name, c)
			if !ok {
				t.Fatalf("style %s not found", s.Name)
			}
			wellFormed(t, s.Name, out)
			if !bytes.HasPrefix(out, []byte("<svg ")) || !bytes.Contains(out, []byte("<title>")) {
				t.Fatalf("%s: no svg root or title", s.Name)
			}
			if k >= 4 && bytes.Contains(out, []byte("<язык>")) {
				t.Fatalf("%s: subject name is not escaped", s.Name)
			}
			if dir != "" {
				_ = os.WriteFile(filepath.Join(dir, s.Name+"-"+string(rune('0'+k))+".svg"), out, 0o644)
			}
		}
	}
	if _, ok := Render("nope", sample(3)); ok {
		t.Fatal("unknown style rendered")
	}
}

func TestEmptyAndHiddenName(t *testing.T) {
	out, _ := Render("dark", Card{Group: "М3105"})
	if !strings.Contains(string(out), "нет баллов") {
		t.Fatalf("empty card: %s", out)
	}
	wellFormed(t, "message", out)
	c := sample(3)
	c.Name = ""
	for _, s := range Styles() {
		out, _ := Render(s.Name, c)
		if strings.Contains(string(out), "Тенишев") {
			t.Fatalf("%s: hidden name leaked", s.Name)
		}
	}
}

func TestNumbers(t *testing.T) {
	for in, want := range map[float64]string{26.4: "26,4", 31.83: "31,83", 100: "100", 22.899999: "22,9", 0: "0"} {
		if got := ru(in); got != want {
			t.Errorf("ru(%v) = %q, want %q", in, got, want)
		}
	}
	if p := (Place{27, 445}); p.top() != 7 || p.tier() != 0 {
		t.Errorf("place 27/445: top %d tier %d", p.top(), p.tier())
	}
	if p := (Place{124, 221}); p.top() != 57 || p.tier() != 2 {
		t.Errorf("place 124/221: top %d tier %d", p.top(), p.tier())
	}
	if level("М3105") != 1 || level("М3205") != 2 || level("x") != 1 {
		t.Error("level from group")
	}
}
