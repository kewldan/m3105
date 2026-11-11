package grades

import (
	"fmt"
	"math"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// maxWarnings is how many disagreeing labs a sync reports by name.
const maxWarnings = 5

// CheckScheme compares the lab totals in the sheet with what the scheme
// gives. The sheet is right by definition: a disagreement means the teacher
// changed the rules (a new deadline stage, another percent for a plus) and
// the source settings need the same change, or the site shows wrong
// potentials. Labs with an empty total are not checked.
func CheckScheme(src models.GradeSource, rows []models.GradeRow) []string {
	out := []string{}
	if !src.Scheme.Enabled() {
		return out
	}
	labels := map[string]string{}
	for _, c := range src.Columns {
		labels[c.Key] = c.Label
	}
	extra := 0
	for _, r := range rows {
		for key, lab := range src.Scheme.Labs(src.Columns, r.Details) {
			got := r.Parts[key]
			if lab.Status != models.LabDone || got == nil || math.Abs(*got-*lab.Points) < 0.015 {
				continue
			}
			if len(out) == maxWarnings {
				extra++
				continue
			}
			out = append(out, fmt.Sprintf("%s, %s: в таблице %s, по схеме %s",
				models.ShortName(r.FullName), labels[key], fmtNum(*got), fmtNum(*lab.Points)))
		}
	}
	if extra > 0 {
		out = append(out, fmt.Sprintf("и ещё %d", extra))
	}
	return out
}

func fmtNum(v float64) string { return fmt.Sprintf("%g", math.Round(v*100)/100) }
