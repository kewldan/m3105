-- +goose Up
-- Аватарки хранятся у нас: при входе API скачивает фото из Telegram и кладёт его
-- в то же хранилище, что и вложения (scope = 'avatar'). users.photo_url остаётся
-- адресом-источником в Telegram, а avatar_source помнит, откуда взят текущий
-- avatar_id, чтобы не скачивать то же фото при каждом входе.
ALTER TABLE attachments DROP CONSTRAINT attachments_scope_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_scope_check CHECK (scope IN ('content', 'social', 'avatar'));

ALTER TABLE users
    ADD COLUMN avatar_id text REFERENCES attachments (id) ON DELETE SET NULL,
    ADD COLUMN avatar_source text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE users DROP COLUMN avatar_id, DROP COLUMN avatar_source;
DELETE FROM attachments WHERE scope = 'avatar';
ALTER TABLE attachments DROP CONSTRAINT attachments_scope_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_scope_check CHECK (scope IN ('content', 'social'));
