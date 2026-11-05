-- +goose Up
-- Ответственные: студент отвечает за поток (stream:N) или группу (group:М3105) и правит
-- материалы, адресованные только его зоне. Ответственных за поток назначает админ,
-- ответственных за группы — админ или ответственный за поток этих групп.
CREATE TABLE editor_roles (
    id         bigserial PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    scope      text NOT NULL,
    granted_by bigint REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, scope)
);

-- Автор материала (кто создал) и кто правил последним; пусто — админ.
ALTER TABLE labs ADD COLUMN author_id bigint REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN updated_by bigint REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN author_id bigint REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN updated_by bigint REFERENCES users (id) ON DELETE SET NULL;

-- Журнал правок контента: кто, что и как было до и после — для просмотра и отката.
CREATE TABLE edits (
    id          bigserial PRIMARY KEY,
    actor_id    bigint REFERENCES users (id) ON DELETE SET NULL,
    actor_name  text NOT NULL DEFAULT '',
    entity      text NOT NULL,
    entity_id   bigint NOT NULL,
    action      text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    title       text NOT NULL DEFAULT '',
    audience    text[] NOT NULL DEFAULT '{}',
    before      jsonb,
    after       jsonb,
    reverted_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edits_created_idx ON edits (created_at DESC);
CREATE INDEX edits_entity_idx ON edits (entity, entity_id);

-- +goose Down
DROP TABLE edits;
ALTER TABLE notes DROP COLUMN updated_by, DROP COLUMN author_id;
ALTER TABLE labs DROP COLUMN updated_by, DROP COLUMN author_id;
DROP TABLE editor_roles;
