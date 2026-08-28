package reviewmedia

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"commerce-backend/internal/config"
	"commerce-backend/internal/domain"
)

// Store implements domain.ReviewMediaStore using MinIO S3-compatible client.
type Store struct {
	client *minio.Client
	bucket string
}

var _ domain.ReviewMediaStore = (*Store)(nil)

// New initializes a new MinIO ReviewMediaStore using the provided configuration.
func New(cfg *config.Config) (*Store, error) {
	if cfg == nil {
		return nil, fmt.Errorf("config must not be nil")
	}

	creds := credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, "")
	client, err := minio.New(cfg.MinioEndpoint, &minio.Options{
		Creds:  creds,
		Secure: cfg.MinioUseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("initialize minio client: %w", err)
	}

	bucket := strings.TrimSpace(cfg.MinioBucket)
	if bucket == "" {
		bucket = "product-review-media"
	}

	return NewWithClient(client, bucket), nil
}

// NewWithClient creates a Store with an existing MinIO client and bucket.
func NewWithClient(client *minio.Client, bucket string) *Store {
	return &Store{
		client: client,
		bucket: bucket,
	}
}

// PutObject stores a binary object at the specified objectKey.
func (s *Store) PutObject(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) error {
	trimmedKey := strings.TrimSpace(objectKey)
	if trimmedKey == "" {
		return fmt.Errorf("objectKey is required")
	}
	if size < 0 {
		return fmt.Errorf("invalid object size: %d", size)
	}

	opts := minio.PutObjectOptions{
		ContentType: contentType,
	}

	_, err := s.client.PutObject(ctx, s.bucket, trimmedKey, reader, size, opts)
	if err != nil {
		return fmt.Errorf("minio put object %q: %w", trimmedKey, err)
	}

	return nil
}

// StatObject retrieves metadata for the specified objectKey.
func (s *Store) StatObject(ctx context.Context, objectKey string) (*domain.ReviewObjectInfo, error) {
	trimmedKey := strings.TrimSpace(objectKey)
	if trimmedKey == "" {
		return nil, fmt.Errorf("objectKey is required")
	}

	info, err := s.client.StatObject(ctx, s.bucket, trimmedKey, minio.StatObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("minio stat object %q: %w", trimmedKey, err)
	}

	return &domain.ReviewObjectInfo{
		Key:         info.Key,
		Size:        info.Size,
		ContentType: info.ContentType,
		ETag:        info.ETag,
	}, nil
}

// GetObject opens a stream to the object at objectKey.
func (s *Store) GetObject(ctx context.Context, objectKey string) (io.ReadCloser, error) {
	trimmedKey := strings.TrimSpace(objectKey)
	if trimmedKey == "" {
		return nil, fmt.Errorf("objectKey is required")
	}

	obj, err := s.client.GetObject(ctx, s.bucket, trimmedKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("minio get object %q: %w", trimmedKey, err)
	}

	// Fail fast: verify object exists and is accessible
	if _, err := obj.Stat(); err != nil {
		_ = obj.Close()
		return nil, fmt.Errorf("minio stat object %q: %w", trimmedKey, err)
	}

	return obj, nil
}

// GetObjectRange opens a stream for a byte range of the object at objectKey.
func (s *Store) GetObjectRange(ctx context.Context, objectKey string, start, length int64) (io.ReadCloser, error) {
	trimmedKey := strings.TrimSpace(objectKey)
	if trimmedKey == "" {
		return nil, fmt.Errorf("objectKey is required")
	}
	if start < 0 || length <= 0 {
		return nil, fmt.Errorf("invalid range: start=%d, length=%d", start, length)
	}

	opts := minio.GetObjectOptions{}
	if err := opts.SetRange(start, start+length-1); err != nil {
		return nil, fmt.Errorf("set byte range [%d, %d]: %w", start, start+length-1, err)
	}

	obj, err := s.client.GetObject(ctx, s.bucket, trimmedKey, opts)
	if err != nil {
		return nil, fmt.Errorf("minio get object range %q: %w", trimmedKey, err)
	}

	if _, err := obj.Stat(); err != nil {
		_ = obj.Close()
		return nil, fmt.Errorf("minio stat object range %q: %w", trimmedKey, err)
	}

	return obj, nil
}

// RemoveObject deletes the object at objectKey.
func (s *Store) RemoveObject(ctx context.Context, objectKey string) error {
	trimmedKey := strings.TrimSpace(objectKey)
	if trimmedKey == "" {
		return nil
	}

	err := s.client.RemoveObject(ctx, s.bucket, trimmedKey, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("minio remove object %q: %w", trimmedKey, err)
	}

	return nil
}

// RemoveObjects deletes multiple objects in batch.
func (s *Store) RemoveObjects(ctx context.Context, objectKeys []string) error {
	if len(objectKeys) == 0 {
		return nil
	}

	objectsCh := make(chan minio.ObjectInfo, len(objectKeys))
	for _, key := range objectKeys {
		trimmed := strings.TrimSpace(key)
		if trimmed != "" {
			objectsCh <- minio.ObjectInfo{Key: trimmed}
		}
	}
	close(objectsCh)

	var errs []error
	for rErr := range s.client.RemoveObjects(ctx, s.bucket, objectsCh, minio.RemoveObjectsOptions{}) {
		if rErr.Err != nil {
			errs = append(errs, fmt.Errorf("remove object %q: %w", rErr.ObjectName, rErr.Err))
		}
	}

	if len(errs) > 0 {
		return errors.Join(errs...)
	}

	return nil
}

// CheckHealth verifies that the storage service is reachable and the bucket exists.
func (s *Store) CheckHealth(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("minio health check failed: %w", err)
	}
	if !exists {
		return fmt.Errorf("minio bucket %q does not exist", s.bucket)
	}
	return nil
}

// ValidateBucketPrivate checks at startup that the bucket exists and is not publicly readable.
// The application must never auto-create or alter bucket policies.
func (s *Store) ValidateBucketPrivate(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("minio bucket exists check failed: %w", err)
	}
	if !exists {
		return fmt.Errorf("minio bucket %q does not exist; bucket must be provisioned before running application", s.bucket)
	}

	policyStr, err := s.client.GetBucketPolicy(ctx, s.bucket)
	if err != nil {
		errResp := minio.ToErrorResponse(err)
		if errResp.Code == "NoSuchBucketPolicy" || errResp.Code == "NoSuchPolicy" || strings.Contains(strings.ToLower(err.Error()), "nosuchbucketpolicy") {
			// S3 default: no policy attached means private.
			return nil
		}
		return fmt.Errorf("failed to retrieve bucket policy for %q: %w", s.bucket, err)
	}

	if strings.TrimSpace(policyStr) != "" {
		isPublic, pErr := IsPolicyAllowingAnonymousRead(policyStr)
		if pErr != nil {
			return fmt.Errorf("failed to parse bucket policy for %q: %w", s.bucket, pErr)
		}
		if isPublic {
			return fmt.Errorf("minio bucket %q is configured with public/anonymous read access; must be private", s.bucket)
		}
	}

	return nil
}
