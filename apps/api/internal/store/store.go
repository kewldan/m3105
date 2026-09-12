// Package store implements PostgreSQL persistence for every entity.
package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// Store wraps the connection pool.
type Store struct {
	db *pgxpool.Pool
}

// New constructs a Store.
func New(db *pgxpool.Pool) *Store { return &Store{db: db} }

func one[T any](ctx context.Context, db *pgxpool.Pool, q string, args ...any) (T, error) {
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		var zero T
		return zero, wrap(err)
	}
	v, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[T])
	return v, wrap(err)
}

func many[T any](ctx context.Context, db *pgxpool.Pool, q string, args ...any) ([]T, error) {
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return nil, wrap(err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByNameLax[T])
	if err != nil {
		return nil, wrap(err)
	}
	if out == nil {
		out = []T{}
	}
	return out, nil
}

func wrap(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation
			return fmt.Errorf("%w: %s", httpx.ErrConflict, pgErr.ConstraintName)
		case "23503": // foreign_key_violation
			return &httpx.ValidationError{Fields: map[string]string{"_": "Связанная запись не найдена"}}
		}
	}
	return err
}

func (s *Store) exec(ctx context.Context, q string, args ...any) error {
	tag, err := s.db.Exec(ctx, q, args...)
	if err != nil {
		return wrap(err)
	}
	if tag.RowsAffected() == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// uniqueSlug appends -2, -3, ... until exists reports the slug as free.
func uniqueSlug(base string, exists func(string) (bool, error)) (string, error) {
	candidate := base
	for i := 2; i < 1000; i++ {
		taken, err := exists(candidate)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
	return "", errors.New("could not find a free slug")
}

func (s *Store) slugTaken(ctx context.Context, q string, args ...any) (bool, error) {
	var taken bool
	if err := s.db.QueryRow(ctx, q, args...).Scan(&taken); err != nil {
		return false, err
	}
	return taken, nil
}
