// Package api wires HTTP handlers to the store and auth service.
package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/kewldan/edu3105/apps/api/internal/auth"
	"github.com/kewldan/edu3105/apps/api/internal/config"
	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/semester"
	"github.com/kewldan/edu3105/apps/api/internal/store"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

// Handler holds dependencies for every route.
type Handler struct {
	store *store.Store
	auth  *auth.Service
	users *userauth.Service
	cfg   config.Config
}

// New constructs the handler set.
func New(st *store.Store, au *auth.Service, users *userauth.Service, cfg config.Config) *Handler {
	return &Handler{store: st, auth: au, users: users, cfg: cfg}
}

// Router builds the chi router with all routes mounted.
func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(requestLogger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(middleware.Compress(5, "application/json", "text/calendar"))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(h.users.Middleware)
		r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
			httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
		})
		r.Get("/openapi.yaml", h.getOpenAPI)
		r.Get("/docs", h.getDocs)
		r.Get("/settings", h.getSettings)
		r.Get("/home", h.getHome)
		r.Get("/subjects", h.listSubjects)
		r.Get("/subjects/{slug}", h.getSubject)
		r.Get("/labs", h.listLabs)
		r.Get("/labs/{subject}/{slug}", h.getLab)
		r.Get("/calendar", h.getCalendar)
		r.Get("/calendar.ics", h.getCalendarICS)
		r.Get("/faq", h.listFAQ)
		r.Get("/pages", h.listPages)
		r.Get("/pages/{slug}", h.getPage)
		r.Get("/notes", h.listNotes)
		r.Get("/notes/{subject}/{slug}", h.getNote)
		r.Get("/quizzes", h.listQuizzes)
		r.Get("/quizzes/{slug}", h.getQuiz)
		r.Get("/search", h.search)
		r.Get("/practice", h.listPractice)
		r.Get("/practice/{id}", h.getPractice)
		r.With(userauth.Require).Put("/practice/{id}/signups", h.setPracticeSignup)
		r.With(userauth.Require).Delete("/practice/{id}/signups", h.setPracticeSignup)
		// Comments and posts: reading is public, writing needs a student session.
		r.Get("/comments/{target}/{id}", h.listComments)
		r.With(userauth.Require).Post("/comments/{target}/{id}", h.createComment)
		r.With(userauth.Require).Delete("/comments/{id}", h.deleteComment)
		r.Get("/posts", h.listPosts)
		r.With(userauth.Require).Post("/posts", h.createPost)
		r.With(userauth.Require).Put("/posts/{id}", h.updatePost)
		r.With(userauth.Require).Delete("/posts/{id}", h.deletePost)
		r.With(userauth.Require).Put("/posts/{id}/like", h.setLike(true))
		r.With(userauth.Require).Delete("/posts/{id}/like", h.setLike(false))

		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", h.login)
			r.Post("/logout", h.logout)
			r.Get("/me", h.adminMe)

			r.Post("/telegram", h.telegramLogin)
			r.Post("/dev-login", h.devLogin)
			r.Post("/passkey/register/begin", h.passkeyRegisterBegin)
			r.Post("/passkey/register/finish", h.passkeyRegisterFinish)
			r.Post("/passkey/login/begin", h.passkeyLoginBegin)
			r.Post("/passkey/login/finish", h.passkeyLoginFinish)
			r.Route("/user", func(r chi.Router) {
				r.Get("/me", h.me)
				r.Post("/logout", h.userLogout)
			})
		})

		r.Route("/me", func(r chi.Router) {
			r.Use(userauth.Require)
			r.Get("/", h.me)
			r.Put("/", h.updateMe)
			r.Put("/labs/{id}/done", h.setLabDone(true))
			r.Delete("/labs/{id}/done", h.setLabDone(false))
			r.Delete("/passkeys/{id}", h.deletePasskey)
		})

		r.Route("/admin", func(r chi.Router) {
			r.Use(h.auth.Require)
			h.mountAdmin(r)
		})
	})

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		httpx.Error(w, http.StatusNotFound, "not_found", "Маршрут не найден")
	})
	return r
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		slog.Info("http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.Status(),
			"bytes", ww.BytesWritten(),
			"dur", time.Since(start).Round(time.Millisecond).String(),
			"ip", auth.ClientIP(r),
		)
	})
}

// ---- shared helpers ----

// siteContext bundles settings-derived values used by several handlers.
type siteContext struct {
	Settings models.Settings
	Loc      *time.Location
	Now      time.Time
}

func (h *Handler) site(ctx context.Context) (siteContext, error) {
	st, err := h.store.GetSettings(ctx)
	if err != nil {
		return siteContext{}, err
	}
	loc, err := time.LoadLocation(st.Timezone)
	if err != nil {
		loc = time.UTC
	}
	return siteContext{Settings: st, Loc: loc, Now: time.Now().In(loc)}, nil
}

