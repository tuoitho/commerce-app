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

func TestFlashSaleRepository_CRUDAndOverlapIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	fsRepo := NewFlashSaleRepository(pool)

	now := time.Now().UTC().Truncate(time.Second)

	// 1. Create scheduled campaign [now+2h, now+4h)
	sched, err := fsRepo.Create(ctx, domain.SaveFlashSaleInput{
		Name:      "Deal Tối",
		StartsAt:  now.Add(2 * time.Hour),
		EndsAt:    now.Add(4 * time.Hour),
		Active:    true,
		CreatedBy: liveAdminID,
		Items: []domain.FlashSaleItemInput{
			{VariantID: liveVariantA1, FlashPriceVND: "850000", Quota: 10},
		},
	}, map[string]string{liveVariantA1: liveProductA})
	require.NoError(t, err)
	assert.Equal(t, domain.FlashSaleStatusScheduled, sched.Status)
	require.Len(t, sched.Items, 1)
	assert.Equal(t, 0, sched.Items[0].SoldQuantity)

	// Scheduled campaign is NOT returned by GetCurrentPublic
	pub, err := fsRepo.GetCurrentPublic(ctx)
	require.NoError(t, err)
	assert.Nil(t, pub)

	// 2. Overlapping active campaign [now+3h, now+5h) fails via EXCLUDE USING gist -> ErrFlashSaleTimeOverlap
	_, err = fsRepo.Create(ctx, domain.SaveFlashSaleInput{
		Name:      "Deal Trùng Giờ",
		StartsAt:  now.Add(3 * time.Hour),
		EndsAt:    now.Add(5 * time.Hour),
		Active:    true,
		CreatedBy: liveAdminID,
		Items: []domain.FlashSaleItemInput{
			{VariantID: liveVariantA2, FlashPriceVND: "1700000", Quota: 5},
		},
	}, map[string]string{liveVariantA2: liveProductA})
	assert.ErrorIs(t, err, domain.ErrFlashSaleTimeOverlap)

	// 3. Inactive overlapping campaign succeeds
	inactive, err := fsRepo.Create(ctx, domain.SaveFlashSaleInput{
		Name:      "Deal Nháp",
		StartsAt:  now.Add(3 * time.Hour),
		EndsAt:    now.Add(5 * time.Hour),
		Active:    false,
		CreatedBy: liveAdminID,
		Items: []domain.FlashSaleItemInput{
			{VariantID: liveVariantA2, FlashPriceVND: "1700000", Quota: 5},
		},
	}, map[string]string{liveVariantA2: liveProductA})
	require.NoError(t, err)
	assert.Equal(t, domain.FlashSaleStatusInactive, inactive.Status)

	// 4. Running campaign [now-1h, now+1h) adjacent to sched [now+2h, now+4h) succeeds and appears on GetCurrentPublic
	running, err := fsRepo.Create(ctx, domain.SaveFlashSaleInput{
		Name:      "Deal Đang Chạy",
		StartsAt:  now.Add(-1 * time.Hour),
		EndsAt:    now.Add(1 * time.Hour),
		Active:    true,
		CreatedBy: liveAdminID,
		Items: []domain.FlashSaleItemInput{
			{VariantID: liveVariantA1, FlashPriceVND: "800000", Quota: 15},
			{VariantID: liveVariantA2, FlashPriceVND: "1600000", Quota: 5},
		},
	}, map[string]string{liveVariantA1: liveProductA, liveVariantA2: liveProductA})
	require.NoError(t, err)
	assert.Equal(t, domain.FlashSaleStatusRunning, running.Status)

	// Simulate 5 sold on variant A2 (quota == soldQuantity still visible in public running campaign)
	_, err = conn.Exec(ctx, `UPDATE flash_sale_items SET sold_quantity = 5 WHERE flash_sale_id = $1 AND variant_id = $2`, running.ID, liveVariantA2)
	require.NoError(t, err)

	pub, err = fsRepo.GetCurrentPublic(ctx)
	require.NoError(t, err)
	require.NotNil(t, pub)
	assert.Equal(t, running.ID, pub.ID)
	require.Len(t, pub.Items, 2)
	assert.Equal(t, 20, pub.Items[0].DiscountPercent)
	assert.Equal(t, 5, pub.Items[1].SoldQuantity)
	assert.Equal(t, 5, pub.Items[1].Quota)

	// 5. ListAdmin with status filter & pagination
	listRunning, totalRunning, err := fsRepo.ListAdmin(ctx, domain.FlashSaleListFilter{Status: "running", Limit: 10, Offset: 0})
	require.NoError(t, err)
	assert.Equal(t, int64(1), totalRunning)
	require.Len(t, listRunning, 1)
	assert.Equal(t, 2, listRunning[0].VariantCount)
	assert.Equal(t, 20, listRunning[0].TotalQuota)
	assert.Equal(t, 5, listRunning[0].TotalSold)

	// 6. Update preserves sold_quantity and rejects turning inactive overlap active
	_, err = fsRepo.Update(ctx, inactive.ID, domain.SaveFlashSaleInput{
		Name:     "Deal Nháp Bật Trùng",
		StartsAt: now.Add(3 * time.Hour),
		EndsAt:   now.Add(5 * time.Hour),
		Active:   true,
		Items: []domain.FlashSaleItemInput{
			{VariantID: liveVariantA2, FlashPriceVND: "1700000", Quota: 5},
		},
	}, map[string]string{liveVariantA2: liveProductA})
	assert.ErrorIs(t, err, domain.ErrFlashSaleTimeOverlap)

	updatedRunning, err := fsRepo.Update(ctx, running.ID, domain.SaveFlashSaleInput{
		Name:     "Deal Đang Chạy V2",
		StartsAt: now.Add(-1 * time.Hour),
		EndsAt:   now.Add(1 * time.Hour),
		Active:   true,
		Items: []domain.FlashSaleItemInput{
			{VariantID: liveVariantA1, FlashPriceVND: "750000", Quota: 20},
			{VariantID: liveVariantA2, FlashPriceVND: "1500000", Quota: 8},
		},
	}, map[string]string{liveVariantA1: liveProductA, liveVariantA2: liveProductA})
	require.NoError(t, err)
	assert.Equal(t, "Deal Đang Chạy V2", updatedRunning.Name)
	assert.Equal(t, 5, updatedRunning.Items[1].SoldQuantity, "soldQuantity must be preserved across update")

	// 7. Delete fails when sold_quantity > 0, succeeds when sold_quantity == 0
	assert.ErrorIs(t, fsRepo.Delete(ctx, running.ID), domain.ErrFlashSaleHasOrders)
	require.NoError(t, fsRepo.Delete(ctx, sched.ID))
	_, err = fsRepo.GetAdminByID(ctx, sched.ID)
	assert.ErrorIs(t, err, domain.ErrFlashSaleNotFound)
}

