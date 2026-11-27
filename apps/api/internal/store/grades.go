package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const gradeSourceColsTpl = `g.id, g.subject_id, g.title, g.spreadsheet_id, g.tab_pattern, g.name_column, g.id_column,
	g.group_column, g.total_column, g.max_total, {columns}, g.scheme, g.sync_hours, g.enabled, g.members_only, g.pass_fail,
	g.parent_id, g.synced_at, g.sync_error,
	g.rows_count, g.created_at, g.updated_at, s.slug AS subject_slug, s.name AS subject_name,
	s.color AS subject_color, s.icon AS subject_icon,
	(SELECT count(*) FROM grade_rows r JOIN users u ON u.isu = r.isu WHERE r.source_id = g.id AND r.isu <> '')::int AS linked_count`

// familyColumns are the columns of source g as the site shows them: its own
// and then those its enabled parts add, a key already taken counting once.
const familyColumns = `(g.columns || COALESCE((SELECT jsonb_agg(x.c ORDER BY x.pos, x.n) FROM (
		SELECT DISTINCT ON (e.c->>'key') e.c, ch.id AS pos, e.n
		FROM grade_sources ch CROSS JOIN LATERAL jsonb_array_elements(ch.columns) WITH ORDINALITY AS e(c, n)
		WHERE ch.parent_id = g.id AND ch.enabled
			AND NOT g.columns @> jsonb_build_array(jsonb_build_object('key', e.c->'key'))
		ORDER BY e.c->>'key', ch.id, e.n) x), '[]'::jsonb)) AS columns`

var (
	// gradeSourceCols keep the source's own columns: settings and sync.
	gradeSourceCols = strings.Replace(gradeSourceColsTpl, "{columns}", "g.columns", 1)
	// gradeShownSourceCols add the columns of its parts: the site and the bot.
	gradeShownSourceCols = strings.Replace(gradeSourceColsTpl, "{columns}", familyColumns, 1)
)

const gradeSourceFrom = ` FROM grade_sources g JOIN subjects s ON s.id = g.subject_id`

// ListGradeSources returns every source with its own settings (admin).
func (s *Store) ListGradeSources(ctx context.Context) ([]models.GradeSource, error) {
	return many[models.GradeSource](ctx, s.db, `SELECT `+gradeSourceCols+gradeSourceFrom+`
		ORDER BY s.position, s.name, COALESCE(g.parent_id, g.id), g.parent_id NULLS FIRST, g.id`)
}

// ListShownGradeSources returns what the site and the bot show: enabled
// sources that are not a part of another, with the columns of their parts.
func (s *Store) ListShownGradeSources(ctx context.Context) ([]models.GradeSource, error) {
	return many[models.GradeSource](ctx, s.db, `SELECT `+gradeShownSourceCols+gradeSourceFrom+`
		WHERE g.enabled AND g.parent_id IS NULL ORDER BY s.position, s.name, g.id`)
}

// ListGradeSourceParts returns the enabled sources that are parts of parentID.
func (s *Store) ListGradeSourceParts(ctx context.Context, parentID int64) ([]models.GradeSource, error) {
	return many[models.GradeSource](ctx, s.db, `SELECT `+gradeSourceCols+gradeSourceFrom+`
		WHERE g.parent_id = $1 AND g.enabled ORDER BY g.id`, parentID)
}

// GetGradeSource fetches one source.
func (s *Store) GetGradeSource(ctx context.Context, id int64) (models.GradeSource, error) {
	return one[models.GradeSource](ctx, s.db, `SELECT `+gradeSourceCols+gradeSourceFrom+` WHERE g.id = $1`, id)
}

