//go:build integration

package repository

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
)

func startAuthRecoveryIntegrationDB(t *testing.T) (*pgx.Conn, *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	container, err := postgres.Run(
		ctx,
		"postgres:17.6-alpine",
		postgres.WithDatabase("commerce"),
		postgres.WithUsername("commerce"),
		postgres.WithPassword("commerce"),
	)
	if err != nil {
		t.Fatalf("Docker/Testcontainers is required: %v", err)
	}
	t.Cleanup(func() {
		if err := testcontainers.TerminateContainer(container); err != nil {
			t.Errorf("terminate container: %v", err)
		}
	})
	dbURL, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	conn := connectIntegrationDB(t, ctx, dbURL)
	t.Cleanup(func() { _ = conn.Close(ctx) })

	for _, name := range upMigrationNames(t) {
		applyMigration(t, ctx, conn, name)
	}

	pool, err := pgxpool.New(ctx, dbURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return conn, pool
}

func execMigrationFile(t *testing.T, ctx context.Context, conn *pgx.Conn, filename string) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "db", "migrations", filename))
	require.NoError(t, err, "read migration %s", filename)
	_, err = conn.Exec(ctx, string(raw))
	require.NoError(t, err, "exec migration %s", filename)
}

// DB-AUTH-RECOVERY@1: migration 000025 up -> down -> up round-trip & constraints.
func TestAuthRecovery_Migration000025RoundTripAndConstraints(t *testing.T) {
	ctx := context.Background()
	conn, _ := startAuthRecoveryIntegrationDB(t)

	// Table and indexes exist after up migrations
	var tblExists bool
	require.NoError(t, conn.QueryRow(ctx, `SELECT to_regclass('public.password_reset_otps') IS NOT NULL`).Scan(&tblExists))
	require.True(t, tblExists, "password_reset_otps should exist after up migration")

	// Down migration removes table & indexes cleanly
	execMigrationFile(t, ctx, conn, "000025_auth_password_recovery.down.sql")
	require.NoError(t, conn.QueryRow(ctx, `SELECT to_regclass('public.password_reset_otps') IS NOT NULL`).Scan(&tblExists))
	require.False(t, tblExists, "password_reset_otps should be dropped after down migration")

	// Re-apply up migration
	execMigrationFile(t, ctx, conn, "000025_auth_password_recovery.up.sql")
	require.NoError(t, conn.QueryRow(ctx, `SELECT to_regclass('public.password_reset_otps') IS NOT NULL`).Scan(&tblExists))
	require.True(t, tblExists, "password_reset_otps should exist after re-applying up migration")

	// Verify attempts CHECK (attempts >= 0 AND attempts <= 5)
	_, err := conn.Exec(ctx, `INSERT INTO password_reset_otps (email, attempts, expires_at) VALUES ('check@example.com', -1, now() + interval '10m')`)
	require.Error(t, err, "negative attempts must violate check constraint")
	_, err = conn.Exec(ctx, `INSERT INTO password_reset_otps (email, attempts, expires_at) VALUES ('check@example.com', 6, now() + interval '10m')`)
	require.Error(t, err, "attempts > 5 must violate check constraint")
}

