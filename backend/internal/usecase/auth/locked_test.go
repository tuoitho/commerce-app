package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/usecase/auth/fakerepos"
)

func newLockTestEnv(t *testing.T) (*UseCase, *fakerepos.Users, *fakerepos.Sessions) {
	t.Helper()
	users := fakerepos.NewUsers()
	sessions := fakerepos.NewSessions(users)
	uc := New(Dependencies{
		Repos:         Repositories{Users: users, Sessions: sessions},
		JWT:           jwt.NewManager(testSecret, "commerce-backend"),
		AccessTTL:     15 * time.Minute,
		RefreshTTL:    24 * time.Hour,
		HashPassword:  hashPassword,
		CheckPassword: checkPassword,
		GenerateRefreshToken: func() (security.RefreshTokenPair, error) {
			return security.GenerateRefreshToken()
		},
	})
	return uc, users, sessions
}

// Requirement 5.5: a locked account with the correct password gets account_locked and no session.
func TestLogin_LockedAccountWithCorrectPassword(t *testing.T) {
	uc, users, sessions := newLockTestEnv(t)
	sess, err := uc.Register(context.Background(), "locked@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	users.Lock(sess.User.ID)
	before := sessions.ActiveTokenCount(sess.User.ID)

	_, err = uc.Login(context.Background(), "locked@example.com", "password123")
	if !errors.Is(err, domain.ErrAccountLocked) {
		t.Fatalf("expected ErrAccountLocked, got %v", err)
	}
	if after := sessions.ActiveTokenCount(sess.User.ID); after != before {
		t.Fatalf("expected no new refresh token, active tokens went from %d to %d", before, after)
	}
}

// Requirement 5.5 (PD-5): a wrong password never reveals the lock state.
func TestLogin_LockedAccountWithWrongPassword(t *testing.T) {
	uc, users, _ := newLockTestEnv(t)
	sess, err := uc.Register(context.Background(), "locked@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	users.Lock(sess.User.ID)

	_, err = uc.Login(context.Background(), "locked@example.com", "wrong-password")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

// Requirements 5.4, 5.6: an unrevoked refresh token of a locked account cannot be refreshed.
func TestRefresh_LockedAccountRejected(t *testing.T) {
	uc, users, _ := newLockTestEnv(t)
	sess, err := uc.Register(context.Background(), "locked@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	users.Lock(sess.User.ID)

	_, err = uc.Refresh(context.Background(), sess.RefreshToken)
	if !errors.Is(err, domain.ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

// Requirement 6.3: once unlocked the account logs in with its existing password.
func TestLogin_UnlockedAccountSucceeds(t *testing.T) {
	uc, users, _ := newLockTestEnv(t)
	sess, err := uc.Register(context.Background(), "locked@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	users.Lock(sess.User.ID)
	users.Unlock(sess.User.ID)

	if _, err := uc.Login(context.Background(), "locked@example.com", "password123"); err != nil {
		t.Fatalf("expected login to succeed after unlock, got %v", err)
	}
}

// Requirement 5.4: logout of a locked account keeps returning success.
func TestLogout_LockedAccountNoError(t *testing.T) {
	uc, users, _ := newLockTestEnv(t)
	sess, err := uc.Register(context.Background(), "locked@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	users.Lock(sess.User.ID)

	if err := uc.Logout(context.Background(), sess.RefreshToken); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}
