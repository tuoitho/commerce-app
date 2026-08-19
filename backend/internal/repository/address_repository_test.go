package repository_test

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository"
)

type fakeAddressAreaRepo struct {
	provinces []domain.Province
	wards     map[int][]domain.Ward
}

func (f *fakeAddressAreaRepo) ListProvinces(_ context.Context) ([]domain.Province, error) {
	return f.provinces, nil
}

func (f *fakeAddressAreaRepo) ListWards(_ context.Context, provinceCode int) ([]domain.Ward, error) {
	w, ok := f.wards[provinceCode]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return w, nil
}

func (f *fakeAddressAreaRepo) Resolve(_ context.Context, provinceCode, wardCode int) (domain.Province, domain.Ward, error) {
	for _, p := range f.provinces {
		if p.Code == provinceCode {
			for _, w := range f.wards[provinceCode] {
				if w.Code == wardCode {
					return p, w, nil
				}
			}
		}
	}
	return domain.Province{}, domain.Ward{}, domain.ErrNotFound
}

func TestAddressRepository_AreaResolutionFailure(t *testing.T) {
	areaRepo := &fakeAddressAreaRepo{
		provinces: []domain.Province{
			{Code: 1, Name: "Thành phố Hà Nội"},
		},
		wards: map[int][]domain.Ward{
			1: {{Code: 4, ProvinceCode: 1, Name: "Phường Ba Đình"}},
		},
	}

	repo := repository.NewAddressRepository(nil, areaRepo)
	ctx := context.Background()

	t.Run("Create fails on unknown area", func(t *testing.T) {
		_, err := repo.Create(ctx, "user-1", domain.AddressInput{
			RecipientName: "Test",
			Phone:         "0987654321",
			ProvinceCode:  999,
			WardCode:      4,
			DetailAddress: "Street",
		})
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("expected ErrNotFound when area resolution fails in Create, got %v", err)
		}
	})

	t.Run("Update fails on unknown area", func(t *testing.T) {
		_, err := repo.Update(ctx, "user-1", "addr-1", domain.AddressInput{
			RecipientName: "Test",
			Phone:         "0987654321",
			ProvinceCode:  1,
			WardCode:      999,
			DetailAddress: "Street",
		})
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("expected ErrNotFound when area resolution fails in Update, got %v", err)
		}
	})
}
