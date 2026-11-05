-- +goose Up
-- Шаверму и анекдоты убрали с сайта: посты, лайки, комментарии к постам и их
-- файлы удаляются. Объекты в S3 без строки потом уберёт files.RunGC.
DELETE FROM comments WHERE target_type = 'post';
DELETE FROM attachments WHERE post_id IS NOT NULL;
-- Вместе с колонкой уходят индекс и обе проверки, где она упоминается.
ALTER TABLE attachments DROP COLUMN post_id;
ALTER TABLE attachments ADD CONSTRAINT attachments_comment_scope_check
    CHECK (scope = 'social' OR comment_id IS NULL);
DROP TABLE post_likes;
DROP TABLE posts;
ALTER TABLE comments DROP CONSTRAINT comments_target_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_target_type_check
    CHECK (target_type IN ('note', 'lab'));

-- +goose Down
ALTER TABLE comments DROP CONSTRAINT comments_target_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_target_type_check
    CHECK (target_type IN ('note', 'lab', 'post'));
CREATE TABLE posts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('shawarma', 'joke')),
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT '',
    body text NOT NULL,
    address text NOT NULL DEFAULT '',
    price integer,
    rating smallint CHECK (rating BETWEEN 1 AND 5),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_kind_idx ON posts (kind, created_at DESC);
CREATE INDEX posts_user_idx ON posts (user_id);
CREATE TABLE post_likes (
    post_id bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);
ALTER TABLE attachments DROP CONSTRAINT attachments_comment_scope_check;
ALTER TABLE attachments
    ADD COLUMN post_id bigint REFERENCES posts (id) ON DELETE CASCADE,
    ADD CONSTRAINT attachments_post_check CHECK (comment_id IS NULL OR post_id IS NULL),
    ADD CONSTRAINT attachments_comment_scope_check
        CHECK (scope = 'social' OR (comment_id IS NULL AND post_id IS NULL));
CREATE INDEX attachments_post_idx ON attachments (post_id, position) WHERE post_id IS NOT NULL;
