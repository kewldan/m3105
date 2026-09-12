package store

import (
	"context"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

const settingsCols = `site_title, group_name, description, semester_start, semester_end, first_week_parity, timezone, links, invite_code, updated_at`

// GetSettings returns the singleton settings row.
func (s *Store) GetSettings(ctx context.Context) (models.Settings, error) {
	return one[models.Settings](ctx, s.db, `SELECT `+settingsCols+` FROM settings WHERE id = 1`)
}

// UpdateSettings replaces the settings row.
func (s *Store) UpdateSettings(ctx context.Context, in *models.Settings) (models.Settings, error) {
	_, err := s.db.Exec(ctx, `UPDATE settings SET site_title=$1, group_name=$2, description=$3, semester_start=$4,
		semester_end=$5, first_week_parity=$6, timezone=$7, links=$8, invite_code=$9, updated_at=now() WHERE id = 1`,
		in.SiteTitle, in.GroupName, in.Description, in.SemesterStart, in.SemesterEnd, in.FirstWeekParity, in.Timezone, in.Links, in.InviteCode)
	if err != nil {
		return models.Settings{}, wrap(err)
	}
	return s.GetSettings(ctx)
}