// CheckGradeParent tells whether source id may be a part of in.ParentID:
// the parent is of the same subject and is not a part itself, and the source
// has no parts of its own — one level, so the site has one place to look.
func (s *Store) CheckGradeParent(ctx context.Context, id int64, in *models.GradeSourceInput) error {
	if in.ParentID == nil {
		return nil
	}
	ve := httpx.NewValidation()
	var subjectID int64
	var grand *int64
	err := s.db.QueryRow(ctx, `SELECT subject_id, parent_id FROM grade_sources WHERE id = $1`, *in.ParentID).Scan(&subjectID, &grand)
	var hasParts bool
	if id > 0 {
		if e := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM grade_sources WHERE parent_id = $1)`, id).Scan(&hasParts); e != nil {
			return wrap(e)
		}
	}
	switch {
	case errors.Is(err, pgx.ErrNoRows) || *in.ParentID == id:
		ve.Add("parentId", "Нет такого источника")
	case err != nil:
		return wrap(err)
	case subjectID != in.SubjectID:
		ve.Add("parentId", "Источник другого предмета")
	case grand != nil:
		ve.Add("parentId", "Он сам входит в другой источник")
	case hasParts:
		ve.Add("parentId", "В этот источник уже входят другие")
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// CreateGradeSource inserts a source; it syncs on the next scheduler tick.
func (s *Store) CreateGradeSource(ctx context.Context, in *models.GradeSourceInput) (models.GradeSource, error) {
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO grade_sources (subject_id, title, spreadsheet_id, tab_pattern, name_column,
		id_column, group_column, total_column, max_total, columns, sync_hours, enabled, members_only, scheme, pass_fail, parent_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
		in.SubjectID, in.Title, in.SpreadsheetID, in.TabPattern, in.NameColumn, in.IDColumn, in.GroupColumn,
		in.TotalColumn, in.MaxTotal, in.Columns, in.SyncHours, in.Enabled, in.MembersOnly, in.Scheme, in.PassFail,
		in.ParentID).Scan(&id)
	if err != nil {
		return models.GradeSource{}, wrap(err)
	}
	if in.ParentID != nil {
		if err := s.exec(ctx, `UPDATE grade_sources SET synced_at = NULL WHERE id = $1`, *in.ParentID); err != nil {
			return models.GradeSource{}, err
		}
	}
	return s.GetGradeSource(ctx, id)
}

// UpdateGradeSource replaces a source's settings. A new table or new columns
// mean the old rows are stale, so the source is due for a sync right away —
// and so is its parent, before and after: a part has no rows of its own,
// they live in the parent.
func (s *Store) UpdateGradeSource(ctx context.Context, id int64, in *models.GradeSourceInput) (models.GradeSource, error) {
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		var old *int64
		if err := tx.QueryRow(ctx, `SELECT parent_id FROM grade_sources WHERE id = $1 FOR UPDATE`, id).Scan(&old); err != nil {
			return wrap(err)
		}
		if _, err := tx.Exec(ctx, `UPDATE grade_sources SET subject_id = $2, title = $3, spreadsheet_id = $4, tab_pattern = $5,
			name_column = $6, id_column = $7, group_column = $8, total_column = $9, max_total = $10, columns = $11,
			sync_hours = $12, enabled = $13, members_only = $14, scheme = $15, pass_fail = $16, parent_id = $17,
			synced_at = NULL, updated_at = now()
			WHERE id = $1`,
			id, in.SubjectID, in.Title, in.SpreadsheetID, in.TabPattern, in.NameColumn, in.IDColumn, in.GroupColumn,
			in.TotalColumn, in.MaxTotal, in.Columns, in.SyncHours, in.Enabled, in.MembersOnly, in.Scheme, in.PassFail,
			in.ParentID); err != nil {
			return wrap(err)
		}
		if in.ParentID != nil {
			if _, err := tx.Exec(ctx, `DELETE FROM grade_rows WHERE source_id = $1`, id); err != nil {
				return wrap(err)
			}
			if _, err := tx.Exec(ctx, `UPDATE grade_sources SET rows_count = 0 WHERE id = $1`, id); err != nil {
				return wrap(err)
			}
		}
		_, err := tx.Exec(ctx, `UPDATE grade_sources SET synced_at = NULL WHERE id = ANY($1)`, []*int64{old, in.ParentID})
		return wrap(err)
	})
	if err != nil {
		return models.GradeSource{}, err
	}
	return s.GetGradeSource(ctx, id)
}

// DeleteGradeSource removes a source with its rows. Its parts become
// sources of their own and sync on the next tick; its parent resyncs
// without its rows.
func (s *Store) DeleteGradeSource(ctx context.Context, id int64) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE grade_sources SET synced_at = NULL
			WHERE parent_id = $1 OR id = (SELECT parent_id FROM grade_sources WHERE id = $1)`, id); err != nil {
			return wrap(err)
		}
		tag, err := tx.Exec(ctx, `DELETE FROM grade_sources WHERE id = $1`, id)
		if err != nil {
			return wrap(err)
		}
		if tag.RowsAffected() == 0 {
			return httpx.ErrNotFound
		}
		return nil
	})
}