// Requirements 3.2, 3.3: anti-enumeration, rate limiting (5/15m), prior OTP invalidation, and concurrency.
func TestPasswordResetRepository_CreateChallengeAndRateLimit(t *testing.T) {
	ctx := context.Background()
	conn, pool := startAuthRecoveryIntegrationDB(t)
	users := NewUserRepository(pool)
	resets := NewPasswordResetRepository(pool)

	activeEmail := "active.recovery@example.com"
	activeUser, err := users.Create(ctx, activeEmail, "old_hash", domain.RoleCustomer)
	require.NoError(t, err)

	lockedEmail := "locked.recovery@example.com"
	lockedUser, err := users.Create(ctx, lockedEmail, "old_hash", domain.RoleCustomer)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `UPDATE users SET status = 'locked', locked_at = now() WHERE id = $1`, lockedUser.ID)
	require.NoError(t, err)

	missingEmail := "nobody.recovery@example.com"

	// 1. Unknown and locked emails record NULL user_id/otp_hash, return ShouldSend=false, and enforce 5/15m limit.
	for _, email := range []string{missingEmail, lockedEmail} {
		for i := 0; i < 5; i++ {
			res, err := resets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
				Email:       email,
				OTPHash:     fmt.Sprintf("hash-%d", i),
				ExpiresAt:   time.Now().Add(10 * time.Minute),
				WindowStart: time.Now().Add(-15 * time.Minute),
				MaxRequests: 5,
			})
			require.NoError(t, err)
			assert.False(t, res.ShouldSend)
			assert.NotEmpty(t, res.RecordID)
		}
		_, err := resets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
			Email:       email,
			OTPHash:     "hash-6",
			ExpiresAt:   time.Now().Add(10 * time.Minute),
			WindowStart: time.Now().Add(-15 * time.Minute),
			MaxRequests: 5,
		})
		require.ErrorIs(t, err, domain.ErrOTPRateLimited)

		var nullSecretCount int
		require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM password_reset_otps WHERE email = $1 AND user_id IS NULL AND otp_hash IS NULL`, email).Scan(&nullSecretCount))
		assert.Equal(t, 5, nullSecretCount)
	}

	// 2. Active user: issuing 2nd challenge invalidates 1st; DeleteChallenge frees rate-limit slot.
	c1, err := resets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
		Email:       activeEmail,
		OTPHash:     "otp-hash-1",
		ExpiresAt:   time.Now().Add(10 * time.Minute),
		WindowStart: time.Now().Add(-15 * time.Minute),
		MaxRequests: 5,
	})
	require.NoError(t, err)
	assert.True(t, c1.ShouldSend)
	assert.Equal(t, activeEmail, c1.RecipientEmail)

	c2, err := resets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
		Email:       "ACTIVE.RECOVERY@example.com",
		OTPHash:     "otp-hash-2",
		ExpiresAt:   time.Now().Add(10 * time.Minute),
		WindowStart: time.Now().Add(-15 * time.Minute),
		MaxRequests: 5,
	})
	require.NoError(t, err)
	assert.True(t, c2.ShouldSend)

	var c1Consumed bool
	require.NoError(t, conn.QueryRow(ctx, `SELECT consumed_at IS NOT NULL FROM password_reset_otps WHERE id = $1`, c1.RecordID).Scan(&c1Consumed))
	assert.True(t, c1Consumed, "previous active OTP must be invalidated when new OTP is issued")

	// Deleting c2 (simulating SMTP failure) reduces count back to 1
	require.NoError(t, resets.DeleteChallenge(ctx, c2.RecordID))
	var cntAfterDelete int
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM password_reset_otps WHERE email = $1`, activeEmail).Scan(&cntAfterDelete))
	assert.Equal(t, 1, cntAfterDelete)
	_ = activeUser

	// 3. Concurrent requests for another email cannot exceed MaxRequests=5.
	concEmail := "concurrent.recovery@example.com"
	_, err = users.Create(ctx, concEmail, "hash", domain.RoleCustomer)
	require.NoError(t, err)

	var wg sync.WaitGroup
	var succeeded atomic.Int32
	var rateLimited atomic.Int32
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, err := resets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
				Email:       concEmail,
				OTPHash:     fmt.Sprintf("conc-hash-%d", idx),
				ExpiresAt:   time.Now().Add(10 * time.Minute),
				WindowStart: time.Now().Add(-15 * time.Minute),
				MaxRequests: 5,
			})
			if err == nil {
				succeeded.Add(1)
			} else if err == domain.ErrOTPRateLimited {
				rateLimited.Add(1)
			} else {
				t.Errorf("unexpected error: %v", err)
			}
		}(i)
	}
	wg.Wait()
	assert.Equal(t, int32(5), succeeded.Load())
	assert.Equal(t, int32(5), rateLimited.Load())

	// 4. Records older than 15m do not count toward rate limit.
	_, err = conn.Exec(ctx, `UPDATE password_reset_otps SET created_at = now() - interval '16 minutes' WHERE email = $1`, concEmail)
	require.NoError(t, err)
	afterWindow, err := resets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
		Email:       concEmail,
		OTPHash:     "after-window-hash",
		ExpiresAt:   time.Now().Add(10 * time.Minute),
		WindowStart: time.Now().Add(-15 * time.Minute),
		MaxRequests: 5,
	})
	require.NoError(t, err)
	assert.True(t, afterWindow.ShouldSend)
}

