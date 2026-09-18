package files

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

// Dir stores objects as plain files in a directory: for local development
// without MinIO and for tests.
type Dir struct {
	root string
}

// NewDir creates the directory if needed.
func NewDir(root string) (*Dir, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	return &Dir{root: root}, nil
}

func (d *Dir) path(key string) (string, error) {
	if !ValidID(key) {
		return "", ErrNotExist
	}
	return filepath.Join(d.root, key), nil
}

// Put writes the object atomically: a reader never sees a half-written file.
func (d *Dir) Put(_ context.Context, key, _ string, data []byte) error {
	p, err := d.path(key)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(d.root, ".upload-*")
	if err != nil {
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name())
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	return os.Rename(tmp.Name(), p)
}

type dirObject struct {
	*os.File
	info fs.FileInfo
}

func (o dirObject) Size() int64        { return o.info.Size() }
func (o dirObject) ModTime() time.Time { return o.info.ModTime() }

// Open returns the stored file.
func (d *Dir) Open(_ context.Context, key string) (Object, error) {
	p, err := d.path(key)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(p)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNotExist
	}
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	return dirObject{File: f, info: info}, nil
}

// Delete removes the object; a missing one (or a key that cannot exist) is not an error.
func (d *Dir) Delete(_ context.Context, key string) error {
	if !ValidID(key) {
		return nil
	}
	if err := os.Remove(filepath.Join(d.root, key)); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}

// Walk lists stored objects, skipping temporary files of unfinished uploads.
func (d *Dir) Walk(ctx context.Context, fn func(string, time.Time) error) error {
	entries, err := os.ReadDir(d.root)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if err := ctx.Err(); err != nil {
			return err
		}
		if e.IsDir() || !ValidID(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if err := fn(e.Name(), info.ModTime()); err != nil {
			return err
		}
	}
	return nil
}
