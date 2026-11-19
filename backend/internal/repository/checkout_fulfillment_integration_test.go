//go:build integration

package repository

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"commerce-backend/internal/domain"
)

// DB-CHECKOUT-FULFILLMENT@1: migration 000027 up -> down -> up round-trip, backfill, and constraints.
func TestCheckoutFulfillment_Migration000027RoundTripAndBackfill(t *testing.T) {
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

	// Apply migrations up through 000026 first to simulate existing production data before 000027.
	migrations := upMigrationNames(t)
	sort.Strings(migrations)
	var has000027 bool
	for _, name := range migrations {
		if name == "000027_vouchers_shipping_timeline.up.sql" {
			has000027 = true
			continue
		}
		applyMigration(t, ctx, conn, name)
	}
	require.True(t, has000027, "migration 000027_vouchers_shipping_timeline.up.sql must exist")

	seedLiveFixtures(t, ctx, conn)

	base := time.Date(2026, 11, 10, 10, 0, 0, 0, time.UTC)
	ordPending := uuid.NewString()
	ordPreparing := uuid.NewString()
	ordShipped := uuid.NewString()
	ordDelivered := uuid.NewString()
	ordCancelled := uuid.NewString()

	_, err = conn.Exec(ctx, `
		INSERT INTO orders (id, user_id, status, payment_method, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address, created_at, updated_at, confirmed_at, cancelled_at, delivered_at)
		VALUES
		($1, $6, 'pending_confirmation', 'cod', 1000000, 0, 1000000, 'Lan', '0900000001', 'HN', 'W', 'D', $7, $7, NULL, NULL, NULL),
		($2, $6, 'preparing', 'cod', 1000000, 0, 1000000, 'Lan', '0900000001', 'HN', 'W', 'D', $7, $8, $8, NULL, NULL),
		($3, $6, 'shipped', 'cod', 1000000, 0, 1000000, 'Lan', '0900000001', 'HN', 'W', 'D', $7, $9, $8, NULL, NULL),
		($4, $6, 'delivered', 'cod', 1000000, 0, 1000000, 'Lan', '0900000001', 'HN', 'W', 'D', $7, $10, $8, NULL, $10),
		($5, $6, 'cancelled', 'cod', 1000000, 0, 1000000, 'Lan', '0900000001', 'HN', 'W', 'D', $7, $8, NULL, $8, NULL)
	`, ordPending, ordPreparing, ordShipped, ordDelivered, ordCancelled, liveCustomerID, base, base.Add(1*time.Hour), base.Add(2*time.Hour), base.Add(3*time.Hour))
	require.NoError(t, err)

	// Apply 000027 up migration
	execMigrationFile(t, ctx, conn, "000027_vouchers_shipping_timeline.up.sql")

	// Verify tables & columns exist
	for _, tbl := range []string{"public.vouchers", "public.voucher_usages", "public.order_status_events"} {
		var exists bool
		require.NoError(t, conn.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`, tbl).Scan(&exists))
		assert.True(t, exists, "%s must exist", tbl)
	}

	// Verify backfill of preparing_at, shipped_at, and order_status_events
	var preparingAt, shippedAt *time.Time
	require.NoError(t, conn.QueryRow(ctx, `SELECT preparing_at, shipped_at FROM orders WHERE id = $1`, ordPreparing).Scan(&preparingAt, &shippedAt))
	require.NotNil(t, preparingAt)
	assert.True(t, preparingAt.Equal(base.Add(1*time.Hour)))
	assert.Nil(t, shippedAt)

	require.NoError(t, conn.QueryRow(ctx, `SELECT preparing_at, shipped_at FROM orders WHERE id = $1`, ordDelivered).Scan(&preparingAt, &shippedAt))
	require.NotNil(t, preparingAt)
	require.NotNil(t, shippedAt)
	assert.True(t, shippedAt.Equal(base.Add(3*time.Hour)))

	rows, err := conn.Query(ctx, `SELECT status FROM order_status_events WHERE order_id = $1 ORDER BY created_at ASC, id ASC`, ordDelivered)
	require.NoError(t, err)
	var statuses []string
	for rows.Next() {
		var s string
		require.NoError(t, rows.Scan(&s))
		statuses = append(statuses, s)
	}
	rows.Close()
	assert.Contains(t, statuses, "pending_confirmation")
	assert.Contains(t, statuses, "confirmed")
	assert.Contains(t, statuses, "shipped")
	assert.Contains(t, statuses, "delivered")

	// Verify 0-amount return_requests are allowed after 000027
	zeroRetID := uuid.NewString()
	_, err = conn.Exec(ctx, `
		INSERT INTO return_requests (id, order_id, user_id, status, reason_code, expected_refund_amount_vnd, refund_amount_vnd, refunded_by_user_id, refunded_at)
		VALUES ($1, $2, $3, 'refunded', 'defective', 0, 0, $4, now())
	`, zeroRetID, ordDelivered, liveCustomerID, liveAdminID)
	require.NoError(t, err, "0 VND expected/actual refund must be allowed under PD-2")

	// Verify order_items_single_promo_source_check rejects both live_session_id and flash_sale_id
	sessID := uuid.NewString()
	fsID := uuid.NewString()
	_, err = conn.Exec(ctx, `INSERT INTO live_sessions (id, title, created_by) VALUES ($1, 'S1', $2)`, sessID, liveAdminID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO flash_sales (id, name, starts_at, ends_at) VALUES ($1, 'F1', now() - interval '1h', now() + interval '1h')`, fsID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO order_items (order_id, variant_id, product_id, brand_name, product_name, unit_price_vnd, quantity, line_total_vnd, live_session_id, flash_sale_id)
		VALUES ($1, $2, $3, 'Aura', 'Phone', 1000, 1, 1000, $4, $5)
	`, ordPending, liveVariantA1, liveProductA, sessID, fsID)
	require.Error(t, err, "must reject both live_session_id and flash_sale_id")

	// Verify vouchers check constraints reject invalid rows
	_, err = conn.Exec(ctx, `
		INSERT INTO vouchers (code, title, voucher_type, discount_value, max_discount_vnd, starts_at, ends_at)
		VALUES ('BADMAX', 'Invalid', 'fixed_amount', 100000, 50000, now(), now() + interval '1 day')
	`)
	require.Error(t, err, "fixed_amount must reject non-null max_discount_vnd")

	_, err = conn.Exec(ctx, `
		INSERT INTO vouchers (code, title, voucher_type, discount_value, starts_at, ends_at)
		VALUES ('lowercase', 'Invalid', 'fixed_amount', 100000, now(), now() + interval '1 day')
	`)
	require.Error(t, err, "lowercase voucher code must be rejected")

	// Down migration cleans up cleanly even with 0-refund return row present, then re-up works.
	execMigrationFile(t, ctx, conn, "000027_vouchers_shipping_timeline.down.sql")
	for _, tbl := range []string{"public.vouchers", "public.voucher_usages", "public.order_status_events"} {
		var exists bool
		require.NoError(t, conn.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`, tbl).Scan(&exists))
		assert.False(t, exists, "%s must be dropped after down migration", tbl)
	}

	execMigrationFile(t, ctx, conn, "000027_vouchers_shipping_timeline.up.sql")
	var exists bool
	require.NoError(t, conn.QueryRow(ctx, `SELECT to_regclass('public.vouchers') IS NOT NULL`).Scan(&exists))
	assert.True(t, exists)
	_ = pgxpool.Config{}
}

