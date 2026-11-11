-- +goose Up
-- Теормин по лабам: у предмета флаг, на сдаче — отдельная отметка «приду на
-- теормин по лабе N». В очередь защит она не входит: это только подсчёт, сколько
-- людей придёт на теормин (менторы) и сколько на защиту лаб (практики).
ALTER TABLE subjects ADD COLUMN theory_min boolean NOT NULL DEFAULT false;

CREATE TABLE practice_theory_signups (
    session_id bigint NOT NULL REFERENCES practice_sessions (id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lab_id bigint NOT NULL REFERENCES labs (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, user_id, lab_id)
);
CREATE INDEX practice_theory_signups_user_idx ON practice_theory_signups (user_id);

-- +goose Down
DROP TABLE IF EXISTS practice_theory_signups;
ALTER TABLE subjects DROP COLUMN IF EXISTS theory_min;
