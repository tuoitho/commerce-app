package favorite_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"commerce-backend/internal/domain"
	favoriteuc "commerce-backend/internal/usecase/favorite"
)

type mockFavoriteRepository struct {
	listFunc   func(ctx context.Context, userID string) ([]domain.FavoriteProduct, error)
	addFunc    func(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error)
	removeFunc func(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error)
}

func (m *mockFavoriteRepository) List(ctx context.Context, userID string) ([]domain.FavoriteProduct, error) {
	if m.listFunc != nil {
		return m.listFunc(ctx, userID)
	}
	return nil, nil
}

func (m *mockFavoriteRepository) Add(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
	if m.addFunc != nil {
		return m.addFunc(ctx, userID, productID)
	}
	return nil, nil
}

func (m *mockFavoriteRepository) Remove(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
	if m.removeFunc != nil {
		return m.removeFunc(ctx, userID, productID)
	}
	return nil, nil
}

const (
	validUserID    = "11111111-1111-1111-1111-111111111111"
	validProductID = "22222222-2222-2222-2222-222222222222"
	invalidID      = "invalid-uuid"
)

func sampleFavoriteProduct() domain.FavoriteProduct {
	minP := domain.MoneyVND("100000")
	maxP := domain.MoneyVND("200000")
	inStock := true
	return domain.FavoriteProduct{
		ID:              validProductID,
		Name:            "Sản phẩm test",
		Model:           "SP-01",
		Brand:           "BrandA",
		Category:        domain.Category{ID: "33333333-3333-3333-3333-333333333333", Name: "Danh mục A"},
		PrimaryImageURL: "https://example.com/img.jpg",
		Availability:    domain.FavoriteActive,
		MinPriceVND:     &minP,
		MaxPriceVND:     &maxP,
		InStock:         &inStock,
		FavoritedAt:     time.Now().UTC(),
	}
}

func TestUseCase_List(t *testing.T) {
	ctx := context.Background()

	t.Run("rejects invalid userID", func(t *testing.T) {
		repo := &mockFavoriteRepository{}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.List(ctx, invalidID)
		if err == nil {
			t.Fatal("expected validation error for invalid userID, got nil")
		}
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected *domain.ValidationError, got %T: %v", err, err)
		}
		if _, ok := valErr.Fields["userId"]; !ok {
			t.Errorf("expected field 'userId' in validation error, got %v", valErr.Fields)
		}
	})

	t.Run("returns favorites list for valid userID", func(t *testing.T) {
		expected := []domain.FavoriteProduct{sampleFavoriteProduct()}
		repo := &mockFavoriteRepository{
			listFunc: func(ctx context.Context, userID string) ([]domain.FavoriteProduct, error) {
				if userID != validUserID {
					t.Errorf("expected userID %s, got %s", validUserID, userID)
				}
				return expected, nil
			},
		}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		items, err := uc.List(ctx, validUserID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(items) != 1 || items[0].ID != validProductID {
			t.Errorf("unexpected items returned: %v", items)
		}
	})

	t.Run("returns empty slice when no favorites", func(t *testing.T) {
		repo := &mockFavoriteRepository{
			listFunc: func(ctx context.Context, userID string) ([]domain.FavoriteProduct, error) {
				return nil, nil
			},
		}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		items, err := uc.List(ctx, validUserID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if items == nil || len(items) != 0 {
			t.Errorf("expected non-nil empty slice, got: %v", items)
		}
	})

	t.Run("propagates repository error", func(t *testing.T) {
		dbErr := errors.New("database connection failed")
		repo := &mockFavoriteRepository{
			listFunc: func(ctx context.Context, userID string) ([]domain.FavoriteProduct, error) {
				return nil, dbErr
			},
		}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.List(ctx, validUserID)
		if !errors.Is(err, dbErr) {
			t.Fatalf("expected dbErr %v, got %v", dbErr, err)
		}
	})
}

func TestUseCase_Add(t *testing.T) {
	ctx := context.Background()

	t.Run("rejects invalid productID with validation error on productId field", func(t *testing.T) {
		repo := &mockFavoriteRepository{}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.Add(ctx, validUserID, invalidID)
		if err == nil {
			t.Fatal("expected validation error for invalid productID, got nil")
		}
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected *domain.ValidationError, got %T: %v", err, err)
		}
		if _, ok := valErr.Fields["productId"]; !ok {
			t.Errorf("expected field 'productId' in validation error, got %v", valErr.Fields)
		}
	})

	t.Run("rejects invalid userID with validation error on userId field", func(t *testing.T) {
		repo := &mockFavoriteRepository{}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.Add(ctx, invalidID, validProductID)
		if err == nil {
			t.Fatal("expected validation error for invalid userID, got nil")
		}
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected *domain.ValidationError, got %T: %v", err, err)
		}
		if _, ok := valErr.Fields["userId"]; !ok {
			t.Errorf("expected field 'userId' in validation error, got %v", valErr.Fields)
		}
	})

	t.Run("rejects both invalid IDs", func(t *testing.T) {
		repo := &mockFavoriteRepository{}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.Add(ctx, invalidID, invalidID)
		if err == nil {
			t.Fatal("expected validation error, got nil")
		}
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected *domain.ValidationError, got %T: %v", err, err)
		}
		if _, ok := valErr.Fields["userId"]; !ok {
			t.Errorf("expected field 'userId' in validation error, got %v", valErr.Fields)
		}
		if _, ok := valErr.Fields["productId"]; !ok {
			t.Errorf("expected field 'productId' in validation error, got %v", valErr.Fields)
		}
	})

	t.Run("adds favorite and returns updated list", func(t *testing.T) {
		expected := []domain.FavoriteProduct{sampleFavoriteProduct()}
		repo := &mockFavoriteRepository{
			addFunc: func(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
				if userID != validUserID || productID != validProductID {
					t.Errorf("unexpected args: userID=%s, productID=%s", userID, productID)
				}
				return expected, nil
			},
		}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		items, err := uc.Add(ctx, validUserID, validProductID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(items) != 1 || items[0].ID != validProductID {
			t.Errorf("unexpected items returned: %v", items)
		}
	})

	t.Run("propagates ErrProductNotFound when product not found or inactive", func(t *testing.T) {
		repo := &mockFavoriteRepository{
			addFunc: func(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
				return nil, domain.ErrProductNotFound
			},
		}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.Add(ctx, validUserID, validProductID)
		if !errors.Is(err, domain.ErrProductNotFound) {
			t.Fatalf("expected ErrProductNotFound, got %v", err)
		}
	})

	t.Run("propagates other repository errors", func(t *testing.T) {
		dbErr := errors.New("db failure")
		repo := &mockFavoriteRepository{
			addFunc: func(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
				return nil, dbErr
			},
		}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.Add(ctx, validUserID, validProductID)
		if !errors.Is(err, dbErr) {
			t.Fatalf("expected dbErr, got %v", err)
		}
	})
}

