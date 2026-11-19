package flashsale

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

const (
	testAdminID    = "11111111-1111-1111-1111-111111111111"
	testProductID  = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
	testVariantID1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1"
	testVariantID2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"
	testVariantOff = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3"
	testFlashID1   = "cccccccc-cccc-cccc-cccc-ccccccccccc1"
	testFlashID2   = "cccccccc-cccc-cccc-cccc-ccccccccccc2"
)

type fakeFlashSaleRepo struct {
	variants  map[string]domain.FlashSaleValidationVariant
	campaigns map[string]*domain.AdminFlashSaleDetail
	public    *domain.FlashSaleCampaignPublic
	seq       int
}

func newFakeRepo() *fakeFlashSaleRepo {
	return &fakeFlashSaleRepo{
		variants: map[string]domain.FlashSaleValidationVariant{
			testVariantID1: {
				ID:              testVariantID1,
				ProductID:       testProductID,
				VariantActive:   true,
				ProductActive:   true,
				RegularPriceVND: "28990000",
			},
			testVariantID2: {
				ID:              testVariantID2,
				ProductID:       testProductID,
				VariantActive:   true,
				ProductActive:   true,
				RegularPriceVND: "34990000",
			},
			testVariantOff: {
				ID:              testVariantOff,
				ProductID:       testProductID,
				VariantActive:   false,
				ProductActive:   true,
				RegularPriceVND: "20000000",
			},
		},
		campaigns: map[string]*domain.AdminFlashSaleDetail{},
	}
}

func (r *fakeFlashSaleRepo) GetCurrentPublic(_ context.Context) (*domain.FlashSaleCampaignPublic, error) {
	return r.public, nil
}

func (r *fakeFlashSaleRepo) ListAdmin(_ context.Context, filter domain.FlashSaleListFilter) ([]domain.AdminFlashSaleSummary, int64, error) {
	out := make([]domain.AdminFlashSaleSummary, 0, len(r.campaigns))
	for _, c := range r.campaigns {
		if filter.Status != "" && string(c.Status) != filter.Status {
			continue
		}
		var totalQuota, totalSold int
		for _, it := range c.Items {
			totalQuota += it.Quota
			totalSold += it.SoldQuantity
		}
		out = append(out, domain.AdminFlashSaleSummary{
			ID:           c.ID,
			Name:         c.Name,
			StartsAt:     c.StartsAt,
			EndsAt:       c.EndsAt,
			Active:       c.Active,
			Status:       c.Status,
			VariantCount: len(c.Items),
			TotalQuota:   totalQuota,
			TotalSold:    totalSold,
			CreatedAt:    c.CreatedAt,
			UpdatedAt:    c.UpdatedAt,
		})
	}
	total := int64(len(out))
	if filter.Offset >= len(out) {
		return []domain.AdminFlashSaleSummary{}, total, nil
	}
	end := filter.Offset + filter.Limit
	if end > len(out) {
		end = len(out)
	}
	return out[filter.Offset:end], total, nil
}

func (r *fakeFlashSaleRepo) GetAdminByID(_ context.Context, id string) (*domain.AdminFlashSaleDetail, error) {
	c, ok := r.campaigns[id]
	if !ok {
		return nil, domain.ErrFlashSaleNotFound
	}
	cp := *c
	cp.Items = append([]domain.AdminFlashSaleItem(nil), c.Items...)
	return &cp, nil
}

func (r *fakeFlashSaleRepo) ValidationData(_ context.Context, flashSaleID string, variantIDs []string) (*domain.FlashSaleValidationData, error) {
	data := &domain.FlashSaleValidationData{
		Variants: map[string]domain.FlashSaleValidationVariant{},
		Sold:     map[string]int{},
	}
	for _, vid := range variantIDs {
		if v, ok := r.variants[vid]; ok {
			data.Variants[vid] = v
		}
	}
	if flashSaleID != "" {
		c, ok := r.campaigns[flashSaleID]
		if !ok {
			return nil, domain.ErrFlashSaleNotFound
		}
		for _, it := range c.Items {
			data.Sold[it.VariantID] = it.SoldQuantity
		}
	}
	return data, nil
}

