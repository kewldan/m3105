package grades

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

// retryAfter keeps a broken source from being hammered on every tick.
const retryAfter = 30 * time.Minute

// fetchParallel is how many tabs are downloaded at once.
const fetchParallel = 6

// Syncer copies sheets into grade_rows on schedule or on demand.
type Syncer struct {
	store   *store.Store
	fetcher *Fetcher
	log     *slog.Logger

	mu sync.Mutex
	// failedAt remembers the last failed attempt per source.
	failedAt map[int64]time.Time
}

// NewSyncer builds a syncer reading from docs.google.com.
func NewSyncer(st *store.Store, f *Fetcher) *Syncer {
	if f == nil {
		f = NewFetcher()
	}
	return &Syncer{store: st, fetcher: f, log: slog.Default().With("component", "grades"), failedAt: map[int64]time.Time{}}
}

// Run syncs due sources every few minutes until ctx ends.
func (s *Syncer) Run(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		s.syncDue(ctx)
		select {
		case <-ticker.C:
		case <-ctx.Done():
			return
		}
	}
}

func (s *Syncer) syncDue(ctx context.Context) {
	now := time.Now()
	due, err := s.store.ListDueGradeSources(ctx, now)
	if err != nil {
		s.log.Warn("due sources", "err", err)
		return
	}
	for _, src := range due {
		s.mu.Lock()
		last := s.failedAt[src.ID]
		s.mu.Unlock()
		if now.Sub(last) < retryAfter {
			continue
		}
		res, err := s.Sync(ctx, src)
		if err != nil {
			s.log.Warn("sync failed", "source", src.ID, "err", err)
			continue
		}
		s.log.Info("synced", "source", src.ID, "tabs", len(res.Tabs), "rows", res.Rows, "linked", res.Linked)
	}
}

// Sync downloads every matching tab and replaces the source's rows. On error
// the old rows stay and the message is stored for the admin panel.
func (s *Syncer) Sync(ctx context.Context, src models.GradeSource) (models.GradeSyncResult, error) {
	res, err := s.sync(ctx, src)
	s.mu.Lock()
	if err != nil {
		s.failedAt[src.ID] = time.Now()
	} else {
		delete(s.failedAt, src.ID)
	}
	s.mu.Unlock()
	if err != nil {
		if e := s.store.MarkGradeSyncFailed(context.WithoutCancel(ctx), src.ID, err.Error()); e != nil {
			s.log.Warn("store sync error", "source", src.ID, "err", e)
		}
		return res, err
	}
	return res, nil
}

func (s *Syncer) sync(ctx context.Context, src models.GradeSource) (models.GradeSyncResult, error) {
	res := models.GradeSyncResult{Tabs: []string{}, Skipped: []string{}}
	var pattern *regexp.Regexp
	if src.TabPattern != "" {
		p, err := regexp.Compile(src.TabPattern)
		if err != nil {
			return res, fmt.Errorf("регулярка вкладок: %w", err)
		}
		pattern = p
	}
	tabs, err := s.fetcher.Tabs(ctx, src.SpreadsheetID)
	if err != nil {
		return res, fmt.Errorf("список вкладок: %w", err)
	}
	// Вкладки качаются параллельно (на курсе их два десятка, по одной — секунды
	// на каждую), а складываются по порядку, чтобы дубли решались одинаково.
	type tabResult struct {
		rows []models.GradeRow
		err  error
	}
	results := make([]tabResult, len(tabs))
	sem := make(chan struct{}, fetchParallel)
	var wg sync.WaitGroup
	for i, tab := range tabs {
		if pattern != nil && !pattern.MatchString(tab.Name) {
			results[i].err = ErrNoHeader
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			records, err := s.fetcher.CSV(ctx, src.SpreadsheetID, tab.GID)
			if err == nil {
				results[i].rows, err = ParseTab(records, src, tab.Name)
			}
			results[i].err = err
		}()
	}
	wg.Wait()

	var rows []models.GradeRow
	seen := map[string]bool{}
	for i, tab := range tabs {
		r := results[i]
		if errors.Is(r.err, ErrNoHeader) {
			res.Skipped = append(res.Skipped, tab.Name)
			continue
		}
		if r.err != nil {
			return res, fmt.Errorf("вкладка %q: %w", tab.Name, r.err)
		}
		res.Tabs = append(res.Tabs, tab.Name)
		for _, row := range r.rows {
			// Студент, попавший в две вкладки, считается один раз — по первой.
			if seen[row.RowKey] {
				continue
			}
			seen[row.RowKey] = true
			rows = append(rows, row)
		}
	}
	if len(rows) == 0 {
		return res, fmt.Errorf("не нашлось ни одной строки: проверьте заголовок %q", src.NameColumn)
	}
	if err := s.store.ReplaceGradeRows(ctx, src.ID, rows); err != nil {
		return res, err
	}
	res.Rows = len(rows)
	linked, err := s.LinkByName(ctx)
	if err != nil {
		s.log.Warn("link by name", "err", err)
	}
	res.Linked = linked
	return res, nil
}

// LinkByName gives confirmed accounts without an ISU the number of the sheet
// row with their name in their group, when exactly one row and one account match.
func (s *Syncer) LinkByName(ctx context.Context) (int, error) {
	users, err := s.store.ListUsersWithoutISU(ctx)
	if err != nil || len(users) == 0 {
		return 0, err
	}
	candidates, err := s.store.ListUnclaimedGradeRows(ctx)
	if err != nil {
		return 0, err
	}
	matches := MatchByName(users, candidates)
	linked := 0
	for userID, isu := range matches {
		ok, err := s.store.LinkUserISU(ctx, userID, isu)
		if err != nil {
			return linked, err
		}
		if ok {
			linked++
			s.log.Info("linked by name", "user", userID)
		}
	}
	return linked, nil
}

// MatchByName pairs accounts with sheet rows: every word of the account name
// ("Имя Фамилия") must be in the row's ФИО and the groups must agree. Rows or
// accounts with more than one match are left for the student to link by hand.
func MatchByName(users []models.User, rows []store.GradeCandidate) map[int64]string {
	byUser := map[int64][]string{}
	claims := map[string]int{}
	for _, u := range users {
		words := nameWords(u.Name)
		if len(words) < 2 || u.GroupName == "" {
			continue
		}
		var found []string
		for _, r := range rows {
			if models.SameGroup(u.GroupName, r.Group) && containsAll(nameWords(r.FullName), words) && !slices.Contains(found, r.ISU) {
				found = append(found, r.ISU)
			}
		}
		if len(found) == 1 {
			byUser[u.ID] = found
			claims[found[0]]++
		}
	}
	out := map[int64]string{}
	for id, found := range byUser {
		if claims[found[0]] == 1 {
			out[id] = found[0]
		}
	}
	return out
}

func nameWords(s string) []string {
	return strings.Fields(strings.ReplaceAll(strings.ToLower(s), "ё", "е"))
}

func containsAll(have, want []string) bool {
	for _, w := range want {
		if !slices.Contains(have, w) {
			return false
		}
	}
	return true
}
