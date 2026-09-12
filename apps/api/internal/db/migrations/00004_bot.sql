-- +goose Up
-- Telegram bot subscribers (private chats that pressed /start).
CREATE TABLE bot_chats (
    chat_id bigint PRIMARY KEY,
    telegram_id bigint NOT NULL,
    first_name text NOT NULL DEFAULT '',
    username text NOT NULL DEFAULT '',
    subscribed boolean NOT NULL DEFAULT true,
    -- Local date (YYYY-MM-DD) of the last deadline digest, so it goes out once a day.
    digest_sent_on text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bot_chats_telegram_idx ON bot_chats (telegram_id);

-- Labs that were already announced, so publishing is broadcast exactly once.
CREATE TABLE bot_announced_labs (
    lab_id bigint PRIMARY KEY REFERENCES labs (id) ON DELETE CASCADE,
    announced_at timestamptz NOT NULL DEFAULT now()
);
-- Everything published before the bot existed counts as announced.
INSERT INTO bot_announced_labs (lab_id) SELECT id FROM labs WHERE status = 'published';

-- +goose Down
DROP TABLE IF EXISTS bot_announced_labs;
DROP TABLE IF EXISTS bot_chats;
