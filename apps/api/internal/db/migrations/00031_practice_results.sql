-- +goose Up
-- Итоги сдачи: во время пары отмечают, кому и когда поставили оценку за защиту
-- лабы (kind = 'lab') или зачёт по теормину ('theory'), в том числе «не принято»
-- — попытка тоже занимает время. По этим отметкам админка считает, сколько
-- защит и теорминов успевают принять за пару, и подсказывает лимит сдачи.
-- Отметка не привязана к записи: студент мог отписаться или сдать без записи.
CREATE TABLE practice_results (
    session_id bigint NOT NULL REFERENCES practice_sessions (id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lab_id bigint NOT NULL REFERENCES labs (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('lab', 'theory')),
    passed boolean NOT NULL,
    graded_at timestamptz NOT NULL DEFAULT now(),
    -- marked_by — ответственный, поставивший отметку; NULL — админ.
    marked_by bigint REFERENCES users (id) ON DELETE SET NULL,
    PRIMARY KEY (session_id, user_id, lab_id, kind)
);
CREATE INDEX practice_results_user_idx ON practice_results (user_id);

-- +goose Down
DROP TABLE IF EXISTS practice_results;
