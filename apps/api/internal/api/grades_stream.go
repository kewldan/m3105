package api

import (
	"cmp"
	"context"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// streamPart is one subject of a stream rating: its source's total is a column.
type streamPart struct {
	Slug  string // subject slug of the grade source
	Key   string // column key in the rating
	Label string
}

// streamRating ranks one stream by the sum of totals over several subjects.
// It is shown only to students of that stream.
type streamRating struct {
	Stream int
	Parts  []streamPart
}

var streamRatings = []streamRating{{
	Stream: 1,
	Parts: []streamPart{
		{Slug: "diskretnaya-matematika", Key: "dm", Label: "ДМ"},
		{Slug: "osnovy-programmirovaniya", Key: "op", Label: "ОП"},
		{Slug: "algoritmy-i-struktury-dannyh", Key: "algo", Label: "Алгосы"},
	},
}}

// streamSourceID is the id of a stream rating in `sources`: negative, so it
// never meets a real source.
func streamSourceID(stream int) int64 { return -int64(stream) }

// streamBoard is a stream rating ready to be listed and, if picked, filled.
type streamBoard struct {
	summary models.GradeSourceSummary
	// sources are the parts' sources, in the order of the columns.
	sources []models.GradeSource
	keys    []string
	groups  map[string]bool
}

// viewerStreamBoard returns the rating of the student's stream, or nil when
// the viewer is not an approved student of a stream that has one.
func (h *Handler) viewerStreamBoard(ctx context.Context, user models.User, sources []models.GradeSource) (*streamBoard, error) {
	if user.ApprovedAt == nil || user.GroupName == "" {
		return nil, nil
	}
	studyGroups, err := h.store.ListStudyGroups(ctx)
	if err != nil {
		return nil, err
	}
	stream := 0
	for _, g := range studyGroups {
		if models.NormalizeGroup(g.Name) == models.NormalizeGroup(user.GroupName) {
			stream = g.Stream
		}
	}
	idx := slices.IndexFunc(streamRatings, func(r streamRating) bool { return r.Stream == stream })
	if stream == 0 || idx < 0 {
		return nil, nil
	}
	rating := streamRatings[idx]
	b := &streamBoard{groups: map[string]bool{}}
	for _, g := range studyGroups {
		if g.Stream == stream {
			b.groups[models.NormalizeGroup(g.Name)] = true
		}
	}
	labels := []string{}
	var synced *time.Time
	var maxTotal float64
	for _, p := range rating.Parts {
		i := slices.IndexFunc(sources, func(s models.GradeSource) bool {
			return s.SubjectSlug == p.Slug && !s.MembersOnly
		})
		if i < 0 {
			continue
		}
		src := sources[i]
		b.sources = append(b.sources, src)
		b.keys = append(b.keys, p.Key)
		labels = append(labels, p.Label)
		b.summary.Columns = append(b.summary.Columns, models.GradeColumn{Key: p.Key, Label: p.Label, Max: src.MaxTotal})
		maxTotal += src.MaxTotal
		// Сводный рейтинг свеж настолько, насколько свежа самая старая таблица.
		if src.SyncedAt != nil && (synced == nil || src.SyncedAt.Before(*synced)) {
			synced = src.SyncedAt
		}
	}
	if len(b.sources) == 0 {
		return nil, nil
	}
	b.summary.ID = streamSourceID(stream)
	b.summary.Title = fmt.Sprintf("Поток %d: %s", stream, strings.Join(labels, " + "))
	b.summary.SubjectName = fmt.Sprintf("Поток %d", stream)
	b.summary.SubjectColor = "amber"
	b.summary.SubjectIcon = "sigma"
	b.summary.MaxTotal = maxTotal
	b.summary.SyncedAt = synced
	b.summary.Stream = stream
	return b, nil
}

// rows sums every stream student's totals over the parts, best first.
func (b *streamBoard) rows(ctx context.Context, h *Handler, isu string) ([]models.GradeEntry, error) {
	byKey := map[string]*models.GradeEntry{}
	for i, src := range b.sources {
		rows, err := h.store.ListGradeRows(ctx, src.ID)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if !b.groups[models.NormalizeGroup(row.Group)] {
				continue
			}
			// Один студент в разных таблицах узнаётся по ИСУ, без него — по ФИО и группе.
			key := "isu:" + row.ISU
			if row.ISU == "" {
				key = "name:" + strings.ToLower(strings.Join(strings.Fields(row.FullName), " ")) + "|" + models.NormalizeGroup(row.Group)
			}
			e, ok := byKey[key]
			if !ok {
				e = &models.GradeEntry{
					Name:  models.ShortName(row.FullName),
					Group: row.Group,
					Parts: map[string]*float64{},
					Labs:  map[string]models.GradeLab{},
				}
				byKey[key] = e
			}
			total := row.Total
			e.Parts[b.keys[i]] = &total
			e.Total += total
			if row.ChangedAt.After(e.ChangedAt) {
				e.ChangedAt = row.ChangedAt
			}
			if e.User == nil && row.UserID != nil {
				e.User = &models.PublicUser{ID: *row.UserID, Name: deref(row.UserName), PhotoURL: deref(row.UserPhoto), Group: deref(row.UserGroup)}
			}
			if isu != "" && row.ISU == isu {
				e.Me = true
			}
		}
	}
	out := make([]models.GradeEntry, 0, len(byKey))
	for _, e := range byKey {
		e.Total = math.Round(e.Total*100) / 100
		out = append(out, *e)
	}
	slices.SortFunc(out, func(a, b models.GradeEntry) int {
		return cmp.Or(cmp.Compare(b.Total, a.Total), strings.Compare(a.Name, b.Name), strings.Compare(a.Group, b.Group))
	})
	return out, nil
}