func (sc siteContext) week(at time.Time) semester.Week {
	var start, end time.Time
	if sc.Settings.SemesterStart.Valid {
		start = sc.Settings.SemesterStart.Time
	}
	if sc.Settings.SemesterEnd.Valid {
		end = sc.Settings.SemesterEnd.Time
	}
	return semester.Compute(at, start, end, semester.Parity(sc.Settings.FirstWeekParity), sc.Loc)
}

func subjectRef(id int64, slug, name, short, color, icon string) *models.SubjectRef {
	if slug == "" {
		return nil
	}
	return &models.SubjectRef{ID: id, Slug: slug, Name: name, ShortName: short, Color: color, Icon: icon}
}

func labToItem(l models.Lab) models.CalendarItem {
	title := fmt.Sprintf("Лаба %d · %s", l.Number, l.Title)
	desc := l.Summary
	if l.DeadlineNote != "" {
		if desc != "" {
			desc += "\n"
		}
		desc += l.DeadlineNote
	}
	return models.CalendarItem{
		ID:          "lab-" + strconv.FormatInt(l.ID, 10),
		Source:      "lab",
		Kind:        "deadline",
		Title:       title,
		StartsAt:    *l.DeadlineAt,
		Description: desc,
		Path:        "/labs/" + l.SubjectSlug + "/" + l.Slug,
		Subject:     subjectRef(l.SubjectID, l.SubjectSlug, l.SubjectName, l.SubjectShortName, l.SubjectColor, l.SubjectIcon),
		LabNumber:   l.Number,
		LabID:       l.ID,
	}
}

func eventToItem(e models.Event) models.CalendarItem {
	var sid int64
	if e.SubjectID != nil {
		sid = *e.SubjectID
	}
	return models.CalendarItem{
		ID:          "event-" + strconv.FormatInt(e.ID, 10),
		Source:      "event",
		Kind:        e.Kind,
		Title:       e.Title,
		StartsAt:    e.StartsAt,
		EndsAt:      e.EndsAt,
		AllDay:      e.AllDay,
		Location:    e.Location,
		Description: e.Description,
		URL:         e.URL,
		Subject:     subjectRef(sid, e.SubjectSlug, e.SubjectName, e.SubjectShortName, e.SubjectColor, e.SubjectIcon),
	}
}

func practiceToItem(p models.PracticeSession) models.CalendarItem {
	name := p.SubjectShortName
	if name == "" {
		name = p.SubjectName
	}
	desc := p.Note
	if p.Capacity != nil {
		desc = strings.TrimSpace(desc + "\n" + fmt.Sprintf("Мест: %d, записалось: %d", *p.Capacity, p.SignupsCount))
	}
	return models.CalendarItem{
		ID:          "practice-" + strconv.FormatInt(p.ID, 10),
		Source:      "practice",
		Kind:        "practice",
		Title:       "Сдача лаб · " + name,
		StartsAt:    p.StartsAt,
		EndsAt:      p.EndsAt,
		Location:    p.Location,
		Description: desc,
		Path:        "/practice?session=" + strconv.FormatInt(p.ID, 10),
		Subject:     subjectRef(p.SubjectID, p.SubjectSlug, p.SubjectName, p.SubjectShortName, p.SubjectColor, p.SubjectIcon),
	}
}

// calendarScope selects which sources calendarItems merges.
type calendarScope int

const (
	scopeLabs   calendarScope = iota // lab deadlines only (home page deadline blocks)
	scopeEvents                      // events and practice sessions only (home page "События")
	scopeAll                         // everything (public calendar, ICS feed, admin overview)
)

// calendarItems merges lab deadlines, events and practice sessions inside [from, to]
// according to the scope.
func (h *Handler) calendarItems(ctx context.Context, from, to time.Time, subjectSlug string, scope calendarScope) ([]models.CalendarItem, error) {
	items := []models.CalendarItem{}
	if scope == scopeLabs || scope == scopeAll {
		labs, err := h.store.ListLabDeadlines(ctx, from, to, subjectSlug)
		if err != nil {
			return nil, err
		}
		for _, l := range labs {
			items = append(items, labToItem(l))
		}
	}
	if scope == scopeEvents || scope == scopeAll {
		events, err := h.store.ListEvents(ctx, &from, &to, subjectSlug)
		if err != nil {
			return nil, err
		}
		sessions, err := h.store.ListPracticeSessions(ctx, store.PracticeFilter{SubjectSlug: subjectSlug, From: &from, To: &to})
		if err != nil {
			return nil, err
		}
		for _, e := range events {
			items = append(items, eventToItem(e))
		}
		for _, p := range sessions {
			items = append(items, practiceToItem(p))
		}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].StartsAt.Before(items[j].StartsAt) })
	return items, nil
}

func parseTimeParam(raw string, loc *time.Location, def time.Time) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return def
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t
	}
	if t, err := time.ParseInLocation("2006-01-02", raw, loc); err == nil {
		return t
	}
	return def
}
