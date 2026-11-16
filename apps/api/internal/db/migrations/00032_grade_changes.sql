-- +goose Up
-- Ручные отметки «кому поставили оценку» не прижились: на парах некому их
-- ставить. Вместо них — журнал изменений таблиц баллов: на каждом синке
-- строки сравниваются с прошлыми, и в журнал попадает, у кого в блоке лабы
-- впервые появилась отметка о приёме (kind = 'lab') или баллы за теормин
-- ('theory'). Во время сдач таблица предмета синкается каждые пару минут,
-- так что detected_at близко к моменту, когда преподаватель поставил оценку;
-- prev_synced_at — прошлый синк: изменение случилось между ними.
DROP TABLE IF EXISTS practice_results;

CREATE TABLE grade_changes (
    id bigserial PRIMARY KEY,
    source_id bigint NOT NULL REFERENCES grade_sources (id) ON DELETE CASCADE,
    row_key text NOT NULL,
    isu text NOT NULL DEFAULT '',
    full_name text NOT NULL,
    -- Группа в нормальной форме («М3105»), как в метках аудитории.
    group_name text NOT NULL DEFAULT '',
    -- Ключ столбца разбивки (лабы).
    part text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('lab', 'theory')),
    detected_at timestamptz NOT NULL DEFAULT now(),
    prev_synced_at timestamptz,
    UNIQUE (source_id, row_key, part, kind)
);
CREATE INDEX grade_changes_detected_idx ON grade_changes (detected_at);

-- +goose Down
DROP TABLE IF EXISTS grade_changes;
CREATE TABLE practice_results (
    session_id bigint NOT NULL REFERENCES practice_sessions (id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lab_id bigint NOT NULL REFERENCES labs (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('lab', 'theory')),
    passed boolean NOT NULL,
    graded_at timestamptz NOT NULL DEFAULT now(),
    marked_by bigint REFERENCES users (id) ON DELETE SET NULL,
    PRIMARY KEY (session_id, user_id, lab_id, kind)
);
CREATE INDEX practice_results_user_idx ON practice_results (user_id);