// Requirements 1.1, 1.2, 1.3: VoucherRepository CRUD, immutability guards when usedCount > 0, and available listing.
func TestVoucherRepository_CRUDAndAvailableIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	repo := NewVoucherRepository(pool)

	now := time.Now().UTC().Truncate(time.Second)
	usageLimit2 := 2

	// 1. Create active vouchers (percent, fixed_amount, freeship)
	vPercent, err := repo.Create(ctx, domain.SaveVoucherInput{
		Code:           "AURA10",
		Title:          "Giảm 10% tối đa 500K",
		Description:    "Áp dụng điện thoại",
		VoucherType:    domain.VoucherTypePercent,
		DiscountValue:  "10",
		MaxDiscountVND: domain.MoneyVNDPtr("500000"),
		MinOrderVND:    "1000000",
		UsageLimit:     &usageLimit2,
		PerUserLimit:   1,
		StartsAt:       now.Add(-1 * time.Hour),
		EndsAt:         now.Add(2 * time.Hour),
		Active:         true,
	})
	require.NoError(t, err)
	assert.Equal(t, domain.VoucherStatusActive, vPercent.EffectiveStatus)

	vFreeship, err := repo.Create(ctx, domain.SaveVoucherInput{
		Code:           "FREESHIP",
		Title:          "Miễn phí vận chuyển",
		Description:    "",
		VoucherType:    domain.VoucherTypeFreeship,
		DiscountValue:  "0",
		MaxDiscountVND: nil,
		MinOrderVND:    "0",
		UsageLimit:     nil,
		PerUserLimit:   2,
		StartsAt:       now.Add(-1 * time.Hour),
		EndsAt:         now.Add(1 * time.Hour), // earlier endsAt -> appears first in available list
		Active:         true,
	})
	require.NoError(t, err)

	// Scheduled, expired, inactive vouchers should not appear in ListAvailableForUser
	_, err = repo.Create(ctx, domain.SaveVoucherInput{
		Code:          "FUTURE",
		Title:         "Sắp diễn ra",
		VoucherType:   domain.VoucherTypeFixedAmount,
		DiscountValue: "100000",
		MinOrderVND:   "0",
		PerUserLimit:  1,
		StartsAt:      now.Add(1 * time.Hour),
		EndsAt:        now.Add(5 * time.Hour),
		Active:        true,
	})
	require.NoError(t, err)

	_, err = repo.Create(ctx, domain.SaveVoucherInput{
		Code:          "EXPIRED",
		Title:         "Hết hạn",
		VoucherType:   domain.VoucherTypeFixedAmount,
		DiscountValue: "100000",
		MinOrderVND:   "0",
		PerUserLimit:  1,
		StartsAt:      now.Add(-5 * time.Hour),
		EndsAt:        now.Add(-1 * time.Hour),
		Active:        true,
	})
	require.NoError(t, err)

	_, err = repo.Create(ctx, domain.SaveVoucherInput{
		Code:          "PAUSED",
		Title:         "Tạm tắt",
		VoucherType:   domain.VoucherTypeFixedAmount,
		DiscountValue: "100000",
		MinOrderVND:   "0",
		PerUserLimit:  1,
		StartsAt:      now.Add(-1 * time.Hour),
		EndsAt:        now.Add(5 * time.Hour),
		Active:        false,
	})
	require.NoError(t, err)

	// Duplicate code fails with ErrVoucherCodeInUse
	_, err = repo.Create(ctx, domain.SaveVoucherInput{
		Code:          "AURA10",
		Title:         "Trùng mã",
		VoucherType:   domain.VoucherTypeFixedAmount,
		DiscountValue: "50000",
		MinOrderVND:   "0",
		PerUserLimit:  1,
		StartsAt:      now.Add(-time.Hour),
		EndsAt:        now.Add(time.Hour),
		Active:        true,
	})
	assert.ErrorIs(t, err, domain.ErrVoucherCodeInUse)

	// ListAdmin search & status filter
	items, total, err := repo.ListAdmin(ctx, domain.VoucherListFilter{Query: "aura", Status: "active", Limit: 10, Offset: 0})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, items, 1)
	assert.Equal(t, "AURA10", items[0].Code)

	// ListAvailableForUser returns FREESHIP first (endsAt earlier) then AURA10
	avail, err := repo.ListAvailableForUser(ctx, liveCustomerID, now)
	require.NoError(t, err)
	require.Len(t, avail, 2)
	assert.Equal(t, "FREESHIP", avail[0].Code)
	assert.Equal(t, 2, avail[0].UserRemainingUses)
	assert.Equal(t, "AURA10", avail[1].Code)
	assert.Equal(t, 1, avail[1].UserRemainingUses)

	// Update when usedCount == 0 allows changing code & type
	vFreeship, err = repo.Update(ctx, vFreeship.ID, domain.SaveVoucherInput{
		Code:           "SHIPFREE",
		Title:          "Miễn phí vận chuyển V2",
		Description:    "Cập nhật",
		VoucherType:    domain.VoucherTypeFreeship,
		DiscountValue:  "0",
		MaxDiscountVND: domain.MoneyVNDPtr("30000"),
		MinOrderVND:    "500000",
		UsageLimit:     nil,
		PerUserLimit:   2,
		StartsAt:       vFreeship.StartsAt,
		EndsAt:         vFreeship.EndsAt,
		Active:         true,
	})
	require.NoError(t, err)
	assert.Equal(t, "SHIPFREE", vFreeship.Code)

	// Simulate used_count = 2 on AURA10 and 1 active usage by liveCustomerID + 1 restored usage by liveCustomer2
	_, err = conn.Exec(ctx, `UPDATE vouchers SET used_count = 2 WHERE id = $1`, vPercent.ID)
	require.NoError(t, err)

	// Changing code or voucherType when used_count > 0 fails with ErrVoucherImmutableFields
	_, err = repo.Update(ctx, vPercent.ID, domain.SaveVoucherInput{
		Code:           "AURA10NEW",
		Title:          vPercent.Title,
		VoucherType:    vPercent.VoucherType,
		DiscountValue:  vPercent.DiscountValue,
		MaxDiscountVND: vPercent.MaxDiscountVND,
		MinOrderVND:    vPercent.MinOrderVND,
		UsageLimit:     vPercent.UsageLimit,
		PerUserLimit:   1,
		StartsAt:       vPercent.StartsAt,
		EndsAt:         vPercent.EndsAt,
		Active:         true,
	})
	assert.ErrorIs(t, err, domain.ErrVoucherImmutableFields)

	_, err = repo.Update(ctx, vPercent.ID, domain.SaveVoucherInput{
		Code:          vPercent.Code,
		Title:         vPercent.Title,
		VoucherType:   domain.VoucherTypeFixedAmount,
		DiscountValue: "100000",
		MinOrderVND:   vPercent.MinOrderVND,
		UsageLimit:    vPercent.UsageLimit,
		PerUserLimit:  1,
		StartsAt:      vPercent.StartsAt,
		EndsAt:        vPercent.EndsAt,
		Active:        true,
	})
	assert.ErrorIs(t, err, domain.ErrVoucherImmutableFields)

	// Lowering usageLimit < usedCount fails with ErrVoucherUsageLimitTooLow
	lowLimit := 1
	_, err = repo.Update(ctx, vPercent.ID, domain.SaveVoucherInput{
		Code:           vPercent.Code,
		Title:          vPercent.Title,
		VoucherType:    vPercent.VoucherType,
		DiscountValue:  vPercent.DiscountValue,
		MaxDiscountVND: vPercent.MaxDiscountVND,
		MinOrderVND:    vPercent.MinOrderVND,
		UsageLimit:     &lowLimit,
		PerUserLimit:   1,
		StartsAt:       vPercent.StartsAt,
		EndsAt:         vPercent.EndsAt,
		Active:         true,
	})
	assert.ErrorIs(t, err, domain.ErrVoucherUsageLimitTooLow)

	// Delete when usedCount > 0 fails with ErrVoucherInUse
	assert.ErrorIs(t, repo.Delete(ctx, vPercent.ID), domain.ErrVoucherInUse)

	// Extending endsAt & disabling active when usedCount > 0 succeeds
	updatedUsed, err := repo.Update(ctx, vPercent.ID, domain.SaveVoucherInput{
		Code:           vPercent.Code,
		Title:          vPercent.Title,
		VoucherType:    vPercent.VoucherType,
		DiscountValue:  vPercent.DiscountValue,
		MaxDiscountVND: vPercent.MaxDiscountVND,
		MinOrderVND:    vPercent.MinOrderVND,
		UsageLimit:     &usageLimit2,
		PerUserLimit:   1,
		StartsAt:       vPercent.StartsAt,
		EndsAt:         vPercent.EndsAt.Add(2 * time.Hour),
		Active:         false,
	})
	require.NoError(t, err)
	assert.False(t, updatedUsed.Active)

	// Delete unused voucher succeeds
	require.NoError(t, repo.Delete(ctx, vFreeship.ID))
	_, err = repo.GetAdminByID(ctx, vFreeship.ID)
	assert.ErrorIs(t, err, domain.ErrVoucherNotFound)
}

