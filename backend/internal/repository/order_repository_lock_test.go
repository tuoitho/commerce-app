package repository

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

func TestAggregateRestockTargets_SortsByVariantIDAscAndAggregatesDuplicates(t *testing.T) {
	v1 := "11111111-1111-1111-1111-111111111111"
	v2 := "22222222-2222-2222-2222-222222222222"
	v3 := "33333333-3333-3333-3333-333333333333"

	rows := []sqlc.ListOrderItemRestoreTargetsByOrderIDsRow{
		{OrderID: "o2", VariantID: v3, Quantity: 2},
		{OrderID: "o1", VariantID: v1, Quantity: 1},
		{OrderID: "o2", VariantID: v2, Quantity: 4},
		{OrderID: "o1", VariantID: v3, Quantity: 5},
		{OrderID: "o3", VariantID: v1, Quantity: 3},
	}

	got := aggregateRestockTargets(rows)
	require.Equal(t, []variantRestockTarget{
		{VariantID: v1, Quantity: 4},
		{VariantID: v2, Quantity: 4},
		{VariantID: v3, Quantity: 7},
	}, got)
}

func TestAggregatePromoRestoreTargets_DeterministicOrderAndAggregation(t *testing.T) {
	p1 := "aaaaaaaa-1111-1111-1111-111111111111"
	p2 := "bbbbbbbb-1111-1111-1111-111111111111"
	v1 := "11111111-1111-1111-1111-111111111111"
	v2 := "22222222-2222-2222-2222-222222222222"

	rows := []sqlc.ListOrderItemRestoreTargetsByOrderIDsRow{
		{OrderID: "o2", VariantID: v2, Quantity: 2, FlashSaleID: p2},
		{OrderID: "o1", VariantID: v2, Quantity: 1, LiveSessionID: p2},
		{OrderID: "o2", VariantID: v1, Quantity: 3, FlashSaleID: p2},
		{OrderID: "o1", VariantID: v1, Quantity: 4, FlashSaleID: p1},
		{OrderID: "o3", VariantID: v1, Quantity: 2, FlashSaleID: p2},
		{OrderID: "o2", VariantID: v1, Quantity: 5, LiveSessionID: p1},
		{OrderID: "o3", VariantID: v1, Quantity: 2, LiveSessionID: p1},
		{OrderID: "o3", VariantID: v2, Quantity: 1}, // non-promo item
	}

	liveTargets, flashTargets := aggregatePromoRestoreTargets(rows)
	require.Equal(t, []promoQuotaRestoreTarget{
		{PromoID: p1, VariantID: v1, Quantity: 7},
		{PromoID: p2, VariantID: v2, Quantity: 1},
	}, liveTargets)
	require.Equal(t, []promoQuotaRestoreTarget{
		{PromoID: p1, VariantID: v1, Quantity: 4},
		{PromoID: p2, VariantID: v1, Quantity: 5},
		{PromoID: p2, VariantID: v2, Quantity: 2},
	}, flashTargets)
}

func TestSortCheckoutPromoLines_LiveThenFlashSaleDeterministicOrder(t *testing.T) {
	p1 := "aaaaaaaa-1111-1111-1111-111111111111"
	p2 := "bbbbbbbb-1111-1111-1111-111111111111"
	v1 := "11111111-1111-1111-1111-111111111111"
	v2 := "22222222-2222-2222-2222-222222222222"
	v3 := "33333333-3333-3333-3333-333333333333"
	v4 := "44444444-1111-1111-1111-111111111111"

	lines := []domain.OrderLineInput{
		{VariantID: v2, Quantity: 1},
		{VariantID: v3, Quantity: 2},
		{VariantID: v4, Quantity: 1},
		{VariantID: v1, Quantity: 3},
	}
	lockedMap := map[string]sqlc.LockSubmittedCartItemsRow{
		v2: {VariantID: v2, FlashSaleID: p2},
		v3: {VariantID: v3, LiveSessionID: p1},
		v4: {VariantID: v4},
		v1: {VariantID: v1, FlashSaleID: p1},
	}

	liveLines, flashLines := splitAndSortCheckoutPromoLines(lines, lockedMap)
	assert.Len(t, liveLines, 1)
	assert.Equal(t, v3, liveLines[0].VariantID)
	require.Len(t, flashLines, 2)
	assert.Equal(t, v1, flashLines[0].VariantID)
	assert.Equal(t, v2, flashLines[1].VariantID)
}
