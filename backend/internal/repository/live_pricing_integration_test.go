//go:build integration

package repository

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

func TestLivePricingIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	liveRepo := NewLiveRepository(pool)
	cartRepo := NewCartRepository(pool)
	catalogRepo := NewCatalogRepository(pool)
	quota := 2

	_, err := cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1)
	require.NoError(t, err)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA2)
	require.NoError(t, err)

	cartPrice := func(t *testing.T, variantID string) (domain.MoneyVND, bool) {
		t.Helper()
		cart, err := cartRepo.Get(ctx, liveCustomerID)
		require.NoError(t, err)
		for _, item := range cart.Items {
			if item.VariantID == variantID {
				require.NotNil(t, item.UnitPriceVND)
				return *item.UnitPriceVND, item.IsLivePrice
			}
		}
		t.Fatalf("variant %s not in cart", variantID)
		return "", false
	}
	detailVariant := func(t *testing.T, variantID string) domain.ProductVariant {
		t.Helper()
		product, err := catalogRepo.GetProductByID(ctx, liveProductA)
		require.NoError(t, err)
		assert.Equal(t, domain.MoneyVND("1000000"), product.MinPriceVND, "product price range stays regular")
		for _, v := range product.Variants {
			if v.ID == variantID {
				return v
			}
		}
		t.Fatalf("variant %s not in product", variantID)
		return domain.ProductVariant{}
	}

	t.Run("without a live session prices are regular", func(t *testing.T) {
		price, live := cartPrice(t, liveVariantA1)
		assert.Equal(t, domain.MoneyVND("1000000"), price)
		assert.False(t, live)
		v := detailVariant(t, liveVariantA1)
		assert.Nil(t, v.LivePriceVND)
		assert.Nil(t, v.LiveRemaining)
	})

	session, err := liveRepo.CreateSession(ctx, "Flash sale", liveAdminID, []domain.LiveProductInput{
		{ProductID: liveProductA, Variants: []domain.LiveVariantInput{
			{VariantID: liveVariantA1, LivePriceVND: "900000", Quota: &quota},
			{VariantID: liveVariantA2, LivePriceVND: "1800000"},
		}},
	})
	require.NoError(t, err)

	t.Run("live prices apply to the cart and product detail", func(t *testing.T) {
		price, live := cartPrice(t, liveVariantA1)
		assert.Equal(t, domain.MoneyVND("900000"), price)
		assert.True(t, live)

		cart, err := cartRepo.Get(ctx, liveCustomerID)
		require.NoError(t, err)
		assert.Equal(t, domain.MoneyVND("2700000"), cart.SelectedTotalVND, "900000 + 1800000")

		v := detailVariant(t, liveVariantA1)
		assert.Equal(t, domain.MoneyVND("1000000"), v.PriceVND, "priceVnd stays regular")
		require.NotNil(t, v.LivePriceVND)
		assert.Equal(t, domain.MoneyVND("900000"), *v.LivePriceVND)
		require.NotNil(t, v.LiveRemaining)
		assert.Equal(t, 2, *v.LiveRemaining)

		unlimited := detailVariant(t, liveVariantA2)
		require.NotNil(t, unlimited.LivePriceVND)
		assert.Nil(t, unlimited.LiveRemaining, "no quota means no remaining count")
	})

	t.Run("product lists keep regular prices", func(t *testing.T) {
		products, err := catalogRepo.ListProducts(ctx, domain.ProductFilter{})
		require.NoError(t, err)
		for _, p := range products {
			if p.ID == liveProductA {
				assert.Equal(t, domain.MoneyVND("1000000"), p.MinPriceVND)
				assert.Equal(t, domain.MoneyVND("2000000"), p.MaxPriceVND)
			}
		}
	})

	t.Run("exhausted quota falls back to the regular price", func(t *testing.T) {
		_, err := conn.Exec(ctx, `UPDATE live_variant_prices SET sold_quantity = 2 WHERE session_id = $1 AND variant_id = $2`, session.ID, liveVariantA1)
		require.NoError(t, err)
		price, live := cartPrice(t, liveVariantA1)
		assert.Equal(t, domain.MoneyVND("1000000"), price)
		assert.False(t, live)
		assert.Nil(t, detailVariant(t, liveVariantA1).LivePriceVND)
	})

	t.Run("ending the session restores regular prices", func(t *testing.T) {
		_, err := liveRepo.EndSession(ctx, session.ID, domain.LiveEndReasonAdmin)
		require.NoError(t, err)
		price, live := cartPrice(t, liveVariantA2)
		assert.Equal(t, domain.MoneyVND("2000000"), price)
		assert.False(t, live)
	})
}
