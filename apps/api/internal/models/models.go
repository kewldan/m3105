// Package models defines the JSON/database shapes shared by store and API.
package models

import (
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/quiz"
	"github.com/kewldan/edu3105/apps/api/internal/slug"
)

// Link is a titled URL used for materials and external resources.
type Link struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// Colors lists the accepted subject color keys (mapped to Tailwind palettes on the web).
var Colors = []string{"blue", "indigo", "violet", "cyan", "teal", "emerald", "amber", "orange", "rose", "slate"}

// Status values for publishable entities.
const (
	StatusDraft     = "draft"
	StatusPublished = "published"
)

func validColor(c string) bool {
	for _, k := range Colors {
		if k == c {
			return true
		}
	}
	return false
}

func validStatus(s string) bool { return s == StatusDraft || s == StatusPublished }

func validateLinks(ve *httpx.ValidationError, field string, links []Link) {
	for i, l := range links {
		if strings.TrimSpace(l.Title) == "" {
			ve.Add(field, "У ссылки №"+itoa(i+1)+" нет названия")
			return
		}
		u, err := url.Parse(strings.TrimSpace(l.URL))
		if err != nil || u.Scheme == "" || u.Host == "" {
			ve.Add(field, "У ссылки №"+itoa(i+1)+" некорректный адрес")
			return
		}
	}
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b []byte
	for i > 0 {
		b = append([]byte{byte('0' + i%10)}, b...)
		i /= 10
	}
	return string(b)
}

func cleanLinks(links []Link) []Link {
	out := make([]Link, 0, len(links))
	for _, l := range links {
		out = append(out, Link{Title: strings.TrimSpace(l.Title), URL: strings.TrimSpace(l.URL)})
	}
	return out
}

// ---------- Settings ----------

// Settings is the singleton site configuration.
type Settings struct {
	SiteTitle       string      `db:"site_title" json:"siteTitle"`
	GroupName       string      `db:"group_name" json:"groupName"`
	Description     string      `db:"description" json:"description"`
	SemesterStart   pgtype.Date `db:"semester_start" json:"semesterStart"`
	SemesterEnd     pgtype.Date `db:"semester_end" json:"semesterEnd"`
	FirstWeekParity string      `db:"first_week_parity" json:"firstWeekParity"`
	Timezone        string      `db:"timezone" json:"timezone"`
	Links           []Link      `db:"links" json:"links"`
	InviteCode      string      `db:"invite_code" json:"inviteCode"`
	UpdatedAt       time.Time   `db:"updated_at" json:"updatedAt"`
}

// Validate normalises and checks settings input.
func (s *Settings) Validate() error {
	ve := httpx.NewValidation()
	s.SiteTitle = strings.TrimSpace(s.SiteTitle)
	s.GroupName = strings.TrimSpace(s.GroupName)
	s.Description = strings.TrimSpace(s.Description)
	s.Timezone = strings.TrimSpace(s.Timezone)
	s.InviteCode = strings.TrimSpace(s.InviteCode)
	if s.SiteTitle == "" {
		ve.Add("siteTitle", "Укажите название сайта")
	}
	if s.GroupName == "" {
		ve.Add("groupName", "Укажите название группы")
	}
	if s.FirstWeekParity != "odd" && s.FirstWeekParity != "even" {
		ve.Add("firstWeekParity", "Чётность первой недели: odd или even")
	}
	if s.Timezone == "" {
		s.Timezone = "Europe/Moscow"
	}
	if _, err := time.LoadLocation(s.Timezone); err != nil {
		ve.Add("timezone", "Неизвестный часовой пояс")
	}
	if s.SemesterStart.Valid && s.SemesterEnd.Valid && s.SemesterEnd.Time.Before(s.SemesterStart.Time) {
		ve.Add("semesterEnd", "Конец семестра раньше начала")
	}
	if s.Links == nil {
		s.Links = []Link{}
	}
	s.Links = cleanLinks(s.Links)
	validateLinks(ve, "links", s.Links)
	if !ve.Empty() {
		return ve
	}
	return nil
}

// ---------- Subjects ----------

