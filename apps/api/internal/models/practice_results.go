package models

import (
	"slices"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// Kinds of a practice result.
const (
	ResultLab    = "lab"
	ResultTheory = "theory"
)

// PracticeResult is a grade put at a session: a lab defense or a theory min,
// passed or not, with the time it was marked.
type PracticeResult struct {
	SessionID int64     `db:"session_id" json:"sessionId"`
	UserID    int64     `db:"user_id" json:"userId"`
	UserName  string    `db:"user_name" json:"userName"`
	UserGroup string    `db:"user_group" json:"userGroup"`
	LabID     int64     `db:"lab_id" json:"labId"`
	LabNumber int       `db:"lab_number" json:"labNumber"`
	Kind      string    `db:"kind" json:"kind"`
	Passed    bool      `db:"passed" json:"passed"`
	GradedAt  time.Time `db:"graded_at" json:"gradedAt"`
	// MarkedBy is the editor who marked it; nil is the admin.
	MarkedBy *string `db:"marked_by_name" json:"markedBy"`
}

// PracticeResultInput marks a defense or a theory min of a session.
type PracticeResultInput struct {
	UserID int64  `json:"userId"`
	LabID  int64  `json:"labId"`
	Kind   string `json:"kind"`
	// Passed: true — accepted, false — not accepted, nil — clear the mark.
	Passed *bool `json:"passed"`
	// At is when it was graded; nil is now.
	At *time.Time `json:"at"`
}

// Validate checks the payload.
func (in *PracticeResultInput) Validate() error {
	ve := httpx.NewValidation()
	if in.UserID <= 0 {
		ve.Add("userId", "Выберите студента")
	}
	if in.LabID <= 0 {
		ve.Add("labId", "Выберите лабу")
	}
	if in.Kind != ResultLab && in.Kind != ResultTheory {
		ve.Add("kind", "Защита или теормин")
	}
	if in.At != nil && in.At.After(time.Now().Add(time.Minute)) {
		ve.Add("at", "Время в будущем")
	}
	if ve.Empty() {
		return nil
	}
	return ve
}

// Throughput is how one kind (defenses or theory mins) went at one session.
type Throughput struct {
	// SignedUp is how many were signed up (defenses or student × lab).
	SignedUp int `json:"signedUp"`
	// Attempts are the marked ones, passed or not; Passed — the accepted ones.
	Attempts int `json:"attempts"`
	Passed   int `json:"passed"`
	// Left are the signups without a mark: not reached by the end.
	Left  int        `json:"left"`
	First *time.Time `json:"first"`
	Last  *time.Time `json:"last"`
	// MinutesEach is the average time per attempt: from the start of the
	// session to the last mark, divided by the attempts. Nil when the marks
	// were put outside the session (filled in afterwards).
	MinutesEach *float64 `json:"minutesEach"`
}

// PracticeStatsSession is one session with marks.
type PracticeStatsSession struct {
	ID       int64      `json:"id"`
	StartsAt time.Time  `json:"startsAt"`
	EndsAt   *time.Time `json:"endsAt"`
	Location string     `json:"location"`
	Capacity *int       `json:"capacity"`
	Audience []string   `json:"audience"`
	// Minutes is the length of the session (90 without an end).
	Minutes  int        `json:"minutes"`
	Finished bool       `json:"finished"`
	Labs     Throughput `json:"labs"`
	Theory   Throughput `json:"theory"`
}

// ThroughputSummary sums one kind up over the finished sessions of a subject.
type ThroughputSummary struct {
	// Sessions is how many finished sessions have marks of this kind.
	Sessions int `json:"sessions"`
	// Attempts and Passed are medians per session.
	Attempts float64 `json:"attempts"`
	Passed   float64 `json:"passed"`
	// Max is the most attempts at one session.
	Max int `json:"max"`
	// MinutesEach is the median time per attempt.
	MinutesEach *float64 `json:"minutesEach"`
	// Busy is how many sessions ended with people left in the queue: only
	// they show how much fits into a session.
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

// lateMarks is how long after the end marks still count as put during the
// session (the teacher finishes the last one, the mark is a bit late).
const lateMarks = 30 * time.Minute

// SessionMinutes is the length of a session.
func SessionMinutes(start time.Time, end *time.Time) int {
	if end == nil || !end.After(start) {
		return DefaultSessionMinutes
	}
	return int(end.Sub(start).Round(time.Minute) / time.Minute)
}

// NewThroughput counts one kind of a session.
func NewThroughput(start time.Time, minutes, signed, left, attempts, passed int, first, last *time.Time) Throughput {
	t := Throughput{SignedUp: signed, Left: left, Attempts: attempts, Passed: passed, First: first, Last: last}
	end := start.Add(time.Duration(minutes)*time.Minute + lateMarks)
	if attempts > 0 && last != nil && last.After(start) && !last.After(end) {
		m := last.Sub(start).Minutes() / float64(attempts)
		t.MinutesEach = &m
	}
	return t
}

// SummarizeThroughput sums one kind (pick) up over the finished sessions.
func SummarizeThroughput(sessions []PracticeStatsSession, pick func(PracticeStatsSession) Throughput) ThroughputSummary {
	var attempts, passed, busyAttempts, paces, lengths []float64
	sum := ThroughputSummary{}
	for _, s := range sessions {
		t := pick(s)
		if !s.Finished || t.Attempts == 0 {
			continue
		}
		sum.Sessions++
		attempts = append(attempts, float64(t.Attempts))
		passed = append(passed, float64(t.Passed))
		lengths = append(lengths, float64(s.Minutes))
		sum.Max = max(sum.Max, t.Attempts)
		if t.Left > 0 {
			sum.Busy++
			busyAttempts = append(busyAttempts, float64(t.Attempts))
		}
		if t.MinutesEach != nil {
			paces = append(paces, *t.MinutesEach)
		}
	}
	if sum.Sessions == 0 {
		return sum
	}
	sum.Attempts = median(attempts)
	sum.Passed = median(passed)
	if len(paces) > 0 {
		m := median(paces)
		sum.MinutesEach = &m
	}
	switch {
	case len(busyAttempts) > 0:
		n := int(median(busyAttempts) + 0.5)
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
