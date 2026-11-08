package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/schedule"
	"github.com/kewldan/edu3105/apps/api/internal/semester"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

var ruleWeekdays = [...]string{"", "пн", "вт", "ср", "чт", "пт", "сб", "вс"}

func ruleTitle(r models.PracticeRule) string {
	name := r.SubjectShortName
	if name == "" {
		name = r.SubjectName
	}
	t := name + ", " + ruleWeekdays[r.Weekday] + " " + r.StartTime
	switch r.Weeks {
	case schedule.Odd:
		t += " (нечётные)"
	case schedule.Even:
		t += " (чётные)"
	}
	return "регулярная сдача: " + t
}

func (h *Handler) mountPracticeRules(r chi.Router) {
	st := h.store
	r.Post("/preview", h.previewPracticeRule)
	mount[models.PracticeRule, models.PracticeRuleInput](h, r, crud[models.PracticeRule, models.PracticeRuleInput]{
		entity: "practice-rules",
		list: func(ctx context.Context, _ *http.Request) (any, error) {
			return st.ListPracticeRules(ctx, nil)
		},
		listWithin: func(ctx context.Context, _ *http.Request, zone []string) (any, error) {
			return st.ListPracticeRules(ctx, zone)
		},
		get: st.GetPracticeRule,
		create: func(ctx context.Context, in *models.PracticeRuleInput) (models.PracticeRule, error) {
			return h.savePracticeRule(ctx, nil, in)
		},
		update: func(ctx context.Context, id int64, in *models.PracticeRuleInput) (models.PracticeRule, error) {
			return h.savePracticeRule(ctx, &id, in)
		},
		del:         st.DeletePracticeRule,
		inAudience:  func(_ context.Context, in *models.PracticeRuleInput) ([]string, error) { return in.Audience, nil },
		rowAudience: func(_ context.Context, r models.PracticeRule) ([]string, error) { return r.Audience, nil },
		idOf:        func(r models.PracticeRule) int64 { return r.ID },
		titleOf:     ruleTitle,
	})
}

// ruleSave expands the rule into dates with the site's timezone and semester.
func (h *Handler) ruleSave(ctx context.Context, in *models.PracticeRuleInput) (store.RuleSave, siteContext, error) {
	sc, err := h.site(ctx)
	if err != nil {
		return store.RuleSave{}, sc, err
	}
	var sem schedule.Semester
	if sc.Settings.SemesterStart.Valid {
		sem.Start = sc.Settings.SemesterStart.Time
		sem.First = semester.Parity(sc.Settings.FirstWeekParity)
		if sem.First == "" {
			sem.First = semester.Odd
		}
	}
	slots, err := schedule.Expand(in.Rule(), sem, sc.Loc)
	if errors.Is(err, schedule.ErrNoSemester) {
		return store.RuleSave{}, sc, &httpx.ValidationError{Fields: map[string]string{
			"weeks": "Чтобы выбрать чётные или нечётные недели, укажите начало семестра в настройках",
		}}
	}
	if err != nil {
		return store.RuleSave{}, sc, err
	}
	return store.RuleSave{In: in, Slots: slots, Now: sc.Now, Loc: sc.Loc}, sc, nil
}

// savePracticeRule writes the rule, brings its sessions in line and tells the
// students of the sessions it had to cancel.
func (h *Handler) savePracticeRule(ctx context.Context, id *int64, in *models.PracticeRuleInput) (models.PracticeRule, error) {
	rs, sc, err := h.ruleSave(ctx, in)
	if err != nil {
		return models.PracticeRule{}, err
	}
	rule, canceled, err := h.store.SavePracticeRule(ctx, id, rs)
	if err != nil {
		return rule, err
	}
	for _, sid := range canceled {
		sess, err := h.store.GetPracticeSession(ctx, sid)
		if err != nil {
			continue
		}
		h.noticeCanceled(ctx, sess, sc.Loc, nil, nil)
	}
	return rule, nil
}

// previewPracticeRule shows what saving a rule would do to each of its dates.
func (h *Handler) previewPracticeRule(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var in models.PracticeRulePreviewInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Rule.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	p := principal(ctx)
	if !p.Covers(in.Rule.Audience) {
		forbiddenZone(w)
		return
	}
	if in.ID != nil && !p.Admin {
		rule, err := h.store.GetPracticeRule(ctx, *in.ID)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if !p.Covers(rule.Audience) {
			forbiddenZone(w)
			return
		}
	}
	rs, _, err := h.ruleSave(ctx, &in.Rule)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	items, err := h.store.PreviewPracticeRule(ctx, in.ID, rs)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, items)
}

// noticeCanceled tells the signed-up students (chats, or loaded now) that the
// session is canceled. Without moved it points to the next session.
func (h *Handler) noticeCanceled(ctx context.Context, sess models.PracticeSession, loc *time.Location, chats []int64, moved *models.PracticeSession) {
	if h.notify == nil || sess.StartsAt.Before(time.Now()) {
		return
	}
	if chats == nil {
		var err error
		if chats, err = h.store.PracticeChats(ctx, sess.ID); err != nil {
			slog.Warn("practice chats", "session", sess.ID, "err", err)
			return
		}
	}
	if len(chats) == 0 {
		return
	}
	var next *models.PracticeSession
	if moved == nil {
		next, _ = h.store.NextPracticeSession(ctx, sess)
	}
	h.notify.PracticeCanceled(chats, sess, loc, moved, next)
}

