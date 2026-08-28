package reviewmedia

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"commerce-backend/internal/config"
)

func TestStore_New(t *testing.T) {
	t.Run("nil config returns error", func(t *testing.T) {
		_, err := New(nil)
		if err == nil {
			t.Error("expected error for nil config")
		}
	})

	t.Run("valid config creates store", func(t *testing.T) {
		cfg := &config.Config{
			MinioEndpoint:  "localhost:19000",
			MinioAccessKey: "access",
			MinioSecretKey: "secret",
			MinioBucket:    "custom-bucket",
			MinioUseSSL:    false,
		}
		store, err := New(cfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if store == nil {
			t.Fatal("expected non-nil store")
		}
		if store.bucket != "custom-bucket" {
			t.Errorf("expected bucket custom-bucket, got %q", store.bucket)
		}
	})

	t.Run("empty bucket falls back to default", func(t *testing.T) {
		cfg := &config.Config{
			MinioEndpoint:  "localhost:19000",
			MinioAccessKey: "access",
			MinioSecretKey: "secret",
			MinioBucket:    "",
			MinioUseSSL:    false,
		}
		store, err := New(cfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if store.bucket != "product-review-media" {
			t.Errorf("expected default bucket product-review-media, got %q", store.bucket)
		}
	})
}

func TestStore_InputValidation(t *testing.T) {
	store := NewWithClient(nil, "product-review-media")
	ctx := context.Background()

	t.Run("PutObject empty key", func(t *testing.T) {
		err := store.PutObject(ctx, "   ", strings.NewReader("data"), 4, "image/jpeg")
		if err == nil || !strings.Contains(err.Error(), "objectKey is required") {
			t.Errorf("expected objectKey is required error, got %v", err)
		}
	})

	t.Run("PutObject negative size", func(t *testing.T) {
		err := store.PutObject(ctx, "key", strings.NewReader("data"), -1, "image/jpeg")
		if err == nil || !strings.Contains(err.Error(), "invalid object size") {
			t.Errorf("expected invalid object size error, got %v", err)
		}
	})

	t.Run("StatObject empty key", func(t *testing.T) {
		_, err := store.StatObject(ctx, "")
		if err == nil || !strings.Contains(err.Error(), "objectKey is required") {
			t.Errorf("expected objectKey is required error, got %v", err)
		}
	})

	t.Run("GetObject empty key", func(t *testing.T) {
		_, err := store.GetObject(ctx, " ")
		if err == nil || !strings.Contains(err.Error(), "objectKey is required") {
			t.Errorf("expected objectKey is required error, got %v", err)
		}
	})

	t.Run("GetObjectRange invalid params", func(t *testing.T) {
		_, err := store.GetObjectRange(ctx, "key", -1, 10)
		if err == nil || !strings.Contains(err.Error(), "invalid range") {
			t.Errorf("expected invalid range error for negative start, got %v", err)
		}

		_, err2 := store.GetObjectRange(ctx, "key", 0, 0)
		if err2 == nil || !strings.Contains(err2.Error(), "invalid range") {
			t.Errorf("expected invalid range error for zero length, got %v", err2)
		}
	})

	t.Run("RemoveObject empty key succeeds as no-op", func(t *testing.T) {
		err := store.RemoveObject(ctx, "")
		if err != nil {
			t.Errorf("expected nil error for empty remove key, got %v", err)
		}
	})

	t.Run("RemoveObjects empty list succeeds as no-op", func(t *testing.T) {
		err := store.RemoveObjects(ctx, nil)
		if err != nil {
			t.Errorf("expected nil error for empty remove list, got %v", err)
		}
	})
}

func decodeAWSChunkedBody(body []byte) []byte {
	if !bytes.Contains(body, []byte(";chunk-signature=")) {
		return body
	}
	var out []byte
	lines := bytes.Split(body, []byte("\r\n"))
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if bytes.Contains(line, []byte(";chunk-signature=")) {
			parts := bytes.Split(line, []byte(";"))
			chunkSizeHex := string(parts[0])
			var size int
			_, _ = fmt.Sscanf(chunkSizeHex, "%x", &size)
			if size == 0 {
				break
			}
			if i+1 < len(lines) {
				chunkData := lines[i+1]
				if len(chunkData) > size {
					chunkData = chunkData[:size]
				}
				out = append(out, chunkData...)
				i++ // skip data line
			}
		}
	}
	return out
}

// setupMockS3Server sets up an httptest server simulating S3 REST API for unit testing.
func setupMockS3Server(t *testing.T) (*httptest.Server, *Store) {
	type mockObject struct {
		data        []byte
		contentType string
		etag        string
	}

	var mu sync.RWMutex
	bucket := "product-review-media"
	objects := make(map[string]mockObject)
	var policyJSON string
	bucketExists := true

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Logf("MOCK S3 REQ: Method=%s, Path=%s, Query=%s, Host=%s", r.Method, r.URL.Path, r.URL.RawQuery, r.Host)
		mu.Lock()
		defer mu.Unlock()

		path := strings.TrimPrefix(r.URL.Path, "/")
		parts := strings.SplitN(path, "/", 2)
		reqBucket := parts[0]
		reqKey := ""
		if len(parts) > 1 {
			reqKey = parts[1]
		}

		if reqBucket != bucket {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		// Handle Bucket Operations (no key)
		if reqKey == "" {
			if !bucketExists {
				w.WriteHeader(http.StatusNotFound)
				return
			}

			// GET bucket location (?location=)
			if r.Method == http.MethodGet && r.URL.Query().Has("location") {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></LocationConstraint>`))
				return
			}

			// HEAD bucket (BucketExists)
			if r.Method == http.MethodHead {
				w.WriteHeader(http.StatusOK)
				return
			}

			// GET bucket policy (?policy=)
			if r.Method == http.MethodGet && r.URL.Query().Has("policy") {
				if policyJSON == "" {
					w.Header().Set("Content-Type", "application/xml")
					w.WriteHeader(http.StatusNotFound)
					_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchBucketPolicy</Code><Message>The bucket policy does not exist</Message></Error>`))
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(policyJSON))
				return
			}

			// POST delete multiple (?delete=)
			if r.Method == http.MethodPost && r.URL.Query().Has("delete") {
				body, _ := io.ReadAll(r.Body)
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>`)))
				_ = body
				return
			}

			w.WriteHeader(http.StatusOK)
			return
		}

		// Handle Object Operations
		switch r.Method {
		case http.MethodPut:
			rawBody, _ := io.ReadAll(r.Body)
			body := decodeAWSChunkedBody(rawBody)
			etag := fmt.Sprintf("\"%x\"", len(body))
			objects[reqKey] = mockObject{
				data:        body,
				contentType: r.Header.Get("Content-Type"),
				etag:        etag,
			}
			w.Header().Set("ETag", etag)
			w.WriteHeader(http.StatusOK)

		case http.MethodHead:
			obj, ok := objects[reqKey]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Header().Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
			w.Header().Set("Content-Length", fmt.Sprintf("%d", len(obj.data)))
			w.Header().Set("Content-Type", obj.contentType)
			w.Header().Set("ETag", obj.etag)
			w.WriteHeader(http.StatusOK)

		case http.MethodGet:
			obj, ok := objects[reqKey]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}

			w.Header().Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
			rangeHeader := r.Header.Get("Range")
			if rangeHeader != "" && strings.HasPrefix(rangeHeader, "bytes=") {
				var start, end int
				_, _ = fmt.Sscanf(rangeHeader, "bytes=%d-%d", &start, &end)
				if end >= len(obj.data) {
					end = len(obj.data) - 1
				}
				if start < 0 || start > end || start >= len(obj.data) {
					w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
					return
				}
				chunk := obj.data[start : end+1]
				w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, len(obj.data)))
				w.Header().Set("Content-Length", fmt.Sprintf("%d", len(chunk)))
				w.Header().Set("Content-Type", obj.contentType)
				w.Header().Set("ETag", obj.etag)
				w.WriteHeader(http.StatusPartialContent)
				_, _ = w.Write(chunk)
				return
			}

			w.Header().Set("Content-Length", fmt.Sprintf("%d", len(obj.data)))
			w.Header().Set("Content-Type", obj.contentType)
			w.Header().Set("ETag", obj.etag)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(obj.data)

		case http.MethodDelete:
			delete(objects, reqKey)
			w.WriteHeader(http.StatusNoContent)

		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	server := httptest.NewServer(handler)
	t.Cleanup(func() {
		server.Close()
	})

	endpoint := strings.TrimPrefix(server.URL, "http://")
	minioClient, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4("testaccess", "testsecret", ""),
		Secure: false,
	})
	if err != nil {
		t.Fatalf("failed to create minio client for test server: %v", err)
	}

	store := NewWithClient(minioClient, bucket)
	return server, store
}

func TestStore_S3Operations(t *testing.T) {
	_, store := setupMockS3Server(t)
	ctx := context.Background()

	// 1. CheckHealth
	if err := store.CheckHealth(ctx); err != nil {
		t.Fatalf("CheckHealth failed: %v", err)
	}

	// 2. ValidateBucketPrivate with no policy (NoSuchBucketPolicy) -> succeeds
	if err := store.ValidateBucketPrivate(ctx); err != nil {
		t.Fatalf("ValidateBucketPrivate with default private bucket failed: %v", err)
	}

	// 3. PutObject
	key := "reviews/uuid-abc/image-xyz"
	content := []byte("image binary payload webp")
	err := store.PutObject(ctx, key, bytes.NewReader(content), int64(len(content)), "image/webp")
	if err != nil {
		t.Fatalf("PutObject failed: %v", err)
	}

	// 4. StatObject
	info, err := store.StatObject(ctx, key)
	if err != nil {
		t.Fatalf("StatObject failed: %v", err)
	}
	if info.Key != key {
		t.Errorf("expected Key %q, got %q", key, info.Key)
	}
	if info.Size != int64(len(content)) {
		t.Errorf("expected Size %d, got %d", len(content), info.Size)
	}
	if info.ContentType != "image/webp" {
		t.Errorf("expected ContentType image/webp, got %q", info.ContentType)
	}

	// 5. GetObject
	rc, err := store.GetObject(ctx, key)
	if err != nil {
		t.Fatalf("GetObject failed: %v", err)
	}
	readBytes, err := io.ReadAll(rc)
	_ = rc.Close()
	if err != nil {
		t.Fatalf("read from GetObject failed: %v", err)
	}
	if !bytes.Equal(readBytes, content) {
		t.Errorf("expected content %q, got %q", string(content), string(readBytes))
	}

	// 6. GetObjectRange
	rangeRC, err := store.GetObjectRange(ctx, key, 0, 5)
	if err != nil {
		t.Fatalf("GetObjectRange failed: %v", err)
	}
	rangeBytes, err := io.ReadAll(rangeRC)
	_ = rangeRC.Close()
	if err != nil {
		t.Fatalf("read range failed: %v", err)
	}
	if string(rangeBytes) != "image" {
		t.Errorf("expected range 'image', got %q", string(rangeBytes))
	}

	// 7. StatObject on missing key
	_, err = store.StatObject(ctx, "reviews/missing/key")
	if err == nil {
		t.Error("expected error for missing key in StatObject")
	}

	// 8. GetObject on missing key (fails fast)
	_, err = store.GetObject(ctx, "reviews/missing/key")
	if err == nil {
		t.Error("expected error for missing key in GetObject")
	}

	// 9. RemoveObject
	if err := store.RemoveObject(ctx, key); err != nil {
		t.Fatalf("RemoveObject failed: %v", err)
	}
	_, err = store.StatObject(ctx, key)
	if err == nil {
		t.Error("expected StatObject to fail after RemoveObject")
	}

	// 10. RemoveObjects batch
	k1 := "reviews/uuid-1/media-1"
	k2 := "reviews/uuid-1/media-2"
	_ = store.PutObject(ctx, k1, strings.NewReader("1"), 1, "image/jpeg")
	_ = store.PutObject(ctx, k2, strings.NewReader("2"), 1, "image/jpeg")
	if err := store.RemoveObjects(ctx, []string{k1, k2}); err != nil {
		t.Fatalf("RemoveObjects failed: %v", err)
	}
}

func TestStore_ValidateBucketPrivate_PublicPolicyRejection(t *testing.T) {
	publicPolicy := `{
		"Version": "2012-10-17",
		"Statement": [
			{
				"Effect": "Allow",
				"Principal": "*",
				"Action": "s3:GetObject",
				"Resource": "arn:aws:s3:::product-review-media/*"
			}
		]
	}`

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Query().Has("location") {
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></LocationConstraint>`))
			return
		}
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method == http.MethodGet && r.URL.Query().Has("policy") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(publicPolicy))
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	endpoint := strings.TrimPrefix(server.URL, "http://")
	minioClient, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4("testaccess", "testsecret", ""),
		Secure: false,
	})
	if err != nil {
		t.Fatalf("failed to create minio client: %v", err)
	}

	store := NewWithClient(minioClient, "product-review-media")
	err = store.ValidateBucketPrivate(context.Background())
	if err == nil {
		t.Fatal("expected ValidateBucketPrivate to reject public bucket policy, got nil")
	}
	if !strings.Contains(err.Error(), "allows anonymous read") && !strings.Contains(err.Error(), "must be private") {
		t.Errorf("expected error about anonymous read / private requirement, got: %v", err)
	}
}

func TestStore_ValidateBucketPrivate_NonExistentBucket(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	endpoint := strings.TrimPrefix(server.URL, "http://")
	minioClient, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4("testaccess", "testsecret", ""),
		Secure: false,
	})
	if err != nil {
		t.Fatalf("failed to create minio client: %v", err)
	}

	store := NewWithClient(minioClient, "non-existent-bucket")
	err = store.ValidateBucketPrivate(context.Background())
	if err == nil {
		t.Fatal("expected ValidateBucketPrivate to reject non-existent bucket, got nil")
	}
	if !strings.Contains(err.Error(), "does not exist") {
		t.Errorf("expected 'does not exist' error, got: %v", err)
	}
}
