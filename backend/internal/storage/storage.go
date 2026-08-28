package storage

import (
	"context"
	"errors"
	"io"
	"time"
)

var (
	ErrObjectNotFound = errors.New("object not found")
	ErrStorageUnavailable = errors.New("storage unavailable")
)

type ObjectInfo struct {
	Key          string
	Size         int64
	ContentType  string
	ETag         string
	LastModified time.Time
}

type MediaObject struct {
	Body         io.ReadCloser
	Size         int64
	ContentType  string
	ETag         string
	LastModified time.Time
}

type Storage interface {
	EnsureBucket(ctx context.Context) error
	PutObject(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) (string, error)
	GetObject(ctx context.Context, objectKey string, start, end int64) (*MediaObject, error)
	DeleteObject(ctx context.Context, objectKey string) error
	ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error)
	Ping(ctx context.Context) error
}