func TestOrderRepository_QuoteAndCheckoutShippingVoucherIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	orderRepo := NewOrderRepository(pool)
	cartRepo := NewCartRepository(pool)
	voucherRepo := NewVoucherRepository(pool)
	fsRepo := NewFlashSaleRepository(pool)
	liveRepo := NewLiveRepository(pool)

	var addrHN, addrDN, addrOther string
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Lan', '0900000001', 1, 'Hà Nội', 1, 'Phúc Xá', '1 Tràng Tiền', true) RETURNING id`, liveCustomerID).Scan(&addrHN))
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Lan', '0900000001', 48, 'Đà Nẵng', 1, 'Hải Châu', '2 Bạch Đằng', false) RETURNING id`, liveCustomerID).Scan(&addrDN))
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Lan', '0900000001', 49, 'Quảng Nam', 1, 'Tam Kỳ', '3 Hùng Vương', false) RETURNING id`, liveCustomerID).Scan(&addrOther))

	now := time.Now().UTC().Truncate(time.Second)
	cfg := domain.DefaultShippingConfig()

	// Seed vouchers covering all error states + freeship + fixed + percent
	_, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "INACTIVE1", Title: "Inactive", VoucherType: domain.VoucherTypeFixedAmount,
		DiscountValue: "50000", MinOrderVND: "0", PerUserLimit: 1,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: false,
	})
	require.NoError(t, err)
	_, err = voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "NOTSTART1", Title: "Scheduled", VoucherType: domain.VoucherTypeFixedAmount,
		DiscountValue: "50000", MinOrderVND: "0", PerUserLimit: 1,
		StartsAt: now.Add(time.Hour), EndsAt: now.Add(2 * time.Hour), Active: true,
	})
	require.NoError(t, err)
	_, err = voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "EXPIRED1", Title: "Expired", VoucherType: domain.VoucherTypeFixedAmount,
		DiscountValue: "50000", MinOrderVND: "0", PerUserLimit: 1,
		StartsAt: now.Add(-2 * time.Hour), EndsAt: now.Add(-time.Hour), Active: true,
	})
	require.NoError(t, err)
	_, err = voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "MIN10M", Title: "Min 10M", VoucherType: domain.VoucherTypeFixedAmount,
		DiscountValue: "500000", MinOrderVND: "10000000", PerUserLimit: 1,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
	})
	require.NoError(t, err)
	_, err = voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "SHIP30K", Title: "Freeship 30K", VoucherType: domain.VoucherTypeFreeship,
		DiscountValue: "0", MaxDiscountVND: domain.MoneyVNDPtr("30000"), MinOrderVND: "0", PerUserLimit: 2,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
	})
	require.NoError(t, err)

	// Add 1 unit of variant A1 (1,000,000) to cart
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
	require.NoError(t, err)

	// Regional quotes below free threshold (5M)
	qHN, err := orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID: liveCustomerID, AddressID: addrHN, DeliveryMethod: domain.DeliveryMethodStandard, Shipping: cfg,
	})
	require.NoError(t, err)
	assert.True(t, qHN.ExpressAvailable)
	assert.Equal(t, domain.MoneyVND("25000"), qHN.StandardShippingFeeVND)
	assert.Equal(t, domain.MoneyVND("60000"), qHN.ExpressShippingFeeVND)
	assert.Equal(t, domain.MoneyVND("25000"), qHN.ShippingFeeVND)
	assert.Equal(t, domain.MoneyVND("1025000"), qHN.TotalVND)
	assert.Nil(t, qHN.VoucherCode)
	assert.Nil(t, qHN.VoucherType)

	qDN, err := orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID: liveCustomerID, AddressID: addrDN, DeliveryMethod: domain.DeliveryMethodStandard, Shipping: cfg,
	})
	require.NoError(t, err)
	assert.False(t, qDN.ExpressAvailable)
	assert.Equal(t, domain.MoneyVND("30000"), qDN.ShippingFeeVND)

	qOther, err := orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID: liveCustomerID, AddressID: addrOther, DeliveryMethod: domain.DeliveryMethodStandard, Shipping: cfg,
	})
	require.NoError(t, err)
	assert.False(t, qOther.ExpressAvailable)
	assert.Equal(t, domain.MoneyVND("40000"), qOther.ShippingFeeVND)

	// Express 2h rejected outside HN/HCM
	_, err = orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID: liveCustomerID, AddressID: addrDN, DeliveryMethod: domain.DeliveryMethodExpress2H, Shipping: cfg,
	})
	assert.ErrorIs(t, err, domain.ErrExpressDeliveryUnavailable)

	_, err = orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID: liveCustomerID, AddressID: addrOther, PaymentMethod: domain.PaymentMethodCOD,
		DeliveryMethod: domain.DeliveryMethodExpress2H, Shipping: cfg,
		Lines: []domain.OrderLineInput{{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"}},
	})
	assert.ErrorIs(t, err, domain.ErrExpressDeliveryUnavailable)

	// Voucher error mappings in QuoteCheckout
	for tc, wantErr := range map[string]error{
		"NOPE":      domain.ErrVoucherNotFound,
		"INACTIVE1": domain.ErrVoucherInactive,
		"NOTSTART1": domain.ErrVoucherNotStarted,
		"EXPIRED1":  domain.ErrVoucherExpired,
	} {
		_, err := orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
			UserID: liveCustomerID, AddressID: addrHN, VoucherCode: tc, Shipping: cfg,
		})
		assert.ErrorIs(t, err, wantErr, "code %s", tc)
	}
	_, err = orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID: liveCustomerID, AddressID: addrHN, VoucherCode: "min10m", Shipping: cfg,
	})
	var minErr *domain.VoucherMinOrderError
	require.True(t, errors.As(err, &minErr))
	assert.Equal(t, domain.MoneyVND("10000000"), minErr.MinOrderVND)

	// Express 2h + Freeship capped 30K in Hanoi -> 1,000,000 + 60,000 - 30,000 = 1,030,000
	qExpressShip, err := orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID: liveCustomerID, AddressID: addrHN, DeliveryMethod: domain.DeliveryMethodExpress2H,
		VoucherCode: "  ship30k ", Shipping: cfg,
	})
	require.NoError(t, err)
	assert.Equal(t, domain.MoneyVND("60000"), qExpressShip.ShippingFeeVND)
	assert.Equal(t, domain.MoneyVND("30000"), qExpressShip.DiscountVND)
	assert.Equal(t, domain.MoneyVND("1030000"), qExpressShip.TotalVND)

	// Flash Sale + Live priority (PD-4): Flash Sale 700K < Live 800K -> Flash Sale wins
	fs, err := fsRepo.Create(ctx, domain.SaveFlashSaleInput{
		Name: "FS Checkout", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour),
		Active: true, CreatedBy: liveAdminID,
		Items: []domain.FlashSaleItemInput{{VariantID: liveVariantA1, FlashPriceVND: "700000", Quota: 2}},
	}, map[string]string{liveVariantA1: liveProductA})
	require.NoError(t, err)
	_, err = liveRepo.CreateSession(ctx, "Live Checkout", liveAdminID, []domain.LiveProductInput{
		{ProductID: liveProductA, Variants: []domain.LiveVariantInput{{VariantID: liveVariantA1, LivePriceVND: "800000", Quota: intPtr(5)}}},
	})
	require.NoError(t, err)

	// Add 2 more of A1 (cart qty=3) while flash sale quota=2 -> FlashSaleQuotaExceededError(remaining=2)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
	require.NoError(t, err)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
	require.NoError(t, err)

	_, err = orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID: liveCustomerID, AddressID: addrHN, PaymentMethod: domain.PaymentMethodCOD,
		DeliveryMethod: domain.DeliveryMethodExpress2H, VoucherCode: "SHIP30K", Shipping: cfg,
		Lines: []domain.OrderLineInput{{VariantID: liveVariantA1, Quantity: 3, ProductName: "Live Phone A", UnitPriceVND: "700000"}},
	})
	var fsQuotaErr *domain.FlashSaleQuotaExceededError
	require.True(t, errors.As(err, &fsQuotaErr), "got err=%v", err)
	assert.EqualValues(t, 2, fsQuotaErr.Remaining)
	assert.Equal(t, "Live Phone A", fsQuotaErr.ProductName)

	// Set cart qty to 2 and place order with express_2h + SHIP30K
	cart, err := cartRepo.Get(ctx, liveCustomerID)
	require.NoError(t, err)
	_, err = cartRepo.SetQuantity(ctx, liveCustomerID, cart.Items[0].ID, 2)
	require.NoError(t, err)

	order, err := orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID: liveCustomerID, AddressID: addrHN, PaymentMethod: domain.PaymentMethodCOD,
		DeliveryMethod: domain.DeliveryMethodExpress2H, VoucherCode: "ship30k", Shipping: cfg,
		Lines: []domain.OrderLineInput{{VariantID: liveVariantA1, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "700000"}},
	})
	require.NoError(t, err)
	assert.Equal(t, domain.DeliveryMethodExpress2H, order.DeliveryMethod)
	assert.Equal(t, domain.MoneyVND("1400000"), order.SubtotalVND)
	assert.Equal(t, domain.MoneyVND("60000"), order.ShippingFeeVND)
	assert.Equal(t, domain.MoneyVND("30000"), order.DiscountVND)
	assert.Equal(t, domain.MoneyVND("1430000"), order.TotalVND)
	require.NotNil(t, order.VoucherCode)
	assert.Equal(t, "SHIP30K", *order.VoucherCode)
	require.NotNil(t, order.VoucherType)
	assert.Equal(t, domain.VoucherTypeFreeship, *order.VoucherType)
	require.Len(t, order.Timeline, 1)
	assert.Equal(t, domain.OrderStatusPendingConfirmation, order.Timeline[0].Status)
	assert.Equal(t, domain.OrderActorCustomer, order.Timeline[0].ActorType)

	// Verify DB recorded flash_sale_id and NOT live_session_id
	var recLiveID, recFSID *string
	require.NoError(t, conn.QueryRow(ctx, `SELECT live_session_id::text, flash_sale_id::text FROM order_items WHERE order_id = $1`, order.ID).Scan(&recLiveID, &recFSID))
	assert.Nil(t, recLiveID)
	require.NotNil(t, recFSID)
	assert.Equal(t, fs.ID, *recFSID)

	var fsSold int
	require.NoError(t, conn.QueryRow(ctx, `SELECT sold_quantity FROM flash_sale_items WHERE flash_sale_id = $1 AND variant_id = $2`, fs.ID, liveVariantA1).Scan(&fsSold))
	assert.Equal(t, 2, fsSold)
}

