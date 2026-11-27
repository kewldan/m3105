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

// LiveSyncEvery is how often a sheet is synced while a practice session of
// its subject is on: grade changes get their time with this precision.
const LiveSyncEvery = 2 * time.Minute

// Syncer copies sheets into grade_rows on schedule or on demand.
type Syncer struct {
	store   *store.Store
	fetcher *Fetcher
	log     *slog.Logger
	// OnSynced is called after every successful sync, scheduled or manual:
	// API сбрасывает по нему кеш рейтинга на фронте, иначе гости видят
	// прошлые баллы до истечения TTL.
	OnSynced func()

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

// Run syncs due sources every minute until ctx ends.
func (s *Syncer) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
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
	due, err := s.store.ListDueGradeSources(ctx, now, LiveSyncEvery)
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
// the old rows stay and the message is stored for the admin panel. A part of
// another source syncs as that source: its rows live there.
func (s *Syncer) Sync(ctx context.Context, src models.GradeSource) (models.GradeSyncResult, error) {
	if src.ParentID != nil {
		parent, err := s.store.GetGradeSource(ctx, *src.ParentID)
		if err != nil {
			return models.GradeSyncResult{}, fmt.Errorf("источник, в который входит этот: %w", err)
		}
		src = parent
	}
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
	if s.OnSynced != nil {
		s.OnSynced()
	}
	return res, nil
}

func (s *Syncer) sync(ctx context.Context, src models.GradeSource) (models.GradeSyncResult, error) {
	res := models.GradeSyncResult{Tabs: []string{}, Skipped: []string{}, Warnings: []string{}}
	rows, maxes, err := s.readSheet(ctx, src, &res)
	if err != nil {
		return res, err
	}
	if len(rows) == 0 {
		return res, fmt.Errorf("не нашлось ни одной строки: проверьте заголовок %q", src.NameColumn)
	}
	// Части источника — другие таблицы того же предмета со своими заголовками:
	// другие группы (ИСРПО у разных преподавателей) или новые столбцы для тех же
	// студентов (бонусы с практик одной группы).
	parts, err := s.store.ListGradeSourceParts(ctx, src.ID)
	if err != nil {
		return res, err
	}
	partMaxes := make([]map[string]float64, len(parts))
	for i, part := range parts {
		partRows, m, err := s.readSheet(ctx, part, &res)
		if err != nil {
			return res, fmt.Errorf("таблица «%s»: %w", part.Label(), err)
		}
		if len(partRows) == 0 {
			return res, fmt.Errorf("таблица «%s»: не нашлось ни одной строки, проверьте заголовок %q", part.Label(), part.NameColumn)
		}
		rows = MergeRows(rows, partRows)
		partMaxes[i] = m
	}

	if err := s.store.ReplaceGradeRows(ctx, src, rows); err != nil {
		return res, err
	}
	res.Rows = len(rows)
	if res.Warnings = CheckScheme(src, rows); len(res.Warnings) > 0 {
		s.log.Warn("grade scheme disagrees with the sheet", "source", src.ID, "labs", res.Warnings)
	}
	for i, one := range append([]models.GradeSource{src}, parts...) {
		m := maxes
		if i > 0 {
			m = partMaxes[i-1]
		}
		if changed := changedMax(one.Columns, m); len(changed) > 0 {
			if err := s.store.SetGradeColumnMax(ctx, one.ID, changed); err != nil {
				return res, err
			}
			s.log.Info("column max from sheet", "source", one.ID, "changed", changed)
		}
	}
	linked, err := s.LinkByName(ctx)
	if err != nil {
		s.log.Warn("link by name", "err", err)
	}
	res.Linked = linked
	return res, nil
}

// readSheet downloads the matching tabs of one spreadsheet and parses them
// with src's headers. A student on two tabs counts once, by the first.
// Read and skipped tabs go to res; maxes are the column maxima of the sheet.
func (s *Syncer) readSheet(ctx context.Context, src models.GradeSource, res *models.GradeSyncResult) ([]models.GradeRow, map[string]float64, error) {
	var pattern *regexp.Regexp
	if src.TabPattern != "" {
		p, err := regexp.Compile(src.TabPattern)
		if err != nil {
			return nil, nil, fmt.Errorf("регулярка вкладок: %w", err)
		}
		pattern = p
	}
	tabs, title, err := s.fetcher.Tabs(ctx, src.SpreadsheetID)
	if err != nil {
		return nil, nil, fmt.Errorf("список вкладок: %w", err)
	}
	// Вкладки качаются параллельно (на курсе их два десятка, по одной — секунды
	// на каждую), а складываются по порядку, чтобы дубли решались одинаково.
	type tabResult struct {
		rows []models.GradeRow
		max  map[string]float64
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
				results[i].rows, err = ParseTab(records, src, TabGroup(tab.Name, title))
				results[i].max = ParseMax(records, src)
			}
			results[i].err = err
		}()
	}
	wg.Wait()

	// Без столбца ИСУ номер и полное имя берутся из списка курса.
	var students []models.Student
	for i := range results {
		if !slices.ContainsFunc(results[i].rows, func(r models.GradeRow) bool { return r.ISU == "" }) {
			continue
		}
		if students == nil {
			if students, err = s.store.ListStudents(ctx); err != nil {
				return nil, nil, fmt.Errorf("список курса: %w", err)
			}
		}
		FillFromCourse(results[i].rows, students)
	}

	var rows []models.GradeRow
	seen := map[string]bool{}
	// Максимум столбца — с первой вкладки, где он есть: на вкладках разных
	// потоков набор лаб бывает разным.
	maxes := map[string]float64{}
	for i, tab := range tabs {
		r := results[i]
		if errors.Is(r.err, ErrNoHeader) {
			res.Skipped = append(res.Skipped, tab.Name)
			continue
		}
		if r.err != nil {
			return nil, nil, fmt.Errorf("вкладка %q: %w", tab.Name, r.err)
		}
		res.Tabs = append(res.Tabs, tab.Name)
		for k, v := range r.max {
			if _, ok := maxes[k]; !ok {
				maxes[k] = v
			}
		}
		for _, row := range r.rows {
			// Студент, попавший в две вкладки, считается один раз — по первой.
			if seen[row.RowKey] {
				continue
			}
			seen[row.RowKey] = true
			rows = append(rows, row)
		}
	}
	return rows, maxes, nil
}

// MergeRows adds the rows of another sheet of the same source. A student
// already there keeps the name, group and total and gets the columns the
// other sheet adds (the first sheet wins a column both have); a new student
// is appended as is.
func MergeRows(rows, more []models.GradeRow) []models.GradeRow {
	at := make(map[string]int, len(rows))
	for i, r := range rows {
		at[r.RowKey] = i
	}
	for _, r := range more {
		i, ok := at[r.RowKey]
		if !ok {
			at[r.RowKey] = len(rows)
			rows = append(rows, r)
			continue
		}
		dst := &rows[i]
		for k, v := range r.Parts {
			if _, has := dst.Parts[k]; !has {
				dst.Parts[k] = v
			}
		}
		for k, v := range r.Details {
			if _, has := dst.Details[k]; !has {
				dst.Details[k] = v
			}
		}
	}
	return rows
}

// changedMax keeps the sheet maxima that differ from the configured ones.
func changedMax(cols []models.GradeColumn, sheet map[string]float64) map[string]float64 {
	out := map[string]float64{}
	for _, c := range cols {
		if v, ok := sheet[c.Key]; ok && v != c.Max {
			out[c.Key] = v
		}
	}
	return out
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
