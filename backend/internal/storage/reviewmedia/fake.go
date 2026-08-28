package reviewmedia

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"sync"

	"commerce-backend/internal/domain"
)

var (
	ErrObjectNotFound = errors.New("object not found")
	ErrInvalidRange   = errors.New("invalid range")
)

type storedObject struct {
	data        []byte
	contentType string
	etag        string
}

// FakeStore is an in-memory implementation of domain.ReviewMediaStore for testing.
type FakeStore struct {
	mu        sync.RWMutex
	objects   map[string]storedObject
	healthErr error
}

var _ domain.ReviewMediaStore = (*FakeStore)(nil)

// NewFakeStore creates a new in-memory FakeStore instance.
func NewFakeStore() *FakeStore {
	return &FakeStore{
		objects: make(map[string]storedObject),
	}
}

func (f *FakeStore) PutObject(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if objectKey == "" {
		return fmt.Errorf("objectKey is required")
	}
	if size < 0 {
		return fmt.Errorf("invalid object size: %d", size)
	}

	data, err := io.ReadAll(reader)
	if err != nil {
		return fmt.Errorf("read object data: %w", err)
	}

	hash := sha256.Sum256(data)
	etag := hex.EncodeToString(hash[:])

	f.mu.Lock()
	defer f.mu.Unlock()

	f.objects[objectKey] = storedObject{
		data:        data,
		contentType: contentType,
		etag:        etag,
	}

	return nil
}

func (f *FakeStore) StatObject(ctx context.Context, objectKey string) (*domain.ReviewObjectInfo, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	f.mu.RLock()
	defer f.mu.RUnlock()

	obj, ok := f.objects[objectKey]
	if !ok {
		return nil, fmt.Errorf("%w: key %q", ErrObjectNotFound, objectKey)
	}

	return &domain.ReviewObjectInfo{
		Key:         objectKey,
		Size:        int64(len(obj.data)),
		ContentType: obj.contentType,
		ETag:        obj.etag,
	}, nil
}

func (f *FakeStore) GetObject(ctx context.Context, objectKey string) (io.ReadCloser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	f.mu.RLock()
	defer f.mu.RUnlock()

	obj, ok := f.objects[objectKey]
	if !ok {
		return nil, fmt.Errorf("%w: key %q", ErrObjectNotFound, objectKey)
	}

	return io.NopCloser(bytes.NewReader(obj.data)), nil
}

func (f *FakeStore) GetObjectRange(ctx context.Context, objectKey string, start, length int64) (io.ReadCloser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if start < 0 || length <= 0 {
		return nil, fmt.Errorf("%w: start=%d, length=%d", ErrInvalidRange, start, length)
	}

	f.mu.RLock()
	defer f.mu.RUnlock()

	obj, ok := f.objects[objectKey]
	if !ok {
		return nil, fmt.Errorf("%w: key %q", ErrObjectNotFound, objectKey)
	}

	total := int64(len(obj.data))
	if start >= total {
		return nil, fmt.Errorf("%w: start offset %d exceeds total size %d", ErrInvalidRange, start, total)
	}

	end := start + length
	if end > total {
		end = total
	}

	sliced := obj.data[start:end]
	return io.NopCloser(bytes.NewReader(sliced)), nil
}

func (f *FakeStore) RemoveObject(ctx context.Context, objectKey string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	delete(f.objects, objectKey)
	return nil
}

func (f *FakeStore) RemoveObjects(ctx context.Context, objectKeys []string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	for _, key := range objectKeys {
		delete(f.objects, key)
	}
	return nil
}

func (f *FakeStore) CheckHealth(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	f.mu.RLock()
	defer f.mu.RUnlock()

	if f.healthErr != nil {
		return f.healthErr
	}
	return nil
}

func (f *FakeStore) SetHealthErr(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.healthErr = err
}

func (f *FakeStore) HasObject(objectKey string) bool {
	f.mu.RLock()
	defer f.mu.RUnlock()
	_, ok := f.objects[objectKey]
	return ok
}

func (f *FakeStore) ObjectCount() int {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return len(f.objects)
}
