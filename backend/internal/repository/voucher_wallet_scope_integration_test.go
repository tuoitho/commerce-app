//go:build integration

package repository

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

func TestVoucherWalletAndScope_Integration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	voucherRepo := NewVoucherRepository(pool)
	orderRepo := NewOrderRepository(pool)

	var addrID string
	require.NoError(t, conn.QueryRow(ctx, `
		INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'An', '0901234567', 1, 'Hà Nội', 1, 'Phúc Xá', '123 Cầu Giấy', true)
		RETURNING id
	`, liveCustomerID).Scan(&addrID))

	// Create two distinct categories & products so we can test mixed-cart category/product scoping
	var catA, catB string
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO categories (name) VALUES ('Voucher Cat A') RETURNING id`).Scan(&catA))
	require.NoError(t, conn.QueryRow(ctx, `INSERT INTO categories (name) VALUES ('Voucher Cat B') RETURNING id`).Scan(&catB))

	var prodA, prodB string
	require.NoError(t, conn.QueryRow(ctx, `
		INSERT INTO products (category_id, brand, name, model, description, price, currency, active)
		VALUES ($1, 'BrandA', 'Phone A', 'A1', 'desc', 1000000, 'VND', true) RETURNING id
	`, catA).Scan(&prodA))
	require.NoError(t, conn.QueryRow(ctx, `
		INSERT INTO products (category_id, brand, name, model, description, price, currency, active)
		VALUES ($1, 'BrandB', 'Laptop B', 'B1', 'desc', 2000000, 'VND', true) RETURNING id
	`, catB).Scan(&prodB))

	var varA, varB string
	require.NoError(t, conn.QueryRow(ctx, `
		INSERT INTO product_variants (product_id, price_vnd, stock_quantity, active)
		VALUES ($1, 1000000, 10, true) RETURNING id
	`, prodA).Scan(&varA))
	require.NoError(t, conn.QueryRow(ctx, `
		INSERT INTO product_variants (product_id, price_vnd, stock_quantity, active)
		VALUES ($1, 2000000, 10, true) RETURNING id
	`, prodB).Scan(&varB))

	// Add both variants as selected cart items for liveCustomerID
	_, err := conn.Exec(ctx, `DELETE FROM cart_items WHERE user_id = $1`, liveCustomerID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO cart_items (user_id, variant_id, quantity, selected, snapshot_brand_name, snapshot_product_name, snapshot_model, snapshot_image_url, snapshot_options)
		VALUES
		  ($1, $2, 1, true, 'BrandA', 'Phone A', 'A1', '', '[]'::jsonb),
		  ($1, $3, 1, true, 'BrandB', 'Laptop B', 'B1', '', '[]'::jsonb)
	`, liveCustomerID, varA, varB)
	require.NoError(t, err)

	now := time.Now().UTC()
	limit10 := 10

	// 1. Admin validation rejects non-existent category target
	_, err = voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code:          "BADCAT",
		Title:         "Bad Cat",
		VoucherType:   domain.VoucherTypePercent,
		ScopeType:     domain.VoucherScopeCategories,
		CategoryIDs:   []string{"99999999-9999-9999-9999-999999999999"},
		DiscountValue: "10",
		MinOrderVND:   "0",
		PerUserLimit:  1,
		StartsAt:      now.Add(-time.Hour),
		EndsAt:        now.Add(24 * time.Hour),
		Active:        true,
	})
	var vErr *domain.ValidationError
	require.ErrorAs(t, err, &vErr)
	assert.NotEmpty(t, vErr.Fields["categoryIds"])

	// 2. Admin creates category-scoped voucher (10% off Cat A, min 500k)
	catVoucher, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code:          "CATA10",
		Title:         "Giảm 10% Cat A",
		Description:   "Chỉ áp dụng Cat A",
		VoucherType:   domain.VoucherTypePercent,
		ScopeType:     domain.VoucherScopeCategories,
		CategoryIDs:   []string{catA},
		DiscountValue: "10",
		MinOrderVND:   "500000",
		UsageLimit:    &limit10,
		PerUserLimit:  1,
		StartsAt:      now.Add(-time.Hour),
		EndsAt:        now.Add(24 * time.Hour),
		Active:        true,
	})
	require.NoError(t, err)
	assert.Equal(t, domain.VoucherScopeCategories, catVoucher.ScopeType)
	require.Len(t, catVoucher.ScopeCategories, 1)
	assert.Equal(t, "Voucher Cat A", catVoucher.ScopeCategories[0].Name)

	// 3. Unclaimed voucher cannot be quoted or ordered
	_, err = orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID:         liveCustomerID,
		AddressID:      addrID,
		DeliveryMethod: domain.DeliveryMethodStandard,
		VoucherCode:    "CATA10",
		Shipping:       domain.DefaultShippingConfig(),
	})
	assert.ErrorIs(t, err, domain.ErrVoucherNotClaimed)

	// 4. Customer discovers voucher, claims idempotently (usedCount stays 0), and sees it in wallet & available
	discover, err := voucherRepo.ListDiscoverForUser(ctx, liveCustomerID, now)
	require.NoError(t, err)
	require.NotEmpty(t, discover)
	var foundDiscover *domain.DiscoverVoucher
	for i := range discover {
		if discover[i].ID == catVoucher.ID {
			foundDiscover = &discover[i]
			break
		}
	}
	require.NotNil(t, foundDiscover)
	assert.False(t, foundDiscover.Claimed)

	claimed1, err := voucherRepo.ClaimForUser(ctx, liveCustomerID, catVoucher.ID, now)
	require.NoError(t, err)
	claimed2, err := voucherRepo.ClaimForUser(ctx, liveCustomerID, catVoucher.ID, now)
	require.NoError(t, err)
	assert.Equal(t, claimed1.ClaimedAt, claimed2.ClaimedAt)
	assert.Equal(t, 0, claimed2.UsedCount)
	assert.Equal(t, domain.VoucherWalletAvailable, claimed2.WalletStatus)

	avail, err := voucherRepo.ListAvailableForUser(ctx, liveCustomerID, now)
	require.NoError(t, err)
	require.Len(t, avail, 1)
	assert.Equal(t, "CATA10", avail[0].Code)

	// 5. QuoteCheckout & CreateCheckoutOrder parity on mixed cart:
	// subtotal = 3,000,000; eligibleSubtotal = 1,000,000 (Cat A only); discount = 10% of 1,000,000 = 100,000; shipping = 25,000; total = 2,925,000
	quote, err := orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID:         liveCustomerID,
		AddressID:      addrID,
		DeliveryMethod: domain.DeliveryMethodStandard,
		VoucherCode:    "CATA10",
		Shipping:       domain.DefaultShippingConfig(),
	})
	require.NoError(t, err)
	assert.Equal(t, domain.MoneyVND("3000000"), quote.SubtotalVND)
	assert.Equal(t, domain.MoneyVND("1000000"), quote.EligibleSubtotalVND)
	assert.Equal(t, domain.MoneyVND("25000"), quote.ShippingFeeVND)
	assert.Equal(t, domain.MoneyVND("100000"), quote.DiscountVND)
	assert.Equal(t, domain.MoneyVND("2925000"), quote.TotalVND)

	order, err := orderRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
		UserID:         liveCustomerID,
		AddressID:      addrID,
		PaymentMethod:  domain.PaymentMethodCOD,
		DeliveryMethod: domain.DeliveryMethodStandard,
		VoucherCode:    "CATA10",
		Shipping:       domain.DefaultShippingConfig(),
		Lines: []domain.OrderLineInput{
			{VariantID: varA, Quantity: 1, ProductName: "Phone A", UnitPriceVND: "1000000"},
			{VariantID: varB, Quantity: 1, ProductName: "Laptop B", UnitPriceVND: "2000000"},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, quote.SubtotalVND, order.SubtotalVND)
	assert.Equal(t, quote.ShippingFeeVND, order.ShippingFeeVND)
	assert.Equal(t, quote.DiscountVND, order.DiscountVND)
	assert.Equal(t, quote.TotalVND, order.TotalVND)

	// Wallet now shows used_up for CATA10
	walletUsedUp, err := voucherRepo.ListWalletForUser(ctx, liveCustomerID, "used_up", now)
	require.NoError(t, err)
	require.Len(t, walletUsedUp, 1)
	assert.Equal(t, domain.VoucherWalletUsedUp, walletUsedUp[0].WalletStatus)

	// 6. Cancel order restores voucher usage while keeping voucher in wallet
	_, err = orderRepo.Cancel(ctx, liveCustomerID, order.ID)
	require.NoError(t, err)
	availAfterCancel, err := voucherRepo.ListAvailableForUser(ctx, liveCustomerID, now)
	require.NoError(t, err)
	require.Len(t, availAfterCancel, 1)
	assert.Equal(t, "CATA10", availAfterCancel[0].Code)
	assert.Equal(t, 1, availAfterCancel[0].UserRemainingUses)

	// 7. Product-scoped voucher mismatch returns ErrVoucherScopeMismatch
	_, err = conn.Exec(ctx, `
		INSERT INTO cart_items (user_id, variant_id, quantity, selected, snapshot_brand_name, snapshot_product_name, snapshot_model, snapshot_image_url, snapshot_options)
		VALUES ($1, $2, 1, true, 'BrandA', 'Phone A', 'A1', '', '[]'::jsonb)
	`, liveCustomerID, varA)
	require.NoError(t, err)

	prodBVoucher, err := voucherRepo.Create(ctx, domain.SaveVoucherInput{
		Code:          "ONLYPRODB",
		Title:         "Chỉ Laptop B",
		VoucherType:   domain.VoucherTypeFixedAmount,
		ScopeType:     domain.VoucherScopeProducts,
		ProductIDs:    []string{prodB},
		DiscountValue: "200000",
		MinOrderVND:   "0",
		PerUserLimit:  1,
		StartsAt:      now.Add(-time.Hour),
		EndsAt:        now.Add(24 * time.Hour),
		Active:        true,
	})
	require.NoError(t, err)
	_, err = voucherRepo.ClaimForUser(ctx, liveCustomerID, prodBVoucher.ID, now)
	require.NoError(t, err)

	_, err = orderRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID:         liveCustomerID,
		AddressID:      addrID,
		DeliveryMethod: domain.DeliveryMethodStandard,
		VoucherCode:    "ONLYPRODB",
		Shipping:       domain.DefaultShippingConfig(),
	})
	assert.ErrorIs(t, err, domain.ErrVoucherScopeMismatch)
}
