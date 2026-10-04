// Package queue orders lab defences at a practice session. The rules, as agreed
// with the group:
//
//  1. The queue is made of defences: one student with one lab. A student who
//     brings two labs defends the second one after everybody's first.
//  2. Defences left in the reserve of the previous session of the subject (signed
//     up beyond the teacher's capacity) go first, in the order they stood there.
//  3. Then round by round: newer labs first, ties broken by a lottery that is
//     fixed for a (session, student) pair, so signing up early gives nothing and
//     the order does not jump on reload.
//  4. At 20:00 the evening before the session the order is frozen: later
//     signups go to the end in the order they came and push nobody down.
package queue

import (
	"encoding/binary"
	"hash/fnv"
	"sort"
	"time"
)

// FreezeHour is the local hour of the day before the session when the order freezes.
const FreezeHour = 20

// FreezeAt is the moment the session's order freezes.
func FreezeAt(startsAt time.Time, loc *time.Location) time.Time {
	d := startsAt.In(loc)
	return time.Date(d.Year(), d.Month(), d.Day()-1, FreezeHour, 0, 0, 0, loc)
}

// Entry is one defence: a student with one lab.
type Entry struct {
	UserID int64
	LabID  int64
	// Lab is the lab number; newer labs have larger numbers.
	Lab int
	// Carried is the 1-based place in the previous session's reserve, 0 if none.
	Carried int
	// Late marks a signup made after the freeze.
	Late     bool
	SignedAt time.Time
}

// Key identifies a defence inside one session.
type Key struct{ UserID, LabID int64 }

// draw is a pseudo-random number fixed for the pair.
func draw(sessionID, userID int64) uint64 {
	h := fnv.New64a()
	var b [16]byte
	binary.LittleEndian.PutUint64(b[:8], uint64(sessionID))
	binary.LittleEndian.PutUint64(b[8:], uint64(userID))
	_, _ = h.Write(b[:])
	// splitmix64 finaliser: FNV of nearby ids differs only in a few bits.
	x := h.Sum64()
	x ^= x >> 30
	x *= 0xbf58476d1ce4e5b9
	x ^= x >> 27
	x *= 0x94d049bb133111eb
	x ^= x >> 31
	return x
}

// Order returns the defences in hand-in order.
func Order(sessionID int64, entries []Entry) []Key {
	onTime, late := []Entry{}, []Entry{}
	for _, e := range entries {
		if e.Late {
			late = append(late, e)
		} else {
			onTime = append(onTime, e)
		}
	}

	// A student's own defences: carried ones first, then newer labs. The index is the round.
	byUser := map[int64][]Entry{}
	for _, e := range onTime {
		byUser[e.UserID] = append(byUser[e.UserID], e)
	}
	round := map[Key]int{}
	for _, list := range byUser {
		sort.Slice(list, func(i, j int) bool {
			a, b := list[i], list[j]
			if (a.Carried > 0) != (b.Carried > 0) {
				return a.Carried > 0
			}
			if a.Carried != b.Carried {
				return a.Carried < b.Carried
			}
			if a.Lab != b.Lab {
				return a.Lab > b.Lab
			}
			return a.LabID < b.LabID
		})
		for i, e := range list {
			round[Key{e.UserID, e.LabID}] = i
		}
	}

	sort.Slice(onTime, func(i, j int) bool {
		a, b := onTime[i], onTime[j]
		if (a.Carried > 0) != (b.Carried > 0) {
			return a.Carried > 0
		}
		if a.Carried > 0 {
			return a.Carried < b.Carried
		}
		ra, rb := round[Key{a.UserID, a.LabID}], round[Key{b.UserID, b.LabID}]
		if ra != rb {
			return ra < rb
		}
		if a.Lab != b.Lab {
			return a.Lab > b.Lab
		}
		if da, db := draw(sessionID, a.UserID), draw(sessionID, b.UserID); da != db {
			return da > db
		}
		if a.UserID != b.UserID {
			return a.UserID < b.UserID
		}
		return a.LabID < b.LabID
	})
	sort.SliceStable(late, func(i, j int) bool {
		if !late[i].SignedAt.Equal(late[j].SignedAt) {
			return late[i].SignedAt.Before(late[j].SignedAt)
		}
		return late[i].LabID < late[j].LabID
	})

	out := make([]Key, 0, len(entries))
	for _, e := range append(onTime, late...) {
		out = append(out, Key{e.UserID, e.LabID})
	}
	return out
}
