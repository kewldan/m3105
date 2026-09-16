-- +goose Up
-- Что студенты ищут и что не находят. Пишем только сам запрос: ни пользователя,
-- ни IP — для «каких конспектов не хватает» этого достаточно.
CREATE TABLE search_queries (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    query text NOT NULL,
    results integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_queries_created_idx ON search_queries (created_at DESC);
-- text_pattern_ops — для отсева запросов, которые оказались префиксом следующего.
CREATE INDEX search_queries_query_idx ON search_queries (query text_pattern_ops, created_at);

-- +goose Down
DROP TABLE search_queries;
