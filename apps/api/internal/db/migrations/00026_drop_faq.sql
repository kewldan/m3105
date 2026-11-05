-- +goose Up
-- Страницу «ЧаВо» убрали с сайта вместе с вопросами.
DROP TABLE faq_items;

-- +goose Down
CREATE TABLE faq_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question text NOT NULL,
    answer text NOT NULL DEFAULT '',
    category text NOT NULL DEFAULT '',
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('russian', coalesce(question, '')), 'A') ||
        setweight(to_tsvector('russian', coalesce(answer, '')), 'C')
    ) STORED
);
CREATE INDEX faq_items_search_idx ON faq_items USING GIN (search_vector);
CREATE INDEX faq_items_question_trgm_idx ON faq_items USING GIN (question gin_trgm_ops);
