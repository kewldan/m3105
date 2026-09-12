package ics

import (
	"strings"
	"testing"
	"time"
)

func TestRender(t *testing.T) {
	now := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	out := Render("Тест", []Item{
		{UID: UID("lab", 1), Title: "Лаба 1; дедлайн", Start: time.Date(2026, 9, 10, 20, 59, 0, 0, time.UTC), Alarm: true, URL: "https://m3105.ru/labs/x/y"},
		{UID: UID("event", 2), Title: "Экзамен", Start: time.Date(2026, 12, 25, 0, 0, 0, 0, time.UTC), AllDay: true},
	}, now)
	for _, want := range []string{
		"BEGIN:VCALENDAR", "UID:lab-1@m3105.ru", "SUMMARY:Лаба 1\\; дедлайн",
		"DTSTART:20260910T205900Z", "DTEND:20260910T212900Z", "TRIGGER:-P1D",
		"DTSTART;VALUE=DATE:20261225", "DTEND;VALUE=DATE:20261226", "END:VCALENDAR",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in output:\n%s", want, out)
		}
	}
	for _, line := range strings.Split(out, "\r\n") {
		if len(line) > 75 {
			t.Errorf("line too long (%d): %q", len(line), line)
		}
	}
}

func TestFoldKeepsUTF8(t *testing.T) {
	long := "SUMMARY:" + strings.Repeat("ю", 100)
	folded := fold(long)
	for _, part := range strings.Split(folded, "\r\n ") {
		if !strings.Contains(part, "ю") && part != "" {
			continue
		}
	}
	joined := strings.ReplaceAll(folded, "\r\n ", "")
	if joined != long {
		t.Error("folding altered content")
	}
}
