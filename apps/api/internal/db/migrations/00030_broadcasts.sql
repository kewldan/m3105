-- +goose Up
-- Журнал рассылок бота: каждая отправка (новая лаба, дайджест, баллы, сдачи,
-- обмены, сообщения админу) — строка в broadcast_deliveries под своей рассылкой.
-- Доставка создаётся в статусе pending до отправки, поэтому оборванная на
-- середине рассылка видна, а не теряется. key склеивает повторные проходы
-- планировщика в одну рассылку (дайджест за день, анонс лабы).
CREATE TABLE broadcasts (
    id bigserial PRIMARY KEY,
    kind text NOT NULL,
    key text UNIQUE,
    title text NOT NULL DEFAULT '',
    ref_type text NOT NULL DEFAULT '',
    ref_id bigint,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX broadcasts_created_idx ON broadcasts (created_at DESC);

CREATE TABLE broadcast_deliveries (
    id bigserial PRIMARY KEY,
    broadcast_id bigint NOT NULL REFERENCES broadcasts (id) ON DELETE CASCADE,
    user_id bigint REFERENCES users (id) ON DELETE SET NULL,
    chat_id bigint,
    recipient text NOT NULL DEFAULT '',
    status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    error text NOT NULL DEFAULT '',
    text text NOT NULL DEFAULT '',
    markup jsonb,
    attempts int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX broadcast_deliveries_broadcast_idx ON broadcast_deliveries (broadcast_id, status);

-- +goose Down
DROP TABLE IF EXISTS broadcast_deliveries;
DROP TABLE IF EXISTS broadcasts;
