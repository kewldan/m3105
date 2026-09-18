package files

import (
	"context"
	"log/slog"
	"time"
)

// Index is what the garbage collector needs from the database.
type Index interface {
	// DeleteStaleUploads removes student uploads never attached to a comment or post.
	DeleteStaleUploads(ctx context.Context, before time.Time) (int64, error)
	// AttachmentIDs returns every id that still has a row.
	AttachmentIDs(ctx context.Context) (map[string]bool, error)
}

const (
	// staleUploadAge: студент загрузил файл, но так и не отправил комментарий.
	staleUploadAge = 24 * time.Hour
	// orphanGrace защищает загрузку, у которой объект уже в хранилище, а строка
	// в базе ещё не записана.
	orphanGrace = time.Hour
	gcEvery     = time.Hour
)

// Collect deletes stale uploads and then objects without a row: rows vanish by
// cascade when a comment, post or user is deleted, and the bytes follow here.
func Collect(ctx context.Context, idx Index, st Storage) error {
	now := time.Now()
	stale, err := idx.DeleteStaleUploads(ctx, now.Add(-staleUploadAge))
	if err != nil {
		return err
	}
	ids, err := idx.AttachmentIDs(ctx)
	if err != nil {
		return err
	}
	var orphans []string
	err = st.Walk(ctx, func(key string, modified time.Time) error {
		if !ids[key] && modified.Before(now.Add(-orphanGrace)) {
			orphans = append(orphans, key)
		}
		return nil
	})
	if err != nil {
		return err
	}
	for _, key := range orphans {
		if err := st.Delete(ctx, key); err != nil {
			return err
		}
	}
	if stale > 0 || len(orphans) > 0 {
		slog.Info("files gc", "stale_uploads", stale, "deleted_objects", len(orphans))
	}
	return nil
}

// RunGC collects garbage every hour until ctx is done. Several API instances
// may run it at once: every step is idempotent.
func RunGC(ctx context.Context, idx Index, st Storage) {
	timer := time.NewTimer(time.Minute)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		if err := Collect(ctx, idx, st); err != nil && ctx.Err() == nil {
			slog.Error("files gc", "err", err)
		}
		timer.Reset(gcEvery)
	}
}
