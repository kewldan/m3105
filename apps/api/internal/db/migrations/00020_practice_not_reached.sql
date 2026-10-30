-- +goose Up
-- «Не успел на прошлой сдаче»: по сохранённому порядку студент переносит в начало
-- очереди защиты тех лаб, с которыми был записан на предыдущую сдачу предмета.
-- Метка видна всем в очереди; «Автоматически» в админке её сбрасывает.
ALTER TABLE practice_signups ADD COLUMN not_reached_at timestamptz;

-- +goose Down
ALTER TABLE practice_signups DROP COLUMN not_reached_at;