func TestOrderRepository_ConcurrencyVoucherAndFlashSaleIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	orderRepo := NewOrderRepository(pool)
	cartRepo := NewCartRepository(pool)
	voucherRepo := NewVoucherRepository(pool)
	fsRepo := NewFlashSaleRepository(pool)
	cfg := domain.DefaultShippingConfig()
	now := time.Now().UTC().Truncate(time.Second)

	// Create 5 customers + addresses
	userIDs := make([]string, 5)
	addrIDs := make([]string, 5)
	for i := 0; i < 5; i++ {
		uid := uuid.NewString()
		_, err := conn.Exec(ctx, `INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, 'hash', 'customer')`,
			uid, fmt.Sprintf("conc-%d@test.local", i))
		require.NoError(t, err)
		var aid string
		require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
			VALUES ($1, 'Buyer', '0900000001', 1, 'Hà Nội', 1, 'W', 'D', true) RETURNING id`, uid).Scan(&aid))
		userIDs[i] = uid
		addrIDs[i] = aid
	}

	// Subtest 1: Last voucher usage_limit=1 across 5 concurrent users
	t.Run("5 goroutines race for last voucher slot (usage_limit=1)", func(t *testing.T) {
		limit1 := 1
		v, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
			Code: "LASTVOUCHER", Title: "Last 1", VoucherType: domain.VoucherTypeFixedAmount,
			DiscountValue: "100000", MinOrderVND: "0", UsageLimit: &limit1, PerUserLimit: 1,
			StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
		})
		require.NoError(t, err)

		for _, uid := range userIDs {
			_, err := cartRepo.AddVariant(ctx, uid, liveVariantA1)
			require.NoError(t, err)
		}

		start := make(chan struct{})
		var wg sync.WaitGroup
		errs := make([]error, len(userIDs))
		for i := range userIDs {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				<-start
				_, errs[idx] = orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
					UserID: userIDs[idx], AddressID: addrIDs[idx], PaymentMethod: domain.PaymentMethodCOD,
					DeliveryMethod: domain.DeliveryMethodStandard, VoucherCode: "LASTVOUCHER", Shipping: cfg,
					Lines: []domain.OrderLineInput{{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"}},
				})
			}(i)
		}
		close(start)
		wg.Wait()

		okCount, exhaustCount := 0, 0
		for _, e := range errs {
			switch {
			case e == nil:
				okCount++
			case errors.Is(e, domain.ErrVoucherExhausted):
				exhaustCount++
			default:
				t.Fatalf("unexpected error: %v", e)
			}
		}
		assert.Equal(t, 1, okCount)
		assert.Equal(t, 4, exhaustCount)

		var usedCount, usageRows int
		require.NoError(t, conn.QueryRow(ctx, `SELECT used_count FROM vouchers WHERE id = $1`, v.ID).Scan(&usedCount))
		require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM voucher_usages WHERE voucher_id = $1 AND status = 'applied'`, v.ID).Scan(&usageRows))
		assert.Equal(t, 1, usedCount)
		assert.Equal(t, 1, usageRows)
	})

	// Subtest 2: Last Flash Sale quota=1 across 5 concurrent users
	t.Run("5 goroutines race for last flash sale slot (quota=1)", func(t *testing.T) {
		_, err := conn.Exec(ctx, `DELETE FROM cart_items; UPDATE product_variants SET stock_quantity = 20 WHERE id = $1`, liveVariantA2)
		require.NoError(t, err)

		fs, err := fsRepo.Create(ctx, domain.SaveFlashSaleInput{
			Name: "FS Race", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour),
			Active: true, CreatedBy: liveAdminID,
			Items: []domain.FlashSaleItemInput{{VariantID: liveVariantA2, FlashPriceVND: "1500000", Quota: 1}},
		}, map[string]string{liveVariantA2: liveProductA})
		require.NoError(t, err)

		for _, uid := range userIDs {
			_, err := cartRepo.AddVariant(ctx, uid, liveVariantA2)
			require.NoError(t, err)
		}

		start := make(chan struct{})
		var wg sync.WaitGroup
		errs := make([]error, len(userIDs))
		for i := range userIDs {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				<-start
				_, errs[idx] = orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
					UserID: userIDs[idx], AddressID: addrIDs[idx], PaymentMethod: domain.PaymentMethodCOD,
					DeliveryMethod: domain.DeliveryMethodStandard, Shipping: cfg,
					Lines: []domain.OrderLineInput{{VariantID: liveVariantA2, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1500000"}},
				})
			}(i)
		}
		close(start)
		wg.Wait()

		okCount, changedCount := 0, 0
		for _, e := range errs {
			var changed *domain.ProductChangedError
			switch {
			case e == nil:
				okCount++
			case errors.As(e, &changed):
				changedCount++
			default:
				t.Fatalf("unexpected error: %v", e)
			}
		}
		assert.Equal(t, 1, okCount)
		assert.Equal(t, 4, changedCount)

		var sold int
		require.NoError(t, conn.QueryRow(ctx, `SELECT sold_quantity FROM flash_sale_items WHERE flash_sale_id = $1 AND variant_id = $2`, fs.ID, liveVariantA2).Scan(&sold))
		assert.Equal(t, 1, sold)
	})

	// Subtest 3: Same-user per_user_limit=1 under concurrency and sequential reuse
	t.Run("same user per_user_limit=1 cannot be exceeded concurrently or sequentially", func(t *testing.T) {
		_, err := conn.Exec(ctx, `DELETE FROM cart_items; UPDATE product_variants SET stock_quantity = 20 WHERE id = $1`, liveVariantA1)
		require.NoError(t, err)

		v, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
			Code: "ONEPERUSER", Title: "One Per User", VoucherType: domain.VoucherTypeFixedAmount,
			DiscountValue: "50000", MinOrderVND: "0", PerUserLimit: 1,
			StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
		})
		require.NoError(t, err)

		_, err = cartRepo.AddVariant(ctx, userIDs[0], liveVariantA1)
		require.NoError(t, err)

		start := make(chan struct{})
		var wg sync.WaitGroup
		errs := make([]error, 3)
		for i := 0; i < 3; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				<-start
				_, errs[idx] = orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
					UserID: userIDs[0], AddressID: addrIDs[0], PaymentMethod: domain.PaymentMethodCOD,
					DeliveryMethod: domain.DeliveryMethodStandard, VoucherCode: "ONEPERUSER", Shipping: cfg,
					Lines: []domain.OrderLineInput{{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"}},
				})
			}(i)
		}
		close(start)
		wg.Wait()

		okCount := 0
		for _, e := range errs {
			if e == nil {
				okCount++
			}
		}
		assert.Equal(t, 1, okCount)

		// Sequential attempt with fresh cart item must get ErrVoucherUserLimitReached
		_, err = cartRepo.AddVariant(ctx, userIDs[0], liveVariantA1)
		require.NoError(t, err)
		_, err = orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
			UserID: userIDs[0], AddressID: addrIDs[0], PaymentMethod: domain.PaymentMethodCOD,
			DeliveryMethod: domain.DeliveryMethodStandard, VoucherCode: "ONEPERUSER", Shipping: cfg,
			Lines: []domain.OrderLineInput{{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"}},
		})
		assert.ErrorIs(t, err, domain.ErrVoucherUserLimitReached)

		var activeUsages int
		require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM voucher_usages WHERE voucher_id = $1 AND user_id = $2 AND status = 'applied'`, v.ID, userIDs[0]).Scan(&activeUsages))
		assert.Equal(t, 1, activeUsages)
	})
}

func TestOrderRepository_CancelRestoresVoucherAndFlashSaleAllThreePathsIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	orderRepo := NewOrderRepository(pool)
	cartRepo := NewCartRepository(pool)
	voucherRepo := NewVoucherRepository(pool)
	fsRepo := NewFlashSaleRepository(pool)
	cfg := domain.DefaultShippingConfig()
	now := time.Now().UTC().Truncate(time.Second)

	var addr1 string
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Lan', '0900000001', 1, 'Hà Nội', 1, 'W', 'D', true) RETURNING id`, liveCustomerID).Scan(&addr1))

	fs, err := fsRepo.Create(ctx, domain.SaveFlashSaleInput{
		Name: "FS Restore", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour),
		Active: true, CreatedBy: liveAdminID,
		Items: []domain.FlashSaleItemInput{{VariantID: liveVariantA1, FlashPriceVND: "800000", Quota: 5}},
	}, map[string]string{liveVariantA1: liveProductA})
	require.NoError(t, err)

	limit1 := 1
	voucher, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "RESTORE1", Title: "Restore test", VoucherType: domain.VoucherTypeFixedAmount,
		DiscountValue: "100000", MinOrderVND: "0", UsageLimit: &limit1, PerUserLimit: 1,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
	})
	require.NoError(t, err)

	placeOrder := func(t *testing.T, payMethod string) *domain.Order {
		t.Helper()
		_, err := cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
		require.NoError(t, err)
		_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
		require.NoError(t, err)
		o, err := orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
			UserID: liveCustomerID, AddressID: addr1, PaymentMethod: payMethod,
			DeliveryMethod: domain.DeliveryMethodStandard, VoucherCode: "RESTORE1", Shipping: cfg,
			Lines: []domain.OrderLineInput{{VariantID: liveVariantA1, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "800000"}},
		})
		require.NoError(t, err)
		return o
	}

	assertRestored := func(t *testing.T, orderID string) {
		t.Helper()
		var usedCount, fsSold, stock int
		var usageStatus string
		require.NoError(t, conn.QueryRow(ctx, `SELECT used_count FROM vouchers WHERE id = $1`, voucher.ID).Scan(&usedCount))
		require.NoError(t, conn.QueryRow(ctx, `SELECT status FROM voucher_usages WHERE order_id = $1`, orderID).Scan(&usageStatus))
		require.NoError(t, conn.QueryRow(ctx, `SELECT sold_quantity FROM flash_sale_items WHERE flash_sale_id = $1 AND variant_id = $2`, fs.ID, liveVariantA1).Scan(&fsSold))
		require.NoError(t, conn.QueryRow(ctx, `SELECT stock_quantity FROM product_variants WHERE id = $1`, liveVariantA1).Scan(&stock))
		assert.Equal(t, 0, usedCount)
		assert.Equal(t, "restored", usageStatus)
		assert.Equal(t, 0, fsSold)
		assert.Equal(t, 10, stock)
	}

	// Path 1: Customer Cancel (+ idempotent second cancel check)
	ord1 := placeOrder(t, domain.PaymentMethodCOD)
	cancelled1, err := orderRepo.Cancel(ctx, liveCustomerID, ord1.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.OrderStatusCancelled, cancelled1.Status)
	assertRestored(t, ord1.ID)
	_, err = orderRepo.Cancel(ctx, liveCustomerID, ord1.ID)
	assert.ErrorIs(t, err, domain.ErrOrderNotCancellable)
	assertRestored(t, ord1.ID)

	// Path 2: Admin ApproveCancel (reuse same voucher!)
	ord2 := placeOrder(t, domain.PaymentMethodCOD)
	require.NoError(t, orderRepo.AutoConfirmDue(ctx, time.Now().UTC().Add(time.Minute)))
	_, err = orderRepo.AdminTransition(ctx, ord2.ID, domain.OrderAdminActionConfirmPreparing)
	require.NoError(t, err)
	_, err = orderRepo.Cancel(ctx, liveCustomerID, ord2.ID)
	require.NoError(t, err)
	_, err = orderRepo.AdminTransition(ctx, ord2.ID, domain.OrderAdminActionApproveCancel)
	require.NoError(t, err)
	assertRestored(t, ord2.ID)

	// Path 3: AutoCancelExpiredMomoOrders (reuse same voucher again!)
	ord3 := placeOrder(t, domain.PaymentMethodMomo)
	_, err = conn.Exec(ctx, `UPDATE orders SET created_at = now() - interval '40 minutes' WHERE id = $1`, ord3.ID)
	require.NoError(t, err)
	expired, err := orderRepo.AutoCancelExpiredMomoOrders(ctx, time.Now().UTC().Add(-30*time.Minute))
	require.NoError(t, err)
	require.Len(t, expired, 1)
	assert.Equal(t, ord3.ID, expired[0].ID)
	assertRestored(t, ord3.ID)

	got3, err := orderRepo.GetByID(ctx, liveCustomerID, ord3.ID)
	require.NoError(t, err)
	require.Len(t, got3.Timeline, 2)
	assert.Equal(t, domain.OrderStatusCancelled, got3.Timeline[1].Status)
	assert.Equal(t, domain.OrderActorSystem, got3.Timeline[1].ActorType)
}

