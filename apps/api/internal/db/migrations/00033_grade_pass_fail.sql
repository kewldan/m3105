-- +goose Up
-- Зачётный предмет (английский, ИСРПО): оценок нет, 60% от максимума и больше — зачёт.
ALTER TABLE grade_sources ADD COLUMN pass_fail boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE grade_sources DROP COLUMN pass_fail;
