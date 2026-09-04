package chatmedia

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

// FakeStore is an in-memory implementation of domain.ChatMediaStore for testing.
type FakeStore struct {
	mu         sync.RWMutex
	objects    map[string]storedObject
	healthErr  error
	privateErr error
	failPutErr error
	failGetErr error
}

var _ domain.ChatMediaStore = (*FakeStore)(nil)

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
	if f.failPutErr != nil {
		return f.failPutErr
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

func (f *FakeStore) StatObject(ctx context.Context, objectKey string) (*domain.ChatObjectInfo, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	f.mu.RLock()
	defer f.mu.RUnlock()

	obj, ok := f.objects[objectKey]
	if !ok {
		return nil, fmt.Errorf("%w: key %q", ErrObjectNotFound, objectKey)
	}

	return &domain.ChatObjectInfo{
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
	if f.failGetErr != nil {
		return nil, f.failGetErr
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
	if f.failGetErr != nil {
		return nil, f.failGetErr
	}
	if start < 0 || length <= 0 {
		return nil, fmt.Errorf("%w: start=%d length=%d", ErrInvalidRange, start, length)
	}

	f.mu.RLock()
	defer f.mu.RUnlock()

	obj, ok := f.objects[objectKey]
	if !ok {
		return nil, fmt.Errorf("%w: key %q", ErrObjectNotFound, objectKey)
	}

	totalLen := int64(len(obj.data))
	if start >= totalLen {
		return nil, fmt.Errorf("%w: start %d exceeds total %d", ErrInvalidRange, start, totalLen)
	}

	end := start + length
	if end > totalLen {
		end = totalLen
	}

	subSlice := obj.data[start:end]
	return io.NopCloser(bytes.NewReader(subSlice)), nil
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

	for _, k := range objectKeys {
		delete(f.objects, k)
	}
	return nil
}

func (f *FakeStore) CheckHealth(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return f.healthErr
}

func (f *FakeStore) ValidateBucketPrivate(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return f.privateErr
}

func (f *FakeStore) SetHealthErr(err error) {
	f.healthErr = err
}

func (f *FakeStore) SetPrivateErr(err error) {
	f.privateErr = err
}

func (f *FakeStore) SetFailPutErr(err error) {
	f.failPutErr = err
}

func (f *FakeStore) SetFailGetErr(err error) {
	f.failGetErr = err
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
