-- +goose Up
-- Список студентов курса (импорт из списков групп). Новый аккаунт подтверждается
-- тем, что студент сам выбирает себя в этом списке: users.isu, имя и группа
-- берутся отсюда, сменить их сам он больше не может. Код доступа и группа
-- подтверждения из настроек больше не нужны.
CREATE TABLE students (
    id         bigserial PRIMARY KEY,
    isu        text NOT NULL UNIQUE,
    full_name  text NOT NULL,
    group_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX students_group_idx ON students (group_name, full_name);

ALTER TABLE settings DROP COLUMN invite_code, DROP COLUMN approval_group;

-- Подтверждённый аккаунт без номера ИСУ не выбирал себя: пусть выберет.
UPDATE users SET approved_at = NULL WHERE approved_at IS NOT NULL AND COALESCE(isu, '') = '';

-- +goose Down
ALTER TABLE settings ADD COLUMN invite_code text NOT NULL DEFAULT '',
    ADD COLUMN approval_group text NOT NULL DEFAULT '';
DROP TABLE students;
