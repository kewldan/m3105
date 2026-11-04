package models

import (
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// Student is a row of the course list. Accounts are confirmed by picking one:
// the account then gets its ISU number, name and group from here.
type Student struct {
	ID        int64     `db:"id" json:"id"`
	ISU       string    `db:"isu" json:"isu"`
	FullName  string    `db:"full_name" json:"fullName"`
	GroupName string    `db:"group_name" json:"groupName"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	// UserID and UserName describe the account that picked the student, if any.
	UserID   *int64  `db:"user_id" json:"userId"`
	UserName *string `db:"user_name" json:"userName"`
}

// StudentChoice is a free row offered to a new account. ISU stays private.
type StudentChoice struct {
	ID        int64  `db:"id" json:"id"`
	FullName  string `db:"full_name" json:"fullName"`
	GroupName string `db:"group_name" json:"groupName"`
}

// StudentInput is one row the admin adds by hand or imports.
type StudentInput struct {
	ISU       string `json:"isu"`
	FullName  string `json:"fullName"`
	GroupName string `json:"groupName"`
}

// Validate normalises and checks the row.
func (in *StudentInput) Validate() error {
	ve := httpx.NewValidation()
	isu, ok := NormalizeISU(in.ISU)
	in.ISU = isu
	if !ok || isu == "" {
		ve.Add("isu", "Номер ИСУ — от 5 до 7 цифр")
	}
	in.FullName = strings.Join(strings.Fields(in.FullName), " ")
	switch n := len([]rune(in.FullName)); {
	case n > 120:
		ve.Add("fullName", "Не длиннее 120 символов")
	case len(strings.Fields(in.FullName)) < 2:
		ve.Add("fullName", "Укажите фамилию и имя")
	}
	in.GroupName = NormalizeGroup(in.GroupName)
	switch n := len([]rune(in.GroupName)); {
	case n == 0:
		ve.Add("groupName", "Укажите группу")
	case n > 40:
		ve.Add("groupName", "Не длиннее 40 символов")
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// StudentImport is a pasted table or a saved page with the group lists.
type StudentImport struct {
	Text string `json:"text"`
}

// StudentImportResult says what an import changed.
type StudentImportResult struct {
	Added   int `json:"added"`
	Updated int `json:"updated"`
	// Skipped counts lines that looked like data but had no ISU, name or group.
	Skipped int `json:"skipped"`
	Total   int `json:"total"`
}

// ClaimInput is the student's pick from the list.
type ClaimInput struct {
	StudentID int64 `json:"studentId"`
}

// FirstLast turns "Фамилия Имя Отчество" into "Имя Фамилия", the name the site shows.
func FirstLast(full string) string {
	f := strings.Fields(full)
	if len(f) < 2 {
		return strings.Join(f, " ")
	}
	return f[1] + " " + f[0]
}
