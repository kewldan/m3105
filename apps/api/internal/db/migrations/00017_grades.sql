-- +goose Up
-- Баллы из внешних таблиц (Google Sheets). Источник — одна таблица по предмету:
-- вкладки — группы, строки — студенты, столбцы ищутся по заголовкам. Синк раз в
-- sync_hours целиком заменяет строки источника.
CREATE TABLE grade_sources (
    id             bigserial PRIMARY KEY,
    subject_id     bigint NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    title          text NOT NULL DEFAULT '',
    spreadsheet_id text NOT NULL,
    -- Регулярка по названиям вкладок; пусто — все вкладки, где нашлись нужные столбцы.
    tab_pattern    text NOT NULL DEFAULT '',
    name_column    text NOT NULL DEFAULT 'ФИО',
    id_column      text NOT NULL DEFAULT 'ИСУ',
    -- Пусто: группа — название вкладки.
    group_column   text NOT NULL DEFAULT '',
    total_column   text NOT NULL DEFAULT 'Итог',
    max_total      double precision NOT NULL DEFAULT 100,
    -- [{key, label, header, max}] — столбцы, которые показываются разбивкой.
    columns        jsonb NOT NULL DEFAULT '[]',
    sync_hours     int NOT NULL DEFAULT 3 CHECK (sync_hours BETWEEN 1 AND 168),
    enabled        boolean NOT NULL DEFAULT true,
    synced_at      timestamptz,
    sync_error     text NOT NULL DEFAULT '',
    rows_count     int NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE grade_rows (
    source_id      bigint NOT NULL REFERENCES grade_sources (id) ON DELETE CASCADE,
    -- Номер ИСУ, а без него — "name:" + ФИО.
    row_key        text NOT NULL,
    isu            text NOT NULL DEFAULT '',
    full_name      text NOT NULL,
    group_name     text NOT NULL DEFAULT '',
    total          double precision NOT NULL DEFAULT 0,
    parts          jsonb NOT NULL DEFAULT '{}',
    changed_at     timestamptz NOT NULL DEFAULT now(),
    -- Что последний раз видел студент в Telegram; бот шлёт разницу и догоняет.
    notified_total double precision,
    notified_parts jsonb NOT NULL DEFAULT '{}',
    PRIMARY KEY (source_id, row_key)
);
CREATE INDEX grade_rows_isu_idx ON grade_rows (isu) WHERE isu <> '';

-- Номер ИСУ связывает аккаунт со строками таблиц; ставит сам студент, админ или
-- автосопоставление по имени и группе после синка. NULL — ещё не задан (можно
-- сопоставить автоматически), '' — студент отвязал сам, автоматически не трогать.
ALTER TABLE users ADD COLUMN isu text;
CREATE UNIQUE INDEX users_isu_key ON users (isu) WHERE isu <> '';

-- +goose Down
ALTER TABLE users DROP COLUMN isu;
DROP TABLE grade_rows;
DROP TABLE grade_sources;
