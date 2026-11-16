package models

import (
	"testing"
	"time"
)

func TestSummarizeThroughput(t *testing.T) {
	start := time.Date(2026, 11, 2, 17, 0, 0, 0, time.UTC)
	at := func(min int) time.Time { return start.Add(time.Duration(min) * time.Minute) }
	session := func(t Throughput, finished bool) PracticeStatsSession {
		return PracticeStatsSession{StartsAt: start, Minutes: 90, Finished: finished, Labs: t}
	}
	pick := func(s PracticeStatsSession) Throughput { return s.Labs }

	// Очередь закончилась раньше конца пары: лимит считается по темпу.
	free := []PracticeStatsSession{
		session(NewThroughput(start, 6, 6, []time.Time{at(10), at(30), at(60)}), true), // 20 мин
		session(NewThroughput(start, 5, 9, []time.Time{at(5), at(40), at(90)}), true),  // 30 мин
	}
	sum := SummarizeThroughput(free, pick)
	if sum.Sessions != 2 || sum.Busy != 0 || sum.Max != 9 || sum.Graded != 7.5 {
		t.Fatalf("summary wrong: %+v", sum)
	}
	if sum.MinutesEach == nil || *sum.MinutesEach != 25 || sum.Suggested == nil || *sum.Suggested != 3 {
		t.Fatalf("pace wrong: %+v", sum)
	}

	// Есть сдачи, где не все успели: лимит — медиана по ним, текущая не считается.
	busy := append(free,
		session(NewThroughput(start, 12, 8, nil), true),
		session(NewThroughput(start, 14, 11, nil), true),
		session(NewThroughput(start, 14, 1, []time.Time{at(3)}), false),
	)
	sum = SummarizeThroughput(busy, pick)
	if sum.Sessions != 4 || sum.Busy != 2 || sum.Suggested == nil || *sum.Suggested != 10 {
		t.Fatalf("busy summary wrong: %+v", sum)
	}

	// Всё внесли после пары: числа есть, темпа нет.
	late := NewThroughput(start, 5, 5, nil)
	if late.MinutesEach != nil || late.InSession != 0 {
		t.Fatalf("late grades must not give a pace: %+v", late)
	}
	if got := SummarizeThroughput([]PracticeStatsSession{session(late, true)}, pick); got.Suggested != nil || got.Sessions != 1 {
		t.Fatalf("summary without pace wrong: %+v", got)
	}
	if !InSession(start, 90, at(100)) || InSession(start, 90, at(200)) || InSession(start, 90, at(-30)) {
		t.Fatal("InSession window wrong")
	}
	if got := SessionMinutes(start, nil); got != DefaultSessionMinutes {
		t.Fatalf("SessionMinutes(nil) = %d", got)
	}
}

func TestGradeChanges(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	cols := []GradeColumn{{Key: "lab1", Label: "Лаба 1", Max: 12}, {Key: "lab2", Label: "Лаба 2", Max: 12}, {Key: "exam", Label: "Экзамен", Max: 40}}
	scheme := GradeSource{Columns: cols, Scheme: GradeScheme{Theory: "12", Plus: "+", Minus: "-", Late: "D", LateFactors: []float64{1}}}
	old := GradeRow{RowKey: "1", Group: "M3105", Details: map[string]LabCells{"lab1": {}, "lab2": {Late: f(0)}}}
	cur := GradeRow{RowKey: "1", Group: "M3105", Details: map[string]LabCells{"lab1": {Late: f(0)}, "lab2": {Late: f(0), Theory: f(12)}},
		Parts: map[string]*float64{"exam": f(30)}}
	got := GradeChanges(scheme, old, cur)
	if len(got) != 2 || got[0] != (GradeChange{RowKey: "1", Group: "М3105", Part: "lab1", Kind: ChangeLab}) ||
		got[1].Part != "lab2" || got[1].Kind != ChangeTheory {
		t.Fatalf("scheme changes: %+v", got)
	}
	// Защита и теормин считаются отдельно: баллы за теормин — не приём лабы,
	// а приём со ступенью и теормин разом — два события.
	if got := GradeChanges(scheme, GradeRow{}, GradeRow{Details: map[string]LabCells{"lab1": {Theory: f(12)}}}); len(got) != 1 || got[0].Kind != ChangeTheory {
		t.Fatalf("theory alone: %+v", got)
	}
	if got := GradeChanges(scheme, GradeRow{}, GradeRow{Details: map[string]LabCells{"lab1": {Theory: f(12), Plus: f(1)}}}); len(got) != 2 {
		t.Fatalf("accepted with theory at once: %+v", got)
	}
	// Без схемы — только столбцы лаб, ноль баллов не считается.
	plain := GradeSource{Columns: []GradeColumn{{Key: "l0", Label: "ЛР 0"}, {Key: "t1", Label: "Тест 1"}, {Key: "l1", Label: "Лабораторные", Header: "Lab 1"}}}
	got = GradeChanges(plain, GradeRow{Parts: map[string]*float64{"l0": f(0)}},
		GradeRow{Parts: map[string]*float64{"l0": f(5), "t1": f(3), "l1": f(0)}})
	if len(got) != 1 || got[0].Part != "l0" {
		t.Fatalf("plain changes: %+v", got)
	}
}
