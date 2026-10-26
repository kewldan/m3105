-- +goose Up
-- Обмен местами в сохранённой очереди: студент предлагает свою защиту в обмен
-- на чужую, второй соглашается. from_pos/to_pos — queue_pos обеих защит в момент
-- предложения: если очередь с тех пор сдвинулась, обмен не проводится, чтобы
-- никто не согласился на место, которого уже нет. Защита выбыла — запрос
-- удаляется каскадом.
CREATE TABLE practice_swaps (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id bigint NOT NULL REFERENCES practice_sessions (id) ON DELETE CASCADE,
    from_signup_id bigint NOT NULL REFERENCES practice_signups (id) ON DELETE CASCADE,
    to_signup_id bigint NOT NULL REFERENCES practice_signups (id) ON DELETE CASCADE,
    from_pos bigint NOT NULL,
    to_pos bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (from_signup_id, to_signup_id)
);
CREATE INDEX practice_swaps_session_idx ON practice_swaps (session_id);
CREATE INDEX practice_swaps_to_idx ON practice_swaps (to_signup_id);

-- +goose Down
DROP TABLE IF EXISTS practice_swaps;
