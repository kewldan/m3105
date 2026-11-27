package models

import "testing"

func TestMark(t *testing.T) {
	cases := []struct {
		total, max float64
		passFail   bool
		want       string
	}{
		{92, 100, false, "A5"},
		{90.5, 100, false, "A5"},
		{90, 100, false, "B4"},
		{83.5, 100, false, "B4"},
		{83, 100, false, "C4"},
		{74, 100, false, "D3"},
		{71.66, 100, false, "D3"},
		{67, 100, false, "E3"},
		{60, 100, false, "E3"},
		{18.9, 21, false, "B4"},
		{59, 100, false, "пока ниже E3"},
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