func (r *fakeFlashSaleRepo) hasOverlap(excludeID string, startsAt, endsAt time.Time) bool {
	for id, c := range r.campaigns {
		if id == excludeID || !c.Active {
			continue
		}
		if startsAt.Before(c.EndsAt) && c.StartsAt.Before(endsAt) {
			return true
		}
	}
	return false
}

func (r *fakeFlashSaleRepo) Create(_ context.Context, input domain.SaveFlashSaleInput, resolvedProductIDs map[string]string) (*domain.AdminFlashSaleDetail, error) {
	if input.Active && r.hasOverlap("", input.StartsAt, input.EndsAt) {
		return nil, domain.ErrFlashSaleTimeOverlap
	}
	r.seq++
	id := testFlashID1
	if r.seq > 1 {
		id = testFlashID2
	}
	now := time.Date(2026, 11, 18, 5, 0, 0, 0, time.UTC)
	items := make([]domain.AdminFlashSaleItem, 0, len(input.Items))
	for i, it := range input.Items {
		v := r.variants[it.VariantID]
		items = append(items, domain.AdminFlashSaleItem{
			ProductID:       resolvedProductIDs[it.VariantID],
			VariantID:       it.VariantID,
			ProductName:     "iPhone 16 Pro",
			Brand:           "Apple",
			Model:           "A3294",
			ImageURL:        "/media/products/test.webp",
			OptionLabel:     "256GB",
			VariantActive:   v.VariantActive && v.ProductActive,
			RegularPriceVND: v.RegularPriceVND,
			FlashPriceVND:   it.FlashPriceVND,
			Quota:           it.Quota,
			SoldQuantity:    0,
			Position:        i,
		})
	}
	detail := &domain.AdminFlashSaleDetail{
		ID:        id,
		Name:      input.Name,
		StartsAt:  input.StartsAt.UTC(),
		EndsAt:    input.EndsAt.UTC(),
		Active:    input.Active,
		CreatedAt: now,
		UpdatedAt: now,
		Items:     items,
	}
	r.campaigns[id] = detail
	return r.GetAdminByID(context.Background(), id)
}

func (r *fakeFlashSaleRepo) Update(_ context.Context, id string, input domain.SaveFlashSaleInput, resolvedProductIDs map[string]string) (*domain.AdminFlashSaleDetail, error) {
	cur, ok := r.campaigns[id]
	if !ok {
		return nil, domain.ErrFlashSaleNotFound
	}
	if input.Active && r.hasOverlap(id, input.StartsAt, input.EndsAt) {
		return nil, domain.ErrFlashSaleTimeOverlap
	}
	soldByVariant := map[string]int{}
	for _, it := range cur.Items {
		soldByVariant[it.VariantID] = it.SoldQuantity
	}
	items := make([]domain.AdminFlashSaleItem, 0, len(input.Items))
	for i, it := range input.Items {
		v := r.variants[it.VariantID]
		items = append(items, domain.AdminFlashSaleItem{
			ProductID:       resolvedProductIDs[it.VariantID],
			VariantID:       it.VariantID,
			ProductName:     "iPhone 16 Pro",
			Brand:           "Apple",
			Model:           "A3294",
			ImageURL:        "/media/products/test.webp",
			OptionLabel:     "256GB",
			VariantActive:   v.VariantActive && v.ProductActive,
			RegularPriceVND: v.RegularPriceVND,
			FlashPriceVND:   it.FlashPriceVND,
			Quota:           it.Quota,
			SoldQuantity:    soldByVariant[it.VariantID],
			Position:        i,
		})
	}
	cur.Name = input.Name
	cur.StartsAt = input.StartsAt.UTC()
	cur.EndsAt = input.EndsAt.UTC()
	cur.Active = input.Active
	cur.UpdatedAt = cur.UpdatedAt.Add(time.Minute)
	cur.Items = items
	return r.GetAdminByID(context.Background(), id)
}

func (r *fakeFlashSaleRepo) Delete(_ context.Context, id string) error {
	c, ok := r.campaigns[id]
	if !ok {
		return domain.ErrFlashSaleNotFound
	}
	for _, it := range c.Items {
		if it.SoldQuantity > 0 {
			return domain.ErrFlashSaleHasOrders
		}
	}
	delete(r.campaigns, id)
	return nil
}

