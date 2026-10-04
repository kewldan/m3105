-- +goose Up
-- Группа, которую получает студент при подтверждении аккаунта. Пусто — название
-- группы сайта. Новые аккаунты до подтверждения живут без группы.
ALTER TABLE settings ADD COLUMN approval_group text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE settings DROP COLUMN approval_group;
