package store

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/kewldan/edu3105/apps/api/internal/search"
)

// SearchResult is one hit in the site-wide search.
type SearchResult struct {
	Kind     string `db:"kind" json:"kind"`
	Title    string `db:"title" json:"title"`
	Subtitle string `db:"subtitle" json:"subtitle"`
	Path     string `db:"path" json:"path"`
	// Snippet is a fragment of the body with <mark> around the matched words.
	Snippet string `db:"snippet" json:"snippet"`
}

// headlineOpts: один фрагмент, совпадения в <mark>, троеточие по краям.
const headlineOpts = `StartSel=<mark>, StopSel=</mark>, MaxWords=24, MinWords=10, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … "`

// mdxText чистит MDX от разметки, чтобы в сниппет не лезли решётки и звёздочки.
func mdxText(col string) string {
	return `regexp_replace(` + col + `, '[#*` + "`" + `>|_\[\]]', ' ', 'g')`
}

// Search ranks published content by relevance: словарь русского языка для
// нормальных запросов, префикс на последнем слове для поиска по мере набора,
// триграммы как страховка от опечаток. Заголовки весят больше текста (веса A/B/C
// в search_vector), поэтому совпадение в названии всегда выше совпадения в теле.
func (s *Store) Search(ctx context.Context, query string, limit int) ([]SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []SearchResult{}, nil
	}
	tsq := search.ToTSQuery(query)
	if tsq == "" {
		// В запросе одни знаки препинания — искать нечего.
		return []SearchResult{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	q := `
	WITH q AS (SELECT to_tsquery('russian', $1) AS tsq, $2::text AS raw),
	hits AS (
		SELECT 'lab' AS kind, l.title, s.name AS subtitle, '/labs/' || s.slug || '/' || l.slug AS path,
			COALESCE(NULLIF(l.summary, ''), l.content) AS body,
			ts_rank_cd(l.search_vector, q.tsq) + similarity(l.title, q.raw) AS rank
		FROM labs l JOIN subjects s ON s.id = l.subject_id, q
		WHERE l.status = 'published' AND (l.search_vector @@ q.tsq OR l.title % q.raw)
		UNION ALL
		SELECT 'note', n.title, s.name, '/notes/' || s.slug || '/' || n.slug,
			COALESCE(NULLIF(n.summary, ''), n.content),
			ts_rank_cd(n.search_vector, q.tsq) + similarity(n.title, q.raw)
		FROM notes n JOIN subjects s ON s.id = n.subject_id, q
		WHERE n.status = 'published' AND (n.search_vector @@ q.tsq OR n.title % q.raw)
		UNION ALL
		SELECT 'quiz', qz.title, s.name || ' · ' || n.title, '/notes/' || s.slug || '/' || n.slug || '#quiz',
			qz.description,
			ts_rank_cd(qz.search_vector, q.tsq) + similarity(qz.title, q.raw)
		FROM quizzes qz JOIN notes n ON n.id = qz.note_id JOIN subjects s ON s.id = n.subject_id, q
		WHERE qz.status = 'published' AND n.status = 'published'
			AND (qz.search_vector @@ q.tsq OR qz.title % q.raw)
		UNION ALL
		SELECT 'faq', f.question, COALESCE(NULLIF(f.category, ''), 'ЧаВо'), '/faq#faq-' || f.id,
			f.answer,
			ts_rank_cd(f.search_vector, q.tsq) + similarity(f.question, q.raw)
		FROM faq_items f, q
		WHERE f.search_vector @@ q.tsq OR f.question % q.raw
		UNION ALL
		SELECT 'page', p.title, 'Страница', '/p/' || p.slug,
			p.content,
			ts_rank_cd(p.search_vector, q.tsq) + similarity(p.title, q.raw)
		FROM pages p, q
		WHERE p.status = 'published' AND (p.search_vector @@ q.tsq OR p.title % q.raw)
		UNION ALL
		SELECT 'subject', s.name, 'Предмет', '/subjects/' || s.slug,
			COALESCE(NULLIF(s.teacher, ''), s.name),
			ts_rank_cd(s.search_vector, q.tsq) + similarity(s.name, q.raw)
		FROM subjects s, q
		WHERE s.search_vector @@ q.tsq OR s.name % q.raw
	),
	top AS (SELECT * FROM hits ORDER BY rank DESC, title LIMIT $3)
	SELECT top.kind, top.title, top.subtitle, top.path,
		ts_headline('russian', ` + mdxText("top.body") + `, q.tsq, '` + headlineOpts + `') AS snippet
	FROM top, q ORDER BY top.rank DESC, top.title`
	return many[SearchResult](ctx, s.db, q, tsq, query, limit)
}

// SearchStat is one aggregated query in the admin analytics.
type SearchStat struct {
	Query string `db:"query" json:"query"`
	// Count — сколько раз искали, Empty — сколько раз без результатов.
	Count   int       `db:"count" json:"count"`
	Empty   int       `db:"empty" json:"empty"`
	Results int       `db:"results" json:"results"`
	LastAt  time.Time `db:"last_at" json:"lastAt"`
}

const maxLoggedQueryLen = 100

// LogSearch records a query for the admin analytics. Слишком длинные запросы
// не пишем: это не поиск, а мусор.
func (s *Store) LogSearch(ctx context.Context, query string, results int) error {
	query = strings.TrimSpace(query)
	if query == "" || utf8.RuneCountInString(query) > maxLoggedQueryLen {
		return nil
	}
	_, err := s.db.Exec(ctx, `INSERT INTO search_queries (query, results) VALUES ($1, $2)`, query, results)
	return wrap(err)
}

// SearchStats aggregates queries for the last `days` days.
//
// Поиск срабатывает на каждую букву, поэтому «пре», «пред» и «предел» попадают
// в таблицу все три раза. Показываем только те запросы, на которых человек
// остановился: запрос отбрасывается, если через минуту после него из того же
// набора есть более длинный запрос, начинающийся с него.
func (s *Store) SearchStats(ctx context.Context, days, limit int) ([]SearchStat, error) {
	if days <= 0 || days > 365 {
		days = 30
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	return many[SearchStat](ctx, s.db, `
		WITH settled AS (
			SELECT s.query, s.results, s.created_at
			FROM search_queries s
			WHERE s.created_at >= now() - make_interval(days => $1)
				AND NOT EXISTS (
					SELECT 1 FROM search_queries s2
					WHERE s2.created_at >= s.created_at
						AND s2.created_at < s.created_at + interval '1 minute'
						AND s2.query <> s.query
						AND s2.query LIKE s.query || '%'
				)
		)
		SELECT query,
			count(*)::int AS count,
			count(*) FILTER (WHERE results = 0)::int AS empty,
			(array_agg(results ORDER BY created_at DESC))[1] AS results,
			max(created_at) AS last_at
		FROM settled
		GROUP BY query
		ORDER BY count(*) DESC, max(created_at) DESC
		LIMIT $2`, days, limit)
}
