package voucher

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

const (
	testUserID    = "11111111-1111-1111-1111-111111111111"
	testVoucher1  = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
	testVoucher2  = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"
	missingVouch  = "99999999-9999-9999-9999-999999999999"
)

type fakeVoucherRepo struct {
	vouchers  map[string]*domain.Voucher
	order     []string
	available []domain.AvailableVoucher
	lastNow   time.Time
	seq       int
}

func newFakeVoucherRepo() *fakeVoucherRepo {
	return &fakeVoucherRepo{
		vouchers: map[string]*domain.Voucher{},
	}
}

func (r *fakeVoucherRepo) ListAdmin(_ context.Context, filter domain.VoucherListFilter) ([]domain.Voucher, int64, error) {
	out := make([]domain.Voucher, 0, len(r.order))
	for _, id := range r.order {
		v, ok := r.vouchers[id]
		if !ok {
			continue
		}
		if filter.Query != "" {
			q := strings.ToLower(filter.Query)
			if !strings.Contains(strings.ToLower(v.Code), q) && !strings.Contains(strings.ToLower(v.Title), q) {
				continue
			}
		}
		if filter.Status != "" && string(v.EffectiveStatus) != filter.Status {
			continue
		}
		out = append(out, *v)
	}
	total := int64(len(out))
	if filter.Offset >= len(out) {
		return []domain.Voucher{}, total, nil
	}
	end := filter.Offset + filter.Limit
	if end > len(out) {
		end = len(out)
	}
	return out[filter.Offset:end], total, nil
}

func (r *fakeVoucherRepo) GetAdminByID(_ context.Context, id string) (*domain.Voucher, error) {
	v, ok := r.vouchers[id]
	if !ok {
		return nil, domain.ErrVoucherNotFound
	}
	cp := *v
	return &cp, nil
}

