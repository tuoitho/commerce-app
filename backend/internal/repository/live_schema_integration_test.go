//go:build integration

package repository

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/repository/sqlc"
)

func TestLiveSchemaIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	q := sqlc.New(pool)

	reset := func(t *testing.T) {
		t.Helper()
		_, err := conn.Exec(ctx, `DELETE FROM order_items; DELETE FROM orders; DELETE FROM live_sessions`)
		require.NoError(t, err)
	}
	startSession := func(t *testing.T) string {
		t.Helper()
		session, err := q.CreateLiveSession(ctx, sqlc.CreateLiveSessionParams{Title: "Live", CreatedBy: liveAdminID})
		require.NoError(t, err)
		return session.ID
	}
	addPrice := func(t *testing.T, sessionID, productID, variantID, price string, quota *int32) {
		t.Helper()
		require.NoError(t, q.UpsertLiveSessionProduct(ctx, sqlc.UpsertLiveSessionProductParams{SessionID: sessionID, ProductID: productID, Position: 0}))
		params := sqlc.UpsertLiveVariantPriceParams{SessionID: sessionID, ProductID: productID, VariantID: variantID, LivePriceVnd: toNumeric(price)}
		if quota != nil {
			params.Quota.Int32, params.Quota.Valid = *quota, true
		}
		require.NoError(t, q.UpsertLiveVariantPrice(ctx, params))
	}
	activeVariants := func(t *testing.T) []string {
		t.Helper()
		rows, err := conn.Query(ctx, `SELECT variant_id::text FROM live_active_variant_prices ORDER BY variant_id`)
		require.NoError(t, err)
		ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
		require.NoError(t, err)
		return ids
	}
	quota := func(v int32) *int32 { return &v }

	t.Run("only one session may be live", func(t *testing.T) {
		reset(t)
		startSession(t)
		_, err := q.CreateLiveSession(ctx, sqlc.CreateLiveSessionParams{Title: "Second", CreatedBy: liveAdminID})
		var pgErr *pgconn.PgError
		require.True(t, errors.As(err, &pgErr), "err = %v", err)
		require.Equal(t, "23505", pgErr.Code)
		require.Equal(t, "live_sessions_single_live_idx", pgErr.ConstraintName)
	})

	t.Run("a new session may start after the previous one ended", func(t *testing.T) {
		reset(t)
		first := startSession(t)
		_, err := q.EndLiveSession(ctx, sqlc.EndLiveSessionParams{ID: first, EndReason: liveText("admin")})
		require.NoError(t, err)
		startSession(t)
		_, err = q.EndLiveSession(ctx, sqlc.EndLiveSessionParams{ID: first, EndReason: liveText("admin")})
		require.ErrorIs(t, err, pgx.ErrNoRows, "ending an ended session must match no row")
	})

	t.Run("view exposes only prices in effect", func(t *testing.T) {
		reset(t)
		session := startSession(t)
		addPrice(t, session, liveProductA, liveVariantA1, "900000", nil)
		addPrice(t, session, liveProductA, liveVariantA2, "2000000", nil) // not below regular price
		addPrice(t, session, liveProductB, liveVariantB1, "2500000", quota(1))
		require.Equal(t, []string{liveVariantA1, liveVariantB1}, activeVariants(t))

		sold, err := q.ConsumeLiveQuota(ctx, sqlc.ConsumeLiveQuotaParams{SessionID: session, VariantID: liveVariantB1, Quantity: 1})
		require.NoError(t, err)
		require.EqualValues(t, 1, sold)
		require.Equal(t, []string{liveVariantA1}, activeVariants(t), "exhausted quota leaves the view")

		_, err = conn.Exec(ctx, `UPDATE product_variants SET price_vnd = 900000 WHERE id = $1`, liveVariantA1)
		require.NoError(t, err)
		require.Empty(t, activeVariants(t), "live price not below regular price leaves the view")
		_, err = conn.Exec(ctx, `UPDATE product_variants SET price_vnd = 1000000 WHERE id = $1`, liveVariantA1)
		require.NoError(t, err)

		_, err = q.EndLiveSession(ctx, sqlc.EndLiveSessionParams{ID: session, EndReason: liveText("admin")})
		require.NoError(t, err)
		require.Empty(t, activeVariants(t), "ended session has no prices in effect")
	})

	t.Run("quota consumption never exceeds the quota", func(t *testing.T) {
		reset(t)
		session := startSession(t)
		addPrice(t, session, liveProductA, liveVariantA1, "900000", quota(2))
		_, err := q.ConsumeLiveQuota(ctx, sqlc.ConsumeLiveQuotaParams{SessionID: session, VariantID: liveVariantA1, Quantity: 1})
		require.NoError(t, err)
		_, err = q.ConsumeLiveQuota(ctx, sqlc.ConsumeLiveQuotaParams{SessionID: session, VariantID: liveVariantA1, Quantity: 2})
		require.ErrorIs(t, err, pgx.ErrNoRows)
		remaining, err := q.GetLiveQuotaRemaining(ctx, sqlc.GetLiveQuotaRemainingParams{SessionID: session, VariantID: liveVariantA1})
		require.NoError(t, err)
		require.EqualValues(t, 1, remaining)
	})

	t.Run("removing a product cascades to its live prices", func(t *testing.T) {
		reset(t)
		session := startSession(t)
		addPrice(t, session, liveProductA, liveVariantA1, "900000", nil)
		addPrice(t, session, liveProductB, liveVariantB1, "2500000", nil)
		require.NoError(t, q.DeleteLiveSessionProductsExcept(ctx, sqlc.DeleteLiveSessionProductsExceptParams{SessionID: session, ProductIds: []string{liveProductB}}))
		require.Equal(t, []string{liveVariantB1}, activeVariants(t))
	})

	t.Run("cancelled order restores quota only while the session is live", func(t *testing.T) {
		reset(t)
		session := startSession(t)
		addPrice(t, session, liveProductA, liveVariantA1, "900000", quota(5))
		_, err := q.ConsumeLiveQuota(ctx, sqlc.ConsumeLiveQuotaParams{SessionID: session, VariantID: liveVariantA1, Quantity: 3})
		require.NoError(t, err)
		orderID := insertLiveOrder(t, ctx, conn, session, liveVariantA1, liveProductA, 3)

		require.NoError(t, q.RestoreLiveQuotaForOrder(ctx, orderID))
		require.Equal(t, int32(0), soldQuantity(t, ctx, conn, session, liveVariantA1))

		require.NoError(t, q.RestoreLiveQuotaForOrder(ctx, orderID))
		require.Equal(t, int32(0), soldQuantity(t, ctx, conn, session, liveVariantA1), "sold never drops below zero")

		_, err = q.ConsumeLiveQuota(ctx, sqlc.ConsumeLiveQuotaParams{SessionID: session, VariantID: liveVariantA1, Quantity: 3})
		require.NoError(t, err)
		_, err = q.EndLiveSession(ctx, sqlc.EndLiveSessionParams{ID: session, EndReason: liveText("admin")})
		require.NoError(t, err)
		require.NoError(t, q.RestoreLiveQuotaForOrder(ctx, orderID))
		require.Equal(t, int32(3), soldQuantity(t, ctx, conn, session, liveVariantA1), "ended session keeps its sold count")
	})

	t.Run("down migration removes every livestream object", func(t *testing.T) {
		reset(t)
		applyMigration(t, ctx, conn, "000021_create_livestream.down.sql")
		var remaining int
		require.NoError(t, conn.QueryRow(ctx, `SELECT count(*) FROM (VALUES
			(to_regclass('live_sessions')), (to_regclass('live_session_products')),
			(to_regclass('live_variant_prices')), (to_regclass('live_comments')),
			(to_regclass('live_active_variant_prices'))) AS objects(o) WHERE o IS NOT NULL`).Scan(&remaining))
		require.Zero(t, remaining)
		var hasColumn bool
		require.NoError(t, conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'live_session_id')`).Scan(&hasColumn))
		require.False(t, hasColumn)
		applyMigration(t, ctx, conn, "000021_create_livestream.up.sql")
	})
}

func insertLiveOrder(t *testing.T, ctx context.Context, conn *pgx.Conn, sessionID, variantID, productID string, quantity int64) string {
	t.Helper()
	var orderID string
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO orders (user_id, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address)
		VALUES ($1, 2700000, 0, 2700000, 'Lan', '0900000000', 'HN', 'W', 'D') RETURNING id`, liveCustomerID).Scan(&orderID))
	_, err := conn.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, product_id, brand_name, product_name, unit_price_vnd, quantity, line_total_vnd, live_session_id)
		VALUES ($1, $2, $3, 'Aura', 'Live Phone A', 900000, $4, 2700000, $5)`, orderID, variantID, productID, quantity, sessionID)
	require.NoError(t, err)
	return orderID
}

func soldQuantity(t *testing.T, ctx context.Context, conn *pgx.Conn, sessionID, variantID string) int32 {
	t.Helper()
	var sold int32
	require.NoError(t, conn.QueryRow(ctx, `SELECT sold_quantity FROM live_variant_prices WHERE session_id = $1 AND variant_id = $2`, sessionID, variantID).Scan(&sold))
	return sold
}
