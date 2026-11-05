-- +goose Up
-- Раздел страницы: на /p полезные страницы сгруппированы по нему.
ALTER TABLE pages ADD COLUMN category text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE pages DROP COLUMN category;
