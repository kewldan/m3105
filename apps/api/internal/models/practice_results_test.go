package models

import (
	"testing"
	"time"
)

func TestSummarizeThroughput(t *testing.T) {
	start := time.Date(2026, 11, 2, 17, 0, 0, 0, time.UTC)
	at := func(min int) *time.Time { v := start.Add(time.Duration(min) * time.Minute); return &v }
	session := func(t Throughput, finished bool) PracticeStatsSession {
		return PracticeStatsSession{StartsAt: start, Minutes: 90, Finished: finished, Labs: t}
	}
	pick := func(s PracticeStatsSession) Throughput { return s.Labs }

	// Очередь закончилась раньше конца пары: лимит считается по темпу.
	free := []PracticeStatsSession{
		session(NewThroughput(start, 90, 6, 0, 6, 5, at(10), at(60)), true),
		session(NewThroughput(start, 90, 9, 0, 9, 9, at(5), at(90)), true),
	}
	sum := SummarizeThroughput(free, pick)
	if sum.Sessions != 2 || sum.Busy != 0 || sum.Max != 9 || sum.Attempts != 7.5 || sum.Passed != 7 {
		t.Fatalf("summary wrong: %+v", sum)
	}
	// Темп: 10 и 10 минут на одну → за 90 минут успевают 9.
	if sum.MinutesEach == nil || *sum.MinutesEach != 10 || sum.Suggested == nil || *sum.Suggested != 9 {
		t.Fatalf("pace wrong: %+v", sum)
	}

	// Есть сдачи, где не все успели: лимит — медиана по ним, текущая не считается.
	busy := append(free,
		session(NewThroughput(start, 90, 12, 4, 8, 8, at(3), at(88)), true),
		session(NewThroughput(start, 90, 14, 3, 11, 10, at(3), at(85)), true),
		session(NewThroughput(start, 90, 14, 14, 1, 1, at(3), at(3)), false),
	)
	sum = SummarizeThroughput(busy, pick)
	if sum.Sessions != 4 || sum.Busy != 2 || sum.Suggested == nil || *sum.Suggested != 10 {
		t.Fatalf("busy summary wrong: %+v", sum)
	}

	// Отметки, поставленные после пары, не дают темпа.
	late := NewThroughput(start, 90, 5, 0, 5, 5, at(200), at(300))
	if late.MinutesEach != nil {
		t.Fatalf("late marks must not give a pace: %v", *late.MinutesEach)
	}
	if got := SummarizeThroughput([]PracticeStatsSession{session(late, true)}, pick); got.Suggested != nil || got.Sessions != 1 {
		t.Fatalf("summary without pace wrong: %+v", got)
	}
	if got := SessionMinutes(start, at(100)); got != 100 {
		t.Fatalf("SessionMinutes = %d", got)
	}
	if got := SessionMinutes(start, nil); got != DefaultSessionMinutes {
		t.Fatalf("SessionMinutes(nil) = %d", got)
	}
}
