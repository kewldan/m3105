package models

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// GradeColumn is a sheet column shown as part of the score breakdown.
type GradeColumn struct {
	// Key identifies the part in GradeRow.Parts; stable across header renames.
	Key   string `json:"key"`
	Label string `json:"label"`
	// Header is the column title in the sheet (the first match wins).
	Header string `json:"header"`
	// Max is the most the part can give; 0 when unknown.
	Max float64 `json:"max"`
}

// GradeSource is an external spreadsheet with scores for one subject.
type GradeSource struct {
	ID            int64         `db:"id" json:"id"`
	SubjectID     int64         `db:"subject_id" json:"subjectId"`
	Title         string        `db:"title" json:"title"`
	SpreadsheetID string        `db:"spreadsheet_id" json:"spreadsheetId"`
	TabPattern    string        `db:"tab_pattern" json:"tabPattern"`
	NameColumn    string        `db:"name_column" json:"nameColumn"`
	IDColumn      string        `db:"id_column" json:"idColumn"`
	GroupColumn   string        `db:"group_column" json:"groupColumn"`
	TotalColumn   string        `db:"total_column" json:"totalColumn"`
	MaxTotal      float64       `db:"max_total" json:"maxTotal"`
	Columns       []GradeColumn `db:"columns" json:"columns"`
	SyncHours     int           `db:"sync_hours" json:"syncHours"`
	Enabled       bool          `db:"enabled" json:"enabled"`
	SyncedAt      *time.Time    `db:"synced_at" json:"syncedAt"`
	SyncError     string        `db:"sync_error" json:"syncError"`
	RowsCount     int           `db:"rows_count" json:"rowsCount"`
	CreatedAt     time.Time     `db:"created_at" json:"createdAt"`
	UpdatedAt     time.Time     `db:"updated_at" json:"updatedAt"`

	SubjectSlug  string `db:"subject_slug" json:"subjectSlug"`
	SubjectName  string `db:"subject_name" json:"subjectName"`
	SubjectColor string `db:"subject_color" json:"subjectColor"`
	SubjectIcon  string `db:"subject_icon" json:"subjectIcon"`
	// LinkedCount is how many rows belong to site accounts (admin only).
	LinkedCount int `db:"linked_count" json:"linkedCount"`
}

// Label is what the site calls the source: its title or the subject name.
func (s GradeSource) Label() string {
	if s.Title != "" {
		return s.Title
	}
	return s.SubjectName
}

// GradeSourceInput is the admin create/update payload.
type GradeSourceInput struct {
	SubjectID int64  `json:"subjectId"`
	Title     string `json:"title"`
	// Spreadsheet accepts the full Google Sheets link or the bare id.
	Spreadsheet string        `json:"spreadsheet"`
	TabPattern  string        `json:"tabPattern"`
	NameColumn  string        `json:"nameColumn"`
	IDColumn    string        `json:"idColumn"`
	GroupColumn string        `json:"groupColumn"`
	TotalColumn string        `json:"totalColumn"`
	MaxTotal    float64       `json:"maxTotal"`
	Columns     []GradeColumn `json:"columns"`
	SyncHours   int           `json:"syncHours"`
	Enabled     bool          `json:"enabled"`

	// SpreadsheetID is filled by Validate from Spreadsheet.
	SpreadsheetID string `json:"-"`
}

var (
	spreadsheetURLRe = regexp.MustCompile(`/spreadsheets/d/([A-Za-z0-9_-]{20,})`)
	spreadsheetIDRe  = regexp.MustCompile(`^[A-Za-z0-9_-]{20,}$`)
	columnKeyRe      = regexp.MustCompile(`^[a-z0-9_]{1,32}$`)
)