func TestOrderRepository_ShipOrderAndTimelineIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	orderRepo := NewOrderRepository(pool)
	cartRepo := NewCartRepository(pool)
	cfg := domain.DefaultShippingConfig()

	var addr1 string
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Lan', '0900000001', 1, 'Hà Nội', 1, 'W', 'D', true) RETURNING id`, liveCustomerID).Scan(&addr1))
	_, err := cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
	require.NoError(t, err)

	ord, err := orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID: liveCustomerID, AddressID: addr1, PaymentMethod: domain.PaymentMethodMomo,
		DeliveryMethod: domain.DeliveryMethodStandard, Shipping: cfg,
		Lines: []domain.OrderLineInput{{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"}},
	})
	require.NoError(t, err)

	// ShipOrder fails when not in preparing
	_, err = orderRepo.ShipOrder(ctx, ord.ID, "GHN", "GHN-123")
	assert.ErrorIs(t, err, domain.ErrOrderActionNotAllowed)

	// Walk full timeline: paid -> preparing -> cancel_requested -> decline_cancel -> shipped -> delivered
	_, justPaid, err := orderRepo.ApplyMomoCallback(ctx, ord.ID, liveCustomerID, string(ord.TotalVND), "TX1", 0)
	require.NoError(t, err)
	assert.True(t, justPaid)

	prepOrder, err := orderRepo.AdminTransition(ctx, ord.ID, domain.OrderAdminActionConfirmPreparing)
	require.NoError(t, err)
	assert.NotNil(t, prepOrder.PreparingAt)

	_, err = orderRepo.Cancel(ctx, liveCustomerID, ord.ID)
	require.NoError(t, err)
	_, err = orderRepo.AdminTransition(ctx, ord.ID, domain.OrderAdminActionDeclineCancel)
	require.NoError(t, err)

	shipped, err := orderRepo.ShipOrder(ctx, ord.ID, "Giao Hàng Nhanh", "GHN_2026_001")
	require.NoError(t, err)
	assert.Equal(t, domain.OrderStatusShipped, shipped.Status)
	require.NotNil(t, shipped.Carrier)
	require.NotNil(t, shipped.TrackingCode)
	require.NotNil(t, shipped.ShippedAt)
	assert.Equal(t, "Giao Hàng Nhanh", *shipped.Carrier)
	assert.Equal(t, "GHN_2026_001", *shipped.TrackingCode)

	delivered, err := orderRepo.AdminTransition(ctx, ord.ID, domain.OrderAdminActionDeliver)
	require.NoError(t, err)
	assert.Equal(t, domain.OrderStatusDelivered, delivered.Status)

	wantStatuses := []domain.OrderStatus{
		domain.OrderStatusPendingConfirmation,
		domain.OrderStatusConfirmed,
		domain.OrderStatusPreparing,
		domain.OrderStatusCancelRequested,
		domain.OrderStatusPreparing,
		domain.OrderStatusShipped,
		domain.OrderStatusDelivered,
	}
	require.Len(t, delivered.Timeline, len(wantStatuses))
	for i, want := range wantStatuses {
		assert.Equal(t, want, delivered.Timeline[i].Status, "timeline index %d", i)
		assert.NotEmpty(t, delivered.Timeline[i].Note)
	}

	// Verify ListByUser & ListByAdmin hydrate timeline
	userOrders, err := orderRepo.ListByUser(ctx, liveCustomerID, domain.OrderStatusBucketAll)
	require.NoError(t, err)
	require.Len(t, userOrders, 1)
	assert.Len(t, userOrders[0].Timeline, len(wantStatuses))

	adminOrders, err := orderRepo.ListByAdmin(ctx, nil)
	require.NoError(t, err)
	require.Len(t, adminOrders, 1)
	assert.Len(t, adminOrders[0].Timeline, len(wantStatuses))
}

