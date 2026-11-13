package http

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"
)

var userMgmtSnapshotPath = filepath.Join("..", "..", "..", "..", ".dream", "specs", "admin-user-management", "contract-snapshots.json")

// Requirement 5.5: a locked account with the correct password receives 403 account_locked.
func TestLoginHandler_LockedAccount(t *testing.T) {
	router, users := newTestRouter(t)
	doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "locked@example.com", "password": "password123",
	})
	user, err := users.GetByEmail(context.Background(), "locked@example.com")
	if err != nil {
		t.Fatal(err)
	}
	users.Lock(user.ID)

	body := map[string]string{"email": "locked@example.com", "password": "password123"}
	w, cookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/login", body)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var env struct {
		Success bool `json:"success"`
		Error   struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if env.Success || env.Error.Code != "account_locked" {
		t.Fatalf("unexpected envelope: %s", w.Body.String())
	}
	if env.Error.Message != "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ." {
		t.Fatalf("unexpected message: %q", env.Error.Message)
	}
	if refreshCookie(cookies) != nil {
		t.Fatal("expected no refresh cookie for a locked account")
	}

	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, "admin-user-management", "login_account_locked_403",
		"API-AUTH-LOCKED@1", "POST /api/v1/auth/login", map[string]string{"email": "locked@example.com", "password": "<redacted>"}, w)
}

// Requirement 5.5 (PD-5): wrong password on a locked account keeps invalid_credentials.
func TestLoginHandler_LockedAccountWrongPassword(t *testing.T) {
	router, users := newTestRouter(t)
	doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "locked@example.com", "password": "password123",
	})
	user, err := users.GetByEmail(context.Background(), "locked@example.com")
	if err != nil {
		t.Fatal(err)
	}
	users.Lock(user.ID)

	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email": "locked@example.com", "password": "wrongpass1",
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

// Requirement 5.4: refresh of a locked account is rejected with invalid_token.
func TestRefreshHandler_LockedAccount(t *testing.T) {
	router, users := newTestRouter(t)
	_, cookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "locked@example.com", "password": "password123",
	})
	user, err := users.GetByEmail(context.Background(), "locked@example.com")
	if err != nil {
		t.Fatal(err)
	}
	users.Lock(user.ID)

	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/refresh", nil, refreshCookie(cookies))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var env struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if env.Error.Code != "invalid_token" {
		t.Fatalf("expected invalid_token, got %q", env.Error.Code)
	}
}
