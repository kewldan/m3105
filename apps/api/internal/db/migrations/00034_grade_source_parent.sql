-- +goose Up
-- Несколько таблиц одного предмета — один источник: у дочернего источника своя
-- таблица и свои заголовки, а синкается он вместе с родителем в его строки.
ALTER TABLE grade_sources ADD COLUMN parent_id bigint REFERENCES grade_sources (id) ON DELETE SET NULL;
CREATE INDEX grade_sources_parent_idx ON grade_sources (parent_id);

-- +goose Down
ALTER TABLE grade_sources DROP COLUMN parent_id;
