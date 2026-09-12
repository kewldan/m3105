package models

import "time"

// CalendarItem is a unified calendar entry built from lab deadlines and events.
type CalendarItem struct {
	ID          string      `json:"id"`
	Source      string      `json:"source"` // "lab" | "event"
	Kind        string      `json:"kind"`   // deadline | test | exam | consultation | other
	Title       string      `json:"title"`
	StartsAt    time.Time   `json:"startsAt"`
	EndsAt      *time.Time  `json:"endsAt"`
	AllDay      bool        `json:"allDay"`
	Location    string      `json:"location"`
	Description string      `json:"description"`
	Path        string      `json:"path"`
	URL         string      `json:"url"`
	Subject     *SubjectRef `json:"subject"`
	LabNumber   int         `json:"labNumber,omitempty"`
	LabID       int64       `json:"labId,omitempty"`
}
