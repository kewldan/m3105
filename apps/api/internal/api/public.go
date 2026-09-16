package api

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/ics"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/semester"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

type authInfo struct {
	TelegramBot    string `json:"telegramBot"`
	TelegramBotID  string `json:"telegramBotId"`
	DevLogin       bool   `json:"devLogin"`
	InviteRequired bool   `json:"inviteRequired"`
}

type settingsResponse struct {
	Settings models.Settings `json:"settings"`
	Week     semester.Week   `json:"week"`
	Now      time.Time       `json:"now"`
	Pages    []models.Page   `json:"navPages"`
	Auth     authInfo        `json:"auth"`
}

func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	sc, err := h.site(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	pages, err := h.store.ListPages(r.Context(), true)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	nav := []models.Page{}
	for _, p := range pages {
		if p.ShowInNav {
			nav = append(nav, p)
		}
	}
	settings := sc.Settings
	inviteRequired := settings.InviteCode != ""
	settings.InviteCode = "" // never expose the code publicly
	httpx.JSON(w, http.StatusOK, settingsResponse{Settings: settings, Week: sc.week(sc.Now), Now: sc.Now, Pages: nav,
		Auth: authInfo{TelegramBot: h.cfg.TelegramBotUsername, TelegramBotID: h.cfg.TelegramBotID, DevLogin: h.cfg.DevLogin, InviteRequired: inviteRequired}})
}

type homeResponse struct {
	Settings          models.Settings           `json:"settings"`
	Week              semester.Week             `json:"week"`
	Now               time.Time                 `json:"now"`
	UpcomingDeadlines []models.CalendarItem     `json:"upcomingDeadlines"`
	OverdueDeadlines  []models.CalendarItem     `json:"overdueDeadlines"`
	UpcomingEvents    []models.CalendarItem     `json:"upcomingEvents"`
	RecentNotes       []models.Note             `json:"recentNotes"`
	Subjects          []store.SubjectWithCounts `json:"subjects"`
}

func (h *Handler) getHome(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sc, err := h.site(ctx)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	upcoming, err := h.calendarItems(ctx, sc.Now, sc.Now.AddDate(0, 0, 21), "", scopeLabs)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if len(upcoming) > 8 {
		upcoming = upcoming[:8]
	}
	overdue, err := h.calendarItems(ctx, sc.Now.AddDate(0, 0, -14), sc.Now, "", scopeLabs)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	events, err := h.calendarItems(ctx, sc.Now, sc.Now.AddDate(0, 0, 21), "", scopeEvents)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if len(events) > 6 {
		events = events[:6]
	}
	week := sc.week(sc.Now)
	notes, err := h.store.ListNotes(ctx, store.NoteFilter{PublishedOnly: true, Limit: 5})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	subjects, err := h.store.ListSubjectsWithCounts(ctx)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	publicSettings := sc.Settings
	publicSettings.InviteCode = ""
	httpx.JSON(w, http.StatusOK, homeResponse{
		Settings:          publicSettings,
		Week:              week,
		Now:               sc.Now,
		UpcomingDeadlines: upcoming,
		OverdueDeadlines:  overdue,
		UpcomingEvents:    events,
		RecentNotes:       notes,
		Subjects:          subjects,
	})
}

func (h *Handler) listSubjects(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListSubjectsWithCounts(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

type subjectResponse struct {
	Subject models.Subject      `json:"subject"`
	Labs    []models.Lab        `json:"labs"`
	Notes   []models.Note       `json:"notes"`
	Quizzes []store.QuizSummary `json:"quizzes"`
}

func (h *Handler) getSubject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	slug := chi.URLParam(r, "slug")
	subj, err := h.store.GetSubjectBySlug(ctx, slug)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	labs, err := h.store.ListLabs(ctx, store.LabFilter{SubjectSlug: slug, PublishedOnly: true})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	notes, err := h.store.ListNotes(ctx, store.NoteFilter{SubjectSlug: slug, PublishedOnly: true})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	quizzes, err := h.store.ListQuizzes(ctx, store.QuizFilter{SubjectSlug: slug, PublishedOnly: true})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, subjectResponse{Subject: subj, Labs: labs, Notes: notes, Quizzes: quizzes})
}

func (h *Handler) listLabs(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListLabs(r.Context(), store.LabFilter{SubjectSlug: r.URL.Query().Get("subject"), PublishedOnly: true})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) getLab(w http.ResponseWriter, r *http.Request) {
	lab, err := h.store.GetLabBySlugs(r.Context(), chi.URLParam(r, "subject"), chi.URLParam(r, "slug"), true)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, lab)
}

