-- +goose Up
-- У предмета отдельно лектор и преподаватель практики. Прежний единственный
-- преподаватель считается лектором.
DROP INDEX subjects_search_idx;
ALTER TABLE subjects DROP COLUMN search_vector;
ALTER TABLE subjects RENAME COLUMN teacher TO lecturer;
ALTER TABLE subjects ADD COLUMN practice_teacher text NOT NULL DEFAULT '';

ALTER TABLE subjects ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(short_name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(lecturer, '') || ' ' || coalesce(practice_teacher, '')), 'B')
) STORED;
CREATE INDEX subjects_search_idx ON subjects USING GIN (search_vector);

-- +goose Down
DROP INDEX subjects_search_idx;
ALTER TABLE subjects DROP COLUMN search_vector;
ALTER TABLE subjects DROP COLUMN practice_teacher;
ALTER TABLE subjects RENAME COLUMN lecturer TO teacher;

ALTER TABLE subjects ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(short_name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(teacher, '')), 'B')
) STORED;
CREATE INDEX subjects_search_idx ON subjects USING GIN (search_vector);
