// Package semester computes the academic week number and parity.
package semester

import "time"

// Parity of a week: "odd" (нечётная) or "even" (чётная).
type Parity string

const (
	Odd  Parity = "odd"
	Even Parity = "even"
)

// Week describes the academic week for a specific date.
type Week struct {
	Number     int       `json:"number"`
	Parity     Parity    `json:"parity"`
	Start      time.Time `json:"start"`
	InRange    bool      `json:"inRange"`
	Configured bool      `json:"configured"`
}

// Monday returns the Monday 00:00 of the week containing t in its location.
func Monday(t time.Time) time.Time {
	y, m, d := t.Date()
	day := time.Date(y, m, d, 0, 0, 0, 0, t.Location())
	wd := int(day.Weekday())
	if wd == 0 {
		wd = 7
	}
	return day.AddDate(0, 0, -(wd - 1))
}

// Compute returns the week info for now given the semester start and the
// parity of the first week. start and end are date-only values; end may be zero.
func Compute(now time.Time, start time.Time, end time.Time, first Parity, loc *time.Location) Week {
	if loc == nil {
		loc = time.UTC
	}
	now = now.In(loc)
	if start.IsZero() {
		return Week{Number: 0, Parity: Odd, Start: Monday(now), InRange: false, Configured: false}
	}
	startMonday := Monday(time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, loc))
	curMonday := Monday(now)
	days := int(curMonday.Sub(startMonday).Hours() / 24)
	number := days/7 + 1
	if days < 0 {
		number = days / 7 // negative or zero, weeks before the start
		if days%7 != 0 {
			number--
		}
		number++
	}
	parity := first
	if number%2 == 0 {
		if first == Odd {
			parity = Even
		} else {
			parity = Odd
		}
	}
	inRange := days >= 0
	if !end.IsZero() {
		endDay := time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 59, 0, loc)
		inRange = inRange && !now.After(endDay)
	}
	return Week{Number: number, Parity: parity, Start: curMonday, InRange: inRange, Configured: true}
}
