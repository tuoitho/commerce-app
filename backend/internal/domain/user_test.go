package domain

import (
	"encoding/json"
	"testing"
	"time"
)

func TestUser_Public_IncludesRole(t *testing.T) {
	u := &User{
		ID:           "u123",
		Email:        "admin@example.com",
		PasswordHash: "hash",
		Role:         RoleAdmin,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	pub := u.Public()
	if pub.ID != "u123" {
		t.Fatalf("expected ID u123, got %s", pub.ID)
	}
	if pub.Email != "admin@example.com" {
		t.Fatalf("expected Email admin@example.com, got %s", pub.Email)
	}
	if pub.Role != RoleAdmin {
		t.Fatalf("expected Role admin, got %s", pub.Role)
	}

	data, err := json.Marshal(pub)
	if err != nil {
		t.Fatalf("json marshal failed: %v", err)
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("json unmarshal failed: %v", err)
	}
	if raw["role"] != "admin" {
		t.Fatalf("expected serialized role to be 'admin', got %v", raw["role"])
	}
}
