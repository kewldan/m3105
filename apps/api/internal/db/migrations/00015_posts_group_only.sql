-- +goose Up
-- Шаверму и анекдоты теперь видят только подтверждённые студенты группы сайта,
-- поэтому деление на «для всех / для своих» и пометка 18+ больше не нужны.
ALTER TABLE posts DROP COLUMN visibility, DROP COLUMN nsfw;

-- +goose Down
ALTER TABLE posts
    ADD COLUMN visibility text NOT NULL DEFAULT 'members' CHECK (visibility IN ('public', 'members')),
    ADD COLUMN nsfw boolean NOT NULL DEFAULT false;
