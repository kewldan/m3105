package grades

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// headerScan is how many top rows may hold the header (titles above the table).
const headerScan = 10

// ErrNoHeader means the tab has no row with the name and total columns: a
// service sheet like "Статистика", skipped without failing the sync.
var ErrNoHeader = errors.New("нет строки заголовков")

func headerKey(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }

var columnNumberRe = regexp.MustCompile(`^#(\d{1,3})$`)

// findColumn returns the index of the column titled want in a header row, or -1.
// "#3" means the third column, for columns without a title. A title matches
// exactly or as the start of a longer one: "ЛР1" finds "ЛР1 (база)" — the
// same column is often annotated differently on each tab.
func findColumn(header []string, want string) int {
	if want == "" {
		return -1
	}
	if m := columnNumberRe.FindStringSubmatch(want); m != nil {
		n, _ := strconv.Atoi(m[1])
		return n - 1
	}
	w := headerKey(want)
	prefix := -1
	for j, cell := range header {
		k := headerKey(cell)
		if k == w {
			return j
		}
		if prefix < 0 && (strings.HasPrefix(k, w+" ") || strings.HasPrefix(k, w+"(")) {
			prefix = j
		}
	}
	return prefix
}

// groupRowRe matches a section row like "M3105" that heads its group's students.
var groupRowRe = regexp.MustCompile(`^[A-ZА-ЯЁ]\d{4,5}$`)

// sectionGroup returns the group of a row whose only filled cell is a group code.
func sectionGroup(row []string) string {
	found := ""
	for _, c := range row {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if found != "" || !groupRowRe.MatchString(strings.ToUpper(c)) {
			return ""
		}
		found = c
	}
	return found
}

// findHeader looks for a column title in the header row and then in the rows
// above it, nearest first: sheets often put a group title ("Total for the
// semester") a row or two above the row with the names of the columns.
func findHeader(records [][]string, head int, want string) int {
	for i := head; i >= 0; i-- {
		if j := findColumn(records[i], want); j >= 0 {
			return j
		}
	}
	return -1
}

// ParseTab turns a tab into rows. The header row is the one with the name
// column; other titles may sit above it. The group of a row comes from the
// group column, else from the latest section row ("M3105" alone in a row),
// else from the tab name. Without a total column the total is the sum of the
// breakdown.
func ParseTab(records [][]string, src models.GradeSource, tabName string) ([]models.GradeRow, error) {
	head := -1
	if !columnNumberRe.MatchString(src.NameColumn) {
		for i := 0; i < len(records) && i < headerScan; i++ {
			if findColumn(records[i], src.NameColumn) >= 0 &&
				(src.TotalColumn == "" || findHeader(records, i, src.TotalColumn) >= 0) {
				head = i
				break
			}
		}
	}
	if head < 0 {
		return nil, ErrNoHeader
	}
	col := func(want string) int { return findHeader(records, head, want) }
	nameCol, totalCol := col(src.NameColumn), col(src.TotalColumn)
	idCol, groupCol := col(src.IDColumn), col(src.GroupColumn)
	if src.GroupColumn != "" && groupCol < 0 {
		return nil, fmt.Errorf("нет столбца %q", src.GroupColumn)
	}
	partCols := make([]int, len(src.Columns))
	for i, c := range src.Columns {
		partCols[i] = col(c.Header)
	}

	cell := func(row []string, j int) string {
		if j < 0 || j >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[j])
	}
	var rows []models.GradeRow
	section := ""
	for _, rec := range records[head+1:] {
		if g := sectionGroup(rec); g != "" {
			section = g
			continue
		}
		name := strings.Join(strings.Fields(cell(rec, nameCol)), " ")
		// Пустые строки, подписи и итоги под таблицей — без хотя бы двух слов в ФИО.
		if len(strings.Fields(name)) < 2 || ParseNumber(name) != nil {
			continue
		}
		isu := normalizeID(cell(rec, idCol))
		// Есть столбец ИСУ, а номера нет — служебная строка вроде «max число баллов».
		if idCol >= 0 && isu == "" {
			continue
		}
		g := tabName
		switch {
		case groupCol >= 0:
			g = cell(rec, groupCol)
		case section != "":
			g = section
		}
		row := models.GradeRow{
			ISU:      isu,
			FullName: name,
			Group:    models.NormalizeGroup(g),
			Parts:    map[string]*float64{},
		}
		// Столбца нет на этой вкладке — части нет вовсе (ключ не пишется), а
		// пустая ячейка — часть есть, но баллов пока нет (null).
		sum := 0.0
		for i, c := range src.Columns {
			if partCols[i] < 0 {
				continue
			}
			v := ParseNumber(cell(rec, partCols[i]))
			row.Parts[c.Key] = v
			if v != nil {
				sum += *v
			}
		}
		// Столбца итога нет или он ещё не посчитан — сумма разбивки.
		if t := ParseNumber(cell(rec, totalCol)); t != nil {
			row.Total = *t
		} else {
			row.Total = math.Round(sum*100) / 100
		}
		row.RowKey = row.ISU
		if row.RowKey == "" {
			row.RowKey = "name:" + strings.ToLower(name)
		}
		rows = append(rows, row)
	}
	return rows, nil
}

var digitsRe = regexp.MustCompile(`^\d{5,7}$`)

// normalizeID keeps an ISU number only when it looks like one ("558434", "558434.0").
func normalizeID(s string) string {
	s = strings.TrimSuffix(strings.TrimSuffix(s, ".0"), ",0")
	if digitsRe.MatchString(s) {
		return s
	}
	return ""
}

// ParseNumber reads "11,04", "12", "−3" or "1 234,5"; empty and text give nil.
func ParseNumber(s string) *float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	s = strings.NewReplacer(" ", "", " ", "", ",", ".", "−", "-").Replace(s)
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	v = math.Round(v*100) / 100
	return &v
}
