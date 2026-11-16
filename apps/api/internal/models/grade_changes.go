package models

import (
	"regexp"
	"time"
)

// Kinds of a grade change.
const (
	// ChangeLab: the lab got accepted — the acceptance cells of its block (the
	// deadline stage, pluses, minuses) got filled; without a scheme, a lab
	// column got points.
	ChangeLab = "lab"
	// ChangeTheory: the theory-min cell of the lab got filled.
	ChangeTheory = "theory"
)

// GradeChange is something graded between two syncs of a sheet row.
type GradeChange struct {
	RowKey   string
	ISU      string
	FullName string
	Group    string
	Part     string
	Kind     string
}

var labColumnRe = regexp.MustCompile(`(?i)^\s*(лаба|лаб\.?|лр|lab)\s*\d`)

// IsLabColumn tells a lab column of a sheet without a scheme by its label or
// header: «Лаба 3», «ЛР 0», «Lab 2».
func IsLabColumn(c GradeColumn) bool {
	return labColumnRe.MatchString(c.Label) || labColumnRe.MatchString(c.Header)
}

// GradeChanges compares a row with its previous version. With a scheme a lab
// counts as accepted when the acceptance cells of its block get filled, and
// the theory min when its cell gets a value: they are taken by different
// people and counted apart. Columns without a block (live coding, exam) are
// not labs. Without a scheme only lab columns count (IsLabColumn): empty or zero
// turning into points.
func GradeChanges(src GradeSource, old, cur GradeRow) []GradeChange {
	out := []GradeChange{}
	add := func(part, kind string) {
		out = append(out, GradeChange{RowKey: cur.RowKey, ISU: cur.ISU, FullName: cur.FullName, Group: NormalizeGroup(cur.Group), Part: part, Kind: kind})
	}
	for _, c := range src.Columns {
		if src.Scheme.Enabled() {
			now, ok := cur.Details[c.Key]
			if !ok {
				continue
			}
			was := old.Details[c.Key]
			if accepted(now) && !accepted(was) {
				add(c.Key, ChangeLab)
			}
			if was.Theory == nil && now.Theory != nil {
				add(c.Key, ChangeTheory)
			}
			continue
		}
		if !IsLabColumn(c) {
			continue
		}
		if positive(cur.Parts[c.Key]) && !positive(old.Parts[c.Key]) {
			add(c.Key, ChangeLab)
		}
	}
	return out
}

func positive(v *float64) bool { return v != nil && *v > 0 }

// accepted: the teacher marked the lab accepted — a deadline stage (0 is in
// time) or pluses or minuses.
func accepted(c LabCells) bool { return c.Late != nil || positive(c.Plus) || positive(c.Minus) }

// PracticeChange is one grade change put down to a practice session.
type PracticeChange struct {
	Name  string `json:"name"`
	Group string `json:"group"`
	// Part is the column key, Label its caption («Лаба 3»).
	Part  string `json:"part"`
	Label string `json:"label"`
	Kind  string `json:"kind"`
	// DetectedAt is the sync that saw it; it happened after PrevSyncAt.
	DetectedAt time.Time  `json:"detectedAt"`
	PrevSyncAt *time.Time `json:"prevSyncAt"`
	// InSession: seen during the session (or soon after), so it counts for the pace.
	InSession bool `json:"inSession"`
}
