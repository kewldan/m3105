package files

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"
	"time"
)

// TestS3 runs against a real S3-compatible server when S3_TEST_ENDPOINT is set
// (for example MinIO from docker-compose.dev.yml):
//
//	S3_TEST_ENDPOINT=localhost:9000 S3_TEST_ACCESS_KEY=edu S3_TEST_SECRET_KEY=edu-dev-password go test ./internal/files -run TestS3
func TestS3(t *testing.T) {
	endpoint := os.Getenv("S3_TEST_ENDPOINT")
	if endpoint == "" {
		t.Skip("S3_TEST_ENDPOINT not set")
	}
	ctx := context.Background()
	s, err := NewS3(ctx, S3Config{
		Endpoint:  endpoint,
		AccessKey: os.Getenv("S3_TEST_ACCESS_KEY"),
		SecretKey: os.Getenv("S3_TEST_SECRET_KEY"),
		Bucket:    "edu3105-test-" + NewID()[:8],
		Region:    "us-east-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	id := NewID()
	data := []byte("0123456789abcdef")
	if err := s.Put(ctx, id, "text/plain", data); err != nil {
		t.Fatal(err)
	}
	obj, err := s.Open(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if obj.Size() != int64(len(data)) || time.Since(obj.ModTime()) > time.Minute {
		t.Fatalf("size %d, modified %v", obj.Size(), obj.ModTime())
	}
	// http.ServeContent answers Range requests by seeking.
	if _, err := obj.Seek(10, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	tail, err := io.ReadAll(obj)
	_ = obj.Close()
	if err != nil || string(tail) != "abcdef" {
		t.Fatalf("read after seek: %q %v", tail, err)
	}
	var seen []string
	if err := s.Walk(ctx, func(key string, _ time.Time) error {
		seen = append(seen, key)
		return nil
	}); err != nil || len(seen) != 1 || seen[0] != id {
		t.Fatalf("walk: %v %v", seen, err)
	}
	if err := s.Delete(ctx, id); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Open(ctx, id); !errors.Is(err, ErrNotExist) {
		t.Fatalf("deleted object: %v", err)
	}
	if err := s.Delete(ctx, id); err != nil {
		t.Fatalf("deleting a missing object must succeed: %v", err)
	}
	if err := s.client.RemoveBucket(ctx, s.bucket); err != nil {
		t.Logf("cleanup: %v", err)
	}
}