func TestOrderRepository_BuyAgainIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	orderRepo := NewOrderRepository(pool)
	cartRepo := NewCartRepository(pool)
	cfg := domain.DefaultShippingConfig()

	var addr1 string
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Lan', '0900000001', 1, 'Hà Nội', 1, 'W', 'D', true) RETURNING id`, liveCustomerID).Scan(&addr1))

	// Put 3 items in order: A1 (qty 4), A2 (qty 2), B1 (qty 1)
	for i := 0; i < 4; i++ {
		_, err := cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
		require.NoError(t, err)
	}
	for i := 0; i < 2; i++ {
		_, err := cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA2)
		require.NoError(t, err)
	}
	_, err := cartRepo.AddVariant(ctx, liveCustomerID, liveVariantB1)
	require.NoError(t, err)

	ord, err := orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID: liveCustomerID, AddressID: addr1, PaymentMethod: domain.PaymentMethodCOD,
		DeliveryMethod: domain.DeliveryMethodStandard, Shipping: cfg,
		Lines: []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 4, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
			{VariantID: liveVariantA2, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "2000000"},
			{VariantID: liveVariantB1, Quantity: 1, ProductName: "Live Phone B", UnitPriceVND: "3000000"},
		},
	})
	require.NoError(t, err)

	// Disallowed while pending_confirmation
	_, err = orderRepo.BuyAgain(ctx, liveCustomerID, ord.ID)
	assert.ErrorIs(t, err, domain.ErrOrderActionNotAllowed)

	// Non-owner gets ErrOrderNotFound
	_, err = orderRepo.BuyAgain(ctx, liveCustomer2, ord.ID)
	assert.ErrorIs(t, err, domain.ErrOrderNotFound)

	// Cancel order so status becomes 'cancelled' (eligible for BuyAgain)
	_, err = orderRepo.Cancel(ctx, liveCustomerID, ord.ID)
	require.NoError(t, err)

	// Pre-populate cart with 1x A1, set A1 stock=3 (so cur=1 + req=4 -> capped to 3, added=2),
	// set A2 stock=0 (out_of_stock), deactivate product B (unavailable)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		UPDATE product_variants SET stock_quantity = 3 WHERE id = $1;
		UPDATE product_variants SET stock_quantity = 0 WHERE id = $2;
		UPDATE products SET active = false WHERE id = $3;
	`, liveVariantA1, liveVariantA2, liveProductB)
	require.NoError(t, err)

	res, err := orderRepo.BuyAgain(ctx, liveCustomerID, ord.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, res.AddedCount)
	require.Len(t, res.AdjustedItems, 1)
	assert.Equal(t, liveVariantA1, res.AdjustedItems[0].VariantID)
	assert.Equal(t, int64(4), res.AdjustedItems[0].RequestedQuantity)
	assert.Equal(t, int64(2), res.AdjustedItems[0].AddedQuantity)

	require.Len(t, res.SkippedItems, 2)
	skipMap := map[string]domain.BuyAgainSkipReason{}
	for _, s := range res.SkippedItems {
		skipMap[s.VariantID] = s.Reason
	}
	assert.Equal(t, domain.BuyAgainSkipOutOfStock, skipMap[liveVariantA2])
	assert.Equal(t, domain.BuyAgainSkipUnavailable, skipMap[liveVariantB1])

	require.NotNil(t, res.Cart)
	require.Len(t, res.Cart.Items, 1)
	assert.Equal(t, int64(3), res.Cart.Items[0].Quantity)
	assert.True(t, res.Cart.Items[0].Selected)

	// If ALL variants unavailable/out_of_stock -> ErrBuyAgainAllUnavailable & cart stays untouched
	_, err = conn.Exec(ctx, `UPDATE product_variants SET active = false WHERE id = $1`, liveVariantA1)
	require.NoError(t, err)
	_, err = orderRepo.BuyAgain(ctx, liveCustomerID, ord.ID)
	assert.ErrorIs(t, err, domain.ErrBuyAgainAllUnavailable)

	var cartQty int64
	require.NoError(t, conn.QueryRow(ctx, `SELECT quantity FROM cart_items WHERE user_id = $1 AND variant_id = $2`, liveCustomerID, liveVariantA1).Scan(&cartQty))
	assert.Equal(t, int64(3), cartQty, "cart must stay untouched when buy again fails with ErrBuyAgainAllUnavailable")
}

func TestReturnRepository_PD2DiscountRefundAndTimelineIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	orderRepo := NewOrderRepository(pool)
	cartRepo := NewCartRepository(pool)
	voucherRepo := NewVoucherRepository(pool)
	returnRepo := NewReturnRepository(pool)
	cfg := domain.DefaultShippingConfig()
	now := time.Now().UTC().Truncate(time.Second)

	var addr1 string
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Lan', '0900000001', 1, 'Hà Nội', 1, 'W', 'D', true) RETURNING id`, liveCustomerID).Scan(&addr1))

	_, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "FIXED500K", Title: "Giảm 500K", VoucherType: domain.VoucherTypeFixedAmount,
		DiscountValue: "500000", MinOrderVND: "0", PerUserLimit: 5,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
	})
	require.NoError(t, err)
	_, err = voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "FULL100", Title: "Giảm 100%", VoucherType: domain.VoucherTypePercent,
		DiscountValue: "100", MinOrderVND: "0", PerUserLimit: 5,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
	})
	require.NoError(t, err)
	_, err = voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "FREESHIPALL", Title: "Freeship All", VoucherType: domain.VoucherTypeFreeship,
		DiscountValue: "0", MinOrderVND: "0", PerUserLimit: 5,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
	})
	require.NoError(t, err)

	deliverOrder := func(t *testing.T, orderID string) *domain.Order {
		t.Helper()
		require.NoError(t, orderRepo.AutoConfirmDue(ctx, time.Now().UTC().Add(time.Minute)))
		_, err := orderRepo.AdminTransition(ctx, orderID, domain.OrderAdminActionConfirmPreparing)
		require.NoError(t, err)
		_, err = orderRepo.ShipOrder(ctx, orderID, "GHN", "GHN12345")
		require.NoError(t, err)
		d, err := orderRepo.AdminTransition(ctx, orderID, domain.OrderAdminActionDeliver)
		require.NoError(t, err)
		return d
	}

	// 1. Partial return with fixed_amount 500K on (A1=1M + A2=2M = 3M, shipping=25K, total=2,525,000)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
	require.NoError(t, err)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA2)
	require.NoError(t, err)
	ord1, err := orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID: liveCustomerID, AddressID: addr1, PaymentMethod: domain.PaymentMethodCOD,
		DeliveryMethod: domain.DeliveryMethodStandard, VoucherCode: "FIXED500K", Shipping: cfg,
		Lines: []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
			{VariantID: liveVariantA2, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "2000000"},
		},
	})
	require.NoError(t, err)
	ord1 = deliverOrder(t, ord1.ID)

	ret1, err := returnRepo.CreateReturnRequest(ctx, domain.CreateReturnInput{
		OrderID: ord1.ID, UserID: liveCustomerID,
		OrderItemIDs: []string{ord1.Items[0].ID},
		ReasonCode:   domain.ReturnReasonDefective,
		Description:  "Lỗi màn hình",
	})
	require.NoError(t, err)
	// Order items sorted by ID; figure out which item was ord1.Items[0]
	expectedPartial := "833333"
	if ord1.Items[0].LineTotalVND == "2000000" {
		expectedPartial = "1666666"
	}
	assert.Equal(t, domain.MoneyVND(expectedPartial), ret1.ExpectedRefundVND)

	_, err = returnRepo.ApproveAdmin(ctx, ret1.ID)
	require.NoError(t, err)
	_, err = returnRepo.ReceiveAdmin(ctx, ret1.ID, []domain.ReceiveItemMapping{
		{OrderItemID: ord1.Items[0].ID, ReceivedVariantID: ord1.Items[0].VariantID},
	})
	require.NoError(t, err)
	refunded1, err := returnRepo.RefundAdmin(ctx, ret1.ID, liveAdminID)
	require.NoError(t, err)
	require.NotNil(t, refunded1.RefundAmountVND)
	assert.Equal(t, domain.MoneyVND(expectedPartial), *refunded1.RefundAmountVND)

	afterOrd1, err := orderRepo.GetByID(ctx, liveCustomerID, ord1.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.OrderStatusPartiallyReturned, afterOrd1.Status)
	assert.Equal(t, domain.OrderStatusPartiallyReturned, afterOrd1.Timeline[len(afterOrd1.Timeline)-1].Status)
	assert.Equal(t, domain.OrderActorAdmin, afterOrd1.Timeline[len(afterOrd1.Timeline)-1].ActorType)

	// 2. Full return on 100% discounted order (totalVnd == 0 -> expected & actual refund == 0)
	// Use standard shipping with threshold >= 5M by adding 6x A1 = 6M so shipping=0, discount=6M, total=0!
	for i := 0; i < 6; i++ {
		_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
		require.NoError(t, err)
	}
	ord2, err := orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID: liveCustomerID, AddressID: addr1, PaymentMethod: domain.PaymentMethodCOD,
		DeliveryMethod: domain.DeliveryMethodStandard, VoucherCode: "FULL100", Shipping: cfg,
		Lines: []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 6, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, domain.MoneyVND("0"), ord2.TotalVND)
	ord2 = deliverOrder(t, ord2.ID)

	ret2, err := returnRepo.CreateReturnRequest(ctx, domain.CreateReturnInput{
		OrderID: ord2.ID, UserID: liveCustomerID,
		OrderItemIDs: []string{ord2.Items[0].ID},
		ReasonCode:   domain.ReturnReasonDefective,
		Description:  "Trả hàng đơn 0 đồng",
	})
	require.NoError(t, err)
	assert.Equal(t, domain.MoneyVND("0"), ret2.ExpectedRefundVND)

	_, err = returnRepo.ApproveAdmin(ctx, ret2.ID)
	require.NoError(t, err)
	_, err = returnRepo.ReceiveAdmin(ctx, ret2.ID, []domain.ReceiveItemMapping{
		{OrderItemID: ord2.Items[0].ID, ReceivedVariantID: ord2.Items[0].VariantID},
	})
	require.NoError(t, err)
	refunded2, err := returnRepo.RefundAdmin(ctx, ret2.ID, liveAdminID)
	require.NoError(t, err)
	require.NotNil(t, refunded2.RefundAmountVND)
	assert.Equal(t, domain.MoneyVND("0"), *refunded2.RefundAmountVND)

	// 3. Partial return with freeship voucher returns exact item LineTotalVND (not prorated)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
	require.NoError(t, err)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA2)
	require.NoError(t, err)
	ord3, err := orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID: liveCustomerID, AddressID: addr1, PaymentMethod: domain.PaymentMethodCOD,
		DeliveryMethod: domain.DeliveryMethodExpress2H, VoucherCode: "FREESHIPALL", Shipping: cfg,
		Lines: []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1000000"},
			{VariantID: liveVariantA2, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "2000000"},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, domain.MoneyVND("60000"), ord3.ShippingFeeVND)
	assert.Equal(t, domain.MoneyVND("60000"), ord3.DiscountVND)
	assert.Equal(t, domain.MoneyVND("3000000"), ord3.TotalVND)
	ord3 = deliverOrder(t, ord3.ID)

	ret3, err := returnRepo.CreateReturnRequest(ctx, domain.CreateReturnInput{
		OrderID: ord3.ID, UserID: liveCustomerID,
		OrderItemIDs: []string{ord3.Items[0].ID},
		ReasonCode:   domain.ReturnReasonDefective,
		Description:  "Trả 1 sản phẩm đơn freeship",
	})
	require.NoError(t, err)
	assert.Equal(t, ord3.Items[0].LineTotalVND, ret3.ExpectedRefundVND)
}

