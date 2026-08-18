package jwt

import (
	"testing"
	"time"
)

func TestJWT_GenerateAndParseWithRole(t *testing.T) {
	secret := "a-secret-that-is-at-least-thirty-two-characters"
	mgr := NewManager(secret, "test-issuer")

	token, err := mgr.GenerateAccessToken("user-1", "admin", time.Minute)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	userID, role, err := mgr.ParseAccessToken(token)
	if err != nil {
		t.Fatalf("unexpected error parsing token: %v", err)
	}
	if userID != "user-1" {
		t.Fatalf("expected userID user-1, got %s", userID)
	}
	if role != "admin" {
		t.Fatalf("expected role admin, got %s", role)
	}
}

func TestJWT_ParseInvalidToken(t *testing.T) {
	secret := "a-secret-that-is-at-least-thirty-two-characters"
	mgr := NewManager(secret, "test-issuer")

	_, _, err := mgr.ParseAccessToken("invalid-token")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}
