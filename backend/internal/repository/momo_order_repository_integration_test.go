//go:build integration

package repository

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

func TestMomoOrderRepository_Integration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	orderRepo := NewOrderRepository(pool)
	cartRepo := NewCartRepository(pool)
	liveRepo := NewLiveRepository(pool)
	returnRepo := NewReturnRepository(pool)

	var addr1, addr2 string
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Lan', '0900000001', 1, 'Hà Nội', 1, 'Phúc Xá', '123 Cầu Giấy', true) RETURNING id`, liveCustomerID).Scan(&addr1))
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Minh', '0900000002', 1, 'Hà Nội', 1, 'Phúc Xá', '456 Kim Mã', true) RETURNING id`, liveCustomer2).Scan(&addr2))

	reset := func(t *testing.T) {
		t.Helper()
		_, err := conn.Exec(ctx, `
			DELETE FROM return_request_items;
			DELETE FROM return_requests;
			DELETE FROM order_items;
			DELETE FROM orders;
			DELETE FROM cart_items;
			DELETE FROM live_sessions;
			UPDATE product_variants
			SET stock_quantity = 20,
			    price_vnd = CASE id
			        WHEN $1::uuid THEN 1000000
			        WHEN $2::uuid THEN 2000000
			        ELSE 3000000
			    END`,
			liveVariantA1, liveVariantA2,
		)
		require.NoError(t, err)
	}

	fillCart := func(t *testing.T, userID, variantID string, qty int) {
		t.Helper()
		for i := 0; i < qty; i++ {
			_, err := cartRepo.AddVariant(ctx, userID, variantID)
			require.NoError(t, err)
		}
	}

	t.Run("migration 000024 constraints and index exist", func(t *testing.T) {
		var idxCount int
		require.NoError(t, conn.QueryRow(ctx, `SELECT count(*) FROM pg_indexes WHERE tablename = 'orders' AND indexname = 'orders_pending_payment_timeout_idx'`).Scan(&idxCount))
		assert.Equal(t, 1, idxCount)

		_, err := conn.Exec(ctx, `INSERT INTO orders (user_id, status, payment_method, payment_status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address)
			VALUES ($1, 'pending_confirmation', 'invalid_method', 'pending', 1000, 0, 1000, 'A', '090', 'HN', 'W', 'D')`, liveCustomerID)
		assert.Error(t, err)

		_, err = conn.Exec(ctx, `INSERT INTO orders (user_id, status, payment_method, payment_status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address)
			VALUES ($1, 'pending_confirmation', 'momo', 'invalid_status', 1000, 0, 1000, 'A', '090', 'HN', 'W', 'D')`, liveCustomerID)
		assert.Error(t, err)
	})

	t.Run("momo amount out of range rejects without modifying stock, live quota, or cart", func(t *testing.T) {
		reset(t)
		_, err := conn.Exec(ctx, `UPDATE product_variants SET price_vnd = 500 WHERE id = $1`, liveVariantA1)
		require.NoError(t, err)
		fillCart(t, liveCustomerID, liveVariantA1, 1)

		_, err = orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "500"},
		}, "0", domain.PaymentMethodMomo)
		require.ErrorIs(t, err, domain.ErrMomoAmountOutOfRange)

		var cartCount, orderCount, stock int
		require.NoError(t, conn.QueryRow(ctx, `SELECT count(*) FROM cart_items WHERE user_id = $1`, liveCustomerID).Scan(&cartCount))
		require.NoError(t, conn.QueryRow(ctx, `SELECT count(*) FROM orders`).Scan(&orderCount))
		require.NoError(t, conn.QueryRow(ctx, `SELECT stock_quantity FROM product_variants WHERE id = $1`, liveVariantA1).Scan(&stock))
		assert.Equal(t, 1, cartCount)
		assert.Equal(t, 0, orderCount)
		assert.Equal(t, 20, stock)

		// > 50,000,000 VND
		reset(t)
		_, err = conn.Exec(ctx, `UPDATE product_variants SET price_vnd = 30000000 WHERE id = $1`, liveVariantA1)
		require.NoError(t, err)
		fillCart(t, liveCustomerID, liveVariantA1, 2)

		_, err = orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "30000000"},
		}, "0", domain.PaymentMethodMomo)
		require.ErrorIs(t, err, domain.ErrMomoAmountOutOfRange)
	})

	t.Run("ApplyMomoCallback handles success, failure, cancelled order, and concurrent calls idempotently", func(t *testing.T) {
		reset(t)
		fillCart(t, liveCustomerID, liveVariantA1, 1)
		order, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
		}, "0", domain.PaymentMethodMomo)
		require.NoError(t, err)
		assert.Equal(t, domain.PaymentMethodMomo, order.PaymentMethod)
		assert.Equal(t, domain.PaymentStatusPending, order.PaymentStatus)

		// Fail first
		failed, justPaid, err := orderRepo.ApplyMomoCallback(ctx, order.ID, liveCustomerID, "1000000", "", 1006)
		require.NoError(t, err)
		assert.False(t, justPaid)
		assert.Equal(t, domain.PaymentStatusFailed, failed.PaymentStatus)
		assert.Equal(t, domain.OrderStatusPendingConfirmation, failed.Status)

		// Amount mismatch rejected
		_, _, err = orderRepo.ApplyMomoCallback(ctx, order.ID, liveCustomerID, "999000", "TX1", 0)
		require.ErrorIs(t, err, domain.ErrMomoInvalidCallback)

		// Concurrent success calls: exactly one reports justPaid = true
		var wg sync.WaitGroup
		paidFlags := make([]bool, 2)
		errs := make([]error, 2)
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				userArg := liveCustomerID
				if idx == 1 {
					userArg = "" // IPN
				}
				_, paidFlags[idx], errs[idx] = orderRepo.ApplyMomoCallback(ctx, order.ID, userArg, "1000000", "4088812345", 0)
			}(i)
		}
		wg.Wait()
		require.NoError(t, errs[0])
		require.NoError(t, errs[1])
		assert.NotEqual(t, paidFlags[0], paidFlags[1], "exactly one concurrent callback should transition order to paid")

		// Late failed IPN does not downgrade paid order
		afterLateFail, justPaid, err := orderRepo.ApplyMomoCallback(ctx, order.ID, "", "1000000", "", 1006)
		require.NoError(t, err)
		assert.False(t, justPaid)
		assert.Equal(t, domain.PaymentStatusPaid, afterLateFail.PaymentStatus)
		assert.Equal(t, domain.OrderStatusConfirmed, afterLateFail.Status)
		require.NotNil(t, afterLateFail.PaymentTransactionID)
		assert.Equal(t, "4088812345", *afterLateFail.PaymentTransactionID)

		// Late success callback on already-cancelled order does not re-confirm
		fillCart(t, liveCustomer2, liveVariantA1, 1)
		cancelledOrder, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomer2, addr2, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
		}, "0", domain.PaymentMethodMomo)
		require.NoError(t, err)
		_, err = orderRepo.Cancel(ctx, liveCustomer2, cancelledOrder.ID)
		require.NoError(t, err)

		res, justPaid, err := orderRepo.ApplyMomoCallback(ctx, cancelledOrder.ID, "", "1000000", "TX99", 0)
		require.NoError(t, err)
		assert.False(t, justPaid)
		assert.Equal(t, domain.OrderStatusCancelled, res.Status)
	})

	t.Run("AutoConfirmDueReturning confirms COD only; AutoCancelExpiredMomoOrders cancels expired MoMo and restores stock and live quota", func(t *testing.T) {
		reset(t)
		session, err := liveRepo.CreateSession(ctx, "Live MoMo", liveAdminID, []domain.LiveProductInput{
			{ProductID: liveProductA, Variants: []domain.LiveVariantInput{{VariantID: liveVariantA1, LivePriceVND: "900000", Quota: intPtr(5)}}},
		})
		require.NoError(t, err)

		// 1. Expired COD order
		fillCart(t, liveCustomerID, liveVariantA2, 1)
		codOrder, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA2, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "2000000"},
		}, "0", domain.PaymentMethodCOD)
		require.NoError(t, err)

		// 2. Expired MoMo order with live quota
		fillCart(t, liveCustomerID, liveVariantA1, 2)
		momoExpired, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "900000"},
		}, "0", domain.PaymentMethodMomo)
		require.NoError(t, err)
		require.NoError(t, orderRepo.SetPaymentFailed(ctx, momoExpired.ID))

		// 3. Fresh MoMo order (not expired)
		fillCart(t, liveCustomer2, liveVariantA1, 1)
		momoFresh, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomer2, addr2, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "900000"},
		}, "0", domain.PaymentMethodMomo)
		require.NoError(t, err)

		oldTime := time.Now().UTC().Add(-45 * time.Minute)
		_, err = conn.Exec(ctx, `UPDATE orders SET created_at = $1 WHERE id IN ($2, $3)`, oldTime, codOrder.ID, momoExpired.ID)
		require.NoError(t, err)

		cutoff := time.Now().UTC().Add(-30 * time.Minute)
		confirmed, err := orderRepo.AutoConfirmDueReturning(ctx, cutoff)
		require.NoError(t, err)
		require.Len(t, confirmed, 1)
		assert.Equal(t, codOrder.ID, confirmed[0].ID)

		expired, err := orderRepo.AutoCancelExpiredMomoOrders(ctx, cutoff)
		require.NoError(t, err)
		require.Len(t, expired, 1)
		assert.Equal(t, momoExpired.ID, expired[0].ID)

		gotExpired, err := orderRepo.GetByID(ctx, liveCustomerID, momoExpired.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.OrderStatusCancelled, gotExpired.Status)
		assert.Equal(t, domain.PaymentStatusFailed, gotExpired.PaymentStatus)
		assert.NotNil(t, gotExpired.CancelledAt)

		gotFresh, err := orderRepo.GetByID(ctx, liveCustomer2, momoFresh.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.OrderStatusPendingConfirmation, gotFresh.Status)

		// Stock restored: started 20, momoExpired took 2 (restored), momoFresh took 1 => 19
		var stock int
		require.NoError(t, conn.QueryRow(ctx, `SELECT stock_quantity FROM product_variants WHERE id = $1`, liveVariantA1).Scan(&stock))
		assert.Equal(t, 19, stock)

		// Live quota restored: sold_quantity should be 1 (only momoFresh)
		assert.Equal(t, int32(1), soldQuantity(t, ctx, conn, session.ID, liveVariantA1))
	})

	t.Run("COD deliver sets paid, cancel paid order and full RefundAdmin set refunded", func(t *testing.T) {
		reset(t)
		// COD deliver -> paid
		fillCart(t, liveCustomerID, liveVariantA1, 1)
		codOrder, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
		}, "0", domain.PaymentMethodCOD)
		require.NoError(t, err)
		_, err = orderRepo.AutoConfirmDueReturning(ctx, time.Now().UTC().Add(time.Minute))
		require.NoError(t, err)
		_, err = orderRepo.AdminTransition(ctx, codOrder.ID, domain.OrderAdminActionConfirmPreparing)
		require.NoError(t, err)
		_, err = orderRepo.AdminTransition(ctx, codOrder.ID, domain.OrderAdminActionShip)
		require.NoError(t, err)
		deliveredCOD, err := orderRepo.AdminTransition(ctx, codOrder.ID, domain.OrderAdminActionDeliver)
		require.NoError(t, err)
		assert.Equal(t, domain.PaymentStatusPaid, deliveredCOD.PaymentStatus)
		assert.NotNil(t, deliveredCOD.PaidAt)

		// Paid MoMo order customer cancel at confirmed -> refunded
		fillCart(t, liveCustomerID, liveVariantA1, 1)
		momoOrder, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
		}, "0", domain.PaymentMethodMomo)
		require.NoError(t, err)
		_, justPaid, err := orderRepo.ApplyMomoCallback(ctx, momoOrder.ID, liveCustomerID, "1000000", "TX-CANCEL", 0)
		require.NoError(t, err)
		assert.True(t, justPaid)

		cancelledPaid, err := orderRepo.Cancel(ctx, liveCustomerID, momoOrder.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.OrderStatusCancelled, cancelledPaid.Status)
		assert.Equal(t, domain.PaymentStatusRefunded, cancelledPaid.PaymentStatus)

		// Full return refund on paid MoMo order -> refunded
		fillCart(t, liveCustomerID, liveVariantA1, 1)
		momoReturnOrder, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
		}, "0", domain.PaymentMethodMomo)
		require.NoError(t, err)
		_, _, err = orderRepo.ApplyMomoCallback(ctx, momoReturnOrder.ID, liveCustomerID, "1000000", "TX-RET", 0)
		require.NoError(t, err)
		_, err = orderRepo.AdminTransition(ctx, momoReturnOrder.ID, domain.OrderAdminActionConfirmPreparing)
		require.NoError(t, err)
		_, err = orderRepo.AdminTransition(ctx, momoReturnOrder.ID, domain.OrderAdminActionShip)
		require.NoError(t, err)
		deliveredMomo, err := orderRepo.AdminTransition(ctx, momoReturnOrder.ID, domain.OrderAdminActionDeliver)
		require.NoError(t, err)

		retReq, err := returnRepo.CreateReturnRequest(ctx, domain.CreateReturnInput{
			OrderID:      momoReturnOrder.ID,
			UserID:       liveCustomerID,
			OrderItemIDs: []string{deliveredMomo.Items[0].ID},
			ReasonCode:   domain.ReturnReasonDefective,
			Description:  "Damaged",
		})
		require.NoError(t, err)
		_, err = returnRepo.ApproveAdmin(ctx, retReq.ID)
		require.NoError(t, err)
		_, err = returnRepo.ReceiveAdmin(ctx, retReq.ID, []domain.ReceiveItemMapping{
			{OrderItemID: deliveredMomo.Items[0].ID, ReceivedVariantID: liveVariantA1},
		})
		require.NoError(t, err)
		_, err = returnRepo.RefundAdmin(ctx, retReq.ID, liveAdminID)
		require.NoError(t, err)

		afterRefund, err := orderRepo.GetByID(ctx, liveCustomerID, momoReturnOrder.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.OrderStatusReturned, afterRefund.Status)
		assert.Equal(t, domain.PaymentStatusRefunded, afterRefund.PaymentStatus)

		// Partial return on paid order keeps paymentStatus = paid
		fillCart(t, liveCustomerID, liveVariantA1, 1)
		fillCart(t, liveCustomerID, liveVariantA2, 1)
		partialOrder, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
			{VariantID: liveVariantA2, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "2000000"},
		}, "0", domain.PaymentMethodMomo)
		require.NoError(t, err)
		_, _, err = orderRepo.ApplyMomoCallback(ctx, partialOrder.ID, liveCustomerID, "3000000", "TX-PART", 0)
		require.NoError(t, err)
		_, err = orderRepo.AdminTransition(ctx, partialOrder.ID, domain.OrderAdminActionConfirmPreparing)
		require.NoError(t, err)
		_, err = orderRepo.AdminTransition(ctx, partialOrder.ID, domain.OrderAdminActionShip)
		require.NoError(t, err)
		deliveredPartial, err := orderRepo.AdminTransition(ctx, partialOrder.ID, domain.OrderAdminActionDeliver)
		require.NoError(t, err)

		partialRet, err := returnRepo.CreateReturnRequest(ctx, domain.CreateReturnInput{
			OrderID:      partialOrder.ID,
			UserID:       liveCustomerID,
			OrderItemIDs: []string{deliveredPartial.Items[0].ID},
			ReasonCode:   domain.ReturnReasonDefective,
			Description:  "One item damaged",
		})
		require.NoError(t, err)
		_, err = returnRepo.ApproveAdmin(ctx, partialRet.ID)
		require.NoError(t, err)
		_, err = returnRepo.ReceiveAdmin(ctx, partialRet.ID, []domain.ReceiveItemMapping{
			{OrderItemID: deliveredPartial.Items[0].ID, ReceivedVariantID: deliveredPartial.Items[0].VariantID},
		})
		require.NoError(t, err)
		_, err = returnRepo.RefundAdmin(ctx, partialRet.ID, liveAdminID)
		require.NoError(t, err)

		afterPartial, err := orderRepo.GetByID(ctx, liveCustomerID, partialOrder.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.OrderStatusPartiallyReturned, afterPartial.Status)
		assert.Equal(t, domain.PaymentStatusPaid, afterPartial.PaymentStatus)

		// Cancel unpaid pending_confirmation MoMo order keeps paymentStatus = pending
		fillCart(t, liveCustomerID, liveVariantA1, 1)
		unpaidOrder, err := orderRepo.CreateWithPaymentMethod(ctx, liveCustomerID, addr1, []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
		}, "0", domain.PaymentMethodMomo)
		require.NoError(t, err)
		cancelledUnpaid, err := orderRepo.Cancel(ctx, liveCustomerID, unpaidOrder.ID)
		require.NoError(t, err)
		assert.Equal(t, domain.OrderStatusCancelled, cancelledUnpaid.Status)
		assert.Equal(t, domain.PaymentStatusPending, cancelledUnpaid.PaymentStatus)
	})
}

func intPtr(v int) *int {
	return &v
}