// Subject is a course/discipline.
type Subject struct {
	ID          int64     `db:"id" json:"id"`
	Slug        string    `db:"slug" json:"slug"`
	Name        string    `db:"name" json:"name"`
	ShortName   string    `db:"short_name" json:"shortName"`
	Color       string    `db:"color" json:"color"`
	Icon        string    `db:"icon" json:"icon"`
	Teacher     string    `db:"teacher" json:"teacher"`
	Description string    `db:"description" json:"description"`
	Links       []Link    `db:"links" json:"links"`
	Position    int       `db:"position" json:"position"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time `db:"updated_at" json:"updatedAt"`
}

// SubjectInput is the create/update payload for a subject.
type SubjectInput struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	ShortName   string `json:"shortName"`
	Color       string `json:"color"`
	Icon        string `json:"icon"`
	Teacher     string `json:"teacher"`
	Description string `json:"description"`
	Links       []Link `json:"links"`
	Position    int    `json:"position"`
}

// Validate normalises and checks the payload.
func (in *SubjectInput) Validate() error {
	ve := httpx.NewValidation()
	in.Name = strings.TrimSpace(in.Name)
	in.ShortName = strings.TrimSpace(in.ShortName)
	in.Teacher = strings.TrimSpace(in.Teacher)
	in.Slug = strings.TrimSpace(strings.ToLower(in.Slug))
	if in.Name == "" {
		ve.Add("name", "Укажите название предмета")
	}
	if in.Slug == "" {
		in.Slug = slug.Make(in.Name)
	} else if !slug.Valid(in.Slug) {
		ve.Add("slug", "Слаг: только латиница, цифры и дефис")
	}
	if in.Color == "" {
		in.Color = "blue"
	}
	if !validColor(in.Color) {
		ve.Add("color", "Неизвестный цвет")
	}
	in.Icon = strings.TrimSpace(strings.ToLower(in.Icon))
	if len(in.Icon) > 40 || !slug.Valid(in.Icon) && in.Icon != "" {
		ve.Add("icon", "Некорректная иконка")
	}
	if in.Links == nil {
		in.Links = []Link{}
	}
	in.Links = cleanLinks(in.Links)
	validateLinks(ve, "links", in.Links)
	if !ve.Empty() {
		return ve
	}
	return nil
}

// SubjectRef is the compact subject shape embedded in other entities.
type SubjectRef struct {
	ID        int64  `json:"id"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	ShortName string `json:"shortName"`
	Color     string `json:"color"`
	Icon      string `json:"icon"`
}

// ---------- Labs ----------

// Lab is a laboratory assignment.
type Lab struct {
	ID           int64      `db:"id" json:"id"`
	SubjectID    int64      `db:"subject_id" json:"subjectId"`
	Number       int        `db:"number" json:"number"`
	Slug         string     `db:"slug" json:"slug"`
	Title        string     `db:"title" json:"title"`
	Summary      string     `db:"summary" json:"summary"`
	Content      string     `db:"content" json:"content"`
	Requirements string     `db:"requirements" json:"requirements"`
	Submission   string     `db:"submission" json:"submission"`
	Variants     string     `db:"variants" json:"variants"`
	Materials    []Link     `db:"materials" json:"materials"`
	DeadlineAt   *time.Time `db:"deadline_at" json:"deadlineAt"`
	DeadlineNote string     `db:"deadline_note" json:"deadlineNote"`
	MaxScore     *int       `db:"max_score" json:"maxScore"`
	Teacher      string     `db:"teacher" json:"teacher"`
	Status       string     `db:"status" json:"status"`
	CreatedAt    time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt    time.Time  `db:"updated_at" json:"updatedAt"`

	SubjectSlug      string `db:"subject_slug" json:"subjectSlug"`
	SubjectName      string `db:"subject_name" json:"subjectName"`
	SubjectShortName string `db:"subject_short_name" json:"subjectShortName"`
	SubjectColor     string `db:"subject_color" json:"subjectColor"`
	SubjectIcon      string `db:"subject_icon" json:"subjectIcon"`
}

// LabInput is the create/update payload for a lab.
type LabInput struct {
	SubjectID    int64      `json:"subjectId"`
	Number       int        `json:"number"`
	Slug         string     `json:"slug"`
	Title        string     `json:"title"`
	Summary      string     `json:"summary"`
	Content      string     `json:"content"`
	Requirements string     `json:"requirements"`
	Submission   string     `json:"submission"`
	Variants     string     `json:"variants"`
	Materials    []Link     `json:"materials"`
	DeadlineAt   *time.Time `json:"deadlineAt"`
	DeadlineNote string     `json:"deadlineNote"`
	MaxScore     *int       `json:"maxScore"`
	Teacher      string     `json:"teacher"`
	Status       string     `json:"status"`
}

