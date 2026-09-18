package files

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3Config points at an S3-compatible server (MinIO in docker-compose).
type S3Config struct {
	Endpoint  string // host:port without scheme
	AccessKey string
	SecretKey string
	Bucket    string
	Region    string
	UseSSL    bool
}

// S3 stores objects in one private bucket; the API is the only client and
// serves files itself, so the bucket never needs to be public.
type S3 struct {
	client *minio.Client
	bucket string
}

// NewS3 connects and creates the bucket on first start. MinIO may still be
// booting when the API starts, so the first check is retried for a while.
func NewS3(ctx context.Context, cfg S3Config) (*S3, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, err
	}
	s := &S3{client: client, bucket: cfg.Bucket}
	var exists bool
	for attempt := 1; ; attempt++ {
		exists, err = client.BucketExists(ctx, cfg.Bucket)
		if err == nil || attempt == 10 {
			break
		}
		slog.Warn("s3 not ready, retrying", "endpoint", cfg.Endpoint, "err", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
	if err != nil {
		return nil, fmt.Errorf("s3 %s: %w", cfg.Endpoint, err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{Region: cfg.Region}); err != nil {
			return nil, fmt.Errorf("create bucket %s: %w", cfg.Bucket, err)
		}
		slog.Info("s3 bucket created", "bucket", cfg.Bucket)
	}
	return s, nil
}

// Put uploads the object.
func (s *S3) Put(ctx context.Context, key, contentType string, data []byte) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType})
	return err
}

type s3Object struct {
	*minio.Object
	info minio.ObjectInfo
}

func (o s3Object) Size() int64        { return o.info.Size }
func (o s3Object) ModTime() time.Time { return o.info.LastModified }

// Open returns a seekable reader; reads are lazy ranged requests to S3.
func (s *S3) Open(ctx context.Context, key string) (Object, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, s3Err(err)
	}
	info, err := obj.Stat()
	if err != nil {
		_ = obj.Close()
		return nil, s3Err(err)
	}
	return s3Object{Object: obj, info: info}, nil
}

// Delete removes the object; S3 treats a missing key as success.
func (s *S3) Delete(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

// Walk lists every object in the bucket.
func (s *S3) Walk(ctx context.Context, fn func(string, time.Time) error) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel() // stops the listing goroutine if fn bails out early
	for obj := range s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{Recursive: true}) {
		if obj.Err != nil {
			return obj.Err
		}
		if err := fn(obj.Key, obj.LastModified); err != nil {
			return err
		}
	}
	return nil
}

func s3Err(err error) error {
	if minio.ToErrorResponse(err).Code == "NoSuchKey" {
		return ErrNotExist
	}
	return err
}