// practiceChanged tells the signed-up students about a cancellation, a
// restored session or a new time or room.
func (h *Handler) practiceChanged(ctx context.Context, before, after models.PracticeSession) {
	if h.notify == nil || after.StartsAt.Before(time.Now()) {
		return
	}
	sc, err := h.site(ctx)
	if err != nil {
		return
	}
	moved := !before.StartsAt.Equal(after.StartsAt) || before.Location != after.Location
	switch {
	case after.Canceled && !before.Canceled:
		h.noticeCanceled(ctx, after, sc.Loc, nil, nil)
	case !after.Canceled && (before.Canceled || moved):
		chats, err := h.store.PracticeChats(ctx, after.ID)
		if err != nil || len(chats) == 0 {
			return
		}
		if before.Canceled {
			h.notify.PracticeRestored(chats, after, sc.Loc)
		} else {
			h.notify.PracticeMoved(chats, before, after, sc.Loc)
		}
	}
}

// updatePractice is the admin form's save: notices go out after it.
func (h *Handler) updatePractice(ctx context.Context, id int64, in *models.PracticeSessionInput) (models.PracticeSession, error) {
	before, err := h.store.GetPracticeSession(ctx, id)
	if err != nil {
		return before, err
	}
	after, err := h.store.UpdatePracticeSession(ctx, id, in)
	if err != nil {
		return after, err
	}
	h.practiceChanged(ctx, before, after)
	return after, nil
}

func practiceTitle(s models.PracticeSession) string {
	return s.SubjectName + ", " + s.StartsAt.Format("02.01 15:04")
}

// practiceAction runs a change of one session (cancel, restore, back to the
// rule), writes it to the journal and answers with the session.
func (h *Handler) practiceAction(w http.ResponseWriter, r *http.Request, fn func(ctx context.Context, sess models.PracticeSession) error) {
	ctx := r.Context()
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	before, err := h.store.GetPracticeSession(ctx, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := fn(ctx, before); err != nil {
		httpx.Fail(w, err)
		return
	}
	after, err := h.store.GetPracticeSession(ctx, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.journal(ctx, store.NewEdit{Entity: "practice", EntityID: id, Action: "update", Title: practiceTitle(after),
		Audience: after.Audience, Before: before, After: after})
	httpx.JSON(w, http.StatusOK, after)
}

// cancelPractice cancels one session; with moveSignups its signups go to the
// next session for the same audience.
func (h *Handler) cancelPractice(w http.ResponseWriter, r *http.Request) {
	var in models.PracticeCancelInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.practiceAction(w, r, func(ctx context.Context, sess models.PracticeSession) error {
		if sess.Canceled {
			return &httpx.ValidationError{Fields: map[string]string{"_": "Сдача уже отменена"}}
		}
		sc, err := h.site(ctx)
		if err != nil {
			return err
		}
		// Записи могут уехать на другую сдачу: кому писать, узнаём заранее.
		chats, err := h.store.PracticeChats(ctx, sess.ID)
		if err != nil {
			return err
		}
		moved, err := h.store.CancelPracticeSession(ctx, sess.ID, in.Reason, in.MoveSignups)
		if err != nil {
			return err
		}
		after, err := h.store.GetPracticeSession(ctx, sess.ID)
		if err != nil {
			return err
		}
		h.noticeCanceled(ctx, after, sc.Loc, chats, moved)
		return nil
	})
}

func (h *Handler) restorePractice(w http.ResponseWriter, r *http.Request) {
	h.practiceAction(w, r, func(ctx context.Context, sess models.PracticeSession) error {
		if !sess.Canceled {
			return &httpx.ValidationError{Fields: map[string]string{"_": "Сдача не отменена"}}
		}
		if err := h.store.RestorePracticeSession(ctx, sess.ID); err != nil {
			return err
		}
		if after, err := h.store.GetPracticeSession(ctx, sess.ID); err == nil {
			h.practiceChanged(ctx, sess, after)
		}
		return nil
	})
}

// resetPractice puts a hand-changed session of a rule back to the rule.
func (h *Handler) resetPractice(w http.ResponseWriter, r *http.Request) {
	h.practiceAction(w, r, func(ctx context.Context, sess models.PracticeSession) error {
		if sess.RuleID == nil {
			return &httpx.ValidationError{Fields: map[string]string{"_": "Это разовая сдача, у неё нет правила"}}
		}
		rule, err := h.store.GetPracticeRule(ctx, *sess.RuleID)
		if err != nil {
			return err
		}
		if !principal(ctx).Covers(rule.Audience) {
			return &httpx.ValidationError{Fields: map[string]string{"_": "Правило этой сдачи — не для вашего потока или группы"}}
		}
		sc, err := h.site(ctx)
		if err != nil {
			return err
		}
		if err := h.store.ResetPracticeSession(ctx, sess.ID, sc.Loc); err != nil {
			return err
		}
		if after, err := h.store.GetPracticeSession(ctx, sess.ID); err == nil {
			h.practiceChanged(ctx, sess, after)
		}
		return nil
	})
}
