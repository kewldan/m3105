package api

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kewldan/edu3105/apps/api/internal/badges"
	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

var isuRe = regexp.MustCompile(`^\d{4,10}$`)

// getBadge draws a student's scores as an SVG card for a GitHub README by the
// ISU number from the grade tables; an account on the site is not needed, it
// only adds the Telegram handle. Errors are badges too (200), since GitHub's
// image proxy shows nothing for an error status.
func (h *Handler) getBadge(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	style := strings.TrimSuffix(chi.URLParam(r, "style"), ".svg")
	q := r.URL.Query()
	fail := func(status int, msg string) {
		writeBadge(w, r, status, badges.Message(msg), 300)
	}
	if !hasStyle(style) {
		fail(http.StatusNotFound, "нет стиля «"+style+"»")
		return
	}
	isu := strings.TrimSpace(q.Get("isu"))
	if !isuRe.MatchString(isu) {
		fail(http.StatusOK, "укажите ?isu=")
		return
	}
	rows, err := h.store.ListBadgeGrades(ctx, isu)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if len(rows) == 0 {
		fail(http.StatusOK, "ИСУ "+isu+" нет в таблицах баллов")
		return
	}
	var user models.User
	switch u, err := h.store.GetApprovedUserByISU(ctx, isu); {
	case err == nil:
		user = u
	case !errors.Is(err, httpx.ErrNotFound):
		httpx.Fail(w, err)
		return
	}
	rows = pickBadgeSubjects(rows, q.Get("subjects"))
	sc, err := h.site(ctx)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	card := badges.Card{
		Handle:   user.TelegramUsername,
		Group:    models.NormalizeGroup(user.GroupName),
		Date:     sc.Now,
		Seed:     isu,
		NoTotal:  q.Get("total") == "0",
		Subjects: make([]badges.Subject, 0, len(rows)),
	}
	if sc.Settings.SemesterEnd.Valid {
		card.Closed = sc.Now.After(sc.Settings.SemesterEnd.Time.AddDate(0, 0, 1))
	}
	var synced time.Time
	for i, g := range rows {
		if i == 0 {
			if q.Get("name") != "0" {
				card.Name = models.ShortName(g.FullName)
			}
			if group := models.NormalizeGroup(g.Group); group != "" {
				card.Group = group
			}
		}
		if g.SyncedAt != nil && g.SyncedAt.After(synced) {
			synced = *g.SyncedAt
		}
		name := g.Title
		if name == "" {
			name = g.SubjectName
		}
		// Короткое название предмета («Прога») читается лучше заголовка таблицы.
		short := g.SubjectShort
		if short == "" {
			short = g.Title
		}
		card.Subjects = append(card.Subjects, badges.Subject{
			Name: name, Short: short, Score: g.Total, Max: g.MaxTotal,
			Group:  badges.Place{Rank: g.GroupRank, Size: g.GroupSize},
			Course: badges.Place{Rank: g.CourseRank, Size: g.CourseSize},
			Median: g.GroupMedian,
		})
	}
	if !synced.IsZero() {
		card.Date = synced.In(sc.Loc)
	}
	out, _ := badges.Render(style, card)
	writeBadge(w, r, http.StatusOK, out, 1800)
}

func hasStyle(name string) bool {
	for _, s := range badges.Styles() {
		if s.Name == name {
			return true
		}
	}
	return false
}

// pickBadgeSubjects keeps the subjects listed in ?subjects= (slugs or source
// ids, comma-separated) in the order given; empty keeps all.
func pickBadgeSubjects(rows []store.BadgeGrade, list string) []store.BadgeGrade {
	if strings.TrimSpace(list) == "" {
		return rows
	}
	out := make([]store.BadgeGrade, 0, len(rows))
	seen := map[int64]bool{}
	for _, key := range strings.Split(list, ",") {
		key = strings.TrimSpace(key)
		id, _ := strconv.ParseInt(key, 10, 64)
		for _, g := range rows {
			if !seen[g.SourceID] && (g.SubjectSlug == key || g.SourceID == id) {
				seen[g.SourceID] = true
				out = append(out, g)
			}
		}
	}
	return out
}

func writeBadge(w http.ResponseWriter, r *http.Request, status int, body []byte, maxAge int) {
	sum := sha256.Sum256(body)
	etag := `"` + hex.EncodeToString(sum[:8]) + `"`
	hd := w.Header()
	hd.Set("Content-Type", "image/svg+xml; charset=utf-8")
	hd.Set("Cache-Control", fmt.Sprintf("public, max-age=%d", maxAge))
	hd.Set("ETag", etag)
	hd.Set("X-Content-Type-Options", "nosniff")
	hd.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	if status == http.StatusOK && r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
