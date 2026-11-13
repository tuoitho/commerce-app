//go:build integration

package repository

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

func TestLiveOrderIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	liveRepo := NewLiveRepository(pool)
	cartRepo := NewCartRepository(pool)
	orderRepo := NewOrderRepository(pool)

	var addressID string
	for _, user := range []string{liveCustomerID, liveCustomer2} {
		require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
			VALUES ($1, 'Lan', '0900000000', 1, 'HN', 1, 'W', 'D', true) RETURNING id`, user).Scan(&addressID))
	}
	addressOf := func(t *testing.T, userID string) string {
		t.Helper()
		var id string
		require.NoError(t, conn.QueryRow(ctx, `SELECT id FROM addresses WHERE user_id = $1`, userID).Scan(&id))
		return id
	}
	reset := func(t *testing.T) {
		t.Helper()
		_, err := conn.Exec(ctx, `DELETE FROM order_items; DELETE FROM orders; DELETE FROM cart_items; DELETE FROM live_sessions;
			UPDATE product_variants SET stock_quantity = 10, price_vnd = CASE id WHEN $1::uuid THEN 1000000 WHEN $2::uuid THEN 2000000 ELSE 3000000 END`,
			liveVariantA1, liveVariantA2)
		require.NoError(t, err)
	}
	startSession := func(t *testing.T, quota *int) string {
		t.Helper()
		s, err := liveRepo.CreateSession(ctx, "Flash sale", liveAdminID, []domain.LiveProductInput{
			{ProductID: liveProductA, Variants: []domain.LiveVariantInput{{VariantID: liveVariantA1, LivePriceVND: "900000", Quota: quota}}},
		})
		require.NoError(t, err)
		return s.ID
	}
	fillCart := func(t *testing.T, userID, variantID string, quantity int) {
		t.Helper()
		for i := 0; i < quantity; i++ {
			_, err := cartRepo.AddVariant(ctx, userID, variantID)
			require.NoError(t, err)
		}
	}
	line := func(variantID string, quantity int64, price domain.MoneyVND) []domain.OrderLineInput {
		return []domain.OrderLineInput{{VariantID: variantID, Quantity: quantity, ProductName: "Live Phone A", UnitPriceVND: price}}
	}
	quota := func(v int) *int { return &v }

	t.Run("an order at the live price consumes quota and records the session", func(t *testing.T) {
		reset(t)
		session := startSession(t, quota(5))
		fillCart(t, liveCustomerID, liveVariantA1, 2)

		order, err := orderRepo.Create(ctx, liveCustomerID, addressOf(t, liveCustomerID), line(liveVariantA1, 2, "900000"), "0")
		require.NoError(t, err)
		assert.Equal(t, domain.MoneyVND("900000"), order.Items[0].UnitPriceVND)
		assert.Equal(t, domain.MoneyVND("1800000"), order.SubtotalVND)
		assert.Equal(t, int32(2), soldQuantity(t, ctx, conn, session, liveVariantA1))

		var recorded *string
		require.NoError(t, conn.QueryRow(ctx, `SELECT live_session_id::text FROM order_items WHERE order_id = $1`, order.ID).Scan(&recorded))
		require.NotNil(t, recorded)
		assert.Equal(t, session, *recorded)
	})

	t.Run("an order beyond the remaining quota is refused without side effects", func(t *testing.T) {
		reset(t)
		session := startSession(t, quota(2))
		fillCart(t, liveCustomerID, liveVariantA1, 3)

		_, err := orderRepo.Create(ctx, liveCustomerID, addressOf(t, liveCustomerID), line(liveVariantA1, 3, "900000"), "0")
		var quotaErr *domain.LiveQuotaExceededError
		require.True(t, errors.As(err, &quotaErr), "err = %v", err)
		assert.EqualValues(t, 2, quotaErr.Remaining)
		assert.Equal(t, "Live Phone A", quotaErr.ProductName)
		assert.Equal(t, int32(0), soldQuantity(t, ctx, conn, session, liveVariantA1))
		var orders, stock int
		require.NoError(t, conn.QueryRow(ctx, `SELECT count(*) FROM orders`).Scan(&orders))
		require.NoError(t, conn.QueryRow(ctx, `SELECT stock_quantity FROM product_variants WHERE id = $1`, liveVariantA1).Scan(&stock))
		assert.Zero(t, orders)
		assert.Equal(t, 10, stock)
	})

	t.Run("concurrent orders never oversell the quota", func(t *testing.T) {
		reset(t)
		session := startSession(t, quota(1))
		fillCart(t, liveCustomerID, liveVariantA1, 1)
		fillCart(t, liveCustomer2, liveVariantA1, 1)

		users := []string{liveCustomerID, liveCustomer2}
		addresses := []string{addressOf(t, users[0]), addressOf(t, users[1])}
		var wg sync.WaitGroup
		errs := make([]error, 2)
		for i := range users {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				_, errs[i] = orderRepo.Create(ctx, users[i], addresses[i], line(liveVariantA1, 1, "900000"), "0")
			}(i)
		}
		wg.Wait()

		succeeded := 0
		for _, err := range errs {
			if err == nil {
				succeeded++
				continue
			}
			var changed *domain.ProductChangedError
			assert.True(t, errors.As(err, &changed), "the loser sees the price change, got %v", err)
		}
		assert.Equal(t, 1, succeeded)
		assert.Equal(t, int32(1), soldQuantity(t, ctx, conn, session, liveVariantA1))
	})

	t.Run("a stale live price after the session ended is a product change", func(t *testing.T) {
		reset(t)
		session := startSession(t, nil)
		fillCart(t, liveCustomerID, liveVariantA1, 1)
		_, err := liveRepo.EndSession(ctx, session, domain.LiveEndReasonAdmin)
		require.NoError(t, err)

		_, err = orderRepo.Create(ctx, liveCustomerID, addressOf(t, liveCustomerID), line(liveVariantA1, 1, "900000"), "0")
		var changed *domain.ProductChangedError
		require.True(t, errors.As(err, &changed), "err = %v", err)

		order, err := orderRepo.Create(ctx, liveCustomerID, addressOf(t, liveCustomerID), line(liveVariantA1, 1, "1000000"), "0")
		require.NoError(t, err)
		var recorded *string
		require.NoError(t, conn.QueryRow(ctx, `SELECT live_session_id::text FROM order_items WHERE order_id = $1`, order.ID).Scan(&recorded))
		assert.Nil(t, recorded, "regular-price lines carry no session")
	})

	t.Run("customer cancellation restores quota while the session is live", func(t *testing.T) {
		reset(t)
		session := startSession(t, quota(5))
		fillCart(t, liveCustomerID, liveVariantA1, 2)
		order, err := orderRepo.Create(ctx, liveCustomerID, addressOf(t, liveCustomerID), line(liveVariantA1, 2, "900000"), "0")
		require.NoError(t, err)

		cancelled, err := orderRepo.Cancel(ctx, liveCustomerID, order.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.OrderStatusCancelled, cancelled.Status)
		assert.Equal(t, int32(0), soldQuantity(t, ctx, conn, session, liveVariantA1))
		assert.Equal(t, domain.MoneyVND("900000"), cancelled.Items[0].UnitPriceVND, "the recorded price never changes")
	})

	t.Run("approved cancellation restores quota; requests and ended sessions do not", func(t *testing.T) {
		reset(t)
		session := startSession(t, quota(5))
		fillCart(t, liveCustomerID, liveVariantA1, 2)
		order, err := orderRepo.Create(ctx, liveCustomerID, addressOf(t, liveCustomerID), line(liveVariantA1, 2, "900000"), "0")
		require.NoError(t, err)
		_, err = conn.Exec(ctx, `UPDATE orders SET status = 'preparing' WHERE id = $1`, order.ID)
		require.NoError(t, err)

		requested, err := orderRepo.Cancel(ctx, liveCustomerID, order.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.OrderStatusCancelRequested, requested.Status)
		assert.Equal(t, int32(2), soldQuantity(t, ctx, conn, session, liveVariantA1), "a cancel request keeps the quota")

		_, err = orderRepo.AdminTransition(ctx, order.ID, domain.OrderAdminActionApproveCancel)
		require.NoError(t, err)
		assert.Equal(t, int32(0), soldQuantity(t, ctx, conn, session, liveVariantA1))

		fillCart(t, liveCustomerID, liveVariantA1, 1)
		second, err := orderRepo.Create(ctx, liveCustomerID, addressOf(t, liveCustomerID), line(liveVariantA1, 1, "900000"), "0")
		require.NoError(t, err)
		_, err = liveRepo.EndSession(ctx, session, domain.LiveEndReasonAdmin)
		require.NoError(t, err)
		_, err = orderRepo.Cancel(ctx, liveCustomerID, second.ID)
		require.NoError(t, err)
		assert.Equal(t, int32(1), soldQuantity(t, ctx, conn, session, liveVariantA1), "ended sessions keep their sold count")
	})
}
