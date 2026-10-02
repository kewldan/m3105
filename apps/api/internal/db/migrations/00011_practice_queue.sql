-- +goose Up
-- Очередь сдачи: FIFO по умолчанию (новая запись получает следующий номер из
-- последовательности), админ может переставлять студентов. Номер один на студента
-- в рамках сдачи, он повторяется во всех его строках.
CREATE SEQUENCE practice_queue_seq;
ALTER TABLE practice_signups ADD COLUMN queue_pos bigint;

UPDATE practice_signups g SET queue_pos = q.pos
FROM (
    SELECT session_id, user_id,
           row_number() OVER (ORDER BY min(created_at), min(id)) AS pos
    FROM practice_signups GROUP BY session_id, user_id
) q
WHERE g.session_id = q.session_id AND g.user_id = q.user_id;

SELECT setval('practice_queue_seq', COALESCE(max(queue_pos), 0) + 1, false) FROM practice_signups;
ALTER TABLE practice_signups ALTER COLUMN queue_pos SET DEFAULT nextval('practice_queue_seq');
ALTER TABLE practice_signups ALTER COLUMN queue_pos SET NOT NULL;
CREATE INDEX practice_signups_queue_idx ON practice_signups (session_id, queue_pos);

-- +goose Down
DROP INDEX practice_signups_queue_idx;
ALTER TABLE practice_signups DROP COLUMN queue_pos;
DROP SEQUENCE practice_queue_seq;
