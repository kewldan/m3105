package api

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/quiz"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

type validator interface{ Validate() error }

// crud describes the store operations behind a generic admin resource.
type crud[T any, In any] struct {
	list   func(ctx context.Context, r *http.Request) (any, error)
	get    func(ctx context.Context, id int64) (T, error)
	create func(ctx context.Context, in *In) (T, error)
	update func(ctx context.Context, id int64, in *In) (T, error)
	del    func(ctx context.Context, id int64) error
}

func mount[T any, In any, PIn interface {
	*In
	validator
}](r chi.Router, c crud[T, In]) {
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		items, err := c.list(r.Context(), r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, items)
	})
	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		var in In
		if err := httpx.Decode(r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		if err := PIn(&in).Validate(); err != nil {
			httpx.Fail(w, err)
			return
		}
		item, err := c.create(r.Context(), &in)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, item)
	})
	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := httpx.IDParam(r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		item, err := c.get(r.Context(), id)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, item)
	})
	r.Put("/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := httpx.IDParam(r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		var in In
		if err := httpx.Decode(r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		if err := PIn(&in).Validate(); err != nil {
			httpx.Fail(w, err)
			return
		}
		item, err := c.update(r.Context(), id, &in)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, item)
	})
	r.Delete("/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := httpx.IDParam(r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if err := c.del(r.Context(), id); err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
}

func optionalID(r *http.Request, key string) *int64 {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return nil
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return nil
	}
	return &id
}

func (h *Handler) mountAdmin(r chi.Router) {
	st := h.store

	r.Get("/settings", func(w http.ResponseWriter, r *http.Request) {
		s, err := st.GetSettings(r.Context())
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, s)
	})
	r.Put("/settings", func(w http.ResponseWriter, r *http.Request) {
		var in models.Settings
		if err := httpx.Decode(r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		if err := in.Validate(); err != nil {
			httpx.Fail(w, err)
			return
		}
		s, err := st.UpdateSettings(r.Context(), &in)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, s)
	})

	r.Get("/overview", h.adminOverview)

	r.Get("/users", h.adminListUsers)
	r.Put("/users/{id}", h.adminUpdateUser)
	r.Delete("/users/{id}", h.adminDeleteUser)
	r.Get("/comments", h.adminListComments)
	r.Get("/search-queries", h.adminSearchStats)
	r.Delete("/comments/{id}", h.adminDeleteComment)
	r.Get("/posts", h.adminListPosts)
	r.Put("/posts/{id}", h.adminUpdatePost)
	r.Delete("/posts/{id}", h.adminDeletePost)

	r.Route("/practice", func(r chi.Router) {
		r.Get("/{id}/signups", h.adminPracticeSignups)
		mount[models.PracticeSession, models.PracticeSessionInput](r, crud[models.PracticeSession, models.PracticeSessionInput]{
			list: func(ctx context.Context, r *http.Request) (any, error) {
				return st.ListPracticeSessions(ctx, store.PracticeFilter{})
			},
			get:    st.GetPracticeSession,
			create: st.CreatePracticeSession,
			update: st.UpdatePracticeSession,
			del:    st.DeletePracticeSession,
		})
	})

	r.Route("/subjects", func(r chi.Router) {
		mount[models.Subject, models.SubjectInput](r, crud[models.Subject, models.SubjectInput]{
			list:   func(ctx context.Context, _ *http.Request) (any, error) { return st.ListSubjectsWithCounts(ctx) },
			get:    st.GetSubject,
			create: st.CreateSubject,
			update: st.UpdateSubject,
			del:    st.DeleteSubject,
		})
	})
	r.Route("/labs", func(r chi.Router) {
		mount[models.Lab, models.LabInput](r, crud[models.Lab, models.LabInput]{
			list: func(ctx context.Context, r *http.Request) (any, error) {
				return st.ListLabs(ctx, store.LabFilter{SubjectID: optionalID(r, "subjectId")})
			},
			get:    st.GetLab,
			create: st.CreateLab,
			update: st.UpdateLab,
			del:    st.DeleteLab,
		})
	})
	r.Route("/events", func(r chi.Router) {
		mount[models.Event, models.EventInput](r, crud[models.Event, models.EventInput]{
			list:   func(ctx context.Context, _ *http.Request) (any, error) { return st.ListEvents(ctx, nil, nil, "") },
			get:    st.GetEvent,
			create: st.CreateEvent,
			update: st.UpdateEvent,
			del:    st.DeleteEvent,
		})
	})
	r.Route("/faq", func(r chi.Router) {
		mount[models.FAQItem, models.FAQInput](r, crud[models.FAQItem, models.FAQInput]{
			list:   func(ctx context.Context, _ *http.Request) (any, error) { return st.ListFAQ(ctx) },
			get:    st.GetFAQ,
			create: st.CreateFAQ,
			update: st.UpdateFAQ,
			del:    st.DeleteFAQ,
		})
	})
	r.Route("/pages", func(r chi.Router) {
		mount[models.Page, models.PageInput](r, crud[models.Page, models.PageInput]{
			list:   func(ctx context.Context, _ *http.Request) (any, error) { return st.ListPages(ctx, false) },
			get:    st.GetPage,
			create: st.CreatePage,
			update: st.UpdatePage,
			del:    st.DeletePage,
		})
	})
	r.Route("/notes", func(r chi.Router) {
		mount[models.Note, models.NoteInput](r, crud[models.Note, models.NoteInput]{
			list: func(ctx context.Context, r *http.Request) (any, error) {
				return st.ListNotes(ctx, store.NoteFilter{SubjectID: optionalID(r, "subjectId")})
			},
			get:    st.GetNote,
			create: st.CreateNote,
			update: st.UpdateNote,
			del:    st.DeleteNote,
		})
	})
	r.Route("/quizzes", func(r chi.Router) {
		r.Post("/validate", func(w http.ResponseWriter, r *http.Request) {
			var in struct {
				Questions []quiz.Question `json:"questions"`
			}
			if err := httpx.Decode(r, &in); err != nil {
				httpx.Fail(w, err)
				return
			}
			if msg := quiz.Validate(in.Questions); msg != "" {
				httpx.JSON(w, http.StatusUnprocessableEntity, httpx.ErrorBody{Error: msg, Code: "validation", Fields: map[string]string{"questions": msg}})
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "questions": in.Questions})
		})
		mount[models.Quiz, models.QuizInput](r, crud[models.Quiz, models.QuizInput]{
			list: func(ctx context.Context, _ *http.Request) (any, error) {
				return st.ListQuizzes(ctx, store.QuizFilter{})
			},
			get:    st.GetQuiz,
			create: st.CreateQuiz,
			update: st.UpdateQuiz,
			del:    st.DeleteQuiz,
		})
	})
}

