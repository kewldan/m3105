-- +goose Up
-- Таблица одной небольшой группы (например, языковой по английскому): видят её
-- только студенты, чей номер ИСУ в ней есть, остальным источник не показывается.
ALTER TABLE grade_sources ADD COLUMN members_only boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE grade_sources DROP COLUMN members_only;
