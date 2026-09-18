// Package files keeps attachments: S3-compatible storage (MinIO in production,
// a local directory in development), upload checks and metadata stripping.
package files

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"errors"
	"io"
	"regexp"
	"strings"
	"time"
)

// ErrNotExist is returned by Storage.Open for a missing object.
var ErrNotExist = errors.New("object does not exist")

// Object is an opened stored file: seekable, so http.ServeContent can answer Range requests.
type Object interface {
	io.ReadSeekCloser
	Size() int64
	ModTime() time.Time
}

// Storage is where attachment bytes live. Keys are attachment ids.
type Storage interface {
	Put(ctx context.Context, key, contentType string, data []byte) error
	Open(ctx context.Context, key string) (Object, error)
	Delete(ctx context.Context, key string) error
	// Walk visits every stored key; the garbage collector uses it to find
	// objects whose database row is gone.
	Walk(ctx context.Context, fn func(key string, modified time.Time) error) error
}

var idEncoding = base32.StdEncoding.WithPadding(base32.NoPadding)

// NewID returns a random, unguessable attachment id: 26 lowercase base32 characters.
func NewID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return strings.ToLower(idEncoding.EncodeToString(b))
}

var idPattern = regexp.MustCompile(`^[a-z2-7]{26}$`)

// ValidID reports whether s looks like an id produced by NewID.
func ValidID(s string) bool { return idPattern.MatchString(s) }

// Config selects the storage: S3 when the endpoint is set, else a local
// directory, else nothing (uploads are then refused with 503).
type Config struct {
	S3  S3Config
	Dir string
}

// Open builds the configured storage; it returns nil, nil when files are disabled.
func Open(ctx context.Context, cfg Config) (Storage, error) {
	// Возвращаем интерфейс явно: типизированный nil от конструктора при ошибке
	// дал бы ненулевой Storage.
	switch {
	case cfg.S3.Endpoint != "":
		s, err := NewS3(ctx, cfg.S3)
		if err != nil {
			return nil, err
		}
		return s, nil
	case cfg.Dir != "":
		d, err := NewDir(cfg.Dir)
		if err != nil {
			return nil, err
		}
		return d, nil
	}
	return nil, nil
}
