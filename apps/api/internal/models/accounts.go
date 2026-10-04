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
	// DisplayName is "Имя Фамилия" set by the student or an admin; it overrides TelegramName.
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

// ProfileInput is what students can change about themselves.
type ProfileInput struct {
	DisplayName string `json:"displayName"`
}

// Validate normalises and checks the payload. Empty resets to the Telegram name.
func (in *ProfileInput) Validate() error {
	ve := httpx.NewValidation()
	in.DisplayName = strings.Join(strings.Fields(in.DisplayName), " ")
	switch n := len([]rune(in.DisplayName)); {
	case n > 80:
		ve.Add("displayName", "Не длиннее 80 символов")
	case n > 0 && len(strings.Fields(in.DisplayName)) < 2:
		ve.Add("displayName", "Укажите имя и фамилию")
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
	// QueueManual: the admin has set the order by hand.
	QueueManual bool `db:"queue_manual" json:"-"`
	// QueueFrozen: the order has been frozen and stored in queue_pos.
	QueueFrozen bool `db:"queue_frozen" json:"-"`
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

// SignupOrderInput is the admin payload that sets the queue order of a session.
type SignupOrderInput struct {
	Entries []struct {
		UserID int64 `json:"userId"`
		LabID  int64 `json:"labId"`
	} `json:"entries"`
}

// Validate checks the payload.
func (in *SignupOrderInput) Validate() error {
	if len(in.Entries) == 0 {
		ve := httpx.NewValidation()
		ve.Add("entries", "Список пуст")
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

// QueueEntry is one defence in a session's queue.
type QueueEntry struct {
	User PublicUser `json:"user"`
	Lab  LabRef     `json:"lab"`
	// Reserve: beyond the number of defences the teacher takes; taken if time allows.
	Reserve bool `json:"reserve"`
	// Carried: left in the reserve last time, so it goes first now.
	Carried bool `json:"carried"`
	// Late: signed up after the freeze, so it went to the end.
	Late bool `json:"late"`
}

// PracticeSessionView is a session with its queue, public to everyone.
type PracticeSessionView struct {
	PracticeSession
	// Queue is the defences in hand-in order.
	Queue []QueueEntry `json:"queue"`
	// FreezesAt is when the order stops being reshuffled by new signups.
	FreezesAt time.Time `json:"freezesAt"`
	Frozen    bool      `json:"frozen"`
	// Participants are the students in the order of their first defence.
	Participants []Participant `json:"participants"`
	MyLabIDs     []int64       `json:"myLabIds"`
	// Full: the main list is taken, new defences go to the reserve.
	Full          bool     `json:"full"`
	Past          bool     `json:"past"`
	AvailableLabs []LabRef `json:"availableLabs"`
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