// Requirement 3.4: 5 wrong attempts lock out OTP; valid OTP updates password + consumes OTP + revokes all refresh tokens atomically.
func TestPasswordResetRepository_VerifyAndResetPassword(t *testing.T) {
	ctx := context.Background()
	conn, pool := startAuthRecoveryIntegrationDB(t)
	users := NewUserRepository(pool)
	sessions := NewSessionRepository(pool)
	resets := NewPasswordResetRepository(pool)

	email := "reset.user@example.com"
	oldHash, err := security.HashPassword("OldPassword123")
	require.NoError(t, err)
	u, err := users.Create(ctx, email, oldHash, domain.RoleCustomer)
	require.NoError(t, err)

	// Create 2 active refresh tokens
	p1, err := security.GenerateRefreshToken()
	require.NoError(t, err)
	p2, err := security.GenerateRefreshToken()
	require.NoError(t, err)
	_, err = sessions.CreateRefreshToken(ctx, u.ID, p1.Hash, time.Now().Add(time.Hour))
	require.NoError(t, err)
	_, err = sessions.CreateRefreshToken(ctx, u.ID, p2.Hash, time.Now().Add(time.Hour))
	require.NoError(t, err)

	// 1. 5 wrong attempts invalidate the OTP
	c1, err := resets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
		Email:       email,
		OTPHash:     "expected-hmac-1",
		ExpiresAt:   time.Now().Add(10 * time.Minute),
		WindowStart: time.Now().Add(-15 * time.Minute),
		MaxRequests: 5,
	})
	require.NoError(t, err)

	for i := 0; i < 5; i++ {
		err := resets.VerifyAndResetPassword(ctx, domain.VerifyPasswordResetInput{
			Email:           email,
			ExpectedOTPHash: "wrong-hmac",
			NewPasswordHash: "new-hash",
			MaxAttempts:     5,
			Now:             time.Now(),
		})
		require.ErrorIs(t, err, domain.ErrInvalidOrExpiredOTP)
	}

	var attempts int
	var consumed bool
	require.NoError(t, conn.QueryRow(ctx, `SELECT attempts, consumed_at IS NOT NULL FROM password_reset_otps WHERE id = $1`, c1.RecordID).Scan(&attempts, &consumed))
	assert.Equal(t, 5, attempts)
	assert.True(t, consumed, "5th failed attempt must consume/invalidate OTP")

	// Even the right OTP is rejected once attempts == 5
	err = resets.VerifyAndResetPassword(ctx, domain.VerifyPasswordResetInput{
		Email:           email,
		ExpectedOTPHash: "expected-hmac-1",
		NewPasswordHash: "new-hash",
		MaxAttempts:     5,
		Now:             time.Now(),
	})
	require.ErrorIs(t, err, domain.ErrInvalidOrExpiredOTP)

	// 2. Expired OTP is rejected
	_, err = resets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
		Email:       email,
		OTPHash:     "expected-hmac-expired",
		ExpiresAt:   time.Now().Add(-1 * time.Minute),
		WindowStart: time.Now().Add(-15 * time.Minute),
		MaxRequests: 5,
	})
	require.NoError(t, err)
	err = resets.VerifyAndResetPassword(ctx, domain.VerifyPasswordResetInput{
		Email:           email,
		ExpectedOTPHash: "expected-hmac-expired",
		NewPasswordHash: "new-hash",
		MaxAttempts:     5,
		Now:             time.Now(),
	})
	require.ErrorIs(t, err, domain.ErrInvalidOrExpiredOTP)

	// 3. Valid OTP atomically updates password, consumes OTP, and revokes all refresh tokens
	c3, err := resets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
		Email:       email,
		OTPHash:     "expected-hmac-valid",
		ExpiresAt:   time.Now().Add(10 * time.Minute),
		WindowStart: time.Now().Add(-15 * time.Minute),
		MaxRequests: 5,
	})
	require.NoError(t, err)

	newHash, err := security.HashPassword("NewPassword123!")
	require.NoError(t, err)
	err = resets.VerifyAndResetPassword(ctx, domain.VerifyPasswordResetInput{
		Email:           email,
		ExpectedOTPHash: "expected-hmac-valid",
		NewPasswordHash: newHash,
		MaxAttempts:     5,
		Now:             time.Now(),
	})
	require.NoError(t, err)

	updatedUser, err := users.GetByID(ctx, u.ID)
	require.NoError(t, err)
	assert.True(t, security.CheckPassword("NewPassword123!", updatedUser.PasswordHash))

	var c3Consumed bool
	require.NoError(t, conn.QueryRow(ctx, `SELECT consumed_at IS NOT NULL FROM password_reset_otps WHERE id = $1`, c3.RecordID).Scan(&c3Consumed))
	assert.True(t, c3Consumed)

	t1, _, err := sessions.GetRefreshTokenByHash(ctx, p1.Hash)
	require.NoError(t, err)
	assert.NotNil(t, t1.RevokedAt, "refresh token 1 must be revoked")
	t2, _, err := sessions.GetRefreshTokenByHash(ctx, p2.Hash)
	require.NoError(t, err)
	assert.NotNil(t, t2.RevokedAt, "refresh token 2 must be revoked")
}
