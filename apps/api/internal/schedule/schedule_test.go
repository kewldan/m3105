package schedule

import (
	"errors"
	"testing"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/semester"
)

func TestExpand(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/Moscow")
	d := func(m time.Month, day int) time.Time { return time.Date(2026, m, day, 0, 0, 0, 0, time.UTC) }
	r := Rule{Weekday: 1, Start: "20:30", End: "22:00", Weeks: All, From: d(9, 1), To: d(9, 30)}
	slots, err := Expand(r, Semester{}, loc)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, s := range slots {
		got = append(got, s.Key())
	}
	want := []string{"2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
	if s := slots[0]; s.StartsAt.UTC().Hour() != 17 || s.EndsAt == nil || s.EndsAt.Sub(s.StartsAt) != 90*time.Minute {
		t.Errorf("first slot = %v – %v", s.StartsAt, s.EndsAt)
	}

	r.Weeks = Even
	if _, err := Expand(r, Semester{}, loc); !errors.Is(err, ErrNoSemester) {
		t.Errorf("parity without semester: err = %v", err)
	}
	// Семестр с 01.09 (вторник), первая неделя нечётная: 07.09 — вторая, чётная.
	slots, err = Expand(r, Semester{Start: d(9, 1), First: semester.Odd}, loc)
	if err != nil {
		t.Fatal(err)
	}
	if len(slots) != 2 || slots[0].Key() != "2026-09-07" || slots[1].Key() != "2026-09-21" {
		t.Errorf("even weeks: %v", slots)
	}
	r.Weeks, r.End = Odd, ""
	slots, _ = Expand(r, Semester{Start: d(9, 1), First: semester.Odd}, loc)
	if len(slots) != 2 || slots[0].Key() != "2026-09-14" || slots[0].EndsAt != nil {
		t.Errorf("odd weeks: %v", slots)
	}
}
