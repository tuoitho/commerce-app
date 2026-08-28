package reviewmedia

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"
)

func TestFakeStore_Lifecycle(t *testing.T) {
	ctx := context.Background()
	store := NewFakeStore()

	// 1. Health check initial
	if err := store.CheckHealth(ctx); err != nil {
		t.Fatalf("unexpected health check error: %v", err)
	}

	// Health check failure simulation
	simErr := errors.New("simulated network failure")
	store.SetHealthErr(simErr)
	if err := store.CheckHealth(ctx); !errors.Is(err, simErr) {
		t.Fatalf("expected health check error %v, got %v", simErr, err)
	}
	store.SetHealthErr(nil)

	// 2. PutObject validation
	if err := store.PutObject(ctx, "", bytes.NewReader([]byte("data")), 4, "text/plain"); err == nil {
		t.Error("expected error for empty objectKey")
	}
	if err := store.PutObject(ctx, "test.txt", bytes.NewReader([]byte("data")), -1, "text/plain"); err == nil {
		t.Error("expected error for negative size")
	}

	// 3. PutObject success
	content := []byte("hello world video or image stream")
	key := "reviews/uuid-1/media-1"
	err := store.PutObject(ctx, key, bytes.NewReader(content), int64(len(content)), "image/webp")
	if err != nil {
		t.Fatalf("failed to PutObject: %v", err)
	}

	if !store.HasObject(key) {
		t.Errorf("expected store to have object %q", key)
	}
	if store.ObjectCount() != 1 {
		t.Errorf("expected 1 object, got %d", store.ObjectCount())
	}

	// 4. StatObject
	info, err := store.StatObject(ctx, key)
	if err != nil {
		t.Fatalf("failed to StatObject: %v", err)
	}
	if info.Key != key {
		t.Errorf("expected key %q, got %q", key, info.Key)
	}
	if info.Size != int64(len(content)) {
		t.Errorf("expected size %d, got %d", len(content), info.Size)
	}
	if info.ContentType != "image/webp" {
		t.Errorf("expected ContentType image/webp, got %q", info.ContentType)
	}
	if info.ETag == "" {
		t.Error("expected non-empty ETag")
	}

	// Stat non-existent
	if _, err := store.StatObject(ctx, "non-existent"); err == nil {
		t.Error("expected error for non-existent key")
	}

	// 5. GetObject
	rc, err := store.GetObject(ctx, key)
	if err != nil {
		t.Fatalf("failed to GetObject: %v", err)
	}
	readData, err := io.ReadAll(rc)
	_ = rc.Close()
	if err != nil {
		t.Fatalf("failed to read from GetObject: %v", err)
	}
	if !bytes.Equal(readData, content) {
		t.Errorf("expected content %q, got %q", string(content), string(readData))
	}

	// Get non-existent
	if _, err := store.GetObject(ctx, "non-existent"); err == nil {
		t.Error("expected error for non-existent key")
	}

	// 6. GetObjectRange
	// Invalid range parameters
	if _, err := store.GetObjectRange(ctx, key, -1, 5); err == nil {
		t.Error("expected error for negative start")
	}
	if _, err := store.GetObjectRange(ctx, key, 0, 0); err == nil {
		t.Error("expected error for zero length")
	}
	if _, err := store.GetObjectRange(ctx, key, 1000, 5); err == nil {
		t.Error("expected error for start beyond length")
	}

	// Valid range: "hello" (start=0, len=5)
	rangeRC, err := store.GetObjectRange(ctx, key, 0, 5)
	if err != nil {
		t.Fatalf("failed to GetObjectRange: %v", err)
	}
	rangeData, err := io.ReadAll(rangeRC)
	_ = rangeRC.Close()
	if err != nil {
		t.Fatalf("failed to read range: %v", err)
	}
	if string(rangeData) != "hello" {
		t.Errorf("expected 'hello', got %q", string(rangeData))
	}

	// Valid range: "world" (start=6, len=5)
	rangeRC2, err := store.GetObjectRange(ctx, key, 6, 5)
	if err != nil {
		t.Fatalf("failed to GetObjectRange: %v", err)
	}
	rangeData2, err := io.ReadAll(rangeRC2)
	_ = rangeRC2.Close()
	if err != nil {
		t.Fatalf("failed to read range: %v", err)
	}
	if string(rangeData2) != "world" {
		t.Errorf("expected 'world', got %q", string(rangeData2))
	}

	// Range extending beyond total length
	rangeRC3, err := store.GetObjectRange(ctx, key, int64(len(content)-6), 100)
	if err != nil {
		t.Fatalf("failed to GetObjectRange: %v", err)
	}
	rangeData3, err := io.ReadAll(rangeRC3)
	_ = rangeRC3.Close()
	if err != nil {
		t.Fatalf("failed to read range: %v", err)
	}
	if string(rangeData3) != "stream" {
		t.Errorf("expected 'stream', got %q", string(rangeData3))
	}

	// 7. RemoveObject
	if err := store.RemoveObject(ctx, key); err != nil {
		t.Fatalf("failed to RemoveObject: %v", err)
	}
	if store.HasObject(key) {
		t.Errorf("object %q should have been removed", key)
	}

	// 8. RemoveObjects
	k1 := "reviews/uuid-1/media-1"
	k2 := "reviews/uuid-1/media-2"
	_ = store.PutObject(ctx, k1, bytes.NewReader([]byte("1")), 1, "image/webp")
	_ = store.PutObject(ctx, k2, bytes.NewReader([]byte("2")), 1, "image/webp")
	if store.ObjectCount() != 2 {
		t.Fatalf("expected 2 objects, got %d", store.ObjectCount())
	}

	if err := store.RemoveObjects(ctx, []string{k1, k2, "non-existent"}); err != nil {
		t.Fatalf("failed to RemoveObjects: %v", err)
	}
	if store.ObjectCount() != 0 {
		t.Errorf("expected 0 objects after RemoveObjects, got %d", store.ObjectCount())
	}
}
