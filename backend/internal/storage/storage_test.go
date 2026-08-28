package storage

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"commerce-backend/internal/domain"
)

func TestMemoryStorage_PutGetDelete(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStorage("test-bucket")

	// 1. Put object
	data := []byte("fake-image-content-bytes")
	etag, err := store.PutObject(ctx, "op1/image1.jpg", bytes.NewReader(data), int64(len(data)), "image/jpeg")
	if err != nil {
		t.Fatalf("unexpected put error: %v", err)
	}
	if etag == "" {
		t.Error("expected non-empty etag")
	}

	// 2. Get full object
	obj, err := store.GetObject(ctx, "op1/image1.jpg", -1, -1)
	if err != nil {
		t.Fatalf("unexpected get error: %v", err)
	}
	defer obj.Body.Close()

	if obj.Size != int64(len(data)) {
		t.Errorf("size = %d, want %d", obj.Size, len(data))
	}
	if obj.ContentType != "image/jpeg" {
		t.Errorf("contentType = %q, want 'image/jpeg'", obj.ContentType)
	}

	// 3. Get byte range
	rangeObj, err := store.GetObject(ctx, "op1/image1.jpg", 0, 3)
	if err != nil {
		t.Fatalf("unexpected range get error: %v", err)
	}
	defer rangeObj.Body.Close()

	if rangeObj.Size != 4 {
		t.Errorf("range size = %d, want 4", rangeObj.Size)
	}

	// 4. List objects
	list, err := store.ListObjects(ctx, "op1")
	if err != nil {
		t.Fatalf("unexpected list error: %v", err)
	}
	if len(list) != 1 || list[0].Key != "op1/image1.jpg" {
		t.Errorf("list = %+v, want 1 item with key op1/image1.jpg", list)
	}

	// 5. Delete object
	if err := store.DeleteObject(ctx, "op1/image1.jpg"); err != nil {
		t.Fatalf("unexpected delete error: %v", err)
	}

	// 6. Get after delete -> not found
	_, err = store.GetObject(ctx, "op1/image1.jpg", -1, -1)
	if err != ErrObjectNotFound {
		t.Errorf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestMemoryStorage_FailureMode(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStorage("test-bucket")
	store.SetFailing(true)

	if err := store.Ping(ctx); err != ErrStorageUnavailable {
		t.Errorf("expected ErrStorageUnavailable, got %v", err)
	}
	if err := store.EnsureBucket(ctx); err != ErrStorageUnavailable {
		t.Errorf("expected ErrStorageUnavailable, got %v", err)
	}
	_, err := store.PutObject(ctx, "k", strings.NewReader("d"), 1, "text/plain")
	if err != ErrStorageUnavailable {
		t.Errorf("expected ErrStorageUnavailable, got %v", err)
	}
	_, err = store.GetObject(ctx, "k", -1, -1)
	if err != ErrStorageUnavailable {
		t.Errorf("expected ErrStorageUnavailable, got %v", err)
	}
	if err := store.DeleteObject(ctx, "k"); err != ErrStorageUnavailable {
		t.Errorf("expected ErrStorageUnavailable, got %v", err)
	}
	_, err = store.ListObjects(ctx, "")
	if err != ErrStorageUnavailable {
		t.Errorf("expected ErrStorageUnavailable, got %v", err)
	}
}

func TestMediaLimits_Constants(t *testing.T) {
	if domain.MaxReviewMediaCount != 5 {
		t.Errorf("MaxReviewMediaCount = %d, want 5", domain.MaxReviewMediaCount)
	}
	if domain.MaxReviewVideoCount != 2 {
		t.Errorf("MaxReviewVideoCount = %d, want 2", domain.MaxReviewVideoCount)
	}
	if domain.MaxReviewImageSizeBytes != 5242880 {
		t.Errorf("MaxReviewImageSizeBytes = %d, want 5242880", domain.MaxReviewImageSizeBytes)
	}
	if domain.MaxReviewVideoSizeBytes != 52428800 {
		t.Errorf("MaxReviewVideoSizeBytes = %d, want 52428800", domain.MaxReviewVideoSizeBytes)
	}
}
