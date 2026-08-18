package auth

import (
	"context"
	"testing"

	"commerce-backend/internal/domain"
)

func TestBootstrapAdmin_Success(t *testing.T) {
	uc, users := newTestEnv(t)

	err := uc.BootstrapAdmin(context.Background(), "admin@example.com", "adminpassword123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	u, err := users.GetByEmail(context.Background(), "admin@example.com")
	if err != nil {
		t.Fatalf("failed to find bootstrapped admin: %v", err)
	}
	if u.Role != domain.RoleAdmin {
		t.Fatalf("expected role %s, got %s", domain.RoleAdmin, u.Role)
	}

	// Verify the admin can login
	sess, err := uc.Login(context.Background(), "admin@example.com", "adminpassword123")
	if err != nil {
		t.Fatalf("login as bootstrapped admin failed: %v", err)
	}
	if sess.User.Role != domain.RoleAdmin {
		t.Fatalf("expected session role %s, got %s", domain.RoleAdmin, sess.User.Role)
	}
}

func TestBootstrapAdmin_Idempotent_ReRunningSameConfig(t *testing.T) {
	uc, users := newTestEnv(t)

	err := uc.BootstrapAdmin(context.Background(), "admin@example.com", "adminpassword123")
	if err != nil {
		t.Fatalf("first bootstrap error: %v", err)
	}

	// Re-running the same config does not error or create duplicate
	err = uc.BootstrapAdmin(context.Background(), "admin@example.com", "adminpassword123")
	if err != nil {
		t.Fatalf("second bootstrap error: %v", err)
	}

	count, err := users.CountByRole(context.Background(), domain.RoleAdmin)
	if err != nil {
		t.Fatalf("count error: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 admin, got %d", count)
	}
}

func TestBootstrapAdmin_AdminAlreadyExists(t *testing.T) {
	uc, users := newTestEnv(t)

	// Create an existing admin first
	_, err := users.Create(context.Background(), "existing_admin@example.com", "hash", domain.RoleAdmin)
	if err != nil {
		t.Fatalf("failed to create existing admin: %v", err)
	}

	// Bootstrap with different credentials
	err = uc.BootstrapAdmin(context.Background(), "new_admin@example.com", "adminpassword123")
	if err != nil {
		t.Fatalf("bootstrap error: %v", err)
	}

	// Should not create new admin since an admin already exists
	count, err := users.CountByRole(context.Background(), domain.RoleAdmin)
	if err != nil {
		t.Fatalf("count error: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 admin, got %d", count)
	}
	_, err = users.GetByEmail(context.Background(), "new_admin@example.com")
	if err != domain.ErrNotFound {
		t.Fatalf("expected ErrNotFound for new_admin, got %v", err)
	}
}

func TestBootstrapAdmin_EmptyCredentials(t *testing.T) {
	uc, users := newTestEnv(t)

	if err := uc.BootstrapAdmin(context.Background(), "", "password"); err != nil {
		t.Fatalf("unexpected error on empty email: %v", err)
	}
	if err := uc.BootstrapAdmin(context.Background(), "admin@example.com", ""); err != nil {
		t.Fatalf("unexpected error on empty password: %v", err)
	}

	count, _ := users.CountByRole(context.Background(), domain.RoleAdmin)
	if count != 0 {
		t.Fatalf("expected 0 admins, got %d", count)
	}
}