func TestFlashSaleUseCase_CreateValidation(t *testing.T) {
	now := time.Date(2026, 11, 18, 6, 0, 0, 0, time.UTC)
	uc := New(Dependencies{
		Repo:  newFakeRepo(),
		Clock: func() time.Time { return now },
	})

	t.Run("rejects empty name, invalid window, empty items", func(t *testing.T) {
		_, err := uc.Create(context.Background(), testAdminID, domain.SaveFlashSaleInput{
			Name:     "   ",
			StartsAt: now.Add(time.Hour),
			EndsAt:   now,
			Active:   true,
			Items:    nil,
		})
		var valErr *domain.ValidationError
		require.ErrorAs(t, err, &valErr)
		assert.Contains(t, valErr.Fields, "name")
		assert.Contains(t, valErr.Fields, "endsAt")
		assert.Contains(t, valErr.Fields, "items")
	})

	t.Run("rejects inactive variant, duplicate variant, flashPrice >= regularPrice, invalid quota", func(t *testing.T) {
		_, err := uc.Create(context.Background(), testAdminID, domain.SaveFlashSaleInput{
			Name:     "Deal Giờ Vàng",
			StartsAt: now,
			EndsAt:   now.Add(2 * time.Hour),
			Active:   true,
			Items: []domain.FlashSaleItemInput{
				{VariantID: testVariantOff, FlashPriceVND: "15000000", Quota: 0},
				{VariantID: testVariantID1, FlashPriceVND: "28990000", Quota: 10},
				{VariantID: testVariantID1, FlashPriceVND: "25990000", Quota: 100001},
			},
		})
		var valErr *domain.ValidationError
		require.ErrorAs(t, err, &valErr)
		assert.Contains(t, valErr.Fields, "items[0].variantId")
		assert.Contains(t, valErr.Fields, "items[0].quota")
		assert.Contains(t, valErr.Fields, "items[1].flashPriceVnd")
		assert.Contains(t, valErr.Fields, "items[2].variantId")
		assert.Contains(t, valErr.Fields, "items[2].quota")
	})
}

