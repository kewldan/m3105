package store

import (
	"context"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// userNameExpr is the name shown on the site: the admin override when set, else the Telegram name.
const userNameExpr = `COALESCE(NULLIF(u.display_name, ''), u.name)`

const userCols = `u.id, u.webauthn_id, ` + userNameExpr + ` AS name, u.name AS telegram_name, u.display_name, u.group_name,
	(u.approved_at IS NOT NULL) AS approved, u.approved_at, u.telegram_id, u.telegram_username, u.photo_url, u.created_at, u.last_login_at`

// GetUser fetches a user by id.
func (s *Store) GetUser(ctx context.Context, id int64) (models.User, error) {
	return one[models.User](ctx, s.db, `SELECT `+userCols+` FROM users u WHERE u.id = $1`, id)
}

// GetUserByTelegramID fetches a user by Telegram id.
func (s *Store) GetUserByTelegramID(ctx context.Context, tgID int64) (models.User, error) {
	return one[models.User](ctx, s.db, `SELECT `+userCols+` FROM users u WHERE u.telegram_id = $1`, tgID)
}

// GetUserByWebauthnID fetches a user by the opaque WebAuthn user handle.
func (s *Store) GetUserByWebauthnID(ctx context.Context, handle []byte) (models.User, error) {
	return one[models.User](ctx, s.db, `SELECT `+userCols+` FROM users u WHERE u.webauthn_id = $1`, handle)
}

// NewUser is the payload for creating an account.
type NewUser struct {
	WebauthnID       []byte
	Name             string
	TelegramID       *int64
	TelegramUsername string
	PhotoURL         string
	GroupName        string
	// Approved marks the account confirmed right away (correct invite code).
	Approved bool
}

// CreateUser inserts an account.
func (s *Store) CreateUser(ctx context.Context, in NewUser) (models.User, error) {
	var id int64
	err := s.db.QueryRow(ctx, `INSERT INTO users (webauthn_id, name, telegram_id, telegram_username, photo_url, group_name, approved_at)
		VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7 THEN now() END) RETURNING id`,
		in.WebauthnID, in.Name, in.TelegramID, in.TelegramUsername, in.PhotoURL, in.GroupName, in.Approved).Scan(&id)
	if err != nil {
		return models.User{}, wrap(err)
	}
	return s.GetUser(ctx, id)
}

// TouchTelegramLogin refreshes the Telegram name, username, photo and the login time.
func (s *Store) TouchTelegramLogin(ctx context.Context, id int64, name, username, photo string) error {
	return s.exec(ctx, `UPDATE users SET name = $2, telegram_username = $3, photo_url = $4, last_login_at = now() WHERE id = $1`, id, name, username, photo)
}

// TouchLogin refreshes the login time.
func (s *Store) TouchLogin(ctx context.Context, id int64) error {
	return s.exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, id)
}

// UpdateUserProfile applies the admin's overrides: display name, group and confirmation.
// The confirmation time is kept when the account is already approved.
func (s *Store) UpdateUserProfile(ctx context.Context, id int64, in models.AdminUserInput) (models.User, error) {
	if err := s.exec(ctx, `UPDATE users SET display_name = $2, group_name = $3,
		approved_at = CASE WHEN $4 THEN COALESCE(approved_at, now()) END WHERE id = $1`,
		id, in.DisplayName, in.GroupName, in.Approved); err != nil {
		return models.User{}, err
	}
	return s.GetUser(ctx, id)
}

// ListUsers returns all accounts with counters (admin).
func (s *Store) ListUsers(ctx context.Context) ([]models.AdminUser, error) {
	return many[models.AdminUser](ctx, s.db, `SELECT `+userCols+`,
		(SELECT count(*) FROM passkeys p WHERE p.user_id = u.id)::int AS passkeys_count,
		(SELECT count(*) FROM lab_completions c WHERE c.user_id = u.id)::int AS completions_count,
		(SELECT count(DISTINCT session_id) FROM practice_signups g WHERE g.user_id = u.id)::int AS signups_count
		FROM users u ORDER BY u.created_at DESC`)
}

// DeleteUser removes an account and everything bound to it.
func (s *Store) DeleteUser(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM users WHERE id = $1`, id)
}

// ---- passkeys ----

const passkeyCols = `p.id, p.user_id, p.label, p.credential, p.created_at, p.last_used_at`

// ListPasskeys returns a user's passkeys.
func (s *Store) ListPasskeys(ctx context.Context, userID int64) ([]models.Passkey, error) {
	return many[models.Passkey](ctx, s.db, `SELECT `+passkeyCols+` FROM passkeys p WHERE p.user_id = $1 ORDER BY p.created_at`, userID)
}

// GetPasskey fetches a passkey by credential id.
func (s *Store) GetPasskey(ctx context.Context, id string) (models.Passkey, error) {
	return one[models.Passkey](ctx, s.db, `SELECT `+passkeyCols+` FROM passkeys p WHERE p.id = $1`, id)
}

// CreatePasskey stores a new credential.
func (s *Store) CreatePasskey(ctx context.Context, userID int64, id, label string, credential []byte) error {
	_, err := s.db.Exec(ctx, `INSERT INTO passkeys (id, user_id, label, credential) VALUES ($1,$2,$3,$4)`, id, userID, label, credential)
	return wrap(err)
}

// TouchPasskey stores the updated credential (sign counter etc.) after a login.
func (s *Store) TouchPasskey(ctx context.Context, id string, credential []byte) error {
	return s.exec(ctx, `UPDATE passkeys SET credential = $2, last_used_at = now() WHERE id = $1`, id, credential)
}

// DeletePasskey removes a user's passkey.
func (s *Store) DeletePasskey(ctx context.Context, userID int64, id string) error {
	return s.exec(ctx, `DELETE FROM passkeys WHERE id = $1 AND user_id = $2`, id, userID)
}

// ---- lab completions ----

// ListCompletedLabIDs returns ids of labs the user marked as done.
func (s *Store) ListCompletedLabIDs(ctx context.Context, userID int64) ([]int64, error) {
	rows, err := s.db.Query(ctx, `SELECT lab_id FROM lab_completions WHERE user_id = $1 ORDER BY completed_at`, userID)
	if err != nil {
		return nil, wrap(err)
	}
	defer rows.Close()
	out := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// SetLabCompletion marks or unmarks a lab as done for the user.
func (s *Store) SetLabCompletion(ctx context.Context, userID, labID int64, done bool) error {
	if done {
		_, err := s.db.Exec(ctx, `INSERT INTO lab_completions (user_id, lab_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, userID, labID)
		return wrap(err)
	}
	_, err := s.db.Exec(ctx, `DELETE FROM lab_completions WHERE user_id = $1 AND lab_id = $2`, userID, labID)
	return wrap(err)
}

// LabExists reports whether a published lab with the id exists.
func (s *Store) LabExists(ctx context.Context, labID int64) (bool, error) {
	var ok bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM labs WHERE id = $1 AND status = 'published')`, labID).Scan(&ok)
	return ok, err
}

// touch helper to keep imports used.
var _ = time.Now
