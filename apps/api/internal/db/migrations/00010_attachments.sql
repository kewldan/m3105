-- +goose Up
-- Вложения: сами файлы лежат в S3 (MinIO) под ключом id, здесь — всё остальное.
-- scope = 'content' — файлы админки для текстов: вставляются ссылками в MDX и
-- живут, пока их не удалят руками. scope = 'social' — файлы комментариев и
-- постов (от студента или от админа, user_id IS NULL): прикрепляются к
-- комментарию или посту и удаляются вместе с ним каскадом; загруженные, но так
-- и не прикреплённые, сборщик мусора убирает через сутки, а объекты без строки —
-- следом.
CREATE TABLE attachments (
    id text PRIMARY KEY,
    name text NOT NULL,
    -- Последний сегмент адреса: транслит имени, чтобы ссылки читались.
    slug text NOT NULL,
    content_type text NOT NULL,
    size bigint NOT NULL,
    width integer,
    height integer,
    sha256 text NOT NULL,
    scope text NOT NULL DEFAULT 'social' CHECK (scope IN ('content', 'social')),
    user_id bigint REFERENCES users (id) ON DELETE CASCADE,
    comment_id bigint REFERENCES comments (id) ON DELETE CASCADE,
    post_id bigint REFERENCES posts (id) ON DELETE CASCADE,
    position smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (comment_id IS NULL OR post_id IS NULL),
    CHECK (scope = 'social' OR (comment_id IS NULL AND post_id IS NULL))
);
CREATE INDEX attachments_comment_idx ON attachments (comment_id, position) WHERE comment_id IS NOT NULL;
CREATE INDEX attachments_post_idx ON attachments (post_id, position) WHERE post_id IS NOT NULL;
CREATE INDEX attachments_user_idx ON attachments (user_id, created_at);
-- Повторная загрузка того же файла для текстов отдаёт уже сохранённый.
CREATE INDEX attachments_content_sha_idx ON attachments (sha256) WHERE scope = 'content';

-- +goose Down
DROP TABLE IF EXISTS attachments;
