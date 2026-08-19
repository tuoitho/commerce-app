package area_test

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/usecase/area"
)

type fakeAreaRepo struct {
	provinces []domain.Province
	wards     map[int][]domain.Ward
}

func (f *fakeAreaRepo) ListProvinces(_ context.Context) ([]domain.Province, error) {
	return f.provinces, nil
}

func (f *fakeAreaRepo) ListWards(_ context.Context, provinceCode int) ([]domain.Ward, error) {
	w, ok := f.wards[provinceCode]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return w, nil
}

func (f *fakeAreaRepo) Resolve(_ context.Context, provinceCode, wardCode int) (domain.Province, domain.Ward, error) {
	var targetP *domain.Province
	for _, p := range f.provinces {
		if p.Code == provinceCode {
			targetP = &p
			break
		}
	}
	if targetP == nil {
		return domain.Province{}, domain.Ward{}, domain.ErrNotFound
	}

	wards, ok := f.wards[provinceCode]
	if !ok {
		return domain.Province{}, domain.Ward{}, domain.ErrNotFound
	}

	for _, w := range wards {
		if w.Code == wardCode {
			return *targetP, w, nil
		}
	}

	return domain.Province{}, domain.Ward{}, domain.ErrNotFound
}

func TestUseCase_ListProvinces(t *testing.T) {
	fakeRepo := &fakeAreaRepo{
		provinces: []domain.Province{
			{Code: 1, Name: "Thành phố Hà Nội"},
			{Code: 79, Name: "Thành phố Hồ Chí Minh"},
		},
	}

	uc := area.New(area.Dependencies{Area: fakeRepo})
	ctx := context.Background()

	provinces, err := uc.ListProvinces(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(provinces) != 2 {
		t.Fatalf("expected 2 provinces, got %d", len(provinces))
	}
	if provinces[0].Code != 1 || provinces[0].Name != "Thành phố Hà Nội" {
		t.Errorf("unexpected province: %+v", provinces[0])
	}
}

func TestUseCase_ListWards(t *testing.T) {
	fakeRepo := &fakeAreaRepo{
		provinces: []domain.Province{
			{Code: 1, Name: "Thành phố Hà Nội"},
		},
		wards: map[int][]domain.Ward{
			1: {
				{Code: 4, ProvinceCode: 1, Name: "Phường Ba Đình"},
			},
		},
	}

	uc := area.New(area.Dependencies{Area: fakeRepo})
	ctx := context.Background()

	t.Run("valid province code returns wards", func(t *testing.T) {
		wards, err := uc.ListWards(ctx, 1)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(wards) != 1 {
			t.Fatalf("expected 1 ward, got %d", len(wards))
		}
		if wards[0].Code != 4 || wards[0].Name != "Phường Ba Đình" {
			t.Errorf("unexpected ward: %+v", wards[0])
		}
	})

	t.Run("invalid province code returns ErrNotFound", func(t *testing.T) {
		_, err := uc.ListWards(ctx, 999)
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("expected domain.ErrNotFound, got %v", err)
		}
	})
}

func TestUseCase_Resolve(t *testing.T) {
	fakeRepo := &fakeAreaRepo{
		provinces: []domain.Province{
			{Code: 1, Name: "Thành phố Hà Nội"},
		},
		wards: map[int][]domain.Ward{
			1: {
				{Code: 4, ProvinceCode: 1, Name: "Phường Ba Đình"},
			},
		},
	}

	uc := area.New(area.Dependencies{Area: fakeRepo})
	ctx := context.Background()

	t.Run("valid province and ward resolve", func(t *testing.T) {
		p, w, err := uc.Resolve(ctx, 1, 4)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Code != 1 || p.Name != "Thành phố Hà Nội" {
			t.Errorf("unexpected province: %+v", p)
		}
		if w.Code != 4 || w.Name != "Phường Ba Đình" {
			t.Errorf("unexpected ward: %+v", w)
		}
	})

	t.Run("invalid province returns ErrNotFound", func(t *testing.T) {
		_, _, err := uc.Resolve(ctx, 999, 4)
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("expected domain.ErrNotFound, got %v", err)
		}
	})

	t.Run("invalid ward returns ErrNotFound", func(t *testing.T) {
		_, _, err := uc.Resolve(ctx, 1, 999)
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("expected domain.ErrNotFound, got %v", err)
		}
	})
}
