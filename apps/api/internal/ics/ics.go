// Package ics renders calendar items as an iCalendar feed.
package ics

import (
	"fmt"
	"strings"
	"time"
)

// Item is a calendar entry to render.
type Item struct {
	UID         string
	Title       string
	Description string
	Location    string
	URL         string
	Start       time.Time
	End         time.Time // zero for point-in-time items
	AllDay      bool
	Alarm       bool // add a reminder one day before
}

func escape(s string) string {
	r := strings.NewReplacer("\\", "\\\\", ";", "\\;", ",", "\\,", "\r\n", "\\n", "\n", "\\n")
	return r.Replace(s)
}

// fold wraps long content lines per RFC 5545 (75 octets).
func fold(line string) string {
	const max = 74
	if len(line) <= max {
		return line
	}
	var b strings.Builder
	for len(line) > max {
		cut := max
		for cut > 0 && !isBoundary(line, cut) {
			cut--
		}
		if cut == 0 {
			cut = max
		}
		b.WriteString(line[:cut])
		b.WriteString("\r\n ")
		line = line[cut:]
	}
	b.WriteString(line)
	return b.String()
}

// isBoundary reports whether cutting at i does not split a UTF-8 sequence.
func isBoundary(s string, i int) bool {
	return i >= len(s) || (s[i]&0xC0) != 0x80
}

// Render produces the full VCALENDAR text.
func Render(name string, items []Item, now time.Time) string {
	var b strings.Builder
	w := func(line string) {
		b.WriteString(fold(line))
		b.WriteString("\r\n")
	}
	w("BEGIN:VCALENDAR")
	w("VERSION:2.0")
	w("PRODID:-//m3105.ru//edu3105//RU")
	w("CALSCALE:GREGORIAN")
	w("METHOD:PUBLISH")
	w("X-WR-CALNAME:" + escape(name))
	w("X-WR-TIMEZONE:Europe/Moscow")
	stamp := now.UTC().Format("20060102T150405Z")
	for _, it := range items {
		w("BEGIN:VEVENT")
		w("UID:" + it.UID)
		w("DTSTAMP:" + stamp)
		if it.AllDay {
			w("DTSTART;VALUE=DATE:" + it.Start.Format("20060102"))
			end := it.End
			if end.IsZero() {
				end = it.Start
			}
			w("DTEND;VALUE=DATE:" + end.AddDate(0, 0, 1).Format("20060102"))
		} else {
			w("DTSTART:" + it.Start.UTC().Format("20060102T150405Z"))
			end := it.End
			if end.IsZero() {
				end = it.Start.Add(30 * time.Minute)
			}
			w("DTEND:" + end.UTC().Format("20060102T150405Z"))
		}
		w("SUMMARY:" + escape(it.Title))
		if it.Description != "" {
			w("DESCRIPTION:" + escape(it.Description))
		}
		if it.Location != "" {
			w("LOCATION:" + escape(it.Location))
		}
		if it.URL != "" {
			w("URL:" + it.URL)
		}
		if it.Alarm {
			w("BEGIN:VALARM")
			w("ACTION:DISPLAY")
			w("DESCRIPTION:" + escape(it.Title))
			w("TRIGGER:-P1D")
			w("END:VALARM")
		}
		w("END:VEVENT")
	}
	w("END:VCALENDAR")
	return b.String()
}

// String helper for fmt-based UIDs.
func UID(kind string, id int64) string { return fmt.Sprintf("%s-%d@m3105.ru", kind, id) }