// ListDueGradeSources returns enabled sources whose last successful sync is
// older than their interval, or than live while a practice session of their
// subject is on (from 10 minutes before the start to 30 minutes after the
// end): then the grade changes get their time almost to the minute.
func (s *Store) ListDueGradeSources(ctx context.Context, now time.Time, live time.Duration) ([]models.GradeSource, error) {
	return many[models.GradeSource](ctx, s.db, `SELECT `+gradeSourceCols+gradeSourceFrom+`
		WHERE g.enabled AND g.parent_id IS NULL AND (g.synced_at IS NULL OR g.synced_at + g.sync_hours * interval '1 hour' <= $1
			OR g.synced_at + make_interval(secs => $2) <= $1 AND EXISTS (
				SELECT 1 FROM practice_sessions ps WHERE ps.subject_id = g.subject_id AND ps.canceled_at IS NULL
					AND ps.starts_at - interval '10 minutes' <= $1
					AND COALESCE(ps.ends_at, ps.starts_at + interval '90 minutes') + interval '30 minutes' >= $1))
		ORDER BY g.id`, now, live.Seconds())
}

// MarkGradeSyncFailed keeps the old rows and stores the error for the admin.
func (s *Store) MarkGradeSyncFailed(ctx context.Context, id int64, msg string) error {
	return s.exec(ctx, `UPDATE grade_sources SET sync_error = $2 WHERE id = $1`, id, msg)
}

