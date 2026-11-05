-- +goose Up
-- Для кого материал: список меток «stream:<номер>» и «group:<группа>», пусто — для всех.
-- Поток группы берётся из списка курса (students.stream).
ALTER TABLE students ADD COLUMN stream integer NOT NULL DEFAULT 0;

ALTER TABLE subjects ADD COLUMN audience text[] NOT NULL DEFAULT '{}';
ALTER TABLE labs ADD COLUMN audience text[] NOT NULL DEFAULT '{}';
ALTER TABLE notes ADD COLUMN audience text[] NOT NULL DEFAULT '{}';
ALTER TABLE events ADD COLUMN audience text[] NOT NULL DEFAULT '{}';
ALTER TABLE practice_sessions ADD COLUMN audience text[] NOT NULL DEFAULT '{}';

-- Метки, под которые попадает студент группы g: сама группа и её поток.
-- Пустая группа — пустой массив: такому зрителю видно только материалы «для всех».
-- +goose StatementBegin
CREATE FUNCTION audience_scope(g text) RETURNS text[] LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN g IS NULL OR g = '' THEN '{}'::text[] ELSE
        array_remove(ARRAY['group:' || g,
            (SELECT 'stream:' || max(stream) FROM students WHERE group_name = g AND stream > 0)], NULL)
    END
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION audience_scope(text);
ALTER TABLE practice_sessions DROP COLUMN audience;
ALTER TABLE events DROP COLUMN audience;
ALTER TABLE notes DROP COLUMN audience;
ALTER TABLE labs DROP COLUMN audience;
ALTER TABLE subjects DROP COLUMN audience;
ALTER TABLE students DROP COLUMN stream;
