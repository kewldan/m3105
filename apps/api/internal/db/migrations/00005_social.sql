-- +goose Up
-- Comments from signed-in students on notes, labs and posts.
CREATE TABLE comments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    target_type text NOT NULL CHECK (target_type IN ('note', 'lab', 'post')),
    target_id bigint NOT NULL,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_target_idx ON comments (target_type, target_id, created_at);
CREATE INDEX comments_user_idx ON comments (user_id);

-- User posts: shawarma reviews and jokes.
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

-- +goose Down
DROP TABLE IF EXISTS post_likes;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS comments;
