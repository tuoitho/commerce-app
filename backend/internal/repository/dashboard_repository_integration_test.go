//go:build integration

package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

func TestDashboardRepositoryIntegration(t *testing.T) {
	ctx := context.Background()
	dbURL := integrationDatabaseURL()

	pool, err := pgxpool.New(ctx, dbURL)
	require.NoError(t, err, "connect pool")
	defer pool.Close()

	conn, err := pgx.Connect(ctx, dbURL)
	require.NoError(t, err, "connect pgx")
	defer conn.Close(ctx)

	seedReviewPrerequisites(t, ctx, conn)

	loc := time.FixedZone("Asia/Ho_Chi_Minh", 7*3600)
	repo := NewDashboardRepository(pool)

	const (
		testUserID  = "11111111-2222-3333-4444-555555555551"
		testProduct = "aaaaaaaa-1111-1111-1111-111111111111"
		testVariant = "aaaaaaaa-1111-1111-1111-111111111112"
	)

	t.Run("RevenueAndRefundDaily_TimezoneAndStatusFilters", func(t *testing.T) {
		// Define range: 2026-11-06 00:00:00 VN to 2026-11-07 23:59:59 VN
		rangeStart := time.Date(2026, 11, 6, 0, 0, 0, 0, loc)
		rangeEnd := time.Date(2026, 11, 7, 23, 59, 59, 0, loc)

		tExactStart := rangeStart
		tExactEnd := rangeEnd
		tJustBeforeStart := rangeStart.Add(-1 * time.Second)
		tJustAfterEnd := rangeEnd.Add(1 * time.Second)

		// 23:30 VN on Nov 6 = 16:30 UTC Nov 6
		t2330Nov6 := time.Date(2026, 11, 6, 23, 30, 0, 0, loc)
		// 00:10 VN on Nov 7 = 17:10 UTC Nov 6
		t0010Nov7 := time.Date(2026, 11, 7, 0, 10, 0, 0, loc)
		t1000Nov7 := time.Date(2026, 11, 7, 10, 0, 0, 0, loc)

		prefix := "d1010000-0000-0000-0000-"
		orderStart := prefix + "000000000001"   // Exact start: delivered, 10000
		order2330 := prefix + "000000000002"    // Nov 6 23:30: delivered, 100000
		order0010 := prefix + "000000000003"    // Nov 7 00:10: partially_returned, 200000
		order1000 := prefix + "000000000004"    // Nov 7 10:00: returned, 150000
		orderEnd := prefix + "000000000005"     // Exact end: delivered, 20000
		orderShipped := prefix + "000000000006" // Nov 6 23:30: shipped (must exclude)
		orderPending := prefix + "000000000007" // Nov 7 10:00: pending_confirmation (must exclude)
		orderBefore := prefix + "000000000008"  // rangeStart - 1s: delivered (must exclude)
		orderAfter := prefix + "000000000009"   // rangeEnd + 1s: delivered (must exclude)

		retStart := prefix + "000000000011"   // Exact start: refunded, 5000
		ret2330 := prefix + "000000000012"    // Nov 6 23:30: refunded, 30000
		ret0010 := prefix + "000000000013"    // Nov 7 00:10: refunded, 40000
		retEnd := prefix + "000000000014"     // Exact end: refunded, 6000
		retPending := prefix + "000000000015" // Nov 7 10:00: pending_approval (must exclude)
		retBefore := prefix + "000000000016"  // rangeStart - 1s: refunded (must exclude)
		retAfter := prefix + "000000000017"   // rangeEnd + 1s: refunded (must exclude)

		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM return_requests WHERE id IN ($1, $2, $3, $4, $5, $6, $7)", retStart, ret2330, ret0010, retEnd, retPending, retBefore, retAfter)
			_, _ = pool.Exec(ctx, "DELETE FROM orders WHERE id IN ($1, $2, $3, $4, $5, $6, $7, $8, $9)", orderStart, order2330, order0010, order1000, orderEnd, orderShipped, orderPending, orderBefore, orderAfter)
		}()

		// Insert test orders
		ordersSQL := `
			INSERT INTO orders (id, user_id, status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address, created_at, delivered_at)
			VALUES
			($1, $10, 'delivered', 10000, 0, 10000, 'Test', '0123456789', 'HN', 'W1', 'D1', $11, $11),
			($2, $10, 'delivered', 100000, 0, 100000, 'Test', '0123456789', 'HN', 'W1', 'D1', $12, $12),
			($3, $10, 'partially_returned', 200000, 0, 200000, 'Test', '0123456789', 'HN', 'W1', 'D1', $13, $13),
			($4, $10, 'returned', 150000, 0, 150000, 'Test', '0123456789', 'HN', 'W1', 'D1', $14, $14),
			($5, $10, 'delivered', 20000, 0, 20000, 'Test', '0123456789', 'HN', 'W1', 'D1', $15, $15),
			($6, $10, 'shipped', 50000, 0, 50000, 'Test', '0123456789', 'HN', 'W1', 'D1', $12, $12),
			($7, $10, 'pending_confirmation', 50000, 0, 50000, 'Test', '0123456789', 'HN', 'W1', 'D1', $14, NULL),
			($8, $10, 'delivered', 80000, 0, 80000, 'Test', '0123456789', 'HN', 'W1', 'D1', $16, $16),
			($9, $10, 'delivered', 90000, 0, 90000, 'Test', '0123456789', 'HN', 'W1', 'D1', $17, $17)
		`
		_, err = pool.Exec(ctx, ordersSQL,
			orderStart, order2330, order0010, order1000, orderEnd, orderShipped, orderPending, orderBefore, orderAfter,
			testUserID, tExactStart, t2330Nov6, t0010Nov7, t1000Nov7, tExactEnd, tJustBeforeStart, tJustAfterEnd,
		)
		require.NoError(t, err)

		// Insert return requests
		returnsSQL := `
			INSERT INTO return_requests (id, order_id, user_id, reason_code, description, status, expected_refund_amount_vnd, refund_amount_vnd, refunded_by_user_id, created_at, refunded_at)
			VALUES
			($1, $8, $15, 'defective', 'desc', 'refunded', 5000, 5000, $15, $16, $16),
			($2, $9, $15, 'defective', 'desc', 'refunded', 30000, 30000, $15, $17, $17),
			($3, $10, $15, 'wrong_or_missing', 'desc', 'refunded', 40000, 40000, $15, $18, $18),
			($4, $11, $15, 'defective', 'desc', 'refunded', 6000, 6000, $15, $19, $19),
			($5, $12, $15, 'wrong_or_missing', 'desc', 'pending_approval', 50000, NULL, NULL, $20, NULL),
			($6, $13, $15, 'defective', 'desc', 'refunded', 60000, 60000, $15, $21, $21),
			($7, $14, $15, 'defective', 'desc', 'refunded', 70000, 70000, $15, $22, $22)
		`
		_, err = pool.Exec(ctx, returnsSQL,
			retStart, ret2330, ret0010, retEnd, retPending, retBefore, retAfter,
			orderStart, order2330, order0010, orderEnd, order1000, orderBefore, orderAfter,
			testUserID, tExactStart, t2330Nov6, t0010Nov7, tExactEnd, t1000Nov7, tJustBeforeStart, tJustAfterEnd,
		)
		require.NoError(t, err)

		data, err := repo.GetDashboardData(ctx, rangeStart, rangeEnd, loc)
		require.NoError(t, err)
		require.NotNil(t, data)

		// Assert Delivered Revenue by day
		// 2026-11-06: orderStart (10000) + order2330 (100000) = 110000, count 2
		// 2026-11-07: order0010 (200000) + order1000 (150000) + orderEnd (20000) = 370000, count 3
		require.Len(t, data.DailyDelivered, 2, "must have delivered rows for 2026-11-06 and 2026-11-07")
		assert.Equal(t, "2026-11-06", data.DailyDelivered[0].Date)
		assert.Equal(t, domain.MoneyVND("110000"), data.DailyDelivered[0].DeliveredVnd)
		assert.Equal(t, int64(2), data.DailyDelivered[0].DeliveredOrders)

		assert.Equal(t, "2026-11-07", data.DailyDelivered[1].Date)
		assert.Equal(t, domain.MoneyVND("370000"), data.DailyDelivered[1].DeliveredVnd)
		assert.Equal(t, int64(3), data.DailyDelivered[1].DeliveredOrders)

		// Assert Refunded by day
		// 2026-11-06: retStart (5000) + ret2330 (30000) = 35000
		// 2026-11-07: ret0010 (40000) + retEnd (6000) = 46000
		require.Len(t, data.DailyRefunded, 2, "must have refunded rows for 2026-11-06 and 2026-11-07")
		assert.Equal(t, "2026-11-06", data.DailyRefunded[0].Date)
		assert.Equal(t, domain.MoneyVND("35000"), data.DailyRefunded[0].RefundedVnd)

		assert.Equal(t, "2026-11-07", data.DailyRefunded[1].Date)
		assert.Equal(t, domain.MoneyVND("46000"), data.DailyRefunded[1].RefundedVnd)
	})

	t.Run("OrdersSummary_And_ByStatus_IndependentOfRange", func(t *testing.T) {
		// Use a fixed past time window where no other test data exists
		rangeStart := time.Date(2025, 6, 1, 0, 0, 0, 0, loc)
		rangeEnd := time.Date(2025, 6, 1, 23, 59, 59, 0, loc)

		prefix := "d1020000-0000-0000-0000-"
		oExactStart := prefix + "000000000001" // created_at = rangeStart, confirmed
		oMid1 := prefix + "000000000002"       // created_at = rangeStart + 4h, cancelled
		oMid2 := prefix + "000000000003"       // created_at = rangeStart + 8h, delivered
		oExactEnd := prefix + "000000000004"   // created_at = rangeEnd, cancelled
		oBefore := prefix + "000000000005"     // created_at = rangeStart - 1s, cancelled (OUT of range)
		oAfter := prefix + "000000000006"      // created_at = rangeEnd + 1s, confirmed (OUT of range)

		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM orders WHERE id IN ($1, $2, $3, $4, $5, $6)", oExactStart, oMid1, oMid2, oExactEnd, oBefore, oAfter)
		}()

		tExactStart := rangeStart
		tMid1 := rangeStart.Add(4 * time.Hour)
		tMid2 := rangeStart.Add(8 * time.Hour)
		tExactEnd := rangeEnd
		tBefore := rangeStart.Add(-1 * time.Second)
		tAfter := rangeEnd.Add(1 * time.Second)

		_, err := pool.Exec(ctx, `
			INSERT INTO orders (id, user_id, status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address, created_at)
			VALUES
			($1, $7, 'confirmed', 10000, 0, 10000, 'Test', '0123', 'HN', 'W1', 'D1', $8),
			($2, $7, 'cancelled', 20000, 0, 20000, 'Test', '0123', 'HN', 'W1', 'D1', $9),
			($3, $7, 'delivered', 30000, 0, 30000, 'Test', '0123', 'HN', 'W1', 'D1', $10),
			($4, $7, 'cancelled', 40000, 0, 40000, 'Test', '0123', 'HN', 'W1', 'D1', $11),
			($5, $7, 'cancelled', 50000, 0, 50000, 'Test', '0123', 'HN', 'W1', 'D1', $12),
			($6, $7, 'confirmed', 60000, 0, 60000, 'Test', '0123', 'HN', 'W1', 'D1', $13)
		`, oExactStart, oMid1, oMid2, oExactEnd, oBefore, oAfter, testUserID, tExactStart, tMid1, tMid2, tExactEnd, tBefore, tAfter)
		require.NoError(t, err)

		dataRange1, err := repo.GetDashboardData(ctx, rangeStart, rangeEnd, loc)
		require.NoError(t, err)
		require.NotNil(t, dataRange1)

		// Assert EXACT counts: out of 6 orders, exactly 4 are in range [rangeStart, rangeEnd]
		// and exactly 2 of those 4 are cancelled. oBefore and oAfter must NOT be counted!
		assert.Equal(t, int64(4), dataRange1.OrdersSummary.NewInRange, "NewInRange must strictly count orders with created_at in range")
		assert.Equal(t, int64(2), dataRange1.OrdersSummary.CancelledInRange, "CancelledInRange must strictly count cancelled orders with created_at in range")

		// Query an entirely different, non-overlapping past range where no orders were created
		rangeOtherStart := time.Date(2025, 7, 1, 0, 0, 0, 0, loc)
		rangeOtherEnd := time.Date(2025, 7, 1, 23, 59, 59, 0, loc)

		dataRange2, err := repo.GetDashboardData(ctx, rangeOtherStart, rangeOtherEnd, loc)
		require.NoError(t, err)
		require.NotNil(t, dataRange2)

		assert.Equal(t, int64(0), dataRange2.OrdersSummary.NewInRange)
		assert.Equal(t, int64(0), dataRange2.OrdersSummary.CancelledInRange)

		// Assert "Orders by status and pending work do not depend on the range"
		assert.Equal(t, dataRange1.OrdersSummary.ByStatus, dataRange2.OrdersSummary.ByStatus, "byStatus must be identical across different query ranges")
		assert.Equal(t, dataRange1.PendingWork, dataRange2.PendingWork, "pendingWork must be identical across different query ranges")

		// Check byStatus contains all 9 keys
		requiredStatuses := []string{
			"pending_confirmation", "confirmed", "preparing", "shipped",
			"delivered", "cancel_requested", "cancelled", "partially_returned", "returned",
		}
		for _, st := range requiredStatuses {
			val, ok := dataRange1.OrdersSummary.ByStatus[st]
			assert.Truef(t, ok, "byStatus must have key %s", st)
			assert.GreaterOrEqual(t, val, int64(0))
		}
	})

	t.Run("PendingWork_ParityWithOriginalQueries", func(t *testing.T) {
		rangeStart := time.Now().Add(-7 * 24 * time.Hour)
		rangeEnd := time.Now()

		data, err := repo.GetDashboardData(ctx, rangeStart, rangeEnd, loc)
		require.NoError(t, err)
		require.NotNil(t, data)

		// Direct query CountAdminReviews
		q := sqlc.New(pool)
		expectedUnreplied, err := q.CountAdminReviews(ctx, sqlc.CountAdminReviewsParams{
			RatingFilter:   0,
			HasReplyFilter: "no",
		})
		require.NoError(t, err)
		assert.Equal(t, expectedUnreplied, data.PendingWork.UnrepliedReviews)

		// Direct query CountConversationsForAdmin
		expectedUnread, err := q.CountConversationsForAdmin(ctx, sqlc.CountConversationsForAdminParams{
			Status: "unread",
			Search: "",
		})
		require.NoError(t, err)
		assert.Equal(t, expectedUnread, data.PendingWork.UnreadConversations)

		// Pending returns check
		var pendingApproval, received int64
		err = pool.QueryRow(ctx, "SELECT COUNT(*) FILTER (WHERE status = 'pending_approval'), COUNT(*) FILTER (WHERE status = 'received') FROM return_requests").Scan(&pendingApproval, &received)
		require.NoError(t, err)
		assert.Equal(t, pendingApproval, data.PendingWork.PendingApprovalReturns)
		assert.Equal(t, received, data.PendingWork.ReceivedReturns)
	})

	t.Run("TopProducts_TieBreak_MultipleVariants_And_SoftDeleted", func(t *testing.T) {
		// Use fixed past window so other orders in DB do not interfere
		rangeStart := time.Date(2025, 8, 1, 0, 0, 0, 0, loc)
		rangeEnd := time.Date(2025, 8, 1, 23, 59, 59, 0, loc)

		prefix := "d1030000-0000-0000-0000-"
		catID := prefix + "0000000000c1"
		pMulti := prefix + "000000000001"       // Has TWO variants (qty 12 + 8 = 20, rev 2,000,000), image pos 2 and pos 1
		pHighRev := prefix + "000000000002"     // qty 10, rev 3,000,000 -> higher rev than pAlpha & pBeta
		pAlpha := prefix + "000000000003"       // qty 10, rev 1,000,000, name "Alpha Product"
		pBeta := prefix + "000000000004"        // qty 10, rev 1,000,000, name "Beta Product", NO image (image_url = "")
		pCancelled := prefix + "000000000005"   // qty 5, in cancelled order -> must be excluded
		pSoftDeleted := prefix + "000000000006" // qty 30, rev 4,500,000, soft-deleted (active = false) -> Rank #1
		pOutBefore := prefix + "000000000007"   // qty 50, created before range -> must be excluded
		pOutAfter := prefix + "000000000008"    // qty 50, created after range -> must be excluded

		vMultiA := prefix + "0000000000b1"
		vMultiB := prefix + "0000000000b2"
		vHighRev := prefix + "0000000000b3"
		vAlpha := prefix + "0000000000b4"
		vBeta := prefix + "0000000000b5"
		vCancelled := prefix + "0000000000b6"
		vSoftDeleted := prefix + "0000000000b7"
		vOutBefore := prefix + "0000000000b8"
		vOutAfter := prefix + "0000000000b9"

		imgMultiPos2 := prefix + "0000000001a1"
		imgMultiPos1 := prefix + "0000000001a2"

		oExactStart := prefix + "0000000000e1" // created_at = rangeStart
		oExactEnd := prefix + "0000000000e2"   // created_at = rangeEnd
		oCancelled := prefix + "0000000000e3"  // created_at in range, status = cancelled
		oBefore := prefix + "0000000000e4"     // created_at = rangeStart - 1s
		oAfter := prefix + "0000000000e5"      // created_at = rangeEnd + 1s

		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM orders WHERE id IN ($1, $2, $3, $4, $5)", oExactStart, oExactEnd, oCancelled, oBefore, oAfter)
			_, _ = pool.Exec(ctx, "DELETE FROM product_images WHERE product_id IN ($1, $2, $3, $4, $5, $6, $7, $8)", pMulti, pHighRev, pAlpha, pBeta, pCancelled, pSoftDeleted, pOutBefore, pOutAfter)
			_, _ = pool.Exec(ctx, "DELETE FROM product_variants WHERE product_id IN ($1, $2, $3, $4, $5, $6, $7, $8)", pMulti, pHighRev, pAlpha, pBeta, pCancelled, pSoftDeleted, pOutBefore, pOutAfter)
			_, _ = pool.Exec(ctx, "DELETE FROM products WHERE id IN ($1, $2, $3, $4, $5, $6, $7, $8)", pMulti, pHighRev, pAlpha, pBeta, pCancelled, pSoftDeleted, pOutBefore, pOutAfter)
			_, _ = pool.Exec(ctx, "DELETE FROM categories WHERE id = $1", catID)
		}()

		_, err := pool.Exec(ctx, "INSERT INTO categories (id, name) VALUES ($1, 'Dashboard Cat') ON CONFLICT (id) DO NOTHING", catID)
		require.NoError(t, err)

		// Insert products (pSoftDeleted active = false; pBeta has no images)
		_, err = pool.Exec(ctx, `
			INSERT INTO products (id, category_id, name, model, brand, description, price, currency, stock_quantity, active)
			VALUES
			($1, $9, 'Product Multi Variants', 'M1', 'Brand1', '', 100000, 'VND', 50, true),
			($2, $9, 'Product High Revenue', 'M2', 'Brand2', '', 300000, 'VND', 50, true),
			($3, $9, 'Alpha Product', 'M3', 'Brand3', '', 100000, 'VND', 50, true),
			($4, $9, 'Beta Product', 'M4', 'Brand4', '', 100000, 'VND', 50, true),
			($5, $9, 'Product Cancelled', 'M5', 'Brand5', '', 100000, 'VND', 50, true),
			($6, $9, 'Product Soft Deleted', 'M6', 'Brand6', '', 150000, 'VND', 50, false),
			($7, $9, 'Product Out Before', 'M7', 'Brand7', '', 100000, 'VND', 50, true),
			($8, $9, 'Product Out After', 'M8', 'Brand8', '', 100000, 'VND', 50, true)
		`, pMulti, pHighRev, pAlpha, pBeta, pCancelled, pSoftDeleted, pOutBefore, pOutAfter, catID)
		require.NoError(t, err)

		// Insert product images for pMulti (pos 2 and pos 1 to verify min position selection)
		_, err = pool.Exec(ctx, `
			INSERT INTO product_images (id, product_id, url, position)
			VALUES
			($1, $3, 'https://example.com/multi_pos2.jpg', 2),
			($2, $3, 'https://example.com/multi_pos1.jpg', 1)
		`, imgMultiPos2, imgMultiPos1, pMulti)
		require.NoError(t, err)

		// Insert variants (pMulti has 2 variants)
		_, err = pool.Exec(ctx, `
			INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active)
			VALUES
			($1, $10, 100000, 50, true),
			($2, $10, 100000, 50, true),
			($3, $11, 300000, 50, true),
			($4, $12, 100000, 50, true),
			($5, $13, 100000, 50, true),
			($6, $14, 100000, 50, true),
			($7, $15, 150000, 50, true),
			($8, $16, 100000, 50, true),
			($9, $17, 100000, 50, true)
		`, vMultiA, vMultiB, vHighRev, vAlpha, vBeta, vCancelled, vSoftDeleted, vOutBefore, vOutAfter,
			pMulti, pHighRev, pAlpha, pBeta, pCancelled, pSoftDeleted, pOutBefore, pOutAfter)
		require.NoError(t, err)

		// Insert orders:
		// oExactStart: at rangeStart (boundary check)
		// oExactEnd: at rangeEnd (boundary check)
		// oCancelled: in range, status cancelled
		// oBefore: at rangeStart - 1s (must exclude)
		// oAfter: at rangeEnd + 1s (must exclude)
		tBefore := rangeStart.Add(-1 * time.Second)
		tAfter := rangeEnd.Add(1 * time.Second)
		_, err = pool.Exec(ctx, `
			INSERT INTO orders (id, user_id, status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address, created_at)
			VALUES
			($1, $6, 'delivered', 10000000, 0, 10000000, 'Test', '0123', 'HN', 'W1', 'D1', $7),
			($2, $6, 'delivered', 10000000, 0, 10000000, 'Test', '0123', 'HN', 'W1', 'D1', $8),
			($3, $6, 'cancelled', 500000, 0, 500000, 'Test', '0123', 'HN', 'W1', 'D1', $7),
			($4, $6, 'delivered', 5000000, 0, 5000000, 'Test', '0123', 'HN', 'W1', 'D1', $9),
			($5, $6, 'delivered', 5000000, 0, 5000000, 'Test', '0123', 'HN', 'W1', 'D1', $10)
		`, oExactStart, oExactEnd, oCancelled, oBefore, oAfter, testUserID, rangeStart, rangeEnd, tBefore, tAfter)
		require.NoError(t, err)

		// Insert order items
		oiPrefix := prefix + "0000000000f"
		_, err = pool.Exec(ctx, `
			INSERT INTO order_items (id, order_id, product_id, variant_id, brand_name, product_name, unit_price_vnd, quantity, line_total_vnd)
			VALUES
			-- oExactStart: pMulti variant A (qty 12) + pSoftDeleted (qty 30) + pHighRev (qty 10)
			($1, $10, $13, $16, 'Brand1', 'Product Multi Variants', 100000, 12, 1200000),
			($2, $10, $14, $17, 'Brand6', 'Product Soft Deleted', 150000, 30, 4500000),
			($3, $10, $15, $18, 'Brand2', 'Product High Revenue', 300000, 10, 3000000),
			-- oExactEnd: pMulti variant B (qty 8) -> pMulti total qty = 20, revenue = 2,000,000!
			($4, $11, $13, $19, 'Brand1', 'Product Multi Variants', 100000, 8, 800000),
			-- oExactEnd: pAlpha (qty 10) + pBeta (qty 10)
			($5, $11, $20, $21, 'Brand3', 'Alpha Product', 100000, 10, 1000000),
			($6, $11, $22, $23, 'Brand4', 'Beta Product', 100000, 10, 1000000),
			-- oCancelled: pCancelled (must be excluded)
			($7, $12, $24, $25, 'Brand5', 'Product Cancelled', 100000, 5, 500000),
			-- oBefore: pOutBefore (must be excluded)
			($8, $26, $27, $28, 'Brand7', 'Product Out Before', 100000, 50, 5000000),
			-- oAfter: pOutAfter (must be excluded)
			($9, $29, $30, $31, 'Brand8', 'Product Out After', 100000, 50, 5000000)
		`,
			oiPrefix+"1", oiPrefix+"2", oiPrefix+"3", oiPrefix+"4", oiPrefix+"5", oiPrefix+"6", oiPrefix+"7", oiPrefix+"8", oiPrefix+"9",
			oExactStart, oExactEnd, oCancelled,
			pMulti, pSoftDeleted, pHighRev,
			vMultiA, vSoftDeleted, vHighRev,
			vMultiB,
			pAlpha, vAlpha,
			pBeta, vBeta,
			pCancelled, vCancelled,
			oBefore, pOutBefore, vOutBefore,
			oAfter, pOutAfter, vOutAfter,
		)
		require.NoError(t, err)

		data, err := repo.GetDashboardData(ctx, rangeStart, rangeEnd, loc)
		require.NoError(t, err)
		require.NotNil(t, data)

		require.Len(t, data.TopProducts, 5, "top products must return exactly 5 items")

		// Verify order:
		// 1. pSoftDeleted: qty 30, active=false, rev 4500000
		// 2. pMulti: qty 20 (sum of variant A: 12 + variant B: 8), active=true, rev 2000000, image_url = min position (pos 1)
		// 3. pHighRev: qty 10, rev 3000000
		// 4. pAlpha: qty 10, rev 1000000, name "Alpha Product"
		// 5. pBeta: qty 10, rev 1000000, name "Beta Product", ImageURL == "" (no image)
		assert.Equal(t, pSoftDeleted, data.TopProducts[0].ProductID)
		assert.False(t, data.TopProducts[0].Active, "soft-deleted product must be ranked with active=false")
		assert.Equal(t, int64(30), data.TopProducts[0].QuantitySold)
		assert.Equal(t, domain.MoneyVND("4500000"), data.TopProducts[0].RevenueVnd)

		assert.Equal(t, pMulti, data.TopProducts[1].ProductID)
		assert.True(t, data.TopProducts[1].Active)
		assert.Equal(t, int64(20), data.TopProducts[1].QuantitySold, "must sum quantities across all variants of product")
		assert.Equal(t, domain.MoneyVND("2000000"), data.TopProducts[1].RevenueVnd, "must sum revenue across all variants of product")
		assert.Equal(t, "https://example.com/multi_pos1.jpg", data.TopProducts[1].ImageURL, "must pick image with lowest position")

		assert.Equal(t, pHighRev, data.TopProducts[2].ProductID)
		assert.Equal(t, int64(10), data.TopProducts[2].QuantitySold)
		assert.Equal(t, domain.MoneyVND("3000000"), data.TopProducts[2].RevenueVnd)

		assert.Equal(t, pAlpha, data.TopProducts[3].ProductID)
		assert.Equal(t, "Alpha Product", data.TopProducts[3].Name)

		assert.Equal(t, pBeta, data.TopProducts[4].ProductID)
		assert.Equal(t, "Beta Product", data.TopProducts[4].Name)
		assert.Equal(t, "", data.TopProducts[4].ImageURL, "product without images must have empty string image_url")

		// Verify cancelled and out-of-range products are not in top products
		for _, tp := range data.TopProducts {
			assert.NotEqual(t, pCancelled, tp.ProductID, "cancelled order product must not appear")
			assert.NotEqual(t, pOutBefore, tp.ProductID, "product before range must not appear")
			assert.NotEqual(t, pOutAfter, tp.ProductID, "product after range must not appear")
		}
	})

	t.Run("LowStock_Threshold_Active_Limit10_Ordering", func(t *testing.T) {
		prefix := "d1040000-0000-0000-0000-"
		catID := prefix + "0000000000c1"

		// Clean up before test
		defer func() {
			_, _ = pool.Exec(ctx, "DELETE FROM variant_option_values WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)", catID)
			_, _ = pool.Exec(ctx, "DELETE FROM product_option_values WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)", catID)
			_, _ = pool.Exec(ctx, "DELETE FROM product_option_groups WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)", catID)
			_, _ = pool.Exec(ctx, "DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)", catID)
			_, _ = pool.Exec(ctx, "DELETE FROM products WHERE category_id = $1", catID)
			_, _ = pool.Exec(ctx, "DELETE FROM categories WHERE id = $1", catID)
		}()

		_, err := pool.Exec(ctx, "INSERT INTO categories (id, name) VALUES ($1, 'LowStock Cat') ON CONFLICT (id) DO NOTHING", catID)
		require.NoError(t, err)

		// Create 12 qualifying products + variants with varying stock 0..5 and names to test:
		// 1) total > 10
		// 2) items limited to 10
		// 3) sorted by stock_quantity ASC then product_name ASC
		// 4) variant with no options has options == []
		// Plus 3 non-qualifying variants (stock 6, variant inactive, product inactive)
		type testVarConfig struct {
			pID       string
			vID       string
			name      string
			pActive   bool
			vActive   bool
			stock     int64
			hasOption bool
		}

		configs := []testVarConfig{
			{prefix + "000000000001", prefix + "0000000000b1", "Phone Stock 0", true, true, 0, false},
			{prefix + "000000000002", prefix + "0000000000b2", "Phone Stock 1", true, true, 1, true},
			{prefix + "000000000003", prefix + "0000000000b3", "Phone Stock 2", true, true, 2, false},
			{prefix + "000000000004", prefix + "0000000000b4", "Phone Stock 3", true, true, 3, false},
			{prefix + "000000000005", prefix + "0000000000b5", "Phone Stock 4", true, true, 4, false},
			{prefix + "000000000006", prefix + "0000000000b6", "Phone Stock 5 A", true, true, 5, false},
			{prefix + "000000000007", prefix + "0000000000b7", "Phone Stock 5 B", true, true, 5, false},
			{prefix + "000000000008", prefix + "0000000000b8", "Phone Stock 5 C", true, true, 5, false},
			{prefix + "000000000009", prefix + "0000000000b9", "Phone Stock 5 D", true, true, 5, false},
			{prefix + "00000000000a", prefix + "0000000000ba", "Phone Stock 5 E", true, true, 5, false},
			{prefix + "00000000000b", prefix + "0000000000bb", "Phone Stock 5 F", true, true, 5, false},
			{prefix + "00000000000c", prefix + "0000000000bc", "Phone Stock 5 G", true, true, 5, false},
			// Non-qualifying:
			{prefix + "00000000000d", prefix + "0000000000bd", "Phone Stock 6 Excluded", true, true, 6, false},
			{prefix + "00000000000e", prefix + "0000000000be", "Phone Variant Inactive Excluded", true, false, 2, false},
			{prefix + "00000000000f", prefix + "0000000000bf", "Phone Product Inactive Excluded", false, true, 2, false},
		}

		gID := prefix + "0000000000d1"
		ovID := prefix + "0000000000e1"

		for _, c := range configs {
			_, err = pool.Exec(ctx, `
				INSERT INTO products (id, category_id, name, model, brand, description, price, currency, stock_quantity, active)
				VALUES ($1, $2, $3, 'M', 'B', '', 10000, 'VND', 10, $4)
			`, c.pID, catID, c.name, c.pActive)
			require.NoError(t, err)

			_, err = pool.Exec(ctx, `
				INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active)
				VALUES ($1, $2, 10000, $3, $4)
			`, c.vID, c.pID, c.stock, c.vActive)
			require.NoError(t, err)

			if c.hasOption {
				_, err = pool.Exec(ctx, "INSERT INTO product_option_groups (id, product_id, label, position) VALUES ($1, $2, 'Color', 0)", gID, c.pID)
				require.NoError(t, err)
				_, err = pool.Exec(ctx, "INSERT INTO product_option_values (id, product_id, group_id, label, position) VALUES ($1, $2, $3, 'Red', 0)", ovID, c.pID, gID)
				require.NoError(t, err)
				_, err = pool.Exec(ctx, "INSERT INTO variant_option_values (variant_id, product_id, group_id, option_value_id) VALUES ($1, $2, $3, $4)", c.vID, c.pID, gID, ovID)
				require.NoError(t, err)
			}
		}

		// Calculate exact expected total qualifying variants in DB
		var expectedTotal int64
		err = pool.QueryRow(ctx, "SELECT count(*) FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.active AND p.active AND v.stock_quantity <= 5").Scan(&expectedTotal)
		require.NoError(t, err)
		require.Greater(t, expectedTotal, int64(10), "expected total must be greater than 10 to test limit")

		data, err := repo.GetDashboardData(ctx, time.Now().Add(-24*time.Hour), time.Now(), loc)
		require.NoError(t, err)
		require.NotNil(t, data)

		assert.Equal(t, int64(5), data.LowStock.Threshold)
		// 1) total > 10 and matches count(*) OVER()
		assert.Equal(t, expectedTotal, data.LowStock.Total, "LowStock.Total must be the exact count of all qualifying variants")
		// 2) items capped at 10
		assert.Equal(t, 10, len(data.LowStock.Items), "LowStock.Items must be limited to 10")

		// 3) Assert ordering: stock_quantity ASC, product_name ASC, variant_id ASC
		for i := 0; i < len(data.LowStock.Items)-1; i++ {
			curr := data.LowStock.Items[i]
			next := data.LowStock.Items[i+1]
			if curr.StockQuantity == next.StockQuantity {
				if curr.ProductName == next.ProductName {
					assert.LessOrEqual(t, curr.VariantID, next.VariantID, "tie-break on variant_id ASC")
				} else {
					assert.Less(t, curr.ProductName, next.ProductName, "tie-break on product_name ASC")
				}
			} else {
				assert.Less(t, curr.StockQuantity, next.StockQuantity, "sorted by stock_quantity ASC")
			}
		}

		// 4) Assert variant with no options has options == [] (empty slice, not null)
		var foundNoOpt bool
		for _, item := range data.LowStock.Items {
			if item.VariantID == prefix+"0000000000b1" {
				foundNoOpt = true
				assert.NotNil(t, item.Options)
				assert.Empty(t, item.Options, "variant with no options must have empty options array")
			}
		}
		assert.True(t, foundNoOpt, "stock 0 variant must be in low stock list")

		// 5) Verify excluded variants do not appear
		for _, item := range data.LowStock.Items {
			assert.NotEqual(t, prefix+"0000000000bd", item.VariantID, "stock 6 variant must be excluded")
			assert.NotEqual(t, prefix+"0000000000be", item.VariantID, "inactive variant must be excluded")
			assert.NotEqual(t, prefix+"0000000000bf", item.VariantID, "variant of inactive product must be excluded")
		}
	})

	t.Run("Performance_50kOrders_200kLines", func(t *testing.T) {
		const perfTag = "perf_bench_order"

		// Use a dedicated acquired connection so session_replication_role cannot leak to other pool conns
		dedicatedConn, err := pool.Acquire(ctx)
		require.NoError(t, err)
		defer dedicatedConn.Release()

		defer func() {
			_, _ = dedicatedConn.Exec(ctx, "SET session_replication_role = 'replica'")
			_, _ = dedicatedConn.Exec(ctx, "DELETE FROM order_items WHERE product_name = 'Bench Product'")
			_, _ = dedicatedConn.Exec(ctx, "DELETE FROM orders WHERE recipient_name = $1", perfTag)
			_, _ = dedicatedConn.Exec(ctx, "SET session_replication_role = 'origin'")
		}()

		// Optimize bulk seed by disabling triggers during seed on the dedicated connection
		_, err = dedicatedConn.Exec(ctx, "SET session_replication_role = 'replica'")
		require.NoError(t, err)

		// Fast bulk insert using generate_series:
		// 50,000 orders
		insertOrdersSQL := `
			INSERT INTO orders (id, user_id, status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address, created_at, delivered_at)
			SELECT
				gen_random_uuid(),
				$1,
				(ARRAY['delivered', 'delivered', 'delivered', 'shipped', 'cancelled'])[1 + (i % 5)],
				100000,
				0,
				100000,
				$2,
				'0900000000',
				'HN', 'W1', 'D1',
				now() - ((i % 40) || ' days')::interval,
				CASE WHEN (i % 5) < 3 THEN now() - ((i % 40) || ' days')::interval ELSE NULL END
			FROM generate_series(1, 50000) AS i;
		`
		t.Log("Seeding 50,000 orders...")
		seedStart := time.Now()
		_, err = dedicatedConn.Exec(ctx, insertOrdersSQL, testUserID, perfTag)
		require.NoError(t, err, "seed 50,000 orders")
		t.Logf("Seeded 50,000 orders in %v", time.Since(seedStart))

		// 200,000 order items (4 items per order on a slice of orders)
		insertItemsSQL := `
			INSERT INTO order_items (id, order_id, product_id, variant_id, brand_name, product_name, unit_price_vnd, quantity, line_total_vnd)
			SELECT
				gen_random_uuid(),
				o.id,
				$1,
				$2,
				'Bench Brand',
				'Bench Product',
				25000,
				1,
				25000
			FROM (
				SELECT id FROM orders WHERE recipient_name = $3 LIMIT 50000
			) o
			CROSS JOIN generate_series(1, 4) AS g;
		`
		t.Log("Seeding 200,000 order lines...")
		seedItemsStart := time.Now()
		_, err = dedicatedConn.Exec(ctx, insertItemsSQL, testProduct, testVariant, perfTag)
		require.NoError(t, err, "seed 200,000 order items")
		t.Logf("Seeded 200,000 order lines in %v", time.Since(seedItemsStart))

		// Re-enable normal replication role on the dedicated connection
		_, err = dedicatedConn.Exec(ctx, "SET session_replication_role = 'origin'")
		require.NoError(t, err)

		nowVN := time.Now().In(loc)
		todayMidnightVN := time.Date(nowVN.Year(), nowVN.Month(), nowVN.Day(), 0, 0, 0, 0, loc)

		ranges := []struct {
			name       string
			rangeStart time.Time
			rangeEnd   time.Time
		}{
			{
				name:       "today",
				rangeStart: todayMidnightVN,
				rangeEnd:   nowVN,
			},
			{
				name:       "7d",
				rangeStart: todayMidnightVN.AddDate(0, 0, -6),
				rangeEnd:   nowVN,
			},
			{
				name:       "30d",
				rangeStart: todayMidnightVN.AddDate(0, 0, -29),
				rangeEnd:   nowVN,
			},
		}

		for _, tc := range ranges {
			tc := tc
			t.Run("Latency_"+tc.name, func(t *testing.T) {
				start := time.Now()
				data, err := repo.GetDashboardData(ctx, tc.rangeStart, tc.rangeEnd, loc)
				elapsed := time.Since(start)

				require.NoError(t, err)
				require.NotNil(t, data)
				t.Logf("Repository GetDashboardData [%s] completed in %v", tc.name, elapsed)
				assert.Less(t, elapsed, 1*time.Second, fmt.Sprintf("range %s must complete under 1s, took %v", tc.name, elapsed))
			})
		}
	})
}
