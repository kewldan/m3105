// Package schedule expands a weekly practice rule into dated occurrences.
package schedule

import (
	"errors"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/semester"
)

// Which weeks a rule runs on.
const (
	All  = "all"
	Odd  = "odd"
	Even = "even"
)

// ErrNoSemester: a rule for odd or even weeks needs the semester start and the
// parity of its first week in the settings.
var ErrNoSemester = errors.New("semester start is not configured")

// Rule is a weekly slot in local time.
type Rule struct {
	// Weekday is 1 (Monday) … 7 (Sunday).
	Weekday int
	// Start and End are "15:04"; End may be empty.
	Start, End string
	Weeks      string
	// From and To are dates: only their year, month and day count.
	From, To time.Time
}

// Semester gives week parity; a zero Start means it is not configured.
type Semester struct {
	Start time.Time
	First semester.Parity
}

// Slot is one occurrence of a rule.
type Slot struct {
	// Day is the date at 00:00 UTC, the way Postgres dates come back.
	Day      time.Time
	StartsAt time.Time
	EndsAt   *time.Time
}

// Key is the slot's date as "2006-01-02".
func (s Slot) Key() string { return s.Day.Format(time.DateOnly) }

// ParseClock reads "15:04" into hours and minutes.
func ParseClock(s string) (h, m int, ok bool) {
	t, err := time.Parse("15:04", s)
	if err != nil {
		return 0, 0, false
	}
	return t.Hour(), t.Minute(), true
}

// maxSlots bounds a rule: a year of weekly sessions with room to spare.
const maxSlots = 60

// Expand lists the rule's occurrences between From and To inclusive.
func Expand(r Rule, sem Semester, loc *time.Location) ([]Slot, error) {
	if loc == nil {
		loc = time.UTC
	}
	if r.Weeks != "" && r.Weeks != All && sem.Start.IsZero() {
		return nil, ErrNoSemester
	}
	sh, sm, ok := ParseClock(r.Start)
	if !ok {
		return nil, errors.New("bad start time")
	}
	eh, em, hasEnd := ParseClock(r.End)
	day := date(r.From)
	last := date(r.To)
	// Сдвигаемся на первый нужный день недели.
	wd := int(day.Weekday())
	if wd == 0 {
		wd = 7
	}
	day = day.AddDate(0, 0, (r.Weekday-wd+7)%7)
	var out []Slot
	for ; !day.After(last) && len(out) < maxSlots; day = day.AddDate(0, 0, 7) {
		local := time.Date(day.Year(), day.Month(), day.Day(), 12, 0, 0, 0, loc)
		if r.Weeks == Odd || r.Weeks == Even {
			w := semester.Compute(local, sem.Start, time.Time{}, sem.First, loc)
			if string(w.Parity) != r.Weeks {
				continue
			}
		}
		s := Slot{Day: day, StartsAt: time.Date(day.Year(), day.Month(), day.Day(), sh, sm, 0, 0, loc)}
		if hasEnd {
			end := time.Date(day.Year(), day.Month(), day.Day(), eh, em, 0, 0, loc)
			s.EndsAt = &end
		}
		out = append(out, s)
	}
	return out, nil
}

func date(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
