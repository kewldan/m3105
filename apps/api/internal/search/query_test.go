package search

import "testing"

func TestToTSQuery(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"пусто", "", ""},
		{"только знаки", "?!.. ***", ""},
		{"одно слово", "матан", "'матан':*"},
		{"несколько слов", "линейная алгебра", "'линейная':* & 'алгебра':*"},
		{"лишние пробелы и пунктуация", "  предел, функции!  ", "'предел':* & 'функции':*"},
		{"цифры остаются", "лаба 3", "'лаба':* & '3':*"},
		{"опасные символы", "a & b | c:*", "'a':* & 'b':* & 'c':*"},
		{"апостроф экранируется", "d'Artagnan", "'d':* & 'Artagnan':*"},
		{"длинный запрос обрезается", "a b c d e f g h i j", "'a':* & 'b':* & 'c':* & 'd':* & 'e':* & 'f':* & 'g':* & 'h':*"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := ToTSQuery(c.in); got != c.want {
				t.Fatalf("ToTSQuery(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
