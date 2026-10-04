-- +goose Up
-- Очередь сдачи состоит из защит (студент + лаба) и строится по правилам из
-- internal/queue. До заморозки (20:00 накануне) порядок считается на лету и в
-- queue_pos не пишется; при заморозке он сохраняется в queue_pos (1..n), а
-- поздние записи получают следующий номер из practice_queue_seq и встают в конец.
-- queue_manual — админ переставил очередь руками, дальше тоже только дописываем.
ALTER TABLE practice_sessions
    ADD COLUMN queue_manual boolean NOT NULL DEFAULT false,
    ADD COLUMN queue_frozen_at timestamptz;

-- Сдачи, чья заморозка (20:00 накануне по времени сайта) уже прошла, сохраняют
-- порядок, в котором на них записывались: прошедшие — это история для переноса,
-- а ближайшую нельзя перетасовать задним числом. Перейти на правила — кнопка
-- «Автоматически» в админке.
UPDATE practice_sessions ps SET queue_manual = true
FROM (SELECT timezone FROM settings LIMIT 1) st
WHERE date_trunc('day', ps.starts_at AT TIME ZONE st.timezone) - interval '4 hours' <= now() AT TIME ZONE st.timezone;

-- +goose Down
ALTER TABLE practice_sessions DROP COLUMN queue_manual, DROP COLUMN queue_frozen_at;
