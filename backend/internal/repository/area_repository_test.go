package repository_test

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository"
)

func TestAreaRepository_ListProvinces(t *testing.T) {
	repo, err := repository.NewAreaRepository()
	if err != nil {
		t.Fatalf("failed to create AreaRepository: %v", err)
	}

	ctx := context.Background()
	provinces, err := repo.ListProvinces(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(provinces) != 34 {
		t.Fatalf("expected 34 provinces, got %d", len(provinces))
	}

	// Verify first province is Hà Nội
	var haNoi *domain.Province
	for i := range provinces {
		if provinces[i].Code == 1 {
			haNoi = &provinces[i]
			break
		}
	}
	if haNoi == nil {
		t.Fatalf("expected province with code 1 (Hà Nội), but not found")
	}
	if haNoi.Name != "Thành phố Hà Nội" {
		t.Errorf("expected province name 'Thành phố Hà Nội', got '%s'", haNoi.Name)
	}
}

func TestAreaRepository_ListWards(t *testing.T) {
	repo, err := repository.NewAreaRepository()
	if err != nil {
		t.Fatalf("failed to create AreaRepository: %v", err)
	}

	ctx := context.Background()

	t.Run("existing province returns wards with province code", func(t *testing.T) {
		wards, err := repo.ListWards(ctx, 1)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(wards) == 0 {
			t.Fatalf("expected wards for Hà Nội, got empty")
		}

		var baDinh *domain.Ward
		for i := range wards {
			if wards[i].Code == 4 {
				baDinh = &wards[i]
				break
			}
		}
		if baDinh == nil {
			t.Fatalf("expected ward with code 4 (Phường Ba Đình), but not found")
		}
		if baDinh.Name != "Phường Ba Đình" {
			t.Errorf("expected ward name 'Phường Ba Đình', got '%s'", baDinh.Name)
		}
		if baDinh.ProvinceCode != 1 {
			t.Errorf("expected ward ProvinceCode 1, got %d", baDinh.ProvinceCode)
		}
	})

	t.Run("non-existent province returns ErrNotFound", func(t *testing.T) {
		_, err := repo.ListWards(ctx, 999999)
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("expected domain.ErrNotFound, got %v", err)
		}
	})
}

func TestAreaRepository_Resolve(t *testing.T) {
	repo, err := repository.NewAreaRepository()
	if err != nil {
		t.Fatalf("failed to create AreaRepository: %v", err)
	}

	ctx := context.Background()

	t.Run("valid province and ward resolve successfully", func(t *testing.T) {
		province, ward, err := repo.Resolve(ctx, 1, 4)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if province.Code != 1 || province.Name != "Thành phố Hà Nội" {
			t.Errorf("unexpected province: %+v", province)
		}
		if ward.Code != 4 || ward.ProvinceCode != 1 || ward.Name != "Phường Ba Đình" {
			t.Errorf("unexpected ward: %+v", ward)
		}
	})

	t.Run("invalid province code returns ErrNotFound", func(t *testing.T) {
		_, _, err := repo.Resolve(ctx, 999999, 4)
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("expected domain.ErrNotFound, got %v", err)
		}
	})

	t.Run("invalid ward code returns ErrNotFound", func(t *testing.T) {
		_, _, err := repo.Resolve(ctx, 1, 999999)
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("expected domain.ErrNotFound, got %v", err)
		}
	})
}
