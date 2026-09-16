-- +goose Up
-- Посты могут быть «только для своих» (видны вошедшим студентам) и помечены 18+.
ALTER TABLE posts
    ADD COLUMN visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'members')),
    ADD COLUMN nsfw boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE posts DROP COLUMN visibility, DROP COLUMN nsfw;
