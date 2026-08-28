package reviewmedia_test

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"commerce-backend/internal/config"
	"commerce-backend/internal/storage/reviewmedia"
)

func TestIntegration_MinIO_PrivateStorage(t *testing.T) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:19000"
	}
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	if accessKey == "" {
		accessKey = "minioadmin"
	}
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	if secretKey == "" {
		secretKey = "miniopassword"
	}
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "product-review-media"
	}

	cfg := &config.Config{
		MinioEndpoint:  endpoint,
		MinioAccessKey: accessKey,
		MinioSecretKey: secretKey,
		MinioBucket:    bucket,
		MinioUseSSL:    false,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	store, err := reviewmedia.New(cfg)
	if err != nil {
		t.Fatalf("failed to create MinIO store: %v", err)
	}

	// Probe connectivity before running integration suite
	if err := store.CheckHealth(ctx); err != nil {
		t.Skipf("MinIO service not reachable at %s (%v); skipping integration test", endpoint, err)
		return
	}

	// 1. Startup validation: Bucket exists and is private
	if err := store.ValidateBucketPrivate(ctx); err != nil {
		t.Fatalf("ValidateBucketPrivate failed: %v", err)
	}

	// 2. Upload image object
	objectKey := fmt.Sprintf("reviews/test-%d/image-1.webp", time.Now().UnixNano())
	payload := []byte("RIFF....WEBPVP8 ... binary sample webp image content ...")
	contentType := "image/webp"

	err = store.PutObject(ctx, objectKey, bytes.NewReader(payload), int64(len(payload)), contentType)
	if err != nil {
		t.Fatalf("PutObject failed: %v", err)
	}
	t.Cleanup(func() {
		_ = store.RemoveObject(context.Background(), objectKey)
	})

	// 3. StatObject
	info, err := store.StatObject(ctx, objectKey)
	if err != nil {
		t.Fatalf("StatObject failed: %v", err)
	}
	if info.Key != objectKey {
		t.Errorf("expected Key %q, got %q", objectKey, info.Key)
	}
	if info.Size != int64(len(payload)) {
		t.Errorf("expected Size %d, got %d", len(payload), info.Size)
	}
	if info.ContentType != contentType {
		t.Errorf("expected ContentType %q, got %q", contentType, info.ContentType)
	}
	if info.ETag == "" {
		t.Error("expected non-empty ETag")
	}

	// 4. GetObject full read
	rc, err := store.GetObject(ctx, objectKey)
	if err != nil {
		t.Fatalf("GetObject failed: %v", err)
	}
	gotData, err := io.ReadAll(rc)
	_ = rc.Close()
	if err != nil {
		t.Fatalf("read from GetObject failed: %v", err)
	}
	if !bytes.Equal(gotData, payload) {
		t.Errorf("GetObject content mismatch: expected %q, got %q", string(payload), string(gotData))
	}

	// 5. GetObjectRange partial read
	rangeRC, err := store.GetObjectRange(ctx, objectKey, 0, 4)
	if err != nil {
		t.Fatalf("GetObjectRange [0, 4] failed: %v", err)
	}
	rangeData, err := io.ReadAll(rangeRC)
	_ = rangeRC.Close()
	if err != nil {
		t.Fatalf("read from GetObjectRange failed: %v", err)
	}
	if string(rangeData) != "RIFF" {
		t.Errorf("expected range 'RIFF', got %q", string(rangeData))
	}

	// 6. Verify anonymous unauthenticated access is rejected (Bucket is truly private)
	anonURL := fmt.Sprintf("http://%s/%s/%s", endpoint, bucket, objectKey)
	resp, err := http.Get(anonURL)
	if err != nil {
		t.Fatalf("anonymous probe failed: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected anonymous GET to be rejected with 403 or 401, got %d", resp.StatusCode)
	}

	// 7. RemoveObject
	if err := store.RemoveObject(ctx, objectKey); err != nil {
		t.Fatalf("RemoveObject failed: %v", err)
	}

	// Verify object is gone
	_, err = store.StatObject(ctx, objectKey)
	if err == nil {
		t.Errorf("expected StatObject to fail after RemoveObject, got nil")
	}

	// 8. Batch RemoveObjects
	k1 := fmt.Sprintf("reviews/test-%d/batch-1.jpg", time.Now().UnixNano())
	k2 := fmt.Sprintf("reviews/test-%d/batch-2.jpg", time.Now().UnixNano())
	_ = store.PutObject(ctx, k1, strings.NewReader("sample1"), 7, "image/jpeg")
	_ = store.PutObject(ctx, k2, strings.NewReader("sample2"), 7, "image/jpeg")

	if err := store.RemoveObjects(ctx, []string{k1, k2}); err != nil {
		t.Fatalf("RemoveObjects failed: %v", err)
	}
	_, err1 := store.StatObject(ctx, k1)
	_, err2 := store.StatObject(ctx, k2)
	if err1 == nil || err2 == nil {
		t.Errorf("expected all batch objects to be removed")
	}
}
