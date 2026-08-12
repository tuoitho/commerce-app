package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
)

func TestRegister_Success(t *testing.T) {
	uc, _ := newTestEnv(t)
	sess, err := uc.Register(context.Background(), "user@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	if sess.User.Email != "user@example.com" {
		t.Fatalf("email = %q", sess.User.Email)
	}
	if sess.User.ID == "" {
		t.Fatal("empty user id")
	}
	if sess.AccessToken == "" || sess.RefreshToken == "" {
		t.Fatal("expected tokens")
	}
}

func TestRegister_InvalidEmail(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.Register(context.Background(), "not-an-email", "password123")
	var ve *domain.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected validation error, got %v", err)
	}
	if ve.Fields["email"] == "" {
		t.Fatal("expected email field error")
	}
}

func TestRegister_ShortPassword(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.Register(context.Background(), "user@example.com", "short")
	var ve *domain.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected validation error, got %v", err)
	}
	if ve.Fields["password"] == "" {
		t.Fatal("expected password field error")
	}
}

func TestRegister_DuplicateEmail(t *testing.T) {
	uc, _ := newTestEnv(t)
	registerUser(t, uc, "user@example.com")
	_, err := uc.Register(context.Background(), "user@example.com", "password123")
	if !errors.Is(err, domain.ErrEmailInUse) {
		t.Fatalf("expected ErrEmailInUse, got %v", err)
	}
}

func TestLogin_Success(t *testing.T) {
	uc, _ := newTestEnv(t)
	registerUser(t, uc, "user@example.com")
	sess, err := uc.Login(context.Background(), "user@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	if sess.User.Email != "user@example.com" {
		t.Fatalf("email = %q", sess.User.Email)
	}
	if sess.AccessToken == "" || sess.RefreshToken == "" {
		t.Fatal("expected tokens")
	}
}

func TestLogin_UnknownEmail(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.Login(context.Background(), "nobody@example.com", "password123")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	uc, _ := newTestEnv(t)
	registerUser(t, uc, "user@example.com")
	_, err := uc.Login(context.Background(), "user@example.com", "wrongpass1")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestRefresh_Success(t *testing.T) {
	uc, _ := newTestEnv(t)
	old := registerSession(t, uc)
	newSess, err := uc.Refresh(context.Background(), old.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if newSess.AccessToken == "" || newSess.RefreshToken == "" {
		t.Fatal("expected new tokens")
	}
	tk, _, err := uc.repos.Sessions.GetRefreshTokenByHash(context.Background(), security.HashRefreshToken(old.RefreshToken))
	if err != nil {
		t.Fatalf("lookup old token: %v", err)
	}
	if tk.RevokedAt == nil {
		t.Fatal("old refresh token should be revoked after rotation")
	}
}

func TestRefresh_Expired(t *testing.T) {
	uc, _ := newTestEnv(t)
	registerUser(t, uc, "user@example.com")
	pair, err := security.GenerateRefreshToken()
	if err != nil {
		t.Fatal(err)
	}
	expiredAt := time.Now().Add(-1 * time.Hour)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	accessToken, err := manager.GenerateAccessToken("1", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	_ = accessToken
	if _, err := uc.repos.Sessions.CreateRefreshToken(context.Background(), "1", pair.Hash, expiredAt); err != nil {
		t.Fatal(err)
	}
	_, err = uc.Refresh(context.Background(), pair.Plaintext)
	if !errors.Is(err, domain.ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken for expired refresh token, got %v", err)
	}
}

func TestRefresh_Revoked(t *testing.T) {
	uc, _ := newTestEnv(t)
	old := registerSession(t, uc)
	if err := uc.Logout(context.Background(), old.RefreshToken); err != nil {
		t.Fatal(err)
	}
	_, err := uc.Refresh(context.Background(), old.RefreshToken)
	if !errors.Is(err, domain.ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken for revoked token, got %v", err)
	}
}

func TestRefresh_Unknown(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.Refresh(context.Background(), "unknown-plaintext")
	if !errors.Is(err, domain.ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken for unknown token, got %v", err)
	}
}

func TestLogout_Revokes(t *testing.T) {
	uc, _ := newTestEnv(t)
	old := registerSession(t, uc)
	if err := uc.Logout(context.Background(), old.RefreshToken); err != nil {
		t.Fatal(err)
	}
	tk, _, err := uc.repos.Sessions.GetRefreshTokenByHash(context.Background(), security.HashRefreshToken(old.RefreshToken))
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if tk.RevokedAt == nil {
		t.Fatal("expected token revoked after logout")
	}
}

func TestLogout_UnknownTokenNoError(t *testing.T) {
	uc, _ := newTestEnv(t)
	if err := uc.Logout(context.Background(), "whatever"); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestMe_ReturnsUser(t *testing.T) {
	uc, users := newTestEnv(t)
	registerUser(t, uc, "user@example.com")
	id := users.ByID("1").ID
	me, err := uc.Me(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if me.Email != "user@example.com" {
		t.Fatalf("email = %q", me.Email)
	}
}

func TestMe_UnknownUser(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.Me(context.Background(), "999")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}