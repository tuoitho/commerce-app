package storage

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"
)

type memoryObject struct {
	data         []byte
	contentType  string
	etag         string
	lastModified time.Time
}

type MemoryStorage struct {
	mu      sync.RWMutex
	bucket  string
	objects map[string]memoryObject
	failing bool
}

var _ Storage = (*MemoryStorage)(nil)

func NewMemoryStorage(bucket string) *MemoryStorage {
	return &MemoryStorage{
		bucket:  bucket,
		objects: make(map[string]memoryObject),
	}
}

func (m *MemoryStorage) SetFailing(failing bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.failing = failing
}

func (m *MemoryStorage) EnsureBucket(ctx context.Context) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.failing {
		return ErrStorageUnavailable
	}
	return nil
}

func (m *MemoryStorage) PutObject(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failing {
		return "", ErrStorageUnavailable
	}

	data, err := io.ReadAll(reader)
	if err != nil {
		return "", fmt.Errorf("read object data: %w", err)
	}

	hash := sha256.Sum256(data)
	etag := fmt.Sprintf("\"%x\"", hash)

	m.objects[objectKey] = memoryObject{
		data:         data,
		contentType:  contentType,
		etag:         etag,
		lastModified: time.Now().UTC(),
	}

	return etag, nil
}

func (m *MemoryStorage) GetObject(ctx context.Context, objectKey string, start, end int64) (*MediaObject, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.failing {
		return nil, ErrStorageUnavailable
	}

	obj, ok := m.objects[objectKey]
	if !ok {
		return nil, ErrObjectNotFound
	}

	data := obj.data
	totalSize := int64(len(data))

	if start >= 0 && end >= start {
		if start >= totalSize {
			return nil, fmt.Errorf("range start %d out of bounds %d", start, totalSize)
		}
		if end >= totalSize {
			end = totalSize - 1
		}
		data = data[start : end+1]
	}

	return &MediaObject{
		Body:         io.NopCloser(bytes.NewReader(data)),
		Size:         int64(len(data)),
		ContentType:  obj.contentType,
		ETag:         obj.etag,
		LastModified: obj.lastModified,
	}, nil
}

func (m *MemoryStorage) DeleteObject(ctx context.Context, objectKey string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failing {
		return ErrStorageUnavailable
	}

	delete(m.objects, objectKey)
	return nil
}

func (m *MemoryStorage) ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.failing {
		return nil, ErrStorageUnavailable
	}

	var result []ObjectInfo
	for k, v := range m.objects {
		if prefix == "" || strings.HasPrefix(k, prefix) {
			result = append(result, ObjectInfo{
				Key:          k,
				Size:         int64(len(v.data)),
				ContentType:  v.contentType,
				ETag:         v.etag,
				LastModified: v.lastModified,
			})
		}
	}
	return result, nil
}

func (m *MemoryStorage) Ping(ctx context.Context) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.failing {
		return ErrStorageUnavailable
	}
	return nil
}
