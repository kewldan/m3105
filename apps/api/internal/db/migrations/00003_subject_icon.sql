-- +goose Up
ALTER TABLE subjects ADD COLUMN icon text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE subjects DROP COLUMN IF EXISTS icon;
