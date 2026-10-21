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

// ParseTab turns a tab into rows. group is used when the source has no group column.
func ParseTab(records [][]string, src models.GradeSource, group string) ([]models.GradeRow, error) {
	head := -1
	index := map[string]int{}
	for i := 0; i < len(records) && i < headerScan; i++ {
		idx := map[string]int{}
		for j, cell := range records[i] {
			if k := headerKey(cell); k != "" {
				if _, dup := idx[k]; !dup {
					idx[k] = j
				}
			}
		}
		_, hasName := idx[headerKey(src.NameColumn)]
		_, hasTotal := idx[headerKey(src.TotalColumn)]
		if hasName && hasTotal {
			head, index = i, idx
			break
		}
	}
	if head < 0 {
		return nil, ErrNoHeader
	}
	col := func(header string) int {
		if header == "" {
			return -1
		}
		if j, ok := index[headerKey(header)]; ok {
			return j
		}
		return -1
	}
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
	for _, rec := range records[head+1:] {
		name := strings.Join(strings.Fields(cell(rec, nameCol)), " ")
		// Пустые строки, подписи и итоги под таблицей — без хотя бы двух слов в ФИО.
		if len(strings.Fields(name)) < 2 || ParseNumber(name) != nil {
			continue
		}
		g := group
		if groupCol >= 0 {
			g = cell(rec, groupCol)
		}
		row := models.GradeRow{
			ISU:      normalizeID(cell(rec, idCol)),
			FullName: name,
			Group:    models.NormalizeGroup(g),
			Parts:    map[string]*float64{},
		}
		if t := ParseNumber(cell(rec, totalCol)); t != nil {
			row.Total = *t
		}
		for i, c := range src.Columns {
			row.Parts[c.Key] = ParseNumber(cell(rec, partCols[i]))
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
