-- +goose Up
-- Полнотекстовый поиск: русский словарь + триграммы для опечаток.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Генерируемые tsvector-колонки: заголовок весит больше тела (веса A/B/C),
-- поэтому совпадение в названии всегда поднимается выше совпадения в тексте.
ALTER TABLE labs ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(content, '')), 'C')
) STORED;

ALTER TABLE notes ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(content, '')), 'C')
) STORED;

ALTER TABLE quizzes ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(description, '')), 'B')
) STORED;

ALTER TABLE faq_items ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(question, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(answer, '')), 'C')
) STORED;

ALTER TABLE pages ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(content, '')), 'C')
) STORED;

ALTER TABLE subjects ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(short_name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(teacher, '')), 'B')
) STORED;

CREATE INDEX labs_search_idx ON labs USING GIN (search_vector);
CREATE INDEX notes_search_idx ON notes USING GIN (search_vector);
CREATE INDEX quizzes_search_idx ON quizzes USING GIN (search_vector);
CREATE INDEX faq_items_search_idx ON faq_items USING GIN (search_vector);
CREATE INDEX pages_search_idx ON pages USING GIN (search_vector);
CREATE INDEX subjects_search_idx ON subjects USING GIN (search_vector);

-- Триграммы по заголовкам: спасают, когда запрос набран с опечаткой
-- и словарь не находит ни одной леммы.
CREATE INDEX labs_title_trgm_idx ON labs USING GIN (title gin_trgm_ops);
CREATE INDEX notes_title_trgm_idx ON notes USING GIN (title gin_trgm_ops);
CREATE INDEX quizzes_title_trgm_idx ON quizzes USING GIN (title gin_trgm_ops);
CREATE INDEX faq_items_question_trgm_idx ON faq_items USING GIN (question gin_trgm_ops);
CREATE INDEX pages_title_trgm_idx ON pages USING GIN (title gin_trgm_ops);
CREATE INDEX subjects_name_trgm_idx ON subjects USING GIN (name gin_trgm_ops);

-- +goose Down
DROP INDEX labs_title_trgm_idx, notes_title_trgm_idx, quizzes_title_trgm_idx,
    faq_items_question_trgm_idx, pages_title_trgm_idx, subjects_name_trgm_idx;
DROP INDEX labs_search_idx, notes_search_idx, quizzes_search_idx,
    faq_items_search_idx, pages_search_idx, subjects_search_idx;
ALTER TABLE labs DROP COLUMN search_vector;
ALTER TABLE notes DROP COLUMN search_vector;
ALTER TABLE quizzes DROP COLUMN search_vector;
ALTER TABLE faq_items DROP COLUMN search_vector;
ALTER TABLE pages DROP COLUMN search_vector;
ALTER TABLE subjects DROP COLUMN search_vector;
