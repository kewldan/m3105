package models

import (
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// User is a student account created on first Telegram or passkey login.
type User struct {
	ID         int64  `db:"id" json:"id"`
	WebauthnID []byte `db:"webauthn_id" json:"-"`
	// Name is what the site shows: the admin's DisplayName when set, otherwise TelegramName.
	Name string `db:"name" json:"name"`
	// TelegramName is refreshed from Telegram on every login.
	TelegramName string `db:"telegram_name" json:"telegramName"`
	// DisplayName is the permanent override set by an admin (e.g. "Имя Фамилия").
	DisplayName string `db:"display_name" json:"displayName"`
	// GroupName is the study group the account belongs to; confirmed by an admin.
	GroupName        string     `db:"group_name" json:"groupName"`
	Approved         bool       `db:"approved" json:"approved"`
	ApprovedAt       *time.Time `db:"approved_at" json:"approvedAt"`
	TelegramID       *int64     `db:"telegram_id" json:"telegramId"`
	TelegramUsername string     `db:"telegram_username" json:"telegramUsername"`
	PhotoURL         string     `db:"photo_url" json:"photoUrl"`
	CreatedAt        time.Time  `db:"created_at" json:"createdAt"`
	LastLoginAt      time.Time  `db:"last_login_at" json:"lastLoginAt"`
}

// AdminUserInput is what an admin can change about an account.
type AdminUserInput struct {
	DisplayName string `json:"displayName"`
	GroupName   string `json:"groupName"`
	Approved    bool   `json:"approved"`
}

// Validate normalises and checks the payload.
func (in *AdminUserInput) Validate() error {
	ve := httpx.NewValidation()
	in.DisplayName = strings.Join(strings.Fields(in.DisplayName), " ")
	in.GroupName = strings.TrimSpace(in.GroupName)
	if n := len([]rune(in.DisplayName)); n > 80 {
		ve.Add("displayName", "Не длиннее 80 символов")
	} else if n == 1 {
		ve.Add("displayName", "Слишком короткое имя")
	}
	if len([]rune(in.GroupName)) > 40 {
		ve.Add("groupName", "Не длиннее 40 символов")
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// PublicUser is the minimal shape shown to other students.
type PublicUser struct {
	ID       int64  `db:"id" json:"id"`
	Name     string `db:"name" json:"name"`
	PhotoURL string `db:"photo_url" json:"photoUrl"`
}

// Public strips private fields.
func (u User) Public() PublicUser {
	return PublicUser{ID: u.ID, Name: u.Name, PhotoURL: u.PhotoURL}
}

// AdminUser adds activity counters for the admin panel.
type AdminUser struct {
	User
	PasskeysCount    int `db:"passkeys_count" json:"passkeysCount"`
	CompletionsCount int `db:"completions_count" json:"completionsCount"`
	SignupsCount     int `db:"signups_count" json:"signupsCount"`
}

// Passkey is a WebAuthn credential (public key only) bound to a user.
type Passkey struct {
	ID         string     `db:"id" json:"id"`
	UserID     int64      `db:"user_id" json:"-"`
	Label      string     `db:"label" json:"label"`
	Credential []byte     `db:"credential" json:"-"`
	CreatedAt  time.Time  `db:"created_at" json:"createdAt"`
	LastUsedAt *time.Time `db:"last_used_at" json:"lastUsedAt"`
}

// PracticeSession is a class where completed labs can be handed in.
type PracticeSession struct {
	ID        int64      `db:"id" json:"id"`
	SubjectID int64      `db:"subject_id" json:"subjectId"`
	StartsAt  time.Time  `db:"starts_at" json:"startsAt"`
	EndsAt    *time.Time `db:"ends_at" json:"endsAt"`
	Location  string     `db:"location" json:"location"`
	Capacity  *int       `db:"capacity" json:"capacity"`
	Note      string     `db:"note" json:"note"`
	CreatedAt time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time  `db:"updated_at" json:"updatedAt"`

	SubjectSlug      string `db:"subject_slug" json:"subjectSlug"`
	SubjectName      string `db:"subject_name" json:"subjectName"`
	SubjectShortName string `db:"subject_short_name" json:"subjectShortName"`
	SubjectColor     string `db:"subject_color" json:"subjectColor"`
	SubjectIcon      string `db:"subject_icon" json:"subjectIcon"`
	// SignupsCount is the number of distinct students signed up.
	SignupsCount int `db:"signups_count" json:"signupsCount"`
}

// PracticeSessionInput is the admin create/update payload.
type PracticeSessionInput struct {
	SubjectID int64      `json:"subjectId"`
	StartsAt  time.Time  `json:"startsAt"`
	EndsAt    *time.Time `json:"endsAt"`
	Location  string     `json:"location"`
	Capacity  *int       `json:"capacity"`
	Note      string     `json:"note"`
}

// Validate normalises and checks the payload.
func (in *PracticeSessionInput) Validate() error {
	ve := httpx.NewValidation()
	in.Location = strings.TrimSpace(in.Location)
	in.Note = strings.TrimSpace(in.Note)
	if in.SubjectID <= 0 {
		ve.Add("subjectId", "Выберите предмет")
	}
	if in.StartsAt.IsZero() {
		ve.Add("startsAt", "Укажите дату и время")
	}
	if in.EndsAt != nil && in.EndsAt.Before(in.StartsAt) {
		ve.Add("endsAt", "Окончание раньше начала")
	}
	if in.Capacity != nil && *in.Capacity <= 0 {
		in.Capacity = nil
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// LabRef is a compact lab reference used in signup lists.
type LabRef struct {
	ID          int64  `db:"id" json:"id"`
	Number      int    `db:"number" json:"number"`
	Title       string `db:"title" json:"title"`
	Slug        string `db:"slug" json:"slug"`
	SubjectSlug string `db:"subject_slug" json:"subjectSlug"`
}

// SignupRow is one (session, user, lab) triple with joined names.
type SignupRow struct {
	SessionID   int64     `db:"session_id" json:"sessionId"`
	UserID      int64     `db:"user_id" json:"userId"`
	UserName    string    `db:"user_name" json:"userName"`
	PhotoURL    string    `db:"photo_url" json:"photoUrl"`
	LabID       int64     `db:"lab_id" json:"labId"`
	LabNumber   int       `db:"lab_number" json:"labNumber"`
	LabTitle    string    `db:"lab_title" json:"labTitle"`
	LabSlug     string    `db:"lab_slug" json:"labSlug"`
	SubjectSlug string    `db:"subject_slug" json:"subjectSlug"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
}

// Participant groups a student's labs for one session.
type Participant struct {
	User PublicUser `json:"user"`
	Labs []LabRef   `json:"labs"`
}

// PracticeSessionView is a session with participants (names only for signed-in users).
type PracticeSessionView struct {
	PracticeSession
	Participants  []Participant `json:"participants"`
	MyLabIDs      []int64       `json:"myLabIds"`
	Full          bool          `json:"full"`
	Past          bool          `json:"past"`
	AvailableLabs []LabRef      `json:"availableLabs"`
}

// MySignup is a signup as seen from the student's profile.
type MySignup struct {
	Session PracticeSession `json:"session"`
	Labs    []LabRef        `json:"labs"`
}

// MeResponse is the signed-in student's profile bundle.
type MeResponse struct {
	User            User       `json:"user"`
	CompletedLabIDs []int64    `json:"completedLabIds"`
	Signups         []MySignup `json:"signups"`
	Passkeys        []Passkey  `json:"passkeys"`
}
