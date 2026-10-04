package queue

import (
	"slices"
	"testing"
	"time"
)

func users(keys []Key) []int64 {
	out := make([]int64, len(keys))
	for i, k := range keys {
		out[i] = k.UserID
	}
	return out
}

func TestOrderNewestLabFirst(t *testing.T) {
	got := users(Order(7, []Entry{
		{UserID: 1, LabID: 12, Lab: 2},
		{UserID: 2, LabID: 14, Lab: 4},
		{UserID: 3, LabID: 13, Lab: 3},
		{UserID: 4, LabID: 14, Lab: 4},
	}))
	if got[2] != 3 || got[3] != 1 || !slices.Contains(got[:2], 2) || !slices.Contains(got[:2], 4) {
		t.Fatalf("labs are not sorted newest first: %v", got)
	}
}

// A student's second lab waits until everybody has defended one.
func TestOrderRoundRobin(t *testing.T) {
	got := Order(1, []Entry{
		{UserID: 1, LabID: 13, Lab: 3},
		{UserID: 1, LabID: 12, Lab: 2},
		{UserID: 1, LabID: 11, Lab: 1},
		{UserID: 2, LabID: 11, Lab: 1},
	})
	want := []Key{{1, 13}, {2, 11}, {1, 12}, {1, 11}}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestOrderCarriedFirst(t *testing.T) {
	got := Order(1, []Entry{
		{UserID: 1, LabID: 15, Lab: 5},
		{UserID: 2, LabID: 11, Lab: 1, Missed: 1, ReservePlace: 2},
		{UserID: 3, LabID: 11, Lab: 1, Missed: 1, ReservePlace: 1},
		{UserID: 3, LabID: 12, Lab: 2},
	})
	want := []Key{{3, 11}, {2, 11}, {1, 15}, {3, 12}}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

// Left out twice in a row beats left out once, whatever the place in the last reserve.
func TestOrderMissedTwiceFirst(t *testing.T) {
	got := Order(1, []Entry{
		{UserID: 1, LabID: 11, Lab: 1, Missed: 1, ReservePlace: 1},
		{UserID: 2, LabID: 11, Lab: 1, Missed: 2, ReservePlace: 5},
		{UserID: 3, LabID: 13, Lab: 3},
	})
	if u := users(got); !slices.Equal(u, []int64{2, 1, 3}) {
		t.Fatalf("missed twice must go first: %v", u)
	}
}

func TestOrderLateGoLastByTime(t *testing.T) {
	now := time.Now()
	got := Order(1, []Entry{
		{UserID: 1, LabID: 15, Lab: 5, Late: true, SignedAt: now.Add(time.Minute)},
		{UserID: 2, LabID: 11, Lab: 1, Late: true, SignedAt: now},
		{UserID: 3, LabID: 11, Lab: 1},
	})
	if u := users(got); !slices.Equal(u, []int64{3, 2, 1}) {
		t.Fatalf("late signups misplaced: %v", u)
	}
}

func TestOrderIsStableAndFair(t *testing.T) {
	in := []Entry{{UserID: 10, LabID: 1, Lab: 1}, {UserID: 11, LabID: 1, Lab: 1}, {UserID: 12, LabID: 1, Lab: 1}}
	a := Order(3, in)
	slices.Reverse(in)
	if b := Order(3, in); !slices.Equal(a, b) {
		t.Fatalf("order depends on input order: %v vs %v", a, b)
	}
	first := 0
	const n = 4000
	for s := range int64(n) {
		if Order(s, []Entry{{UserID: 5, LabID: 1, Lab: 1}, {UserID: 6, LabID: 1, Lab: 1}})[0].UserID == 5 {
			first++
		}
	}
	if first < n*45/100 || first > n*55/100 {
		t.Fatalf("lottery is biased: %d of %d", first, n)
	}
}

func TestFreezeAt(t *testing.T) {
	msk := time.FixedZone("MSK", 3*3600)
	got := FreezeAt(time.Date(2026, 10, 5, 10, 0, 0, 0, time.UTC), msk)
	if want := time.Date(2026, 10, 4, 20, 0, 0, 0, msk); !got.Equal(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
