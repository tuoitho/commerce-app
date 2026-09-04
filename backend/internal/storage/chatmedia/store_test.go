package chatmedia

import (
	"context"
	"strings"
	"testing"

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
			MinioEndpoint:   "localhost:19000",
			MinioAccessKey:  "access",
			MinioSecretKey:  "secret",
			MinioChatBucket: "custom-chat-bucket",
			MinioUseSSL:     false,
		}
		store, err := New(cfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if store == nil {
			t.Fatal("expected non-nil store")
		}
		if store.bucket != "custom-chat-bucket" {
			t.Errorf("expected bucket custom-chat-bucket, got %q", store.bucket)
		}
	})

	t.Run("empty bucket falls back to default", func(t *testing.T) {
		cfg := &config.Config{
			MinioEndpoint:   "localhost:19000",
			MinioAccessKey:  "access",
			MinioSecretKey:  "secret",
			MinioChatBucket: "",
			MinioUseSSL:     false,
		}
		store, err := New(cfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if store.bucket != "chat-media" {
			t.Errorf("expected default bucket chat-media, got %q", store.bucket)
		}
	})
}

func TestStore_InputValidation(t *testing.T) {
	store := NewWithClient(nil, "chat-media")
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

		_, err = store.GetObjectRange(ctx, "key", 0, 0)
		if err == nil || !strings.Contains(err.Error(), "invalid range") {
			t.Errorf("expected invalid range error for zero length, got %v", err)
		}

		_, err = store.GetObjectRange(ctx, "  ", 0, 10)
		if err == nil || !strings.Contains(err.Error(), "objectKey is required") {
			t.Errorf("expected objectKey is required error, got %v", err)
		}
	})

	t.Run("RemoveObject empty key", func(t *testing.T) {
		err := store.RemoveObject(ctx, " ")
		if err != nil {
			t.Errorf("expected nil for empty key, got %v", err)
		}
	})

	t.Run("RemoveObjects empty list", func(t *testing.T) {
		err := store.RemoveObjects(ctx, nil)
		if err != nil {
			t.Errorf("expected nil for empty list, got %v", err)
		}
	})
}

func TestPolicy_IsPolicyAllowingAnonymousRead(t *testing.T) {
	t.Run("empty policy string is safe", func(t *testing.T) {
		public, err := IsPolicyAllowingAnonymousRead("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if public {
			t.Error("expected false for empty policy")
		}
	})

	t.Run("public anonymous read allowed", func(t *testing.T) {
		policy := `{
			"Version": "2012-10-17",
			"Statement": [
				{
					"Effect": "Allow",
					"Principal": "*",
					"Action": "s3:GetObject",
					"Resource": "arn:aws:s3:::chat-media/*"
				}
			]
		}`
		public, err := IsPolicyAllowingAnonymousRead(policy)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !public {
			t.Error("expected true for public policy")
		}
	})

	t.Run("deny effect is not public", func(t *testing.T) {
		policy := `{
			"Version": "2012-10-17",
			"Statement": [
				{
					"Effect": "Deny",
					"Principal": "*",
					"Action": "s3:GetObject",
					"Resource": "arn:aws:s3:::chat-media/*"
				}
			]
		}`
		public, err := IsPolicyAllowingAnonymousRead(policy)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if public {
			t.Error("expected false for deny policy")
		}
	})

	t.Run("invalid json returns error", func(t *testing.T) {
		_, err := IsPolicyAllowingAnonymousRead("not-json")
		if err == nil {
			t.Error("expected error for invalid json")
		}
	})
}