type overviewResponse struct {
	Subjects  int `json:"subjects"`
	Labs      int `json:"labs"`
	LabsDraft int `json:"labsDraft"`
	Notes     int `json:"notes"`
	Quizzes   int `json:"quizzes"`
	FAQ       int `json:"faq"`
	Pages     int `json:"pages"`
	Events    int `json:"events"`
	Users     int `json:"users"`
	// PendingUsers are accounts waiting for an admin to confirm their group.
	PendingUsers int                   `json:"pendingUsers"`
	Practice     int                   `json:"practice"`
	Upcoming     []models.CalendarItem `json:"upcoming"`
}

func (h *Handler) adminOverview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sc, err := h.site(ctx)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var resp overviewResponse
	subjects, err := h.store.ListSubjects(ctx)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp.Subjects = len(subjects)
	labs, err := h.store.ListLabs(ctx, store.LabFilter{})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	for _, l := range labs {
		if l.Status == models.StatusDraft {
			resp.LabsDraft++
		}
	}
	resp.Labs = len(labs)
	notes, err := h.store.ListNotes(ctx, store.NoteFilter{})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp.Notes = len(notes)
	quizzes, err := h.store.ListQuizzes(ctx, store.QuizFilter{})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp.Quizzes = len(quizzes)
	faq, err := h.store.ListFAQ(ctx)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp.FAQ = len(faq)
	pages, err := h.store.ListPages(ctx, false)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp.Pages = len(pages)
	events, err := h.store.ListEvents(ctx, nil, nil, "")
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp.Events = len(events)
	users, err := h.store.ListUsers(ctx)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp.Users = len(users)
	for _, u := range users {
		if !u.Approved {
			resp.PendingUsers++
		}
	}
	now := sc.Now
	practice, err := h.store.ListPracticeSessions(ctx, store.PracticeFilter{From: &now})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp.Practice = len(practice)
	resp.Upcoming, err = h.calendarItems(ctx, sc.Now, sc.Now.AddDate(0, 0, 30), "", scopeAll)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, resp)
}
