package semester

import (
	"testing"
	"time"
)

func TestCompute(t *testing.T) {
	loc := time.UTC
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, loc) // Tuesday
	cases := []struct {
		now    time.Time
		number int
		parity Parity
	}{
		{time.Date(2026, 9, 1, 10, 0, 0, 0, loc), 1, Odd},
		{time.Date(2026, 9, 6, 23, 0, 0, 0, loc), 1, Odd}, // Sunday of week 1
		{time.Date(2026, 9, 7, 0, 0, 0, 0, loc), 2, Even}, // Monday of week 2
		{time.Date(2026, 9, 14, 0, 0, 0, 0, loc), 3, Odd},
		{time.Date(2026, 8, 30, 0, 0, 0, 0, loc), 0, Even}, // week before start
	}
	for _, c := range cases {
		w := Compute(c.now, start, time.Time{}, Odd, loc)
		if w.Number != c.number || w.Parity != c.parity {
			t.Errorf("Compute(%v) = %d/%s, want %d/%s", c.now, w.Number, w.Parity, c.number, c.parity)
		}
	}
	w := Compute(time.Date(2026, 9, 7, 0, 0, 0, 0, loc), start, time.Time{}, Even, loc)
	if w.Parity != Odd {
		t.Errorf("first=even: week 2 should be odd, got %s", w.Parity)
	}
	w = Compute(time.Date(2027, 1, 20, 0, 0, 0, 0, loc), start, time.Date(2026, 12, 31, 0, 0, 0, 0, loc), Odd, loc)
	if w.InRange {
		t.Error("expected out of range after semester end")
	}
	w = Compute(time.Now(), time.Time{}, time.Time{}, Odd, loc)
	if w.Configured {
		t.Error("expected unconfigured week")
	}
}