func (h *Handler) getCalendar(w http.ResponseWriter, r *http.Request) {
	sc, err := h.site(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	q := r.URL.Query()
	from := parseTimeParam(q.Get("from"), sc.Loc, sc.Now.AddDate(0, -1, 0))
	to := parseTimeParam(q.Get("to"), sc.Loc, sc.Now.AddDate(0, 6, 0))
	if len(q.Get("to")) == 10 { // date-only "to" should include the whole day
		to = to.Add(24*time.Hour - time.Nanosecond)
	}
	items, err := h.calendarItems(r.Context(), from, to, q.Get("subject"), scopeAll)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "from": from, "to": to, "now": sc.Now})
}

func (h *Handler) getCalendarICS(w http.ResponseWriter, r *http.Request) {
	sc, err := h.site(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	items, err := h.calendarItems(r.Context(), sc.Now.AddDate(0, -2, 0), sc.Now.AddDate(1, 0, 0), r.URL.Query().Get("subject"), scopeAll)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]ics.Item, 0, len(items))
	for _, it := range items {
		url := it.URL
		if it.Path != "" {
			url = h.cfg.PublicURL + it.Path
		}
		var end time.Time
		if it.EndsAt != nil {
			end = *it.EndsAt
		}
		title := it.Title
		if it.Subject != nil && it.Source != "practice" { // practice titles already name the subject
			name := it.Subject.ShortName
			if name == "" {
				name = it.Subject.Name
			}
			title = name + ": " + title
		}
		out = append(out, ics.Item{
			UID:         it.ID + "@m3105.ru",
			Title:       title,
			Description: it.Description,
			Location:    it.Location,
			URL:         url,
			Start:       it.StartsAt,
			End:         end,
			AllDay:      it.AllDay,
			Alarm:       it.Source == "lab" || it.Kind == "exam" || it.Kind == "test",
		})
	}
	body := ics.Render(sc.Settings.SiteTitle+" — дедлайны", out, sc.Now)
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", `inline; filename="m3105.ics"`)
	w.Header().Set("Cache-Control", "public, max-age=900")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}

func (h *Handler) listFAQ(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListFAQ(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) listPages(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListPages(r.Context(), true)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) getPage(w http.ResponseWriter, r *http.Request) {
	page, err := h.store.GetPageBySlug(r.Context(), chi.URLParam(r, "slug"), true)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, page)
}

func (h *Handler) listNotes(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListNotes(r.Context(), store.NoteFilter{SubjectSlug: r.URL.Query().Get("subject"), PublishedOnly: true})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

type noteResponse struct {
	models.Note
	Quizzes []store.QuizSummary `json:"quizzes"`
	Prev    *models.Note        `json:"prev"`
	Next    *models.Note        `json:"next"`
}

func (h *Handler) getNote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	note, err := h.store.GetNoteBySlugs(ctx, chi.URLParam(r, "subject"), chi.URLParam(r, "slug"), true)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	quizzes, err := h.store.ListQuizzes(ctx, store.QuizFilter{NoteID: &note.ID, PublishedOnly: true})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	siblings, err := h.store.ListNotes(ctx, store.NoteFilter{SubjectSlug: note.SubjectSlug, PublishedOnly: true})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp := noteResponse{Note: note, Quizzes: quizzes}
	for i := range siblings {
		if siblings[i].ID == note.ID {
			if i > 0 {
				resp.Prev = &siblings[i-1]
			}
			if i+1 < len(siblings) {
				resp.Next = &siblings[i+1]
			}
		}
	}
	httpx.JSON(w, http.StatusOK, resp)
}

func (h *Handler) listQuizzes(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListQuizzes(r.Context(), store.QuizFilter{SubjectSlug: r.URL.Query().Get("subject"), PublishedOnly: true})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (h *Handler) getQuiz(w http.ResponseWriter, r *http.Request) {
	quiz, err := h.store.GetQuizBySlug(r.Context(), chi.URLParam(r, "slug"), true)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, quiz)
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	query := r.URL.Query().Get("q")
	items, err := h.store.Search(r.Context(), query, limit)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.logSearch(query, len(items))
	httpx.JSON(w, http.StatusOK, items)
}

// logSearch пишет запрос в аналитику в фоне: поиск не должен ждать вставку,
// а её падение не должно ломать выдачу.
func (h *Handler) logSearch(query string, results int) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := h.store.LogSearch(ctx, query, results); err != nil {
			slog.Warn("log search", "err", err)
		}
	}()
}
