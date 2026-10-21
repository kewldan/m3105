package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const gradeSourceCols = `g.id, g.subject_id, g.title, g.spreadsheet_id, g.tab_pattern, g.name_column, g.id_column,
	g.group_column, g.total_column, g.max_total, g.columns, g.sync_hours, g.enabled, g.synced_at, g.sync_error,
	g.rows_count, g.created_at, g.updated_at, s.slug AS subject_slug, s.name AS subject_name,
	s.color AS subject_color, s.icon AS subject_icon,
	(SELECT count(*) FROM grade_rows r JOIN users u ON u.isu = r.isu WHERE r.source_id = g.id AND r.isu <> '')::int AS linked_count`

const gradeSourceFrom = ` FROM grade_sources g JOIN subjects s ON s.id = g.subject_id`

// ListGradeSources returns sources in subject order; onlyEnabled hides switched-off ones.
func (s *Store) ListGradeSources(ctx context.Context, onlyEnabled bool) ([]models.GradeSource, error) {
	return many[models.GradeSource](ctx, s.db, `SELECT `+gradeSourceCols+gradeSourceFrom+`
		WHERE g.enabled OR NOT $1 ORDER BY s.position, s.name, g.id`, onlyEnabled)
}

// GetGradeSource fetches one source.
func (s *Store) GetGradeSource(ctx context.Context, id int64) (models.GradeSource, error) {
	return one[models.GradeSource](ctx, s.db, `SELECT `+gradeSourceCols+gradeSourceFrom+` WHERE g.id = $1`, id)
}

// CreateGradeSource inserts a source; it syncs on the next scheduler tick.
func (s *Store) CreateGradeSource(ctx context.Context, in *models.GradeSourceInput) (models.GradeSource, error) {
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO grade_sources (subject_id, title, spreadsheet_id, tab_pattern, name_column,
		id_column, group_column, total_column, max_total, columns, sync_hours, enabled)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
		in.SubjectID, in.Title, in.SpreadsheetID, in.TabPattern, in.NameColumn, in.IDColumn, in.GroupColumn,
		in.TotalColumn, in.MaxTotal, in.Columns, in.SyncHours, in.Enabled).Scan(&id)
	if err != nil {
		return models.GradeSource{}, wrap(err)
	}
	return s.GetGradeSource(ctx, id)
}

// UpdateGradeSource replaces a source's settings. A new table or new columns
// mean the old rows are stale, so the source is due for a sync right away.
func (s *Store) UpdateGradeSource(ctx context.Context, id int64, in *models.GradeSourceInput) (models.GradeSource, error) {
	if err := s.exec(ctx, `UPDATE grade_sources SET subject_id = $2, title = $3, spreadsheet_id = $4, tab_pattern = $5,
		name_column = $6, id_column = $7, group_column = $8, total_column = $9, max_total = $10, columns = $11,
		sync_hours = $12, enabled = $13, synced_at = NULL, updated_at = now() WHERE id = $1`,
		id, in.SubjectID, in.Title, in.SpreadsheetID, in.TabPattern, in.NameColumn, in.IDColumn, in.GroupColumn,
		in.TotalColumn, in.MaxTotal, in.Columns, in.SyncHours, in.Enabled); err != nil {
		return models.GradeSource{}, err
	}
	return s.GetGradeSource(ctx, id)
}

