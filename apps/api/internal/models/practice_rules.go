package models

import (
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/schedule"
)

// PracticeRule is a weekly practice slot: sessions are created from it for
// every matching date of the period.
type PracticeRule struct {
	// Audience lists who it is for: "stream:1", "group:М3105"; empty is everyone.
	Audience  []string `db:"audience" json:"audience"`
	ID        int64    `db:"id" json:"id"`
	SubjectID int64    `db:"subject_id" json:"subjectId"`
	// Weekday is 1 (Monday) … 7 (Sunday).
	Weekday int `db:"weekday" json:"weekday"`
	// StartTime and EndTime are local "15:04"; EndTime may be empty.
	StartTime string `db:"start_time" json:"startTime"`
	EndTime   string `db:"end_time" json:"endTime"`
	// Weeks: all, odd or even (by the semester's week parity).
	Weeks     string      `db:"weeks" json:"weeks"`
	StartsOn  pgtype.Date `db:"starts_on" json:"startsOn"`
	EndsOn    pgtype.Date `db:"ends_on" json:"endsOn"`
	Location  string      `db:"location" json:"location"`
	Capacity  *int        `db:"capacity" json:"capacity"`
	Note      string      `db:"note" json:"note"`
	CreatedAt time.Time   `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time   `db:"updated_at" json:"updatedAt"`

	SubjectSlug      string `db:"subject_slug" json:"subjectSlug"`
	SubjectName      string `db:"subject_name" json:"subjectName"`
	SubjectShortName string `db:"subject_short_name" json:"subjectShortName"`
	SubjectColor     string `db:"subject_color" json:"subjectColor"`
	SubjectIcon      string `db:"subject_icon" json:"subjectIcon"`
	// SessionsCount is every session of the rule, past ones included.
	SessionsCount int `db:"sessions_count" json:"sessionsCount"`
	UpcomingCount int `db:"upcoming_count" json:"upcomingCount"`
	CanceledCount int `db:"canceled_count" json:"canceledCount"`
	// Next are the starts of the nearest sessions that are not canceled.
	Next []time.Time `db:"next" json:"next"`
}

// PracticeRuleInput is the create/update payload of a rule.
type PracticeRuleInput struct {
	Audience  []string    `json:"audience"`
	SubjectID int64       `json:"subjectId"`
	Weekday   int         `json:"weekday"`
	StartTime string      `json:"startTime"`
	EndTime   string      `json:"endTime"`
	Weeks     string      `json:"weeks"`
	StartsOn  pgtype.Date `json:"startsOn"`
	EndsOn    pgtype.Date `json:"endsOn"`
	Location  string      `json:"location"`
	Capacity  *int        `json:"capacity"`
	Note      string      `json:"note"`
}

// Validate normalises and checks the payload.
func (in *PracticeRuleInput) Validate() error {
	ve := httpx.NewValidation()
	checkAudience(ve, &in.Audience)
	in.Location = strings.TrimSpace(in.Location)
	in.Note = strings.TrimSpace(in.Note)
	in.StartTime = strings.TrimSpace(in.StartTime)
	in.EndTime = strings.TrimSpace(in.EndTime)
	if in.SubjectID <= 0 {
		ve.Add("subjectId", "Выберите предмет")
	}
	if in.Weekday < 1 || in.Weekday > 7 {
		ve.Add("weekday", "Выберите день недели")
	}
	sh, sm, ok := schedule.ParseClock(in.StartTime)
	if !ok {
		ve.Add("startTime", "Время начала — ЧЧ:ММ")
	}
	if in.EndTime != "" {
		eh, em, eok := schedule.ParseClock(in.EndTime)
		switch {
		case !eok:
			ve.Add("endTime", "Время окончания — ЧЧ:ММ")
		case ok && eh*60+em <= sh*60+sm:
			ve.Add("endTime", "Окончание раньше начала")
		}
	}
	if in.Weeks == "" {
		in.Weeks = schedule.All
	}
	if in.Weeks != schedule.All && in.Weeks != schedule.Odd && in.Weeks != schedule.Even {
		ve.Add("weeks", "Недели: все, чётные или нечётные")
	}
	switch {
	case !in.StartsOn.Valid:
		ve.Add("startsOn", "Укажите, с какого дня")
	case !in.EndsOn.Valid:
		ve.Add("endsOn", "Укажите, по какой день")
	case in.EndsOn.Time.Before(in.StartsOn.Time):
		ve.Add("endsOn", "Конец раньше начала")
	case in.EndsOn.Time.Sub(in.StartsOn.Time) > 366*24*time.Hour:
		ve.Add("endsOn", "Не больше года")
	}
	if in.Capacity != nil && *in.Capacity <= 0 {
		in.Capacity = nil
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// Rule is the payload as a schedule rule.
func (in *PracticeRuleInput) Rule() schedule.Rule {
	return schedule.Rule{Weekday: in.Weekday, Start: in.StartTime, End: in.EndTime, Weeks: in.Weeks, From: in.StartsOn.Time, To: in.EndsOn.Time}
}

// What saving a rule does to one of its dates.
const (
	PlanCreate = "create" // a new session
	PlanAdopt  = "adopt"  // a one-off session on that date joins the rule
	PlanUpdate = "update" // the session follows the changed rule
	PlanKeep   = "keep"   // nothing changes
	// PlanManual: the session was changed by hand, the rule leaves it alone.
	PlanManual = "manual"
	// PlanCanceled: the session is canceled and stays so.
	PlanCanceled = "canceled"
	PlanPast     = "past" // already took place, never touched
	// The date is no longer in the rule:
	PlanDelete = "delete" // nobody signed up, the session goes
	PlanCancel = "cancel" // students signed up: it is canceled, they get a message
	PlanDetach = "detach" // changed by hand and has signups: stays as a one-off
)

// PracticeRulePlanItem is one date in a rule's preview.
type PracticeRulePlanItem struct {
	Day       string     `json:"day"`
	StartsAt  time.Time  `json:"startsAt"`
	EndsAt    *time.Time `json:"endsAt"`
	Action    string     `json:"action"`
	SessionID *int64     `json:"sessionId"`
	Signups   int        `json:"signups"`
	// Differs: an adopted session differs from the rule (time, room, capacity
	// or note), so it joins as changed by hand and keeps what it has.
	Differs bool `json:"differs"`
}

// PracticeRulePreviewInput asks what saving a rule would do; ID is empty for a new rule.
type PracticeRulePreviewInput struct {
	ID   *int64            `json:"id"`
	Rule PracticeRuleInput `json:"rule"`
}

// PracticeCancelInput cancels one session.
type PracticeCancelInput struct {
	Reason string `json:"reason"`
	// MoveSignups moves the signups to the subject's next session for the same audience.
	MoveSignups bool `json:"moveSignups"`
}

// Validate normalises the payload.
func (in *PracticeCancelInput) Validate() error {
	in.Reason = strings.TrimSpace(in.Reason)
	if len([]rune(in.Reason)) > 300 {
		ve := httpx.NewValidation()
		ve.Add("reason", "Не длиннее 300 символов")
		return ve
	}
	return nil
}