func TestUseCase_Remove(t *testing.T) {
	ctx := context.Background()

	t.Run("rejects invalid productID with validation error on productId field", func(t *testing.T) {
		repo := &mockFavoriteRepository{}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.Remove(ctx, validUserID, invalidID)
		if err == nil {
			t.Fatal("expected validation error for invalid productID, got nil")
		}
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected *domain.ValidationError, got %T: %v", err, err)
		}
		if _, ok := valErr.Fields["productId"]; !ok {
			t.Errorf("expected field 'productId' in validation error, got %v", valErr.Fields)
		}
	})

	t.Run("rejects invalid userID with validation error on userId field", func(t *testing.T) {
		repo := &mockFavoriteRepository{}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.Remove(ctx, invalidID, validProductID)
		if err == nil {
			t.Fatal("expected validation error for invalid userID, got nil")
		}
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected *domain.ValidationError, got %T: %v", err, err)
		}
		if _, ok := valErr.Fields["userId"]; !ok {
			t.Errorf("expected field 'userId' in validation error, got %v", valErr.Fields)
		}
	})

	t.Run("removes favorite and returns updated list", func(t *testing.T) {
		repo := &mockFavoriteRepository{
			removeFunc: func(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
				if userID != validUserID || productID != validProductID {
					t.Errorf("unexpected args: userID=%s, productID=%s", userID, productID)
				}
				return []domain.FavoriteProduct{}, nil
			},
		}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		items, err := uc.Remove(ctx, validUserID, validProductID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if items == nil || len(items) != 0 {
			t.Errorf("expected non-nil empty slice, got: %v", items)
		}
	})

	t.Run("propagates repository error", func(t *testing.T) {
		dbErr := errors.New("db failure")
		repo := &mockFavoriteRepository{
			removeFunc: func(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
				return nil, dbErr
			},
		}
		uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})

		_, err := uc.Remove(ctx, validUserID, validProductID)
		if !errors.Is(err, dbErr) {
			t.Fatalf("expected dbErr, got %v", err)
		}
	})
}