// DeleteGradeSource removes a source with its rows.
func (s *Store) DeleteGradeSource(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM grade_sources WHERE id = $1`, id)
}

// ListDueGradeSources returns enabled sources whose last successful sync is
// older than their interval.
func (s *Store) ListDueGradeSources(ctx context.Context, now time.Time) ([]models.GradeSource, error) {
	return many[models.GradeSource](ctx, s.db, `SELECT `+gradeSourceCols+gradeSourceFrom+`
		WHERE g.enabled AND (g.synced_at IS NULL OR g.synced_at + g.sync_hours * interval '1 hour' <= $1)
		ORDER BY g.id`, now)
}

// MarkGradeSyncFailed keeps the old rows and stores the error for the admin.
func (s *Store) MarkGradeSyncFailed(ctx context.Context, id int64, msg string) error {
	return s.exec(ctx, `UPDATE grade_sources SET sync_error = $2 WHERE id = $1`, id, msg)
}

// ReplaceGradeRows makes the source's rows exactly rows. New rows start as
// already notified, so the first import does not message everyone; changed
// rows keep their old notified_* for the bot to report the difference.
func (s *Store) ReplaceGradeRows(ctx context.Context, sourceID int64, rows []models.GradeRow) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		keys := make([]string, len(rows))
		batch := &pgx.Batch{}
		for i, r := range rows {
			keys[i] = r.RowKey
			batch.Queue(`INSERT INTO grade_rows (source_id, row_key, isu, full_name, group_name, total, parts, notified_total, notified_parts)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$7)
				ON CONFLICT (source_id, row_key) DO UPDATE SET isu = EXCLUDED.isu, full_name = EXCLUDED.full_name,
					group_name = EXCLUDED.group_name, total = EXCLUDED.total, parts = EXCLUDED.parts,
					changed_at = CASE WHEN grade_rows.total IS DISTINCT FROM EXCLUDED.total OR grade_rows.parts <> EXCLUDED.parts
						THEN now() ELSE grade_rows.changed_at END`,
				sourceID, r.RowKey, r.ISU, r.FullName, r.Group, r.Total, r.Parts)
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
	return many[RatedRow](ctx, s.db, `SELECT r.source_id, r.row_key, r.isu, r.full_name, r.group_name, r.total, r.parts, r.changed_at,
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
		SELECT k.source_id, k.row_key, k.isu, k.full_name, k.group_name, k.total, k.parts, k.changed_at,
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
	ChatID        int64                `db:"chat_id"`
	SourceID      int64                `db:"source_id"`
	RowKey        string               `db:"row_key"`
	Title         string               `db:"title"`
	SubjectName   string               `db:"subject_name"`
	MaxTotal      float64              `db:"max_total"`
	Columns       []models.GradeColumn `db:"columns"`
	Total         float64              `db:"total"`
	Parts         map[string]*float64  `db:"parts"`
	NotifiedTotal float64              `db:"notified_total"`
	NotifiedParts map[string]*float64  `db:"notified_parts"`
}

// ListGradeChanges returns changed rows of linked accounts with a subscribed bot chat.
func (s *Store) ListGradeChanges(ctx context.Context) ([]GradeChange, error) {
	return many[GradeChange](ctx, s.db, `SELECT c.chat_id, r.source_id, r.row_key, g.title, sb.name AS subject_name,
		g.max_total, g.columns, r.total, r.parts, r.notified_total, r.notified_parts
		FROM grade_rows r
		JOIN grade_sources g ON g.id = r.source_id AND g.enabled
		JOIN subjects sb ON sb.id = g.subject_id
		JOIN users u ON u.isu = r.isu AND r.isu <> ''
		JOIN bot_chats c ON c.telegram_id = u.telegram_id AND c.subscribed
		WHERE r.notified_total IS NOT NULL
			AND (r.notified_total IS DISTINCT FROM r.total OR r.notified_parts <> r.parts)
		ORDER BY c.chat_id, r.source_id`)
}

// MarkGradeNotified records what the student has now seen.
func (s *Store) MarkGradeNotified(ctx context.Context, sourceID int64, rowKey string, total float64, parts map[string]*float64) error {
	return s.exec(ctx, `UPDATE grade_rows SET notified_total = $3, notified_parts = $4 WHERE source_id = $1 AND row_key = $2`,
		sourceID, rowKey, total, parts)
}

// GetUserISUByTelegramID returns the ISU of the account bound to a Telegram user.
func (s *Store) GetUserISUByTelegramID(ctx context.Context, tgID int64) (string, error) {
	var isu string
	err := s.db.QueryRow(ctx, `SELECT COALESCE(isu, '') FROM users WHERE telegram_id = $1`, tgID).Scan(&isu)
	return isu, wrap(err)
}
