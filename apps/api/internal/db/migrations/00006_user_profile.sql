-- +goose Up
ALTER TABLE users
    ADD COLUMN display_name text NOT NULL DEFAULT '',
    ADD COLUMN group_name text NOT NULL DEFAULT '',
    ADD COLUMN approved_at timestamptz;

-- Accounts that already exist got in through the invite code or open sign-up:
-- treat them as confirmed members of the site's group.
UPDATE users SET approved_at = created_at, group_name = (SELECT group_name FROM settings WHERE id = 1);

CREATE INDEX users_pending_idx ON users (created_at) WHERE approved_at IS NULL;

-- +goose Down
DROP INDEX users_pending_idx;
ALTER TABLE users DROP COLUMN display_name, DROP COLUMN group_name, DROP COLUMN approved_at;
