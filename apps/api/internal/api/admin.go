package api

import (
	"context"
	"encoding/json"
	"errors"
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
// Resources with an entity name are open to editors within their zone and go
// to the journal; without one they are for the admin only.
type crud[T any, In any] struct {
	entity string
	list   func(ctx context.Context, r *http.Request) (any, error)
	// listWithin lists what an editor may edit (their zone).
	listWithin func(ctx context.Context, r *http.Request, zone []string) (any, error)
	get        func(ctx context.Context, id int64) (T, error)
	create     func(ctx context.Context, in *In) (T, error)
	update     func(ctx context.Context, id int64, in *In) (T, error)
	del        func(ctx context.Context, id int64) error
	// inAudience and rowAudience say who an input and a stored row are for.
	inAudience  func(ctx context.Context, in *In) ([]string, error)
	rowAudience func(ctx context.Context, row T) ([]string, error)
	idOf        func(row T) int64
	titleOf     func(row T) string
	// saved runs after a create (created) or an update, e.g. to record the author.
	saved func(ctx context.Context, p models.Principal, id int64, created bool, in *In) error
}

func mount[T any, In any, PIn interface {
	*In
	validator
}](h *Handler, r chi.Router, c crud[T, In]) {
	open := c.entity != ""
	// allowRow lets the admin through and an editor only within the zone.
	allowRow := func(w http.ResponseWriter, ctx context.Context, row T) bool {
		p := principal(ctx)
		if p.Admin {
			return true
		}
		if !open {
			httpx.Error(w, http.StatusForbidden, "forbidden", "Этот раздел только для администратора")
			return false
		}
		a, err := c.rowAudience(ctx, row)
		if err != nil {
			httpx.Fail(w, err)
			return false
		}
		if !p.Covers(a) {
			forbiddenZone(w)
			return false
		}
		return true
	}
	allowInput := func(w http.ResponseWriter, ctx context.Context, in *In) bool {
		p := principal(ctx)
		if p.Admin {
			return true
		}
		if !open {
			httpx.Error(w, http.StatusForbidden, "forbidden", "Этот раздел только для администратора")
			return false
		}
		a, err := c.inAudience(ctx, in)
		if err != nil {
			httpx.Fail(w, err)
			return false
		}
		if !p.Covers(a) {
			forbiddenZone(w)
			return false
		}
		return true
	}
	record := func(ctx context.Context, action string, id int64, before, after *T) {
		if !open {
			return
		}
		e := store.NewEdit{Entity: c.entity, EntityID: id, Action: action}
		row := after
		if row == nil {
			row = before
		}
		e.Title = c.titleOf(*row)
		e.Audience, _ = c.rowAudience(ctx, *row)
		if before != nil {
			e.Before = *before
		}
		if after != nil {
			e.After = *after
		}
		h.journal(ctx, e)
	}
	save := func(ctx context.Context, id int64, created bool, in *In) (T, error) {
		if c.saved != nil {
			if err := c.saved(ctx, principal(ctx), id, created, in); err != nil {
				var zero T
				return zero, err
			}
		}
		return c.get(ctx, id)
	}

	if open {
		replay := func(raw json.RawMessage) (*In, error) {
			var in In
			if err := json.Unmarshal(raw, &in); err != nil {
				return nil, err
			}
			if err := PIn(&in).Validate(); err != nil {
				return nil, err
			}
			return &in, nil
		}
		h.reverters[c.entity] = reverter{
			create: func(ctx context.Context, raw json.RawMessage) (int64, error) {
				in, err := replay(raw)
				if err != nil {
					return 0, err
				}
				item, err := c.create(ctx, in)
				if err != nil {
					return 0, err
				}
				_, err = save(ctx, c.idOf(item), true, in)
				return c.idOf(item), err
			},
			update: func(ctx context.Context, id int64, raw json.RawMessage) error {
				in, err := replay(raw)
				if err != nil {
					return err
				}
				if _, err := c.update(ctx, id, in); err != nil {
					return err
				}
				_, err = save(ctx, id, false, in)
				return err
			},
			del: c.del,
		}
	}

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		p := principal(r.Context())
		var items any
		var err error
		switch {
		case p.Admin:
			items, err = c.list(r.Context(), r)
		case c.listWithin != nil:
			items, err = c.listWithin(r.Context(), r, p.Zone)
		default:
			httpx.Error(w, http.StatusForbidden, "forbidden", "Этот раздел только для администратора")
			return
		}
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, items)
	})
	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var in In
		if err := httpx.Decode(r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		if err := PIn(&in).Validate(); err != nil {
			httpx.Fail(w, err)
			return
		}
		if !allowInput(w, ctx, &in) {
			return
		}
		item, err := c.create(ctx, &in)
		if err == nil && open {
			item, err = save(ctx, c.idOf(item), true, &in)
		}
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if open {
			record(ctx, "create", c.idOf(item), nil, &item)
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
		if !principal(r.Context()).Admin && c.listWithin == nil {
			httpx.Error(w, http.StatusForbidden, "forbidden", "Этот раздел только для администратора")
			return
		}
		if open && !allowRow(w, r.Context(), item) {
			return
		}
		httpx.JSON(w, http.StatusOK, item)
	})
	r.Put("/{id}", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
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
		var before T
		if open || !principal(ctx).Admin {
			if before, err = c.get(ctx, id); err != nil {
				httpx.Fail(w, err)
				return
			}
			if !allowRow(w, ctx, before) || !allowInput(w, ctx, &in) {
				return
			}
		}
		item, err := c.update(ctx, id, &in)
		if err == nil && open {
			item, err = save(ctx, id, false, &in)
		}
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if open {
			record(ctx, "update", id, &before, &item)
		}
		httpx.JSON(w, http.StatusOK, item)
	})
	r.Delete("/{id}", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		id, err := httpx.IDParam(r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		var before T
		if open || !principal(ctx).Admin {
			if before, err = c.get(ctx, id); err != nil {
				httpx.Fail(w, err)
				return
			}
			if !allowRow(w, ctx, before) {
				return
			}
		}
		if err := c.del(ctx, id); err != nil {
			httpx.Fail(w, err)
			return
		}
		if open {
			record(ctx, "delete", id, &before, nil)
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
	h.reverters = map[string]reverter{}

	// Open to editors: who they are, their zone's groups, roles and journal.
	r.Get("/study-groups", h.adminStudyGroups)
	r.Get("/editors", h.listEditorRoles)
	r.Get("/editors/candidates", h.listEditorCandidates)
	r.Post("/editors", h.grantEditorRole)
	r.Delete("/editors/{id}", h.revokeEditorRole)
	r.Get("/journal", h.listJournal)
	r.Post("/files", h.adminUploadFile)

	r.Group(func(r chi.Router) {
		r.Use(adminOnly)
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
		r.Delete("/users/{id}/student", h.adminUnclaimUser)
		r.Get("/students", h.adminListStudents)
		r.Post("/students", h.adminCreateStudent)
		r.Post("/students/import", h.adminImportStudents)
		r.Delete("/students/{id}", h.adminDeleteStudent)
		r.Get("/comments", h.adminListComments)
		r.Get("/search-queries", h.adminSearchStats)
		r.Put("/comments/{id}", h.adminUpdateComment)
		r.Delete("/comments/{id}", h.adminDeleteComment)
		r.Get("/posts", h.adminListPosts)
		r.Put("/posts/{id}", h.adminUpdatePost)
		r.Delete("/posts/{id}", h.adminDeletePost)
		r.Get("/files", h.adminListFiles)
		r.Delete("/files/{id}", h.adminDeleteFile)
		r.Post("/journal/{id}/revert", h.revertEdit)
		r.Route("/grade-sources", h.mountGradeSources)
		r.Route("/faq", func(r chi.Router) {
			mount[models.FAQItem, models.FAQInput](h, r, crud[models.FAQItem, models.FAQInput]{
				list:   func(ctx context.Context, _ *http.Request) (any, error) { return st.ListFAQ(ctx) },
				get:    st.GetFAQ,
				create: st.CreateFAQ,
				update: st.UpdateFAQ,
				del:    st.DeleteFAQ,
			})
		})
		r.Route("/pages", func(r chi.Router) {
			mount[models.Page, models.PageInput](h, r, crud[models.Page, models.PageInput]{
				list:   func(ctx context.Context, _ *http.Request) (any, error) { return st.ListPages(ctx, false) },
				get:    st.GetPage,
				create: st.CreatePage,
				update: st.UpdatePage,
				del:    st.DeletePage,
			})
		})
	})

	r.Route("/practice", func(r chi.Router) {
		r.With(h.practiceInZone).Get("/{id}/signups", h.adminPracticeSignups)
		r.With(h.practiceInZone).Put("/{id}/signups/order", h.adminReorderSignups)
		r.With(h.practiceInZone).Post("/{id}/signups/auto", h.adminAutoQueue)
		mount[models.PracticeSession, models.PracticeSessionInput](h, r, crud[models.PracticeSession, models.PracticeSessionInput]{
			entity: "practice",
			list: func(ctx context.Context, r *http.Request) (any, error) {
				return st.ListPracticeSessions(ctx, store.PracticeFilter{})
			},
			listWithin: func(ctx context.Context, _ *http.Request, zone []string) (any, error) {
				return st.ListPracticeSessions(ctx, store.PracticeFilter{Within: zone})
			},
			get:         st.GetPracticeSession,
			create:      st.CreatePracticeSession,
			update:      st.UpdatePracticeSession,
			del:         st.DeletePracticeSession,
			inAudience:  func(_ context.Context, in *models.PracticeSessionInput) ([]string, error) { return in.Audience, nil },
			rowAudience: func(_ context.Context, s models.PracticeSession) ([]string, error) { return s.Audience, nil },
			idOf:        func(s models.PracticeSession) int64 { return s.ID },
			titleOf:     func(s models.PracticeSession) string { return s.SubjectName + ", " + s.StartsAt.Format("02.01 15:04") },
		})
	})

	r.Route("/subjects", func(r chi.Router) {
		// Editors read subjects to pick one; only the admin changes them.
		mount[models.Subject, models.SubjectInput](h, r, crud[models.Subject, models.SubjectInput]{
			list: func(ctx context.Context, _ *http.Request) (any, error) { return st.ListSubjectsWithCounts(ctx, "") },
			listWithin: func(ctx context.Context, _ *http.Request, _ []string) (any, error) {
				return st.ListSubjectsWithCounts(ctx, "")
			},
			get:    st.GetSubject,
			create: st.CreateSubject,
			update: st.UpdateSubject,
			del:    st.DeleteSubject,
		})
	})
	r.Route("/labs", func(r chi.Router) {
		mount[models.Lab, models.LabInput](h, r, crud[models.Lab, models.LabInput]{
			entity: "labs",
			list: func(ctx context.Context, r *http.Request) (any, error) {
				return st.ListLabs(ctx, store.LabFilter{SubjectID: optionalID(r, "subjectId")})
			},
			listWithin: func(ctx context.Context, r *http.Request, zone []string) (any, error) {
				return st.ListLabs(ctx, store.LabFilter{SubjectID: optionalID(r, "subjectId"), Within: zone})
			},
			get:         st.GetLab,
			create:      st.CreateLab,
			update:      st.UpdateLab,
			del:         st.DeleteLab,
			inAudience:  func(_ context.Context, in *models.LabInput) ([]string, error) { return in.Audience, nil },
			rowAudience: func(_ context.Context, l models.Lab) ([]string, error) { return l.Audience, nil },
			idOf:        func(l models.Lab) int64 { return l.ID },
			titleOf: func(l models.Lab) string {
				return l.SubjectName + ": лаба " + strconv.Itoa(l.Number) + " «" + l.Title + "»"
			},
			saved: func(ctx context.Context, p models.Principal, id int64, created bool, in *models.LabInput) error {
				return setAuthor(ctx, st, "labs", p, id, created, in.AuthorID)
			},
		})
	})
	r.Route("/events", func(r chi.Router) {
		mount[models.Event, models.EventInput](h, r, crud[models.Event, models.EventInput]{
			entity: "events",
			list:   func(ctx context.Context, _ *http.Request) (any, error) { return st.ListEvents(ctx, nil, nil, "", "") },
			listWithin: func(ctx context.Context, _ *http.Request, zone []string) (any, error) {
				return st.ListEventsWithin(ctx, zone)
			},
			get:         st.GetEvent,
			create:      st.CreateEvent,
			update:      st.UpdateEvent,
			del:         st.DeleteEvent,
			inAudience:  func(_ context.Context, in *models.EventInput) ([]string, error) { return in.Audience, nil },
			rowAudience: func(_ context.Context, e models.Event) ([]string, error) { return e.Audience, nil },
			idOf:        func(e models.Event) int64 { return e.ID },
			titleOf:     func(e models.Event) string { return e.Title },
		})
	})
	r.Route("/notes", func(r chi.Router) {
		mount[models.Note, models.NoteInput](h, r, crud[models.Note, models.NoteInput]{
			entity: "notes",
			list: func(ctx context.Context, r *http.Request) (any, error) {
				return st.ListNotes(ctx, store.NoteFilter{SubjectID: optionalID(r, "subjectId")})
			},
			listWithin: func(ctx context.Context, r *http.Request, zone []string) (any, error) {
				return st.ListNotes(ctx, store.NoteFilter{SubjectID: optionalID(r, "subjectId"), Within: zone})
			},
			get:         st.GetNote,
			create:      st.CreateNote,
			update:      st.UpdateNote,
			del:         st.DeleteNote,
			inAudience:  func(_ context.Context, in *models.NoteInput) ([]string, error) { return in.Audience, nil },
			rowAudience: func(_ context.Context, n models.Note) ([]string, error) { return n.Audience, nil },
			idOf:        func(n models.Note) int64 { return n.ID },
			titleOf:     func(n models.Note) string { return n.SubjectName + ": «" + n.Title + "»" },
			saved: func(ctx context.Context, p models.Principal, id int64, created bool, in *models.NoteInput) error {
				return setAuthor(ctx, st, "notes", p, id, created, in.AuthorID)
			},
		})
	})
	// A quiz is for whoever its note is for; a quiz without a note is the admin's.
	noteAudience := func(ctx context.Context, noteID *int64) ([]string, error) {
		if noteID == nil {
			return []string{}, nil
		}
		n, err := st.GetNote(ctx, *noteID)
		if errors.Is(err, httpx.ErrNotFound) {
			return []string{}, nil
		}
		return n.Audience, err
	}
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
		mount[models.Quiz, models.QuizInput](h, r, crud[models.Quiz, models.QuizInput]{
			entity: "quizzes",
			list: func(ctx context.Context, _ *http.Request) (any, error) {
				return st.ListQuizzes(ctx, store.QuizFilter{})
			},
			listWithin: func(ctx context.Context, _ *http.Request, zone []string) (any, error) {
				return st.ListQuizzes(ctx, store.QuizFilter{Within: zone})
			},
			get:         st.GetQuiz,
			create:      st.CreateQuiz,
			update:      st.UpdateQuiz,
			del:         st.DeleteQuiz,
			inAudience:  func(ctx context.Context, in *models.QuizInput) ([]string, error) { return noteAudience(ctx, in.NoteID) },
			rowAudience: func(ctx context.Context, q models.Quiz) ([]string, error) { return noteAudience(ctx, q.NoteID) },
			idOf:        func(q models.Quiz) int64 { return q.ID },
			titleOf:     func(q models.Quiz) string { return "квиз «" + q.Title + "»" },
		})
	})
}

// setAuthor records the author: the admin picks it in the form, an editor
// becomes the author of what they create and the last editor of what they change.
func setAuthor(ctx context.Context, st *store.Store, table string, p models.Principal, id int64, created bool, chosen *int64) error {
	switch {
	case p.Admin:
		return st.SetAuthor(ctx, table, id, chosen, nil, false)
	case created:
		return st.SetAuthor(ctx, table, id, p.ActorID(), p.ActorID(), false)
	default:
		return st.SetAuthor(ctx, table, id, nil, p.ActorID(), true)
	}
}

// practiceInZone lets an editor manage the queue of a session in their zone.
func (h *Handler) practiceInZone(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := principal(r.Context())
		if p.Admin {
			next.ServeHTTP(w, r)
			return
		}
		id, err := httpx.IDParam(r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		sess, err := h.store.GetPracticeSession(r.Context(), id)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if !p.Covers(sess.Audience) {
			forbiddenZone(w)
			return
		}
		next.ServeHTTP(w, r)
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
	events, err := h.store.ListEvents(ctx, nil, nil, "", "")
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
	resp.Upcoming, err = h.calendarItems(ctx, sc.Now, sc.Now.AddDate(0, 0, 30), "", "", scopeAll)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, resp)
}
