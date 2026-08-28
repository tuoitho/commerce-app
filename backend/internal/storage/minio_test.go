package storage

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"commerce-backend/internal/config"
)

func TestMinIOStorage_GetObjectKeepsStreamReadable(t *testing.T) {
	const content = "review-media-bytes"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, locationRequest := r.URL.Query()["location"]; locationRequest {
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, `<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>`)
			return
		}
		w.Header().Set("Content-Length", "18")
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("ETag", `"test-etag"`)
		w.Header().Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
		if r.Method == http.MethodGet {
			_, _ = io.WriteString(w, content)
		}
	}))
	defer server.Close()

	store, err := NewMinIOStorage(&config.Config{
		MinIOEndpoint:       strings.TrimPrefix(server.URL, "http://"),
		MinIOAccessKey:      "test-access-key",
		MinIOSecretKey:      "test-secret-key",
		MinIOBucket:         "product-reviews",
		MinIORequestTimeout: time.Second,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}

	obj, err := store.GetObject(context.Background(), "reviews/op/media", -1, -1)
	if err != nil {
		t.Fatalf("get object: %v", err)
	}
	defer obj.Body.Close()

	got, err := io.ReadAll(obj.Body)
	if err != nil {
		t.Fatalf("read returned body: %v", err)
	}
	if string(got) != content {
		t.Fatalf("body = %q, want %q", got, content)
	}
}
