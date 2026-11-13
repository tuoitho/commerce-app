//go:build integration

package repository

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
)

// beginUserAdminTx opens a transaction that is rolled back when the test ends,
// so fixtures never leak into the shared development database.
func beginUserAdminTx(t *testing.T) (context.Context, pgx.Tx) {
	t.Helper()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, integrationDatabaseURL())
	require.NoError(t, err, "connect pgx")
	tx, err := conn.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = tx.Rollback(ctx)
		_ = conn.Close(ctx)
	})
	return ctx, tx
}

func uniqueEmailToken() string {
	return fmt.Sprintf("it%d", time.Now().UnixNano())
}

// Requirements 7.1, 7.2, 7.4: accounts are created active with no lock data.
func TestUserStatus_NewAccountsAreActive(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	users := NewUserRepository(tx)

	for _, role := range []string{domain.RoleCustomer, domain.RoleAdmin} {
		created, err := users.Create(ctx, uniqueEmailToken()+"@example.com", "hash", role)
		require.NoError(t, err)
		assert.Equal(t, domain.UserStatusActive, created.Status)
		assert.Nil(t, created.LockedAt)
		assert.Nil(t, created.LockReason)

		byEmail, err := users.GetByEmail(ctx, created.Email)
		require.NoError(t, err)
		assert.Equal(t, domain.UserStatusActive, byEmail.Status)

		byID, err := users.GetByID(ctx, created.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.UserStatusActive, byID.Status)
	}

	var nonActive int
	require.NoError(t, tx.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE status <> 'active' AND locked_at IS NULL`).Scan(&nonActive))
	assert.Zero(t, nonActive, "no account may be non-active without lock data")
}

// DB-USER-STATUS@1 constraints.
func TestUserStatus_Constraints(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	users := NewUserRepository(tx)
	created, err := users.Create(ctx, uniqueEmailToken()+"@example.com", "hash", domain.RoleCustomer)
	require.NoError(t, err)

	cases := map[string]string{
		"unknown status":        `UPDATE users SET status = 'banned' WHERE id = $1`,
		"locked without time":   `UPDATE users SET status = 'locked' WHERE id = $1`,
		"active with lock time": `UPDATE users SET locked_at = now() WHERE id = $1`,
		"active with reason":    `UPDATE users SET lock_reason = 'x' WHERE id = $1`,
		"reason over 500 chars": `UPDATE users SET status = 'locked', locked_at = now(), lock_reason = repeat('ạ', 501) WHERE id = $1`,
	}
	for name, stmt := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := tx.Exec(ctx, "SAVEPOINT c")
			require.NoError(t, err)
			_, err = tx.Exec(ctx, stmt, created.ID)
			assert.Error(t, err)
			_, err = tx.Exec(ctx, "ROLLBACK TO SAVEPOINT c")
			require.NoError(t, err)
		})
	}

	_, err = tx.Exec(ctx, `UPDATE users SET status = 'locked', locked_at = now(), lock_reason = $2 WHERE id = $1`, created.ID, strings.Repeat("ạ", 500))
	assert.NoError(t, err, "a 500-character reason is accepted")
}

// Requirements 5.4, 5.5: auth queries expose the lock state.
func TestUserStatus_AuthQueriesReturnStatus(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	users := NewUserRepository(tx)
	sessions := NewSessionRepository(tx)
	created, err := users.Create(ctx, uniqueEmailToken()+"@example.com", "hash", domain.RoleCustomer)
	require.NoError(t, err)
	pair, err := security.GenerateRefreshToken()
	require.NoError(t, err)
	_, err = sessions.CreateRefreshToken(ctx, created.ID, pair.Hash, time.Now().Add(time.Hour))
	require.NoError(t, err)

	_, err = tx.Exec(ctx, `UPDATE users SET status = 'locked', locked_at = now(), lock_reason = 'spam' WHERE id = $1`, created.ID)
	require.NoError(t, err)

	byEmail, err := users.GetByEmail(ctx, created.Email)
	require.NoError(t, err)
	assert.Equal(t, domain.UserStatusLocked, byEmail.Status)
	require.NotNil(t, byEmail.LockedAt)
	require.NotNil(t, byEmail.LockReason)
	assert.Equal(t, "spam", *byEmail.LockReason)

	_, tokenUser, err := sessions.GetRefreshTokenByHash(ctx, pair.Hash)
	require.NoError(t, err)
	assert.Equal(t, domain.UserStatusLocked, tokenUser.Status)
}

func insertTestUser(t *testing.T, ctx context.Context, tx pgx.Tx, email, role string, createdAt time.Time) string {
	t.Helper()
	var id string
	require.NoError(t, tx.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, role, created_at) VALUES ($1, 'hash', $2, $3) RETURNING id`,
		email, role, createdAt).Scan(&id))
	return id
}

