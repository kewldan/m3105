-- +goose Up
ALTER TABLE settings ADD COLUMN invite_code text NOT NULL DEFAULT '';

CREATE TABLE users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    webauthn_id bytea NOT NULL UNIQUE,
    name text NOT NULL,
    telegram_id bigint UNIQUE,
    telegram_username text NOT NULL DEFAULT '',
    photo_url text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE passkeys (
    id text PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    label text NOT NULL DEFAULT '',
    credential jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
);
CREATE INDEX passkeys_user_idx ON passkeys (user_id);

CREATE TABLE lab_completions (
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lab_id bigint NOT NULL REFERENCES labs (id) ON DELETE CASCADE,
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lab_id)
);

CREATE TABLE practice_sessions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_id bigint NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    location text NOT NULL DEFAULT '',
    capacity integer,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX practice_sessions_starts_idx ON practice_sessions (starts_at);

CREATE TABLE practice_signups (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id bigint NOT NULL REFERENCES practice_sessions (id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lab_id bigint NOT NULL REFERENCES labs (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, user_id, lab_id)
);
CREATE INDEX practice_signups_user_idx ON practice_signups (user_id);

-- +goose Down
DROP TABLE IF EXISTS practice_signups;
DROP TABLE IF EXISTS practice_sessions;
DROP TABLE IF EXISTS lab_completions;
DROP TABLE IF EXISTS passkeys;
DROP TABLE IF EXISTS users;
ALTER TABLE settings DROP COLUMN IF EXISTS invite_code;
