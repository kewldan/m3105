-- +goose Up
CREATE TABLE settings (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    site_title text NOT NULL DEFAULT 'М3105',
    group_name text NOT NULL DEFAULT 'М3105',
    description text NOT NULL DEFAULT '',
    semester_start date,
    semester_end date,
    first_week_parity text NOT NULL DEFAULT 'odd' CHECK (first_week_parity IN ('odd', 'even')),
    timezone text NOT NULL DEFAULT 'Europe/Moscow',
    links jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (id) VALUES (1);

CREATE TABLE subjects (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    short_name text NOT NULL DEFAULT '',
    color text NOT NULL DEFAULT 'blue',
    teacher text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    links jsonb NOT NULL DEFAULT '[]'::jsonb,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE labs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_id bigint NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    number integer NOT NULL DEFAULT 1,
    slug text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    content text NOT NULL DEFAULT '',
    requirements text NOT NULL DEFAULT '',
    submission text NOT NULL DEFAULT '',
    variants text NOT NULL DEFAULT '',
    materials jsonb NOT NULL DEFAULT '[]'::jsonb,
    deadline_at timestamptz,
    deadline_note text NOT NULL DEFAULT '',
    max_score integer,
    teacher text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subject_id, slug)
);
CREATE INDEX labs_deadline_idx ON labs (deadline_at);
CREATE INDEX labs_subject_idx ON labs (subject_id, number);

CREATE TABLE events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('deadline', 'test', 'exam', 'consultation', 'other')),
    subject_id bigint REFERENCES subjects (id) ON DELETE SET NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    all_day boolean NOT NULL DEFAULT false,
    location text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    url text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_starts_idx ON events (starts_at);

CREATE TABLE faq_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question text NOT NULL,
    answer text NOT NULL DEFAULT '',
    category text NOT NULL DEFAULT '',
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    content text NOT NULL DEFAULT '',
    position integer NOT NULL DEFAULT 0,
    show_in_nav boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_id bigint NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    number integer NOT NULL DEFAULT 1,
    slug text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    content text NOT NULL DEFAULT '',
    lecture_date date,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subject_id, slug)
);
CREATE INDEX notes_subject_idx ON notes (subject_id, number);

CREATE TABLE quizzes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_id bigint REFERENCES subjects (id) ON DELETE SET NULL,
    note_id bigint REFERENCES notes (id) ON DELETE SET NULL,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    questions jsonb NOT NULL DEFAULT '[]'::jsonb,
    shuffle_questions boolean NOT NULL DEFAULT true,
    shuffle_options boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS quizzes;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS pages;
DROP TABLE IF EXISTS faq_items;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS labs;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS settings;