// Validate normalises and checks the payload.
func (in *LabInput) Validate() error {
	ve := httpx.NewValidation()
	in.Title = strings.TrimSpace(in.Title)
	in.Summary = strings.TrimSpace(in.Summary)
	in.Teacher = strings.TrimSpace(in.Teacher)
	in.DeadlineNote = strings.TrimSpace(in.DeadlineNote)
	in.Slug = strings.TrimSpace(strings.ToLower(in.Slug))
	if in.SubjectID <= 0 {
		ve.Add("subjectId", "Выберите предмет")
	}
	if in.Number < 0 {
		ve.Add("number", "Номер лабы не может быть отрицательным")
	}
	if in.Title == "" {
		ve.Add("title", "Укажите название")
	}
	if in.Slug == "" {
		in.Slug = slug.Make(in.Title)
	} else if !slug.Valid(in.Slug) {
		ve.Add("slug", "Слаг: только латиница, цифры и дефис")
	}
	if in.Status == "" {
		in.Status = StatusDraft
	}
	if !validStatus(in.Status) {
		ve.Add("status", "Статус: draft или published")
	}
	if in.MaxScore != nil && *in.MaxScore < 0 {
		ve.Add("maxScore", "Баллы не могут быть отрицательными")
	}
	if in.Materials == nil {
		in.Materials = []Link{}
	}
	in.Materials = cleanLinks(in.Materials)
	validateLinks(ve, "materials", in.Materials)
	if !ve.Empty() {
		return ve
	}
	return nil
}

// ---------- Events ----------

// EventKinds lists accepted calendar event kinds.
var EventKinds = []string{"deadline", "test", "exam", "consultation", "other"}

// Event is a standalone calendar entry (not derived from a lab deadline).
type Event struct {
	ID          int64      `db:"id" json:"id"`
	Title       string     `db:"title" json:"title"`
	Kind        string     `db:"kind" json:"kind"`
	SubjectID   *int64     `db:"subject_id" json:"subjectId"`
	StartsAt    time.Time  `db:"starts_at" json:"startsAt"`
	EndsAt      *time.Time `db:"ends_at" json:"endsAt"`
	AllDay      bool       `db:"all_day" json:"allDay"`
	Location    string     `db:"location" json:"location"`
	Description string     `db:"description" json:"description"`
	URL         string     `db:"url" json:"url"`
	CreatedAt   time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updatedAt"`

	SubjectSlug      string `db:"subject_slug" json:"subjectSlug"`
	SubjectName      string `db:"subject_name" json:"subjectName"`
	SubjectShortName string `db:"subject_short_name" json:"subjectShortName"`
	SubjectColor     string `db:"subject_color" json:"subjectColor"`
	SubjectIcon      string `db:"subject_icon" json:"subjectIcon"`
}

// EventInput is the create/update payload for an event.
type EventInput struct {
	Title       string     `json:"title"`
	Kind        string     `json:"kind"`
	SubjectID   *int64     `json:"subjectId"`
	StartsAt    time.Time  `json:"startsAt"`
	EndsAt      *time.Time `json:"endsAt"`
	AllDay      bool       `json:"allDay"`
	Location    string     `json:"location"`
	Description string     `json:"description"`
	URL         string     `json:"url"`
}