func TestCartAndFlashSale_EffectivePricePriorityIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	fsRepo := NewFlashSaleRepository(pool)
	liveRepo := NewLiveRepository(pool)
	cartRepo := NewCartRepository(pool)

	_, err := cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA1) // regular 1,000,000
	require.NoError(t, err)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantA2) // regular 2,000,000
	require.NoError(t, err)
	_, err = cartRepo.AddVariant(ctx, liveCustomerID, liveVariantB1) // regular 3,000,000
	require.NoError(t, err)

	now := time.Now().UTC().Truncate(time.Second)

	// Start running Flash Sale:
	// - A1: 800,000 (quota 2)
	// - A2: 1,500,000 (quota 5)
	// - B1: 2,500,000 (quota 5)
	fs, err := fsRepo.Create(ctx, domain.SaveFlashSaleInput{
		Name:      "Flash Sale PD-4",
		StartsAt:  now.Add(-30 * time.Minute),
		EndsAt:    now.Add(30 * time.Minute),
		Active:    true,
		CreatedBy: liveAdminID,
		Items: []domain.FlashSaleItemInput{
			{VariantID: liveVariantA1, FlashPriceVND: "800000", Quota: 2},
			{VariantID: liveVariantA2, FlashPriceVND: "1500000", Quota: 5},
			{VariantID: liveVariantB1, FlashPriceVND: "2500000", Quota: 5},
		},
	}, map[string]string{
		liveVariantA1: liveProductA,
		liveVariantA2: liveProductA,
		liveVariantB1: liveProductB,
	})
	require.NoError(t, err)

	// Start Live Session:
	// - A1: 900,000 (higher than Flash Sale 800,000 -> Flash Sale wins!)
	// - A2: 1,400,000 (lower than Flash Sale 1,500,000 -> Live wins!)
	// - B1: 2,500,000 (equal to Flash Sale 2,500,000 -> Tie-breaker Live wins!)
	_, err = liveRepo.CreateSession(ctx, "Live PD-4", liveAdminID, []domain.LiveProductInput{
		{ProductID: liveProductA, Variants: []domain.LiveVariantInput{
			{VariantID: liveVariantA1, LivePriceVND: "900000"},
			{VariantID: liveVariantA2, LivePriceVND: "1400000"},
		}},
		{ProductID: liveProductB, Variants: []domain.LiveVariantInput{
			{VariantID: liveVariantB1, LivePriceVND: "2500000"},
		}},
	})
	require.NoError(t, err)

	getItem := func(t *testing.T, variantID string) domain.CartItem {
		t.Helper()
		cart, err := cartRepo.Get(ctx, liveCustomerID)
		require.NoError(t, err)
		for _, it := range cart.Items {
			if it.VariantID == variantID {
				return it
			}
		}
		t.Fatalf("variant %s not in cart", variantID)
		return domain.CartItem{}
	}

	t.Run("picks lower price between live and flash sale, live wins on tie", func(t *testing.T) {
		a1 := getItem(t, liveVariantA1)
		require.NotNil(t, a1.UnitPriceVND)
		assert.Equal(t, domain.MoneyVND("800000"), *a1.UnitPriceVND)
		assert.False(t, a1.IsLivePrice)
		assert.True(t, a1.IsFlashSalePrice)

		a2 := getItem(t, liveVariantA2)
		require.NotNil(t, a2.UnitPriceVND)
		assert.Equal(t, domain.MoneyVND("1400000"), *a2.UnitPriceVND)
		assert.True(t, a2.IsLivePrice)
		assert.False(t, a2.IsFlashSalePrice)

		b1 := getItem(t, liveVariantB1)
		require.NotNil(t, b1.UnitPriceVND)
		assert.Equal(t, domain.MoneyVND("2500000"), *b1.UnitPriceVND)
		assert.True(t, b1.IsLivePrice, "on equal price, Live takes precedence")
		assert.False(t, b1.IsFlashSalePrice)
	})

	t.Run("exhausted flash sale quota falls back to live or regular price", func(t *testing.T) {
		_, err := conn.Exec(ctx, `UPDATE flash_sale_items SET sold_quantity = quota WHERE flash_sale_id = $1 AND variant_id = $2`, fs.ID, liveVariantA1)
		require.NoError(t, err)

		a1 := getItem(t, liveVariantA1)
		require.NotNil(t, a1.UnitPriceVND)
		assert.Equal(t, domain.MoneyVND("900000"), *a1.UnitPriceVND)
		assert.True(t, a1.IsLivePrice)
		assert.False(t, a1.IsFlashSalePrice)
	})

	t.Run("expired flash sale without live session reverts automatically to regular price", func(t *testing.T) {
		// End live session and expire flash sale in DB
		sess, err := liveRepo.GetCurrentSession(ctx)
		require.NoError(t, err)
		_, err = liveRepo.EndSession(ctx, sess.ID, domain.LiveEndReasonAdmin)
		require.NoError(t, err)

		_, err = conn.Exec(ctx, `UPDATE flash_sales SET ends_at = now() - interval '1 second' WHERE id = $1`, fs.ID)
		require.NoError(t, err)

		pub, err := fsRepo.GetCurrentPublic(ctx)
		require.NoError(t, err)
		assert.Nil(t, pub)

		a2 := getItem(t, liveVariantA2)
		require.NotNil(t, a2.UnitPriceVND)
		assert.Equal(t, domain.MoneyVND("2000000"), *a2.UnitPriceVND)
		assert.False(t, a2.IsLivePrice)
		assert.False(t, a2.IsFlashSalePrice)
	})
}