// Validate normalises and checks the payload.
func (in *GradeSourceInput) Validate() error {
	ve := httpx.NewValidation()
	in.Title = strings.TrimSpace(in.Title)
	in.Spreadsheet = strings.TrimSpace(in.Spreadsheet)
	in.TabPattern = strings.TrimSpace(in.TabPattern)
	in.NameColumn = strings.TrimSpace(in.NameColumn)
	in.IDColumn = strings.TrimSpace(in.IDColumn)
	in.GroupColumn = strings.TrimSpace(in.GroupColumn)
	in.TotalColumn = strings.TrimSpace(in.TotalColumn)
	if in.SubjectID <= 0 {
		ve.Add("subjectId", "Выберите предмет")
	}
	if len([]rune(in.Title)) > 80 {
		ve.Add("title", "Не длиннее 80 символов")
	}
	if m := spreadsheetURLRe.FindStringSubmatch(in.Spreadsheet); m != nil {
		in.SpreadsheetID = m[1]
	} else if spreadsheetIDRe.MatchString(in.Spreadsheet) {
		in.SpreadsheetID = in.Spreadsheet
	} else {
		ve.Add("spreadsheet", "Нужна ссылка на Google-таблицу")
	}
	if in.TabPattern != "" {
		if _, err := regexp.Compile(in.TabPattern); err != nil {
			ve.Add("tabPattern", "Некорректное регулярное выражение")
		}
	}
	if in.NameColumn == "" {
		ve.Add("nameColumn", "Укажите столбец с ФИО")
	}
	if in.TotalColumn == "" {
		ve.Add("totalColumn", "Укажите столбец с итогом")
	}
	if in.MaxTotal <= 0 {
		in.MaxTotal = 100
	}
	if in.SyncHours < 1 || in.SyncHours > 168 {
		ve.Add("syncHours", "От 1 до 168 часов")
	}
	if in.Columns == nil {
		in.Columns = []GradeColumn{}
	}
	seen := map[string]bool{}
	for i := range in.Columns {
		c := &in.Columns[i]
		c.Header = strings.TrimSpace(c.Header)
		c.Label = strings.TrimSpace(c.Label)
		c.Key = strings.ToLower(strings.TrimSpace(c.Key))
		if c.Key == "" {
			c.Key = fmt.Sprintf("c%d", i+1)
		}
		if c.Label == "" {
			c.Label = c.Header
		}
		switch {
		case c.Header == "":
			ve.Add("columns", fmt.Sprintf("Столбец %d: нет заголовка", i+1))
		case !columnKeyRe.MatchString(c.Key):
			ve.Add("columns", fmt.Sprintf("Столбец %d: ключ — латиница, цифры и _", i+1))
		case seen[c.Key]:
			ve.Add("columns", fmt.Sprintf("Ключ %q повторяется", c.Key))
		case c.Max < 0:
			ve.Add("columns", fmt.Sprintf("Столбец %d: максимум не может быть отрицательным", i+1))
		}
		seen[c.Key] = true
	}
	if len(in.Columns) > 20 {
		ve.Add("columns", "Не больше 20 столбцов")
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// GradeRow is one student's line of a source.
type GradeRow struct {
	SourceID  int64               `db:"source_id" json:"-"`
	RowKey    string              `db:"row_key" json:"-"`
	ISU       string              `db:"isu" json:"-"`
	FullName  string              `db:"full_name" json:"-"`
	Group     string              `db:"group_name" json:"group"`
	Total     float64             `db:"total" json:"total"`
	Parts     map[string]*float64 `db:"parts" json:"parts"`
	ChangedAt time.Time           `db:"changed_at" json:"changedAt"`
}

// GradeEntry is a row as shown in the rating: no ISU, a short name.
type GradeEntry struct {
	// Name is "Фамилия Имя" from the sheet, or the site name of a linked account.
	Name      string              `json:"name"`
	Group     string              `json:"group"`
	Total     float64             `json:"total"`
	Parts     map[string]*float64 `json:"parts"`
	ChangedAt time.Time           `json:"changedAt"`
	// User is the site account the row belongs to.
	User *PublicUser `json:"user"`
	Me   bool        `json:"me"`
}

// GradeSourceSummary is a source as students see it.
type GradeSourceSummary struct {
	ID           int64         `json:"id"`
	Title        string        `json:"title"`
	SubjectSlug  string        `json:"subjectSlug"`
	SubjectName  string        `json:"subjectName"`
	SubjectColor string        `json:"subjectColor"`
	SubjectIcon  string        `json:"subjectIcon"`
	MaxTotal     float64       `json:"maxTotal"`
	Columns      []GradeColumn `json:"columns"`
	SyncedAt     *time.Time    `json:"syncedAt"`
}

// Summary strips admin-only settings.
func (s GradeSource) Summary() GradeSourceSummary {
	cols := make([]GradeColumn, len(s.Columns))
	for i, c := range s.Columns {
		cols[i] = GradeColumn{Key: c.Key, Label: c.Label, Max: c.Max}
	}
	return GradeSourceSummary{
		ID: s.ID, Title: s.Label(), SubjectSlug: s.SubjectSlug, SubjectName: s.SubjectName,
		SubjectColor: s.SubjectColor, SubjectIcon: s.SubjectIcon, MaxTotal: s.MaxTotal,
		Columns: cols, SyncedAt: s.SyncedAt,
	}
}

// GradesResponse is the rating page payload.
type GradesResponse struct {
	Sources []GradeSourceSummary `json:"sources"`
	// Source is the selected one; nil when there are none.
	Source *GradeSourceSummary `json:"source"`
	Rows   []GradeEntry        `json:"rows"`
	// MyGroup is the group to open the rating with: from the student's row, else the account.
	MyGroup string `json:"myGroup"`
	// Linked: the account has an ISU number bound.
	Linked bool `json:"linked"`
}

// Place is a rank among size people (1 is the best).
type Place struct {
	Rank int `db:"rank" json:"rank"`
	Size int `db:"size" json:"size"`
}

// MyGrade is the student's own result in one source, for the profile.
type MyGrade struct {
	Source  GradeSourceSummary  `json:"source"`
	Group   string              `json:"group"`
	Total   float64             `json:"total"`
	Parts   map[string]*float64 `json:"parts"`
	Course  Place               `json:"course"`
	InGroup Place               `json:"inGroup"`
	// Site is the place among students registered on the site.
	Site      Place     `json:"site"`
	ChangedAt time.Time `json:"changedAt"`
}

// GradeSyncResult reports what a sync found.
type GradeSyncResult struct {
	Tabs    []string `json:"tabs"`
	Skipped []string `json:"skipped"`
	Rows    int      `json:"rows"`
	// Linked is how many accounts got their ISU from name matching.
	Linked int `json:"linked"`
}

var isuRe = regexp.MustCompile(`^\d{5,7}$`)

// NormalizeISU trims the number and checks its shape; empty is allowed (unlink).
func NormalizeISU(raw string) (string, bool) {
	s := strings.TrimSpace(raw)
	return s, s == "" || isuRe.MatchString(s)
}

// NormalizeGroup brings "m 3105" and "М3105" to one spelling with a Cyrillic "М".
func NormalizeGroup(s string) string {
	return strings.ReplaceAll(strings.ToUpper(strings.Join(strings.Fields(s), "")), "M", "М")
}

// ShortName turns "Фамилия Имя Отчество" into "Фамилия Имя".
func ShortName(full string) string {
	f := strings.Fields(full)
	if len(f) > 2 {
		f = f[:2]
	}
	return strings.Join(f, " ")
}

// Letter is the ITMO letter grade for a score scaled to 100 points.
func Letter(total, maxTotal float64) string {
	if maxTotal <= 0 {
		maxTotal = 100
	}
	switch p := total / maxTotal * 100; {
	case p >= 91:
		return "A"
	case p >= 84:
		return "B"
	case p >= 74:
		return "C"
	case p >= 68:
		return "D"
	case p >= 60:
		return "E"
	default:
		return "F"
	}
}
