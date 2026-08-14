package auth

import (
	"context"
	"fmt"
	"testing"
	"time"

	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/usecase/auth/fakerepos"
)

const testSecret = "a-secret-that-is-at-least-thirty-two-characters"

func hashPassword(s string) (string, error) { return s + "_hash", nil }
func checkPassword(p, h string) bool        { return h == p+"_hash" }

func newTestEnv(t *testing.T) (*UseCase, *fakerepos.Users) {
	t.Helper()
	users := fakerepos.NewUsers()
	sessions := fakerepos.NewSessions(users)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	uc := New(Dependencies{
		Repos:         Repositories{Users: users, Sessions: sessions},
		JWT:           manager,
		AccessTTL:     15 * time.Minute,
		RefreshTTL:    24 * time.Hour,
		HashPassword:  hashPassword,
		CheckPassword: checkPassword,
		GenerateRefreshToken: func() (security.RefreshTokenPair, error) {
			return security.GenerateRefreshToken()
		},
	})
	return uc, users
}

func registerUser(t *testing.T, uc *UseCase, email string) {
	t.Helper()
	if _, err := uc.Register(context.Background(), email, "password123"); err != nil {
		t.Fatalf("register: %v", err)
	}
}

func registerSession(t *testing.T, uc *UseCase) *Session {
	t.Helper()
	sess, err := uc.Register(context.Background(), fmt.Sprintf("user%d@example.com", time.Now().UnixNano()), "password123")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	return sess
}
