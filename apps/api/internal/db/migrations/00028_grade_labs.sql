-- +goose Up
-- Лабы с модификаторами (ОП): у каждой лабы в таблице слева от её итога блок
-- столбцов — баллы за теормин, плюсы, минусы, ступень просрочки. scheme — их
-- заголовки и правила расчёта; '{}' — у источника лаб нет.
ALTER TABLE grade_sources ADD COLUMN scheme jsonb NOT NULL DEFAULT '{}';
-- {ключ части: {theory, plus, minus, late}} — ячейки блока лабы; части без блока нет.
ALTER TABLE grade_rows ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
-- Что из блоков лаб студент последний раз видел в Telegram.
ALTER TABLE grade_rows ADD COLUMN notified_details jsonb NOT NULL DEFAULT '{}';

-- +goose Down
ALTER TABLE grade_rows DROP COLUMN notified_details;
ALTER TABLE grade_rows DROP COLUMN details;
ALTER TABLE grade_sources DROP COLUMN scheme;