func TestFlashSaleUseCase_CreateOverlapAndStatus(t *testing.T) {
	now := time.Date(2026, 11, 18, 6, 0, 0, 0, time.UTC)
	uc := New(Dependencies{
		Repo:  newFakeRepo(),
		Clock: func() time.Time { return now },
	})

	// Running campaign [05:00, 08:00)
	created, err := uc.Create(context.Background(), testAdminID, domain.SaveFlashSaleInput{
		Name:     "Deal 12H",
		StartsAt: now.Add(-1 * time.Hour),
		EndsAt:   now.Add(2 * time.Hour),
		Active:   true,
		Items: []domain.FlashSaleItemInput{
			{VariantID: testVariantID1, FlashPriceVND: "25990000", Quota: 20},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, domain.FlashSaleStatusRunning, created.Status)

	// Overlapping active campaign -> ErrFlashSaleTimeOverlap
	_, err = uc.Create(context.Background(), testAdminID, domain.SaveFlashSaleInput{
		Name:     "Deal Overlap",
		StartsAt: now,
		EndsAt:   now.Add(3 * time.Hour),
		Active:   true,
		Items: []domain.FlashSaleItemInput{
			{VariantID: testVariantID2, FlashPriceVND: "30000000", Quota: 10},
		},
	})
	assert.ErrorIs(t, err, domain.ErrFlashSaleTimeOverlap)

	// Adjacent [08:00, 10:00) -> allowed, status = scheduled
	adjacent, err := uc.Create(context.Background(), testAdminID, domain.SaveFlashSaleInput{
		Name:     "Deal Tiếp Theo",
		StartsAt: now.Add(2 * time.Hour),
		EndsAt:   now.Add(4 * time.Hour),
		Active:   true,
		Items: []domain.FlashSaleItemInput{
			{VariantID: testVariantID2, FlashPriceVND: "30000000", Quota: 10},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, domain.FlashSaleStatusScheduled, adjacent.Status)
}

func TestFlashSaleUseCase_UpdateAndDeleteGuards(t *testing.T) {
	now := time.Date(2026, 11, 18, 6, 0, 0, 0, time.UTC)
	repo := newFakeRepo()
	uc := New(Dependencies{
		Repo:  repo,
		Clock: func() time.Time { return now },
	})

	created, err := uc.Create(context.Background(), testAdminID, domain.SaveFlashSaleInput{
		Name:     "Deal 12H",
		StartsAt: now.Add(-1 * time.Hour),
		EndsAt:   now.Add(2 * time.Hour),
		Active:   true,
		Items: []domain.FlashSaleItemInput{
			{VariantID: testVariantID1, FlashPriceVND: "25990000", Quota: 20},
		},
	})
	require.NoError(t, err)

	// Simulate 5 units sold
	repo.campaigns[created.ID].Items[0].SoldQuantity = 5

	// Update with quota < soldQuantity -> ValidationError
	_, err = uc.Update(context.Background(), created.ID, domain.SaveFlashSaleInput{
		Name:     "Deal 12H",
		StartsAt: now.Add(-1 * time.Hour),
		EndsAt:   now.Add(2 * time.Hour),
		Active:   true,
		Items: []domain.FlashSaleItemInput{
			{VariantID: testVariantID1, FlashPriceVND: "25990000", Quota: 4},
		},
	})
	var valErr *domain.ValidationError
	require.ErrorAs(t, err, &valErr)
	assert.Contains(t, valErr.Fields, "items[0].quota")

	// Update removing sold item -> ValidationError
	_, err = uc.Update(context.Background(), created.ID, domain.SaveFlashSaleInput{
		Name:     "Deal 12H",
		StartsAt: now.Add(-1 * time.Hour),
		EndsAt:   now.Add(2 * time.Hour),
		Active:   true,
		Items: []domain.FlashSaleItemInput{
			{VariantID: testVariantID2, FlashPriceVND: "30000000", Quota: 10},
		},
	})
	require.ErrorAs(t, err, &valErr)
	assert.Contains(t, valErr.Fields, "items")

	// Delete with soldQuantity > 0 -> ErrFlashSaleHasOrders
	err = uc.Delete(context.Background(), created.ID)
	assert.ErrorIs(t, err, domain.ErrFlashSaleHasOrders)

	// Reset soldQuantity -> Delete succeeds
	repo.campaigns[created.ID].Items[0].SoldQuantity = 0
	require.NoError(t, uc.Delete(context.Background(), created.ID))
	_, err = uc.GetAdminByID(context.Background(), created.ID)
	assert.True(t, errors.Is(err, domain.ErrFlashSaleNotFound))
}

func TestFlashSaleUseCase_ListAndPublicCurrent(t *testing.T) {
	now := time.Date(2026, 11, 18, 6, 0, 0, 0, time.UTC)
	repo := newFakeRepo()
	uc := New(Dependencies{
		Repo:  repo,
		Clock: func() time.Time { return now },
	})

	_, err := uc.ListAdmin(context.Background(), ListInput{Status: "unknown", Page: 1, Limit: 20})
	var filterErr *domain.FilterValidationError
	require.ErrorAs(t, err, &filterErr)
	assert.Contains(t, filterErr.Fields, "status")

	_, err = uc.ListAdmin(context.Background(), ListInput{Page: 0, Limit: 200})
	var valErr *domain.ValidationError
	require.ErrorAs(t, err, &valErr)
	assert.Contains(t, valErr.Fields, "page")
	assert.Contains(t, valErr.Fields, "limit")

	// Current public returns nil when none
	cur, err := uc.GetCurrentPublic(context.Background())
	require.NoError(t, err)
	assert.Nil(t, cur)

	// When repo returns a running campaign, discountPercent is populated
	repo.public = &domain.FlashSaleCampaignPublic{
		ID:       testFlashID1,
		Name:     "Deal Chớp Nhoáng 12H",
		StartsAt: now.Add(-time.Hour),
		EndsAt:   now.Add(2 * time.Hour),
		Items: []domain.FlashSalePublicItem{
			{
				ProductID:       testProductID,
				VariantID:       testVariantID1,
				ProductName:     "iPhone 16 Pro",
				Brand:           "Apple",
				Model:           "A3294",
				ImageURL:        "/media/products/test.webp",
				OptionLabel:     "256GB",
				RegularPriceVND: "28990000",
				FlashPriceVND:   "25990000",
				Quota:           20,
				SoldQuantity:    12,
				InStock:         true,
			},
		},
	}
	cur, err = uc.GetCurrentPublic(context.Background())
	require.NoError(t, err)
	require.NotNil(t, cur)
	assert.Equal(t, 10, cur.Items[0].DiscountPercent)
}
