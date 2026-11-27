package grades

import (
	"strings"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// FillFromCourse gives rows without an ISU number the number and full name
// of their student from the course list: some teachers keep only «Фамилия
// И. О.». A row matches a student of its group when the surname is the same
// and every following word is the same or is its initial; the match must be
// the only one both ways, or the row keeps its name and stays unlinked.
// Rows that got a number are keyed by it, as if the sheet had it.
func FillFromCourse(rows []models.GradeRow, students []models.Student) {
	byRow := map[int]int{}
	claims := map[int]int{}
	for i, r := range rows {
		if r.ISU != "" {
			continue
		}
		words := nameWords(strings.ReplaceAll(r.FullName, ".", ". "))
		if len(words) < 2 {
			continue
		}
		found := -1
		for j, st := range students {
			if !models.SameGroup(r.Group, st.GroupName) || !nameMatches(words, nameWords(st.FullName)) {
				continue
			}
			if found >= 0 {
				found = -2
				break
			}
			found = j
		}
		if found >= 0 {
			byRow[i] = found
			claims[found]++
		}
	}
	for i, j := range byRow {
		if claims[j] != 1 {
			continue
		}
		rows[i].ISU = students[j].ISU
		rows[i].FullName = strings.Join(strings.Fields(students[j].FullName), " ")
		rows[i].RowKey = rows[i].ISU
	}
}

// nameMatches compares «седых в. а.» with «седых виктория алексеевна»: the
// surname whole, the rest whole or by the initial.
func nameMatches(sheet, full []string) bool {
	if len(sheet) > len(full) || sheet[0] != full[0] {
		return false
	}
	for i, w := range sheet[1:] {
		f := full[i+1]
		w = strings.TrimSuffix(w, ".")
		if len([]rune(w)) == 1 {
			if !strings.HasPrefix(f, w) {
				return false
			}
		} else if w != f {
			return false
		}
	}
	return true
}