func TestOrderRepository_MultiOrderAutoCancelMomoConcurrentCheckoutNoDeadlockIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	orderRepo := NewOrderRepository(pool)
	cartRepo := NewCartRepository(pool)
	voucherRepo := NewVoucherRepository(pool)
	fsRepo := NewFlashSaleRepository(pool)
	cfg := domain.DefaultShippingConfig()
	now := time.Now().UTC().Truncate(time.Second)

	_, err := conn.Exec(ctx, `
		UPDATE product_variants SET stock_quantity = 50 WHERE id = ANY($1::uuid[])
	`, []string{liveVariantA1, liveVariantA2, liveVariantB1})
	require.NoError(t, err)

	fs, err := fsRepo.Create(ctx, domain.SaveFlashSaleInput{
		Name: "FS Multi AutoCancel", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour),
		Active: true, CreatedBy: liveAdminID,
		Items: []domain.FlashSaleItemInput{
			{VariantID: liveVariantA1, FlashPriceVND: "800000", Quota: 50},
			{VariantID: liveVariantA2, FlashPriceVND: "1500000", Quota: 50},
		},
	}, map[string]string{
		liveVariantA1: liveProductA,
		liveVariantA2: liveProductA,
	})
	require.NoError(t, err)

	limit20 := 20
	voucherA, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "CONCA", Title: "Concurrent A", VoucherType: domain.VoucherTypeFixedAmount,
		DiscountValue: "50000", MinOrderVND: "0", UsageLimit: &limit20, PerUserLimit: 5,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
	})
	require.NoError(t, err)
	voucherB, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "CONCB", Title: "Concurrent B", VoucherType: domain.VoucherTypeFixedAmount,
		DiscountValue: "50000", MinOrderVND: "0", UsageLimit: &limit20, PerUserLimit: 5,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
	})
	require.NoError(t, err)

	// 8 users: 3 expired MoMo orders + 1 fresh MoMo order + 4 concurrent checkout buyers
	userIDs := make([]string, 8)
	addrIDs := make([]string, 8)
	for i := 0; i < 8; i++ {
		uid := uuid.NewString()
		_, err := conn.Exec(ctx, `INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, 'hash', 'customer')`,
			uid, fmt.Sprintf("autocanc-%d@test.local", i))
		require.NoError(t, err)
		var aid string
		require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
			VALUES ($1, 'Buyer', '0900000001', 1, 'Hà Nội', 1, 'W', 'D', true) RETURNING id`, uid).Scan(&aid))
		userIDs[i] = uid
		addrIDs[i] = aid
	}

	fillCartAndOrder := func(idx int, payMethod, voucherCode string, lines []domain.OrderLineInput) *domain.Order {
		t.Helper()
		for _, l := range lines {
			for q := int64(0); q < l.Quantity; q++ {
				_, err := cartRepo.AddVariant(ctx, userIDs[idx], l.VariantID)
				require.NoError(t, err)
			}
		}
		ord, err := orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
			UserID: userIDs[idx], AddressID: addrIDs[idx], PaymentMethod: payMethod,
			DeliveryMethod: domain.DeliveryMethodStandard, VoucherCode: voucherCode, Shipping: cfg,
			Lines: lines,
		})
		require.NoError(t, err)
		return ord
	}

	// Create 3 expired MoMo orders (with reverse/mixed variant ordering) + 1 fresh MoMo order
	exp1 := fillCartAndOrder(0, domain.PaymentMethodMomo, "CONCB", []domain.OrderLineInput{
		{VariantID: liveVariantA2, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "1500000"},
		{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "800000"},
	})
	exp2 := fillCartAndOrder(1, domain.PaymentMethodMomo, "CONCA", []domain.OrderLineInput{
		{VariantID: liveVariantA1, Quantity: 3, ProductName: "Live Phone A", UnitPriceVND: "800000"},
		{VariantID: liveVariantA2, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1500000"},
	})
	exp3 := fillCartAndOrder(2, domain.PaymentMethodMomo, "CONCB", []domain.OrderLineInput{
		{VariantID: liveVariantB1, Quantity: 2, ProductName: "Live Phone B", UnitPriceVND: "3000000"},
		{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "800000"},
	})
	freshOrd := fillCartAndOrder(3, domain.PaymentMethodMomo, "CONCA", []domain.OrderLineInput{
		{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "800000"},
	})

	_, err = conn.Exec(ctx, `UPDATE orders SET created_at = now() - interval '40 minutes' WHERE id = ANY($1::uuid[])`,
		[]string{exp1.ID, exp2.ID, exp3.ID})
	require.NoError(t, err)

	// Pre-populate carts for 4 concurrent checkout buyers touching overlapping variants, vouchers & Flash Sale
	type buyerSpec struct {
		idx         int
		voucherCode string
		lines       []domain.OrderLineInput
	}
	buyers := []buyerSpec{
		{4, "CONCA", []domain.OrderLineInput{
			{VariantID: liveVariantA2, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "1500000"},
			{VariantID: liveVariantA1, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "800000"},
		}},
		{5, "CONCB", []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "800000"},
			{VariantID: liveVariantA2, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "1500000"},
		}},
		{6, "CONCA", []domain.OrderLineInput{
			{VariantID: liveVariantA2, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "1500000"},
			{VariantID: liveVariantA1, Quantity: 1, ProductName: "Live Phone A", UnitPriceVND: "800000"},
		}},
		{7, "CONCB", []domain.OrderLineInput{
			{VariantID: liveVariantA1, Quantity: 2, ProductName: "Live Phone A", UnitPriceVND: "800000"},
			{VariantID: liveVariantB1, Quantity: 1, ProductName: "Live Phone B", UnitPriceVND: "3000000"},
		}},
	}
	for _, b := range buyers {
		for _, l := range b.lines {
			for q := int64(0); q < l.Quantity; q++ {
				_, err := cartRepo.AddVariant(ctx, userIDs[b.idx], l.VariantID)
				require.NoError(t, err)
			}
		}
	}

	start := make(chan struct{})
	var wg sync.WaitGroup
	var expiredOut []domain.AutoConfirmedOrder
	var autoErr error
	buyErrs := make([]error, len(buyers))

	wg.Add(1)
	go func() {
		defer wg.Done()
		<-start
		expiredOut, autoErr = orderRepo.AutoCancelExpiredMomoOrders(ctx, time.Now().UTC().Add(-30*time.Minute))
	}()

	for i, b := range buyers {
		wg.Add(1)
		go func(pos int, spec buyerSpec) {
			defer wg.Done()
			<-start
			_, buyErrs[pos] = orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
				UserID: userIDs[spec.idx], AddressID: addrIDs[spec.idx], PaymentMethod: domain.PaymentMethodCOD,
				DeliveryMethod: domain.DeliveryMethodStandard, VoucherCode: spec.voucherCode, Shipping: cfg,
				Lines: spec.lines,
			})
		}(i, b)
	}

	close(start)
	wg.Wait()

	require.NoError(t, autoErr, "AutoCancelExpiredMomoOrders must succeed without deadlock")
	for i, be := range buyErrs {
		require.NoError(t, be, "concurrent checkout %d must succeed without deadlock", i)
	}

	require.Len(t, expiredOut, 3)
	expiredIDs := map[string]bool{}
	for _, o := range expiredOut {
		expiredIDs[o.ID] = true
	}
	assert.True(t, expiredIDs[exp1.ID])
	assert.True(t, expiredIDs[exp2.ID])
	assert.True(t, expiredIDs[exp3.ID])
	assert.False(t, expiredIDs[freshOrd.ID])

	// Verify fresh order untouched and expired orders have cancelled + system timeline
	gotFresh, err := orderRepo.GetByID(ctx, userIDs[3], freshOrd.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.OrderStatusPendingConfirmation, gotFresh.Status)
	assert.Equal(t, domain.PaymentStatusPending, gotFresh.PaymentStatus)

	for idx, ordID := range []string{exp1.ID, exp2.ID, exp3.ID} {
		got, err := orderRepo.GetByID(ctx, userIDs[idx], ordID)
		require.NoError(t, err)
		assert.Equal(t, domain.OrderStatusCancelled, got.Status)
		assert.Equal(t, domain.PaymentStatusFailed, got.PaymentStatus)
		require.Len(t, got.Timeline, 2)
		assert.Equal(t, domain.OrderStatusCancelled, got.Timeline[1].Status)
		assert.Equal(t, domain.OrderActorSystem, got.Timeline[1].ActorType)
	}

	// Verify stock: 50 - expired(restored) - fresh - concurrent buyers
	var stockA1, stockA2, stockB1 int64
	require.NoError(t, conn.QueryRow(ctx, `SELECT stock_quantity FROM product_variants WHERE id = $1`, liveVariantA1).Scan(&stockA1))
	require.NoError(t, conn.QueryRow(ctx, `SELECT stock_quantity FROM product_variants WHERE id = $1`, liveVariantA2).Scan(&stockA2))
	require.NoError(t, conn.QueryRow(ctx, `SELECT stock_quantity FROM product_variants WHERE id = $1`, liveVariantB1).Scan(&stockB1))
	assert.Equal(t, int64(50-1-6), stockA1) // fresh(1) + conc(2+1+1+2=6) = 43
	assert.Equal(t, int64(50-5), stockA2)   // conc(1+2+2=5) = 45
	assert.Equal(t, int64(50-1), stockB1)   // conc(1) = 49

	// Verify vouchers used_count & voucher_usages statuses
	var usedA, usedB, restoredA, restoredB, appliedA, appliedB int
	require.NoError(t, conn.QueryRow(ctx, `SELECT used_count FROM vouchers WHERE id = $1`, voucherA.ID).Scan(&usedA))
	require.NoError(t, conn.QueryRow(ctx, `SELECT used_count FROM vouchers WHERE id = $1`, voucherB.ID).Scan(&usedB))
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM voucher_usages WHERE voucher_id = $1 AND status = 'restored'`, voucherA.ID).Scan(&restoredA))
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM voucher_usages WHERE voucher_id = $1 AND status = 'restored'`, voucherB.ID).Scan(&restoredB))
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM voucher_usages WHERE voucher_id = $1 AND status = 'applied'`, voucherA.ID).Scan(&appliedA))
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM voucher_usages WHERE voucher_id = $1 AND status = 'applied'`, voucherB.ID).Scan(&appliedB))
	assert.Equal(t, 3, usedA) // fresh + buyer4 + buyer6
	assert.Equal(t, 2, usedB) // buyer5 + buyer7
	assert.Equal(t, 1, restoredA)
	assert.Equal(t, 2, restoredB)
	assert.Equal(t, 3, appliedA)
	assert.Equal(t, 2, appliedB)

	// Verify flash_sale_items.sold_quantity restored for expired orders and retained only for fresh + concurrent buyers
	var fsSoldA1, fsSoldA2 int
	require.NoError(t, conn.QueryRow(ctx, `SELECT sold_quantity FROM flash_sale_items WHERE flash_sale_id = $1 AND variant_id = $2`, fs.ID, liveVariantA1).Scan(&fsSoldA1))
	require.NoError(t, conn.QueryRow(ctx, `SELECT sold_quantity FROM flash_sale_items WHERE flash_sale_id = $1 AND variant_id = $2`, fs.ID, liveVariantA2).Scan(&fsSoldA2))
	assert.Equal(t, 7, fsSoldA1) // fresh(1) + conc(6)
	assert.Equal(t, 5, fsSoldA2) // conc(5)
}

func TestOrderRepository_CreateCheckoutMomoOutOfRangeLeavesQuotasUnchangedIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	orderRepo := NewOrderRepository(pool)
	cartRepo := NewCartRepository(pool)
	voucherRepo := NewVoucherRepository(pool)
	fsRepo := NewFlashSaleRepository(pool)
	cfg := domain.DefaultShippingConfig()
	now := time.Now().UTC().Truncate(time.Second)

	var addrHN string
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Lan', '0900000001', 1, 'Hà Nội', 1, 'Phúc Xá', '1 Tràng Tiền', true) RETURNING id`, liveCustomerID).Scan(&addrHN))

	fs, err := fsRepo.Create(ctx, domain.SaveFlashSaleInput{
		Name: "FS MoMo Range", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour),
		Active: true, CreatedBy: liveAdminID,
		Items: []domain.FlashSaleItemInput{{VariantID: liveVariantA1, FlashPriceVND: "800000", Quota: 10}},
	}, map[string]string{liveVariantA1: liveProductA})
	require.NoError(t, err)

	v, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code: "MOMOFREE100", Title: "Giảm 100%", VoucherType: domain.VoucherTypePercent,
		DiscountValue: "100", MinOrderVND: "0", PerUserLimit: 2,
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Active: true,
	})
	require.NoError(t, err)

	// 7x A1 at Flash Sale 800,000 = 5,600,000 (>= 5,000,000 free standard shipping threshold -> shipping=0, total=0 < 1,000)
	for i := 0; i < 7; i++ {
		_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
		require.NoError(t, err)
	}

	_, err = orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID: liveCustomerID, AddressID: addrHN, PaymentMethod: domain.PaymentMethodMomo,
		DeliveryMethod: domain.DeliveryMethodStandard, VoucherCode: "MOMOFREE100", Shipping: cfg,
		Lines: []domain.OrderLineInput{{VariantID: liveVariantA1, Quantity: 7, ProductName: "Live Phone A", UnitPriceVND: "800000"}},
	})
	require.ErrorIs(t, err, domain.ErrMomoAmountOutOfRange)

	var voucherUsed, voucherUsageCount, fsSold, orderCount int
	var stockA1 int64
	require.NoError(t, conn.QueryRow(ctx, `SELECT used_count FROM vouchers WHERE id = $1`, v.ID).Scan(&voucherUsed))
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM voucher_usages WHERE voucher_id = $1`, v.ID).Scan(&voucherUsageCount))
	require.NoError(t, conn.QueryRow(ctx, `SELECT sold_quantity FROM flash_sale_items WHERE flash_sale_id = $1 AND variant_id = $2`, fs.ID, liveVariantA1).Scan(&fsSold))
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE user_id = $1`, liveCustomerID).Scan(&orderCount))
	require.NoError(t, conn.QueryRow(ctx, `SELECT stock_quantity FROM product_variants WHERE id = $1`, liveVariantA1).Scan(&stockA1))

	assert.Equal(t, 0, voucherUsed)
	assert.Equal(t, 0, voucherUsageCount)
	assert.Equal(t, 0, fsSold)
	assert.Equal(t, 0, orderCount)
	assert.Equal(t, int64(10), stockA1)
}