// Validate normalises and checks the payload.
func (in *EventInput) Validate() error {
	ve := httpx.NewValidation()
	in.Title = strings.TrimSpace(in.Title)
	in.Location = strings.TrimSpace(in.Location)
	in.URL = strings.TrimSpace(in.URL)
	if in.Title == "" {
		ve.Add("title", "Укажите название события")
	}
	if in.Kind == "" {
		in.Kind = "other"
	}
	ok := false
	for _, k := range EventKinds {
		if k == in.Kind {
			ok = true
		}
	}
	if !ok {
		ve.Add("kind", "Неизвестный тип события")
	}
	if in.StartsAt.IsZero() {
		ve.Add("startsAt", "Укажите дату и время")
	}
	if in.EndsAt != nil && in.EndsAt.Before(in.StartsAt) {
		ve.Add("endsAt", "Окончание раньше начала")
	}
	if in.SubjectID != nil && *in.SubjectID <= 0 {
		in.SubjectID = nil
	}
	if in.URL != "" {
		if u, err := url.Parse(in.URL); err != nil || u.Scheme == "" {
			ve.Add("url", "Некорректная ссылка")
		}
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// ---------- FAQ ----------

// FAQItem is a question/answer pair.
type FAQItem struct {
	ID        int64     `db:"id" json:"id"`
	Question  string    `db:"question" json:"question"`
	Answer    string    `db:"answer" json:"answer"`
	Category  string    `db:"category" json:"category"`
	Position  int       `db:"position" json:"position"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time `db:"updated_at" json:"updatedAt"`
}

// FAQInput is the create/update payload for an FAQ item.
type FAQInput struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Category string `json:"category"`
	Position int    `json:"position"`
}

// Validate normalises and checks the payload.
func (in *FAQInput) Validate() error {
	ve := httpx.NewValidation()
	in.Question = strings.TrimSpace(in.Question)
	in.Category = strings.TrimSpace(in.Category)
	if in.Question == "" {
		ve.Add("question", "Укажите вопрос")
	}
	if strings.TrimSpace(in.Answer) == "" {
		ve.Add("answer", "Укажите ответ")
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// ---------- Pages ----------

// Page is a static informational page.
type Page struct {
	ID        int64     `db:"id" json:"id"`
	Slug      string    `db:"slug" json:"slug"`
	Title     string    `db:"title" json:"title"`
	Summary   string    `db:"summary" json:"summary"`
	Content   string    `db:"content" json:"content"`
	Position  int       `db:"position" json:"position"`
	ShowInNav bool      `db:"show_in_nav" json:"showInNav"`
	Status    string    `db:"status" json:"status"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time `db:"updated_at" json:"updatedAt"`
}

// PageInput is the create/update payload for a page.
type PageInput struct {
	Slug      string `json:"slug"`
	Title     string `json:"title"`
	Summary   string `json:"summary"`
	Content   string `json:"content"`
	Position  int    `json:"position"`
	ShowInNav bool   `json:"showInNav"`
	Status    string `json:"status"`
}

// Validate normalises and checks the payload.
func (in *PageInput) Validate() error {
	ve := httpx.NewValidation()
	in.Title = strings.TrimSpace(in.Title)
	in.Summary = strings.TrimSpace(in.Summary)
	in.Slug = strings.TrimSpace(strings.ToLower(in.Slug))
	if in.Title == "" {
		ve.Add("title", "Укажите заголовок")
	}
	if in.Slug == "" {
		in.Slug = slug.Make(in.Title)
	} else if !slug.Valid(in.Slug) {
		ve.Add("slug", "Слаг: только латиница, цифры и дефис")
	}
	if in.Status == "" {
		in.Status = StatusDraft
	}
	if !validStatus(in.Status) {
		ve.Add("status", "Статус: draft или published")
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// ---------- Notes ----------

// Note is a lecture summary written in MDX.
type Note struct {
	ID          int64       `db:"id" json:"id"`
	SubjectID   int64       `db:"subject_id" json:"subjectId"`
	Number      int         `db:"number" json:"number"`
	Slug        string      `db:"slug" json:"slug"`
	Title       string      `db:"title" json:"title"`
	Summary     string      `db:"summary" json:"summary"`
	Content     string      `db:"content" json:"content"`
	LectureDate pgtype.Date `db:"lecture_date" json:"lectureDate"`
	Status      string      `db:"status" json:"status"`
	CreatedAt   time.Time   `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time   `db:"updated_at" json:"updatedAt"`
	// QuizzesCount is the number of published quizzes attached to the note.
	QuizzesCount int `db:"quizzes_count" json:"quizzesCount"`

	SubjectSlug      string `db:"subject_slug" json:"subjectSlug"`
	SubjectName      string `db:"subject_name" json:"subjectName"`
	SubjectShortName string `db:"subject_short_name" json:"subjectShortName"`
	SubjectColor     string `db:"subject_color" json:"subjectColor"`
	SubjectIcon      string `db:"subject_icon" json:"subjectIcon"`
}

// NoteInput is the create/update payload for a note.
type NoteInput struct {
	SubjectID   int64       `json:"subjectId"`
	Number      int         `json:"number"`
	Slug        string      `json:"slug"`
	Title       string      `json:"title"`
	Summary     string      `json:"summary"`
	Content     string      `json:"content"`
	LectureDate pgtype.Date `json:"lectureDate"`
	Status      string      `json:"status"`
}

// Validate normalises and checks the payload.
func (in *NoteInput) Validate() error {
	ve := httpx.NewValidation()
	in.Title = strings.TrimSpace(in.Title)
	in.Summary = strings.TrimSpace(in.Summary)
	in.Slug = strings.TrimSpace(strings.ToLower(in.Slug))
	if in.SubjectID <= 0 {
		ve.Add("subjectId", "Выберите предмет")
	}
	if in.Number <= 0 {
		ve.Add("number", "Номер лекции должен быть больше нуля")
	}
	if in.Title == "" {
		ve.Add("title", "Укажите название")
	}
	if in.Slug == "" {
		in.Slug = slug.Make(in.Title)
	} else if !slug.Valid(in.Slug) {
		ve.Add("slug", "Слаг: только латиница, цифры и дефис")
	}
	if in.Status == "" {
		in.Status = StatusDraft
	}
	if !validStatus(in.Status) {
		ve.Add("status", "Статус: draft или published")
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// ---------- Quizzes ----------

// Quiz is a self-check test.
type Quiz struct {
	ID               int64           `db:"id" json:"id"`
	SubjectID        *int64          `db:"subject_id" json:"subjectId"`
	NoteID           *int64          `db:"note_id" json:"noteId"`
	Slug             string          `db:"slug" json:"slug"`
	Title            string          `db:"title" json:"title"`
	Description      string          `db:"description" json:"description"`
	Questions        []quiz.Question `db:"questions" json:"questions"`
	ShuffleQuestions bool            `db:"shuffle_questions" json:"shuffleQuestions"`
	ShuffleOptions   bool            `db:"shuffle_options" json:"shuffleOptions"`
	Status           string          `db:"status" json:"status"`
	CreatedAt        time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt        time.Time       `db:"updated_at" json:"updatedAt"`

	SubjectSlug      string `db:"subject_slug" json:"subjectSlug"`
	SubjectName      string `db:"subject_name" json:"subjectName"`
	SubjectShortName string `db:"subject_short_name" json:"subjectShortName"`
	SubjectColor     string `db:"subject_color" json:"subjectColor"`
	SubjectIcon      string `db:"subject_icon" json:"subjectIcon"`
	NoteSlug         string `db:"note_slug" json:"noteSlug"`
	NoteTitle        string `db:"note_title" json:"noteTitle"`
}

// QuizInput is the create/update payload for a quiz.
type QuizInput struct {
	SubjectID        *int64          `json:"subjectId"`
	NoteID           *int64          `json:"noteId"`
	Slug             string          `json:"slug"`
	Title            string          `json:"title"`
	Description      string          `json:"description"`
	Questions        []quiz.Question `json:"questions"`
	ShuffleQuestions *bool           `json:"shuffleQuestions"`
	ShuffleOptions   *bool           `json:"shuffleOptions"`
	Status           string          `json:"status"`
}

// Validate normalises and checks the payload, including every question.
func (in *QuizInput) Validate() error {
	ve := httpx.NewValidation()
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	in.Slug = strings.TrimSpace(strings.ToLower(in.Slug))
	if in.Title == "" {
		ve.Add("title", "Укажите название")
	}
	if in.Slug == "" {
		in.Slug = slug.Make(in.Title)
	} else if !slug.Valid(in.Slug) {
		ve.Add("slug", "Слаг: только латиница, цифры и дефис")
	}
	if in.Status == "" {
		in.Status = StatusDraft
	}
	if !validStatus(in.Status) {
		ve.Add("status", "Статус: draft или published")
	}
	if in.SubjectID != nil && *in.SubjectID <= 0 {
		in.SubjectID = nil
	}
	if in.NoteID == nil || *in.NoteID <= 0 {
		ve.Add("noteId", "Выберите конспект, под которым будет квиз")
	}
	if in.Questions == nil {
		in.Questions = []quiz.Question{}
	}
	if msg := quiz.Validate(in.Questions); msg != "" {
		ve.Add("questions", msg)
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}