// ReplaceGradeRows makes the source's rows exactly rows. New rows start as
// already notified, so the first import does not message everyone; changed
// rows keep their old notified_* for the bot to report the difference. The
// first sync after the settings changed (synced_at is reset) re-baselines
// every row: a new or renamed column is not a change of scores.
//
// What got graded since the previous sync (models.GradeChanges) goes to
// grade_changes, except on a re-baseline and for rows seen the first time.
func (s *Store) ReplaceGradeRows(ctx context.Context, src models.GradeSource, rows []models.GradeRow) error {
	sourceID := src.ID
	return s.inTx(ctx, func(tx pgx.Tx) error {
		var prevSync *time.Time
		if err := tx.QueryRow(ctx, `SELECT synced_at FROM grade_sources WHERE id = $1 FOR UPDATE`, sourceID).Scan(&prevSync); err != nil {
			return wrap(err)
		}
		baseline := prevSync == nil
		if !baseline {
			if err := recordGradeChanges(ctx, tx, src, rows, *prevSync); err != nil {
				return err
			}
		}
		keys := make([]string, len(rows))
		batch := &pgx.Batch{}
		for i, r := range rows {
			keys[i] = r.RowKey
			details := r.Details
			if details == nil {
				details = map[string]models.LabCells{}
			}
			batch.Queue(`INSERT INTO grade_rows (source_id, row_key, isu, full_name, group_name, total, parts, details,
					notified_total, notified_parts, notified_details)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$6,$7,$8)
				ON CONFLICT (source_id, row_key) DO UPDATE SET isu = EXCLUDED.isu, full_name = EXCLUDED.full_name,
					group_name = EXCLUDED.group_name, total = EXCLUDED.total, parts = EXCLUDED.parts,
					details = EXCLUDED.details,
					changed_at = CASE WHEN grade_rows.total IS DISTINCT FROM EXCLUDED.total
						OR jsonb_strip_nulls(grade_rows.parts) <> jsonb_strip_nulls(EXCLUDED.parts)
						OR grade_rows.details <> EXCLUDED.details
						THEN now() ELSE grade_rows.changed_at END,
					notified_total = CASE WHEN $9 THEN EXCLUDED.total ELSE grade_rows.notified_total END,
					notified_parts = CASE WHEN $9 THEN EXCLUDED.parts ELSE grade_rows.notified_parts END,
					notified_details = CASE WHEN $9 THEN EXCLUDED.details ELSE grade_rows.notified_details END`,
				sourceID, r.RowKey, r.ISU, r.FullName, r.Group, r.Total, r.Parts, details, baseline)
		}
		if err := tx.SendBatch(ctx, batch).Close(); err != nil {
			return wrap(err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM grade_rows WHERE source_id = $1 AND NOT (row_key = ANY($2))`, sourceID, keys); err != nil {
			return wrap(err)
		}
		_, err := tx.Exec(ctx, `UPDATE grade_sources SET synced_at = now(), sync_error = '', rows_count = $2 WHERE id = $1`, sourceID, len(rows))
		return wrap(err)
	})
}

// SetGradeColumnMax overwrites the max of the columns with these keys, leaving
// the rest of the settings alone (an admin may be editing them right now).
func (s *Store) SetGradeColumnMax(ctx context.Context, id int64, maxes map[string]float64) error {
	return s.exec(ctx, `UPDATE grade_sources SET columns = (
			SELECT coalesce(jsonb_agg(CASE WHEN $2::jsonb ? (c->>'key')
				THEN jsonb_set(c, '{max}', $2::jsonb -> (c->>'key')) ELSE c END ORDER BY n), '[]'::jsonb)
			FROM jsonb_array_elements(columns) WITH ORDINALITY AS t(c, n))
		WHERE id = $1`, id, maxes)
}

// ListGradeSourceIDsByISU returns the sources that have a row with this ISU.
func (s *Store) ListGradeSourceIDsByISU(ctx context.Context, isu string) (map[int64]bool, error) {
	out := map[int64]bool{}
	if isu == "" {
		return out, nil
	}
	rows, err := s.db.Query(ctx, `SELECT DISTINCT source_id FROM grade_rows WHERE isu = $1`, isu)
	if err != nil {
		return nil, wrap(err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return nil, wrap(err)
	}
	for _, id := range ids {
		out[id] = true
	}
	return out, nil
}

// RatedRow is a grade row with the site account it belongs to, if any.
type RatedRow struct {
	models.GradeRow
	UserID    *int64  `db:"user_id"`
	UserName  *string `db:"user_name"`
	UserPhoto *string `db:"user_photo"`
	UserGroup *string `db:"user_group"`
}

// ListGradeRows returns a source's rows, best first.
func (s *Store) ListGradeRows(ctx context.Context, sourceID int64) ([]RatedRow, error) {
	return many[RatedRow](ctx, s.db, `SELECT r.source_id, r.row_key, r.isu, r.full_name, r.group_name, r.total, r.parts, r.details, r.changed_at,
		u.id AS user_id, `+userNameExpr+` AS user_name, `+userPhotoExpr+` AS user_photo, u.group_name AS user_group
		FROM grade_rows r LEFT JOIN users u ON u.isu = r.isu AND r.isu <> ''
		WHERE r.source_id = $1 ORDER BY r.total DESC, r.full_name`, sourceID)
}

// MyGradeRow is a student's row with places in the course, group and site.
type MyGradeRow struct {
	models.GradeRow
	CourseRank int `db:"course_rank"`
	CourseSize int `db:"course_size"`
	GroupRank  int `db:"group_rank"`
	GroupSize  int `db:"group_size"`
	SiteRank   int `db:"site_rank"`
	SiteSize   int `db:"site_size"`
}

// ListGradesByISU returns the student's rows in enabled sources with their places.
func (s *Store) ListGradesByISU(ctx context.Context, isu string) ([]MyGradeRow, error) {
	if isu == "" {
		return []MyGradeRow{}, nil
	}
	return many[MyGradeRow](ctx, s.db, `WITH ranked AS (
			SELECT r.*,
				rank() OVER (PARTITION BY r.source_id ORDER BY r.total DESC) AS course_rank,
				count(*) OVER (PARTITION BY r.source_id) AS course_size,
				rank() OVER (PARTITION BY r.source_id, r.group_name ORDER BY r.total DESC) AS group_rank,
				count(*) OVER (PARTITION BY r.source_id, r.group_name) AS group_size
			FROM grade_rows r
		), site AS (
			SELECT r.source_id, r.row_key,
				rank() OVER (PARTITION BY r.source_id ORDER BY r.total DESC) AS site_rank,
				count(*) OVER (PARTITION BY r.source_id) AS site_size
			FROM grade_rows r JOIN users u ON u.isu = r.isu WHERE r.isu <> ''
		)
		SELECT k.source_id, k.row_key, k.isu, k.full_name, k.group_name, k.total, k.parts, k.details, k.changed_at,
			k.course_rank, k.course_size, k.group_rank, k.group_size,
			COALESCE(site.site_rank, 0) AS site_rank, COALESCE(site.site_size, 0) AS site_size
		FROM ranked k JOIN grade_sources g ON g.id = k.source_id
		LEFT JOIN site ON site.source_id = k.source_id AND site.row_key = k.row_key
		WHERE k.isu = $1 AND g.enabled ORDER BY k.source_id`, isu)
}

// GradeCandidate is a sheet row an unlinked account may be matched to by name.
type GradeCandidate struct {
	ISU      string `db:"isu"`
	FullName string `db:"full_name"`
	Group    string `db:"group_name"`
}

// ListUnclaimedGradeRows returns distinct sheet students whose ISU no account has.
func (s *Store) ListUnclaimedGradeRows(ctx context.Context) ([]GradeCandidate, error) {
	return many[GradeCandidate](ctx, s.db, `SELECT DISTINCT r.isu, r.full_name, r.group_name FROM grade_rows r
		WHERE r.isu <> '' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.isu = r.isu)`)
}

// ListUsersWithoutISU returns confirmed accounts that are not linked yet.
func (s *Store) ListUsersWithoutISU(ctx context.Context) ([]models.User, error) {
	return many[models.User](ctx, s.db, `SELECT `+userCols+` FROM users u WHERE u.isu IS NULL AND u.approved_at IS NOT NULL`)
}

// LinkUserISU sets the ISU of an account that has none; ok is false when it
// got one meanwhile or the number is taken.
func (s *Store) LinkUserISU(ctx context.Context, userID int64, isu string) (bool, error) {
	tag, err := s.db.Exec(ctx, `UPDATE users SET isu = $2 WHERE id = $1 AND isu IS NULL
		AND NOT EXISTS (SELECT 1 FROM users WHERE isu = $2)`, userID, isu)
	if err != nil {
		return false, wrap(err)
	}
	return tag.RowsAffected() > 0, nil
}

// GradeChange is a row whose score moved since the student last heard from the bot.
type GradeChange struct {
	ChatID          int64                      `db:"chat_id"`
	SourceID        int64                      `db:"source_id"`
	RowKey          string                     `db:"row_key"`
	Title           string                     `db:"title"`
	SubjectName     string                     `db:"subject_name"`
	MaxTotal        float64                    `db:"max_total"`
	Columns         []models.GradeColumn       `db:"columns"`
	Scheme          models.GradeScheme         `db:"scheme"`
	Total           float64                    `db:"total"`
	Parts           map[string]*float64        `db:"parts"`
	Details         map[string]models.LabCells `db:"details"`
	NotifiedTotal   float64                    `db:"notified_total"`
	NotifiedParts   map[string]*float64        `db:"notified_parts"`
	NotifiedDetails map[string]models.LabCells `db:"notified_details"`
}

// ListGradeChanges returns changed rows of linked accounts with a subscribed bot chat.
func (s *Store) ListGradeChanges(ctx context.Context) ([]GradeChange, error) {
	return many[GradeChange](ctx, s.db, `SELECT c.chat_id, r.source_id, r.row_key, g.title, sb.name AS subject_name,
		g.max_total, `+familyColumns+`, g.scheme, r.total, r.parts, r.details, r.notified_total, r.notified_parts,
		r.notified_details
		FROM grade_rows r
		JOIN grade_sources g ON g.id = r.source_id AND g.enabled
		JOIN subjects sb ON sb.id = g.subject_id
		JOIN users u ON u.isu = r.isu AND r.isu <> ''
		JOIN bot_chats c ON c.telegram_id = u.telegram_id AND c.subscribed
		WHERE r.notified_total IS NOT NULL
			AND (r.notified_total IS DISTINCT FROM r.total
				OR jsonb_strip_nulls(r.notified_parts) <> jsonb_strip_nulls(r.parts)
				OR r.notified_details <> r.details)
		ORDER BY c.chat_id, r.source_id`)
}

// MarkGradeNotified records what the student has now seen.
func (s *Store) MarkGradeNotified(ctx context.Context, c GradeChange) error {
	return s.exec(ctx, `UPDATE grade_rows SET notified_total = $3, notified_parts = $4, notified_details = $5
		WHERE source_id = $1 AND row_key = $2`, c.SourceID, c.RowKey, c.Total, c.Parts, c.Details)
}

// GetUserISUByTelegramID returns the ISU of the account bound to a Telegram user.
func (s *Store) GetUserISUByTelegramID(ctx context.Context, tgID int64) (string, error) {
	var isu string
	err := s.db.QueryRow(ctx, `SELECT COALESCE(isu, '') FROM users WHERE telegram_id = $1`, tgID).Scan(&isu)
	return isu, wrap(err)
}

// BadgeGrade is one subject on a student's score badge.
type BadgeGrade struct {
	SourceID     int64      `db:"source_id"`
	Title        string     `db:"title"`
	SubjectSlug  string     `db:"subject_slug"`
	SubjectName  string     `db:"subject_name"`
	SubjectShort string     `db:"subject_short"`
	MaxTotal     float64    `db:"max_total"`
	FullName     string     `db:"full_name"`
	Group        string     `db:"group_name"`
	Total        float64    `db:"total"`
	GroupRank    int        `db:"group_rank"`
	GroupSize    int        `db:"group_size"`
	CourseRank   int        `db:"course_rank"`
	CourseSize   int        `db:"course_size"`
	GroupMedian  float64    `db:"group_median"`
	SyncedAt     *time.Time `db:"synced_at"`
}

// ListBadgeGrades returns the student's rows in enabled public sources (not
// members-only: the badge is open to anyone) with places and the group median,
// in the order of subjects on the site.
func (s *Store) ListBadgeGrades(ctx context.Context, isu string) ([]BadgeGrade, error) {
	if isu == "" {
		return []BadgeGrade{}, nil
	}
	return many[BadgeGrade](ctx, s.db, `WITH ranked AS (
			SELECT r.source_id, r.isu, r.full_name, r.group_name, r.total,
				rank() OVER (PARTITION BY r.source_id ORDER BY r.total DESC) AS course_rank,
				count(*) OVER (PARTITION BY r.source_id) AS course_size,
				rank() OVER (PARTITION BY r.source_id, r.group_name ORDER BY r.total DESC) AS group_rank,
				count(*) OVER (PARTITION BY r.source_id, r.group_name) AS group_size
			FROM grade_rows r
		), med AS (
			SELECT source_id, group_name, percentile_cont(0.5) WITHIN GROUP (ORDER BY total) AS median
			FROM grade_rows GROUP BY source_id, group_name
		)
		SELECT k.source_id, g.title, sb.slug AS subject_slug, sb.name AS subject_name, sb.short_name AS subject_short,
			g.max_total, k.full_name, k.group_name, k.total, k.group_rank, k.group_size, k.course_rank, k.course_size,
			COALESCE(m.median, 0) AS group_median, g.synced_at
		FROM ranked k
		JOIN grade_sources g ON g.id = k.source_id
		JOIN subjects sb ON sb.id = g.subject_id
		LEFT JOIN med m ON m.source_id = k.source_id AND m.group_name = k.group_name
		WHERE k.isu = $1 AND g.enabled AND NOT g.members_only
		ORDER BY sb.position, sb.id, g.id`, isu)
}

// GetApprovedUserByISU finds the confirmed account the ISU number belongs to.
func (s *Store) GetApprovedUserByISU(ctx context.Context, isu string) (models.User, error) {
	return one[models.User](ctx, s.db, `SELECT `+userCols+` FROM users u WHERE u.isu = $1 AND u.approved_at IS NOT NULL`, isu)
}

// recordGradeChanges compares the new rows with the stored ones and writes
// what got graded to grade_changes; the first sight of a change wins.
func recordGradeChanges(ctx context.Context, tx pgx.Tx, src models.GradeSource, rows []models.GradeRow, prevSync time.Time) error {
	old, err := many[models.GradeRow](ctx, tx, `SELECT source_id, row_key, isu, full_name, group_name, total, parts, details, changed_at
		FROM grade_rows WHERE source_id = $1`, src.ID)
	if err != nil {
		return err
	}
	byKey := make(map[string]models.GradeRow, len(old))
	for _, r := range old {
		byKey[r.RowKey] = r
	}
	batch := &pgx.Batch{}
	for _, r := range rows {
		prev, ok := byKey[r.RowKey]
		if !ok {
			continue
		}
		for _, c := range models.GradeChanges(src, prev, r) {
			batch.Queue(`INSERT INTO grade_changes (source_id, row_key, isu, full_name, group_name, part, kind, prev_synced_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
				src.ID, c.RowKey, c.ISU, c.FullName, c.Group, c.Part, c.Kind, prevSync)
		}
	}
	if batch.Len() == 0 {
		return nil
	}
	return wrap(tx.SendBatch(ctx, batch).Close())
}
