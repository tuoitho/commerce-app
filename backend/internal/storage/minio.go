package storage

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"commerce-backend/internal/config"
)

type MinIOStorage struct {
	client  *minio.Client
	bucket  string
	timeout time.Duration
	log     *slog.Logger
}

type cancelReadCloser struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (r *cancelReadCloser) Close() error {
	err := r.ReadCloser.Close()
	r.cancel()
	return err
}

var _ Storage = (*MinIOStorage)(nil)

func NewMinIOStorage(cfg *config.Config, log *slog.Logger) (*MinIOStorage, error) {
	client, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	return &MinIOStorage{
		client:  client,
		bucket:  cfg.MinIOBucket,
		timeout: cfg.MinIORequestTimeout,
		log:     log,
	}, nil
}

func (s *MinIOStorage) EnsureBucket(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("check bucket exists: %w", err)
	}
	if !exists {
		err = s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("make bucket: %w", err)
		}
	}
	return nil
}

func (s *MinIOStorage) PutObject(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	info, err := s.client.PutObject(ctx, s.bucket, objectKey, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("put object: %w", err)
	}
	return info.ETag, nil
}

func (s *MinIOStorage) GetObject(ctx context.Context, objectKey string, start, end int64) (*MediaObject, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)

	opts := minio.GetObjectOptions{}
	if start >= 0 && end >= start {
		if err := opts.SetRange(start, end); err != nil {
			cancel()
			return nil, fmt.Errorf("set range: %w", err)
		}
	}

	obj, err := s.client.GetObject(ctx, s.bucket, objectKey, opts)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("get object: %w", err)
	}

	stat, err := obj.Stat()
	if err != nil {
		_ = obj.Close()
		cancel()
		errResp := minio.ToErrorResponse(err)
		if errResp.Code == "NoSuchKey" {
			return nil, ErrObjectNotFound
		}
		return nil, fmt.Errorf("stat object: %w", err)
	}

	return &MediaObject{
		Body:         &cancelReadCloser{ReadCloser: obj, cancel: cancel},
		Size:         stat.Size,
		ContentType:  stat.ContentType,
		ETag:         stat.ETag,
		LastModified: stat.LastModified,
	}, nil
}

func (s *MinIOStorage) DeleteObject(ctx context.Context, objectKey string) error {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	err := s.client.RemoveObject(ctx, s.bucket, objectKey, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}

func (s *MinIOStorage) ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout*2)
	defer cancel()

	var result []ObjectInfo
	for obj := range s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}) {
		if obj.Err != nil {
			return nil, fmt.Errorf("list objects: %w", obj.Err)
		}
		result = append(result, ObjectInfo{
			Key:          obj.Key,
			Size:         obj.Size,
			ContentType:  obj.ContentType,
			ETag:         obj.ETag,
			LastModified: obj.LastModified,
		})
	}
	return result, nil
}

func (s *MinIOStorage) Ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	_, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("ping minio: %w", err)
	}
	return nil
}