func (r *fakeVoucherRepo) Create(_ context.Context, input domain.SaveVoucherInput) (*domain.Voucher, error) {
	code := domain.NormalizeVoucherCode(input.Code)
	for _, existing := range r.vouchers {
		if existing.Code == code {
			return nil, domain.ErrVoucherCodeInUse
		}
	}
	r.seq++
	id := testVoucher1
	if r.seq > 1 {
		id = testVoucher2
	}
	now := time.Date(2026, 11, 18, 8, 0, 0, 0, time.UTC)
	v := &domain.Voucher{
		ID:              id,
		Code:            code,
		Title:           input.Title,
		Description:     input.Description,
		VoucherType:     input.VoucherType,
		DiscountValue:   input.DiscountValue,
		MaxDiscountVND:  input.MaxDiscountVND,
		MinOrderVND:     input.MinOrderVND,
		UsageLimit:      input.UsageLimit,
		UsedCount:       0,
		PerUserLimit:    input.PerUserLimit,
		StartsAt:        input.StartsAt.UTC(),
		EndsAt:          input.EndsAt.UTC(),
		Active:          input.Active,
		EffectiveStatus: domain.DeriveVoucherEffectiveStatus(input.Active, input.StartsAt, input.EndsAt, now, input.UsageLimit, 0),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	r.vouchers[id] = v
	r.order = append(r.order, id)
	cp := *v
	return &cp, nil
}

func (r *fakeVoucherRepo) Update(_ context.Context, id string, input domain.SaveVoucherInput) (*domain.Voucher, error) {
	cur, ok := r.vouchers[id]
	if !ok {
		return nil, domain.ErrVoucherNotFound
	}
	code := domain.NormalizeVoucherCode(input.Code)
	for otherID, other := range r.vouchers {
		if otherID != id && other.Code == code {
			return nil, domain.ErrVoucherCodeInUse
		}
	}
	if cur.UsedCount > 0 {
		if cur.Code != code || cur.VoucherType != input.VoucherType {
			return nil, domain.ErrVoucherImmutableFields
		}
		if input.UsageLimit != nil && *input.UsageLimit < cur.UsedCount {
			return nil, domain.ErrVoucherUsageLimitTooLow
		}
	}
	cur.Code = code
	cur.Title = input.Title
	cur.Description = input.Description
	cur.VoucherType = input.VoucherType
	cur.DiscountValue = input.DiscountValue
	cur.MaxDiscountVND = input.MaxDiscountVND
	cur.MinOrderVND = input.MinOrderVND
	cur.UsageLimit = input.UsageLimit
	cur.PerUserLimit = input.PerUserLimit
	cur.StartsAt = input.StartsAt.UTC()
	cur.EndsAt = input.EndsAt.UTC()
	cur.Active = input.Active
	cur.UpdatedAt = cur.UpdatedAt.Add(time.Minute)
	cp := *cur
	return &cp, nil
}

func (r *fakeVoucherRepo) Delete(_ context.Context, id string) error {
	v, ok := r.vouchers[id]
	if !ok {
		return domain.ErrVoucherNotFound
	}
	if v.UsedCount > 0 {
		return domain.ErrVoucherInUse
	}
	delete(r.vouchers, id)
	return nil
}

func (r *fakeVoucherRepo) ListAvailableForUser(_ context.Context, _ string, now time.Time) ([]domain.AvailableVoucher, error) {
	r.lastNow = now
	return r.available, nil
}

func intPtr(v int) *int { return &v }

func moneyPtr(v domain.MoneyVND) *domain.MoneyVND { return &v }

func TestVoucherUseCase_CreateAndValidation(t *testing.T) {
	now := time.Date(2026, 11, 18, 10, 0, 0, 0, time.UTC)
	uc := New(Dependencies{
		Repo:  newFakeVoucherRepo(),
		Clock: func() time.Time { return now },
	})
	ctx := context.Background()

	t.Run("rejects invalid fields across all voucher rules", func(t *testing.T) {
		_, err := uc.Create(ctx, domain.SaveVoucherInput{
			Code:           "ab",
			Title:          "   ",
			Description:    strings.Repeat("a", 501),
			VoucherType:    domain.VoucherType("invalid"),
			DiscountValue:  "0",
			MaxDiscountVND: moneyPtr("0"),
			MinOrderVND:    "-100",
			UsageLimit:     intPtr(0),
			PerUserLimit:   0,
			StartsAt:       now.Add(2 * time.Hour),
			EndsAt:         now,
			Active:         true,
		})
		var valErr *domain.ValidationError
		require.ErrorAs(t, err, &valErr)
		assert.Contains(t, valErr.Fields, "code")
		assert.Contains(t, valErr.Fields, "title")
		assert.Contains(t, valErr.Fields, "description")
		assert.Contains(t, valErr.Fields, "voucherType")
		assert.Contains(t, valErr.Fields, "discountValue")
		assert.Contains(t, valErr.Fields, "maxDiscountVnd")
		assert.Contains(t, valErr.Fields, "minOrderVnd")
		assert.Contains(t, valErr.Fields, "usageLimit")
		assert.Contains(t, valErr.Fields, "perUserLimit")
		assert.Contains(t, valErr.Fields, "endsAt")
	})

	t.Run("rejects percent > 100, non-null maxDiscountVnd on fixed_amount, and non-zero discountValue on freeship", func(t *testing.T) {
		_, err := uc.Create(ctx, domain.SaveVoucherInput{
			Code:          "PCT101",
			Title:         "Percent too high",
			VoucherType:   domain.VoucherTypePercent,
			DiscountValue: "101",
			MinOrderVND:   "0",
			PerUserLimit:  1,
			StartsAt:      now,
			EndsAt:        now.Add(time.Hour),
		})
		var valErr *domain.ValidationError
		require.ErrorAs(t, err, &valErr)
		assert.Contains(t, valErr.Fields, "discountValue")

		_, err = uc.Create(ctx, domain.SaveVoucherInput{
			Code:           "FIXCAP",
			Title:          "Fixed with max cap",
			VoucherType:    domain.VoucherTypeFixedAmount,
			DiscountValue:  "500000",
			MaxDiscountVND: moneyPtr("500000"),
			MinOrderVND:    "1000000",
			PerUserLimit:   1,
			StartsAt:       now,
			EndsAt:         now.Add(time.Hour),
		})
		valErr = nil
		require.ErrorAs(t, err, &valErr)
		assert.Contains(t, valErr.Fields, "maxDiscountVnd")

		_, err = uc.Create(ctx, domain.SaveVoucherInput{
			Code:          "FREEBAD",
			Title:         "Freeship non-zero",
			VoucherType:   domain.VoucherTypeFreeship,
			DiscountValue: "30000",
			MinOrderVND:   "0",
			PerUserLimit:  1,
			StartsAt:      now,
			EndsAt:        now.Add(time.Hour),
		})
		valErr = nil
		require.ErrorAs(t, err, &valErr)
		assert.Contains(t, valErr.Fields, "discountValue")
	})

	t.Run("normalizes code, trims text, derives effectiveStatus, and propagates duplicate code", func(t *testing.T) {
		created, err := uc.Create(ctx, domain.SaveVoucherInput{
			Code:           "  aura10 ",
			Title:          "  Giảm 10% tối đa 1 triệu  ",
			Description:    "  Áp dụng đơn từ 5 triệu  ",
			VoucherType:    domain.VoucherTypePercent,
			DiscountValue:  "10",
			MaxDiscountVND: moneyPtr("1000000"),
			MinOrderVND:    "5000000",
			UsageLimit:     intPtr(50),
			PerUserLimit:   2,
			StartsAt:       now.Add(-time.Hour),
			EndsAt:         now.Add(24 * time.Hour),
			Active:         true,
		})
		require.NoError(t, err)
		assert.Equal(t, "AURA10", created.Code)
		assert.Equal(t, "Giảm 10% tối đa 1 triệu", created.Title)
		assert.Equal(t, "Áp dụng đơn từ 5 triệu", created.Description)
		assert.Equal(t, domain.VoucherStatusActive, created.EffectiveStatus)

		_, err = uc.Create(ctx, domain.SaveVoucherInput{
			Code:          "aura10",
			Title:         "Trùng mã",
			VoucherType:   domain.VoucherTypeFreeship,
			DiscountValue: "0",
			MinOrderVND:   "0",
			PerUserLimit:  1,
			StartsAt:      now,
			EndsAt:        now.Add(time.Hour),
			Active:        true,
		})
		assert.ErrorIs(t, err, domain.ErrVoucherCodeInUse)
	})
}

func TestVoucherUseCase_UpdateDeleteListAndAvailable(t *testing.T) {
	now := time.Date(2026, 11, 18, 10, 0, 0, 0, time.UTC)
	repo := newFakeVoucherRepo()
	uc := New(Dependencies{
		Repo:  repo,
		Clock: func() time.Time { return now },
	})
	ctx := context.Background()

	v, err := uc.Create(ctx, domain.SaveVoucherInput{
		Code:          "FREESHIP30",
		Title:         "Miễn phí vận chuyển",
		VoucherType:   domain.VoucherTypeFreeship,
		DiscountValue: "0",
		MinOrderVND:   "0",
		UsageLimit:    intPtr(10),
		PerUserLimit:  1,
		StartsAt:      now.Add(-time.Hour),
		EndsAt:        now.Add(2 * time.Hour),
		Active:        true,
	})
	require.NoError(t, err)

	// Invalid UUID guards
	_, err = uc.GetAdminByID(ctx, "not-a-uuid")
	assert.ErrorIs(t, err, domain.ErrVoucherNotFound)
	_, err = uc.Update(ctx, "not-a-uuid", domain.SaveVoucherInput{})
	assert.ErrorIs(t, err, domain.ErrVoucherNotFound)
	assert.ErrorIs(t, uc.Delete(ctx, "not-a-uuid"), domain.ErrVoucherNotFound)

	// Simulate usedCount = 3 -> immutable code/type & usageLimit too low & delete in use
	repo.vouchers[v.ID].UsedCount = 3

	_, err = uc.Update(ctx, v.ID, domain.SaveVoucherInput{
		Code:          "RENAMED",
		Title:         "Miễn phí vận chuyển",
		VoucherType:   domain.VoucherTypeFreeship,
		DiscountValue: "0",
		MinOrderVND:   "0",
		UsageLimit:    intPtr(10),
		PerUserLimit:  1,
		StartsAt:      now.Add(-time.Hour),
		EndsAt:        now.Add(2 * time.Hour),
		Active:        true,
	})
	assert.ErrorIs(t, err, domain.ErrVoucherImmutableFields)

	_, err = uc.Update(ctx, v.ID, domain.SaveVoucherInput{
		Code:          "FREESHIP30",
		Title:         "Miễn phí vận chuyển",
		VoucherType:   domain.VoucherTypeFreeship,
		DiscountValue: "0",
		MinOrderVND:   "0",
		UsageLimit:    intPtr(2),
		PerUserLimit:  1,
		StartsAt:      now.Add(-time.Hour),
		EndsAt:        now.Add(2 * time.Hour),
		Active:        true,
	})
	assert.ErrorIs(t, err, domain.ErrVoucherUsageLimitTooLow)

	assert.ErrorIs(t, uc.Delete(ctx, v.ID), domain.ErrVoucherInUse)

	// Deactivate and extend endsAt when usedCount > 0 is allowed
	updated, err := uc.Update(ctx, v.ID, domain.SaveVoucherInput{
		Code:          "FREESHIP30",
		Title:         "Miễn phí vận chuyển (gia hạn)",
		VoucherType:   domain.VoucherTypeFreeship,
		DiscountValue: "0",
		MinOrderVND:   "0",
		UsageLimit:    intPtr(20),
		PerUserLimit:  1,
		StartsAt:      now.Add(-time.Hour),
		EndsAt:        now.Add(5 * time.Hour),
		Active:        false,
	})
	require.NoError(t, err)
	assert.Equal(t, domain.VoucherStatusInactive, updated.EffectiveStatus)

	// Delete succeeds when usedCount == 0
	repo.vouchers[v.ID].UsedCount = 0
	require.NoError(t, uc.Delete(ctx, v.ID))
	_, err = uc.GetAdminByID(ctx, v.ID)
	assert.ErrorIs(t, err, domain.ErrVoucherNotFound)

	// ListAdmin validation
	_, err = uc.ListAdmin(ctx, ListInput{Page: 0, Limit: 200})
	var valErr *domain.ValidationError
	require.ErrorAs(t, err, &valErr)
	assert.Contains(t, valErr.Fields, "page")
	assert.Contains(t, valErr.Fields, "limit")

	_, err = uc.ListAdmin(ctx, ListInput{Page: 1, Limit: 20, Status: "unknown"})
	var filterErr *domain.FilterValidationError
	require.ErrorAs(t, err, &filterErr)
	assert.Contains(t, filterErr.Fields, "status")

	listRes, err := uc.ListAdmin(ctx, ListInput{Page: 1, Limit: 20})
	require.NoError(t, err)
	assert.NotNil(t, listRes.Items)
	assert.Empty(t, listRes.Items)

	// ListAvailable
	_, err = uc.ListAvailable(ctx, "invalid-user")
	assert.True(t, errors.Is(err, domain.ErrInvalidToken))

	avail, err := uc.ListAvailable(ctx, testUserID)
	require.NoError(t, err)
	assert.NotNil(t, avail)
	assert.Equal(t, now, repo.lastNow)
}