func insertTestOrder(t *testing.T, ctx context.Context, tx pgx.Tx, userID, status string, totalVnd int64, createdAt time.Time) string {
	t.Helper()
	var id string
	require.NoError(t, tx.QueryRow(ctx, `
		INSERT INTO orders (user_id, status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address, created_at)
		VALUES ($1, $2, $3, 0, $3, 'Test', '0123456789', 'HN', 'W1', 'D1', $4)
		RETURNING id`, userID, status, totalVnd, createdAt).Scan(&id))
	return id
}

func lockTestUser(t *testing.T, ctx context.Context, tx pgx.Tx, id string) {
	t.Helper()
	_, err := tx.Exec(ctx, `UPDATE users SET status = 'locked', locked_at = now() WHERE id = $1`, id)
	require.NoError(t, err)
}

func listedIDs(items []domain.UserListItem) []string {
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, it.ID)
	}
	return out
}

// Requirements 2.1–2.3, 2.7, 3.1–3.4: filtering, ordering, paging and order counts.
func TestUserAdminRepository_ListUsers(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	repo := NewUserAdminRepository(tx)
	tok := uniqueEmailToken()
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	alice := insertTestUser(t, ctx, tx, "Alice."+tok+"@example.com", domain.RoleCustomer, base.Add(1*time.Hour))
	bob := insertTestUser(t, ctx, tx, "bob_50%."+tok+"@example.com", domain.RoleCustomer, base.Add(2*time.Hour))
	admin := insertTestUser(t, ctx, tx, "admin."+tok+"@example.com", domain.RoleAdmin, base.Add(3*time.Hour))
	carol := insertTestUser(t, ctx, tx, "carol."+tok+"@example.com", domain.RoleCustomer, base.Add(3*time.Hour))
	lockTestUser(t, ctx, tx, bob)
	insertTestOrder(t, ctx, tx, alice, "delivered", 1000, base)
	insertTestOrder(t, ctx, tx, alice, "cancelled", 2000, base)
	insertTestOrder(t, ctx, tx, bob, "pending_confirmation", 3000, base)

	items, total, err := repo.ListUsers(ctx, domain.UserListFilter{Search: tok, Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, int64(4), total)
	// Newest first; admin and carol share created_at and are ordered by id descending.
	tied := []string{admin, carol}
	if tied[0] < tied[1] {
		tied[0], tied[1] = tied[1], tied[0]
	}
	assert.Equal(t, []string{tied[0], tied[1], bob, alice}, listedIDs(items))
	counts := map[string]int64{}
	for _, it := range items {
		counts[it.ID] = it.OrderCount
	}
	assert.Equal(t, map[string]int64{alice: 2, bob: 1, admin: 0, carol: 0}, counts)

	items, _, err = repo.ListUsers(ctx, domain.UserListFilter{Search: "ALICE." + strings.ToUpper(tok), Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, []string{alice}, listedIDs(items), "search is case-insensitive")

	items, _, err = repo.ListUsers(ctx, domain.UserListFilter{Search: "_50%." + tok, Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, []string{bob}, listedIDs(items), "% and _ are literal")

	items, _, err = repo.ListUsers(ctx, domain.UserListFilter{Search: "e_." + tok, Limit: 20})
	require.NoError(t, err)
	assert.Empty(t, items, "_ does not match any single character")

	items, total, err = repo.ListUsers(ctx, domain.UserListFilter{Search: tok, Role: domain.RoleCustomer, Status: domain.UserStatusActive, Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Equal(t, []string{carol, alice}, listedIDs(items))

	items, total, err = repo.ListUsers(ctx, domain.UserListFilter{Search: tok, Role: domain.RoleAdmin, Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, []string{admin}, listedIDs(items))

	items, total, err = repo.ListUsers(ctx, domain.UserListFilter{Search: tok, Status: domain.UserStatusLocked, Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, []string{bob}, listedIDs(items))

	page2, total, err := repo.ListUsers(ctx, domain.UserListFilter{Search: tok, Limit: 3, Offset: 3})
	require.NoError(t, err)
	assert.Equal(t, int64(4), total)
	assert.Equal(t, []string{alice}, listedIDs(page2))

	beyond, total, err := repo.ListUsers(ctx, domain.UserListFilter{Search: tok, Limit: 20, Offset: 40})
	require.NoError(t, err)
	assert.Equal(t, int64(4), total)
	assert.Empty(t, beyond)
}

// Requirements 4.1–4.3: account data, order summary and the five newest orders.
func TestUserAdminRepository_GetUserDetail(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	repo := NewUserAdminRepository(tx)
	tok := uniqueEmailToken()
	base := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)

	buyer := insertTestUser(t, ctx, tx, "buyer."+tok+"@example.com", domain.RoleCustomer, base)
	statuses := []string{"delivered", "partially_returned", "returned", "cancelled", "shipped", "pending_confirmation", "delivered"}
	var orderIDs []string
	for i, st := range statuses {
		orderIDs = append(orderIDs, insertTestOrder(t, ctx, tx, buyer, st, int64(1000*(i+1)), base.Add(time.Duration(i)*time.Hour)))
	}

	detail, err := repo.GetUserDetail(ctx, buyer)
	require.NoError(t, err)
	assert.Equal(t, "buyer."+tok+"@example.com", detail.User.Email)
	assert.Equal(t, domain.UserStatusActive, detail.User.Status)
	assert.Equal(t, int64(7), detail.OrderSummary.TotalOrders)
	assert.Equal(t, int64(4), detail.OrderSummary.DeliveredOrders)
	assert.Equal(t, "13000", detail.OrderSummary.DeliveredTotalVnd) // 1000 + 2000 + 3000 + 7000
	require.Len(t, detail.RecentOrders, 5)
	assert.Equal(t, orderIDs[6], detail.RecentOrders[0].ID)
	assert.Equal(t, "delivered", detail.RecentOrders[0].Status)
	assert.Equal(t, "7000", detail.RecentOrders[0].TotalVnd)
	assert.Equal(t, orderIDs[2], detail.RecentOrders[4].ID)
	require.NotNil(t, detail.LastOrderAt())
	assert.True(t, detail.LastOrderAt().Equal(base.Add(6*time.Hour)))

	empty := insertTestUser(t, ctx, tx, "empty."+tok+"@example.com", domain.RoleCustomer, base)
	detail, err = repo.GetUserDetail(ctx, empty)
	require.NoError(t, err)
	assert.Equal(t, domain.UserOrderSummary{DeliveredTotalVnd: "0"}, detail.OrderSummary)
	assert.Empty(t, detail.RecentOrders)
	assert.Nil(t, detail.LastOrderAt())

	_, err = repo.GetUserDetail(ctx, "11111111-2222-4333-8444-555555555555")
	assert.ErrorIs(t, err, domain.ErrUserNotFound)
}

// Requirement 8.1: list and detail stay under one second with 10,000 users and 50,000 orders.
func TestUserAdminRepository_Performance(t *testing.T) {
	if testing.Short() {
		t.Skip("performance seed skipped in -short mode")
	}
	ctx, tx := beginUserAdminTx(t)
	repo := NewUserAdminRepository(tx)
	tok := uniqueEmailToken()

	_, err := tx.Exec(ctx, `
		INSERT INTO users (email, password_hash, role, created_at)
		SELECT 'perf' || g || '.' || $1 || '@example.com', 'hash',
		       CASE WHEN g % 100 = 0 THEN 'admin' ELSE 'customer' END,
		       now() - (g || ' minutes')::interval
		FROM generate_series(1, 10000) g`, tok)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `
		INSERT INTO orders (user_id, status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address, created_at)
		SELECT u.id, (ARRAY['delivered','cancelled','shipped','pending_confirmation','returned'])[1 + (g % 5)],
		       100000, 0, 100000, 'Perf', '0123456789', 'HN', 'W1', 'D1', now() - (g || ' seconds')::interval
		FROM generate_series(1, 50000) g
		JOIN users u ON u.email = 'perf' || (1 + g % 10000) || '.' || $1 || '@example.com'`, tok)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `UPDATE users SET status = 'locked', locked_at = now() WHERE email LIKE 'perf%0.' || $1 || '@example.com'`, tok)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `ANALYZE users`)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `ANALYZE orders`)
	require.NoError(t, err)

	filters := map[string]domain.UserListFilter{
		"no filter":   {Limit: 20},
		"search":      {Search: "perf99", Limit: 20},
		"role+status": {Role: domain.RoleCustomer, Status: domain.UserStatusLocked, Limit: 20, Offset: 100},
	}
	for name, f := range filters {
		start := time.Now()
		items, _, err := repo.ListUsers(ctx, f)
		elapsed := time.Since(start)
		require.NoError(t, err, name)
		assert.NotEmpty(t, items, name)
		assert.Less(t, elapsed, time.Second, name)
	}

	var heavyID string
	require.NoError(t, tx.QueryRow(ctx, `SELECT id FROM users WHERE email = 'perf1.' || $1 || '@example.com'`, tok).Scan(&heavyID))
	start := time.Now()
	detail, err := repo.GetUserDetail(ctx, heavyID)
	elapsed := time.Since(start)
	require.NoError(t, err)
	assert.Equal(t, int64(5), detail.OrderSummary.TotalOrders)
	assert.Less(t, elapsed, time.Second)
}

func createTestRefreshToken(t *testing.T, ctx context.Context, sessions *SessionRepository, userID string) string {
	t.Helper()
	pair, err := security.GenerateRefreshToken()
	require.NoError(t, err)
	_, err = sessions.CreateRefreshToken(ctx, userID, pair.Hash, time.Now().Add(time.Hour))
	require.NoError(t, err)
	return pair.Hash
}

func activeTokenCount(t *testing.T, ctx context.Context, tx pgx.Tx, userID string) int {
	t.Helper()
	var n int
	require.NoError(t, tx.QueryRow(ctx, `SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`, userID).Scan(&n))
	return n
}

// Requirements 5.2, 5.4, 5.7, 5.8, 5.9: conditional lock with token revocation in one transaction.
func TestUserAdminRepository_LockCustomer(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	repo := NewUserAdminRepository(tx)
	sessions := NewSessionRepository(tx)
	tok := uniqueEmailToken()
	base := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)

	customer := insertTestUser(t, ctx, tx, "lockme."+tok+"@example.com", domain.RoleCustomer, base)
	other := insertTestUser(t, ctx, tx, "other."+tok+"@example.com", domain.RoleCustomer, base)
	admin := insertTestUser(t, ctx, tx, "admin."+tok+"@example.com", domain.RoleAdmin, base)
	order := insertTestOrder(t, ctx, tx, customer, "shipped", 5000, base)
	createTestRefreshToken(t, ctx, sessions, customer)
	createTestRefreshToken(t, ctx, sessions, customer)
	createTestRefreshToken(t, ctx, sessions, other)
	createTestRefreshToken(t, ctx, sessions, admin)

	reason := "Spam đánh giá"
	locked, err := repo.LockCustomer(ctx, customer, &reason)
	require.NoError(t, err)
	assert.True(t, locked)

	detail, err := repo.GetUserDetail(ctx, customer)
	require.NoError(t, err)
	assert.Equal(t, domain.UserStatusLocked, detail.User.Status)
	require.NotNil(t, detail.User.LockedAt)
	require.NotNil(t, detail.User.LockReason)
	assert.Equal(t, reason, *detail.User.LockReason)
	assert.Zero(t, activeTokenCount(t, ctx, tx, customer), "every refresh token of the locked account is revoked")
	assert.Equal(t, 1, activeTokenCount(t, ctx, tx, other), "other accounts keep their sessions")

	var orderStatus string
	require.NoError(t, tx.QueryRow(ctx, `SELECT status FROM orders WHERE id = $1`, order).Scan(&orderStatus))
	assert.Equal(t, "shipped", orderStatus, "locking leaves orders untouched")

	firstLockedAt := *detail.User.LockedAt
	again := "lý do khác"
	locked, err = repo.LockCustomer(ctx, customer, &again)
	require.NoError(t, err)
	assert.False(t, locked, "an already locked account is not locked again")
	detail, err = repo.GetUserDetail(ctx, customer)
	require.NoError(t, err)
	assert.True(t, firstLockedAt.Equal(*detail.User.LockedAt))
	assert.Equal(t, reason, *detail.User.LockReason)

	locked, err = repo.LockCustomer(ctx, admin, nil)
	require.NoError(t, err)
	assert.False(t, locked, "admins cannot be locked")
	assert.Equal(t, 1, activeTokenCount(t, ctx, tx, admin))

	locked, err = repo.LockCustomer(ctx, other, nil)
	require.NoError(t, err)
	assert.True(t, locked)
	detail, err = repo.GetUserDetail(ctx, other)
	require.NoError(t, err)
	assert.Nil(t, detail.User.LockReason)

	locked, err = repo.LockCustomer(ctx, "11111111-2222-4333-8444-555555555555", nil)
	require.NoError(t, err)
	assert.False(t, locked)
}

// Requirements 6.2, 6.3 (TD-4): unlock clears lock data and revokes tokens issued during the lock.
func TestUserAdminRepository_UnlockUser(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	repo := NewUserAdminRepository(tx)
	sessions := NewSessionRepository(tx)
	tok := uniqueEmailToken()
	base := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)

	customer := insertTestUser(t, ctx, tx, "unlock."+tok+"@example.com", domain.RoleCustomer, base)
	active := insertTestUser(t, ctx, tx, "active."+tok+"@example.com", domain.RoleCustomer, base)
	reason := "tạm khóa"
	locked, err := repo.LockCustomer(ctx, customer, &reason)
	require.NoError(t, err)
	require.True(t, locked)
	// A login racing the lock could still store a token after the revoke step.
	createTestRefreshToken(t, ctx, sessions, customer)
	createTestRefreshToken(t, ctx, sessions, active)

	unlocked, err := repo.UnlockUser(ctx, customer)
	require.NoError(t, err)
	assert.True(t, unlocked)
	detail, err := repo.GetUserDetail(ctx, customer)
	require.NoError(t, err)
	assert.Equal(t, domain.UserStatusActive, detail.User.Status)
	assert.Nil(t, detail.User.LockedAt)
	assert.Nil(t, detail.User.LockReason)
	assert.Zero(t, activeTokenCount(t, ctx, tx, customer))

	unlocked, err = repo.UnlockUser(ctx, active)
	require.NoError(t, err)
	assert.False(t, unlocked, "active accounts are not unlocked")
	assert.Equal(t, 1, activeTokenCount(t, ctx, tx, active), "a refused unlock revokes nothing")

	unlocked, err = repo.UnlockUser(ctx, "11111111-2222-4333-8444-555555555555")
	require.NoError(t, err)
	assert.False(t, unlocked)
}

// Requirement 2.7: offsets beyond 32 bits return an empty page with the real total.
func TestUserAdminRepository_ListUsersHugeOffset(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	repo := NewUserAdminRepository(tx)
	tok := uniqueEmailToken()
	insertTestUser(t, ctx, tx, "huge."+tok+"@example.com", domain.RoleCustomer, time.Now())

	items, total, err := repo.ListUsers(ctx, domain.UserListFilter{Search: tok, Limit: 20, Offset: 2147483660})
	require.NoError(t, err)
	assert.Empty(t, items)
	assert.Equal(t, int64(1), total)
}
