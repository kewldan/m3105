package models

import (
	"slices"
	"time"
)

// Throughput is how one kind (lab defenses or theory mins) went at one
// session, by the grade sheet.
type Throughput struct {
	// SignedUp is how many were signed up (defenses or student × lab).
	SignedUp int `json:"signedUp"`
	// Graded is how many got graded in the sheet; InSession — of them seen
	// during the session, the rest were filled in later.
	Graded    int `json:"graded"`
	InSession int `json:"inSession"`
	// Left is how many signups got no grade: not reached by the end.
	Left int `json:"left"`
	// First and Last are the first and the last change seen during the session.
	First *time.Time `json:"first"`
	Last  *time.Time `json:"last"`
	// MinutesEach is the average time per grade: from the start of the
	// session to the last change seen during it, divided by those changes.
	MinutesEach *float64 `json:"minutesEach"`
}

// PracticeStatsSession is one session with grade changes put down to it.
type PracticeStatsSession struct {
	ID       int64      `json:"id"`
	StartsAt time.Time  `json:"startsAt"`
	EndsAt   *time.Time `json:"endsAt"`
	Location string     `json:"location"`
	Capacity *int       `json:"capacity"`
	Audience []string   `json:"audience"`
	// Minutes is the length of the session (90 without an end).
	Minutes  int              `json:"minutes"`
	Finished bool             `json:"finished"`
	Labs     Throughput       `json:"labs"`
	Theory   Throughput       `json:"theory"`
	Changes  []PracticeChange `json:"changes"`
}

// ThroughputSummary sums one kind up over the finished sessions of a subject.
type ThroughputSummary struct {
	// Sessions is how many finished sessions have grades of this kind.
	Sessions int `json:"sessions"`
	// Graded is the median per session; Max — the most at one session.
	Graded float64 `json:"graded"`
	Max    int     `json:"max"`
	// MinutesEach is the median time per grade.
	MinutesEach *float64 `json:"minutesEach"`
	// Busy is how many sessions ended with signups left without a grade:
	// only they show how much fits into a session.
	Busy int `json:"busy"`
	// Suggested is how many to take per session: the median of the busy
	// sessions, else the pace over the usual length; nil without data.
	Suggested *int `json:"suggested"`
}

// PracticeStatsSubject is the throughput of one subject.
type PracticeStatsSubject struct {
	SubjectID        int64                  `json:"subjectId"`
	SubjectName      string                 `json:"subjectName"`
	SubjectShortName string                 `json:"subjectShortName"`
	SubjectColor     string                 `json:"subjectColor"`
	TheoryMin        bool                   `json:"theoryMin"`
	Labs             ThroughputSummary      `json:"labs"`
	Theory           ThroughputSummary      `json:"theory"`
	Sessions         []PracticeStatsSession `json:"sessions"`
}

// DefaultSessionMinutes is the length of a session without an end: one pair.
const DefaultSessionMinutes = 90

// LateChanges is how long after the end changes still count as seen during
// the session: the teacher finishes the last one, the sheet syncs a bit later.
const LateChanges = 30 * time.Minute

// SessionMinutes is the length of a session.
func SessionMinutes(start time.Time, end *time.Time) int {
	if end == nil || !end.After(start) {
		return DefaultSessionMinutes
	}
	return int(end.Sub(start).Round(time.Minute) / time.Minute)
}

// InSession tells whether a change seen at t counts as made during a session.
func InSession(start time.Time, minutes int, t time.Time) bool {
	return !t.Before(start.Add(-15*time.Minute)) && !t.After(start.Add(time.Duration(minutes)*time.Minute+LateChanges))
}

// NewThroughput counts one kind of a session: signed signups, graded grades,
// seen — the times of those seen during the session.
func NewThroughput(start time.Time, signed, graded int, seen []time.Time) Throughput {
	t := Throughput{SignedUp: signed, Graded: graded, InSession: len(seen), Left: max(0, signed-graded)}
	if len(seen) == 0 {
		return t
	}
	first, last := slices.MinFunc(seen, time.Time.Compare), slices.MaxFunc(seen, time.Time.Compare)
	t.First, t.Last = &first, &last
	if last.After(start) {
		m := last.Sub(start).Minutes() / float64(len(seen))
		t.MinutesEach = &m
	}
	return t
}

// SummarizeThroughput sums one kind (pick) up over the finished sessions.
func SummarizeThroughput(sessions []PracticeStatsSession, pick func(PracticeStatsSession) Throughput) ThroughputSummary {
	var graded, busyGraded, paces, lengths []float64
	sum := ThroughputSummary{}
	for _, s := range sessions {
		t := pick(s)
		if !s.Finished || t.Graded == 0 {
			continue
		}
		sum.Sessions++
		graded = append(graded, float64(t.Graded))
		lengths = append(lengths, float64(s.Minutes))
		sum.Max = max(sum.Max, t.Graded)
		if t.Left > 0 {
			sum.Busy++
			busyGraded = append(busyGraded, float64(t.Graded))
		}
		if t.MinutesEach != nil {
			paces = append(paces, *t.MinutesEach)
		}
	}
	if sum.Sessions == 0 {
		return sum
	}
	sum.Graded = median(graded)
	if len(paces) > 0 {
		m := median(paces)
		sum.MinutesEach = &m
	}
	switch {
	case len(busyGraded) > 0:
		n := int(median(busyGraded) + 0.5)
		sum.Suggested = &n
	case sum.MinutesEach != nil && *sum.MinutesEach > 0:
		n := int(median(lengths) / *sum.MinutesEach)
		sum.Suggested = &n
	}
	return sum
}

func median(v []float64) float64 {
	s := slices.Clone(v)
	slices.Sort(s)
	n := len(s)
	if n%2 == 1 {
		return s[n/2]
	}
	return (s[n/2-1] + s[n/2]) / 2
}
