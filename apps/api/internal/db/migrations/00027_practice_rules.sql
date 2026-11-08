-- +goose Up
-- Регулярные сдачи: правило «предмет, день недели, время, недели, период», по
-- которому занятия (practice_sessions) создаются сразу при сохранении правила.
-- Время — местное (часовой пояс из settings), недели — все, чётные или нечётные
-- по semester_start/first_week_parity.
CREATE TABLE practice_rules (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_id bigint NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- 1 — понедельник
    start_time time NOT NULL,
    end_time time,
    weeks text NOT NULL DEFAULT 'all' CHECK (weeks IN ('all', 'odd', 'even')),
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    location text NOT NULL DEFAULT '',
    capacity integer,
    note text NOT NULL DEFAULT '',
    audience text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_on >= starts_on)
);
CREATE INDEX practice_rules_subject_idx ON practice_rules (subject_id);

-- rule_id + occurs_on — занятие правила на эту дату. overridden — занятие
-- поменяли вручную (перенос, другая аудитория), правка правила его не трогает.
-- Отменённое занятие остаётся строкой: правило не создаст его заново, а
-- студенты видят, что сдачи не будет.
ALTER TABLE practice_sessions
    ADD COLUMN rule_id bigint REFERENCES practice_rules (id) ON DELETE SET NULL,
    ADD COLUMN occurs_on date,
    ADD COLUMN overridden boolean NOT NULL DEFAULT false,
    ADD COLUMN canceled_at timestamptz,
    ADD COLUMN cancel_reason text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX practice_sessions_rule_day_idx ON practice_sessions (rule_id, occurs_on) WHERE rule_id IS NOT NULL;

-- +goose Down
DROP INDEX practice_sessions_rule_day_idx;
ALTER TABLE practice_sessions
    DROP COLUMN rule_id,
    DROP COLUMN occurs_on,
    DROP COLUMN overridden,
    DROP COLUMN canceled_at,
    DROP COLUMN cancel_reason;
DROP TABLE practice_rules;
