package models

import "testing"

func TestMark(t *testing.T) {
	cases := []struct {
		total, max float64
		passFail   bool
		want       string
	}{
		{92, 100, false, "A"},
		{59, 100, false, "F"},
		{60, 100, true, "зачёт"},
		{95, 100, true, "зачёт"},
		{59.5, 100, true, "пока не зачёт"},
		{30, 50, true, "зачёт"},
	}
	for _, c := range cases {
		if got := Mark(c.total, c.max, c.passFail); got != c.want {
			t.Errorf("Mark(%v, %v, %v) = %q, want %q", c.total, c.max, c.passFail, got, c.want)
		}
	}
}
