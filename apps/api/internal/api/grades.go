package api

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

// RunGradeSync syncs score sheets on schedule until ctx ends.
func (h *Handler) RunGradeSync(ctx context.Context) { h.grades.Run(ctx) }

// linkGradesLater matches unlinked accounts to sheet rows by name after a
// name, group or approval change, without holding up the response.
func (h *Handler) linkGradesLater(ctx context.Context) {
	go func() {
		if _, err := h.grades.LinkByName(context.WithoutCancel(ctx)); err != nil {
			slog.Warn("link grades by name", "err", err)
		}
	}()
}

// myGrades returns the student's results in every enabled source.
func (h *Handler) myGrades(ctx context.Context, isu string) ([]models.MyGrade, error) {
	out := []models.MyGrade{}
	if isu == "" {
		return out, nil
	}
	rows, err := h.store.ListGradesByISU(ctx, isu)
	if err != nil || len(rows) == 0 {
		return out, err
	}
	sources, err := h.store.ListGradeSources(ctx, true)
	if err != nil {
		return nil, err
	}
	byID := map[int64]models.GradeSource{}
	for _, s := range sources {
		byID[s.ID] = s
	}
	for _, r := range rows {
		src, ok := byID[r.SourceID]
		if !ok {
			continue
		}
		out = append(out, models.MyGrade{
			Source:    src.Summary(),
			Group:     r.Group,
			Total:     r.Total,
			Parts:     r.Parts,
			Course:    models.Place{Rank: r.CourseRank, Size: r.CourseSize},
			InGroup:   models.Place{Rank: r.GroupRank, Size: r.GroupSize},
			Site:      models.Place{Rank: r.SiteRank, Size: r.SiteSize},
			ChangedAt: r.ChangedAt,
		})
	}
	return out, nil
}

// getMyGrades is the rating page: every row of one source. Only confirmed
// students see it — the sheet lists the whole course by name.
func (h *Handler) getMyGrades(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID, _ := userauth.UserID(ctx)
	user, err := h.store.GetUser(ctx, userID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	sources, err := h.store.ListGradeSources(ctx, true)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp := models.GradesResponse{
		Sources: make([]models.GradeSourceSummary, len(sources)),
		Rows:    []models.GradeEntry{},
		MyGroup: models.NormalizeGroup(user.GroupName),
		Linked:  user.ISU != "",
	}
	for i, s := range sources {
		resp.Sources[i] = s.Summary()
	}
	if len(sources) == 0 {
		httpx.JSON(w, http.StatusOK, resp)
		return
	}
	selected := 0
	if id, err := strconv.ParseInt(r.URL.Query().Get("source"), 10, 64); err == nil {
		for i, s := range sources {
			if s.ID == id {
				selected = i
			}
		}
	}
	resp.Source = &resp.Sources[selected]
	rows, err := h.store.ListGradeRows(ctx, sources[selected].ID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	for _, row := range rows {
		e := models.GradeEntry{
			Name:      models.ShortName(row.FullName),
			Group:     row.Group,
			Total:     row.Total,
			Parts:     row.Parts,
			ChangedAt: row.ChangedAt,
			Me:        user.ISU != "" && row.ISU == user.ISU,
		}
		if row.UserID != nil {
			e.User = &models.PublicUser{ID: *row.UserID, Name: deref(row.UserName), PhotoURL: deref(row.UserPhoto), Group: deref(row.UserGroup)}
		}
		if e.Me {
			resp.MyGroup = row.Group
		}
		resp.Rows = append(resp.Rows, e)
	}
	httpx.JSON(w, http.StatusOK, resp)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// mountGradeSources is the admin side: sheet settings and a manual sync.
func (h *Handler) mountGradeSources(r chi.Router) {
	st := h.store
	r.Post("/{id}/sync", func(w http.ResponseWriter, r *http.Request) {
		id, err := httpx.IDParam(r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		src, err := st.GetGradeSource(r.Context(), id)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		res, err := h.grades.Sync(r.Context(), src)
		if err != nil {
			httpx.Error(w, http.StatusBadGateway, "sync_failed", err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, res)
	})
	mount[models.GradeSource, models.GradeSourceInput](r, crud[models.GradeSource, models.GradeSourceInput]{
		list:   func(ctx context.Context, _ *http.Request) (any, error) { return st.ListGradeSources(ctx, false) },
		get:    st.GetGradeSource,
		create: st.CreateGradeSource,
		update: st.UpdateGradeSource,
		del:    st.DeleteGradeSource,
	})
}
