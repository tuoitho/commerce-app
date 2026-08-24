package domain_test

import (
	"testing"
	"time"

	"commerce-backend/internal/domain"
)

func TestFavoriteAvailabilityConstants(t *testing.T) {
	if domain.FavoriteActive != "active" {
		t.Errorf("expected FavoriteActive to be 'active', got %q", domain.FavoriteActive)
	}
	if domain.FavoriteUnavailable != "unavailable" {
		t.Errorf("expected FavoriteUnavailable to be 'unavailable', got %q", domain.FavoriteUnavailable)
	}
	if domain.FavoriteDeleted != "deleted" {
		t.Errorf("expected FavoriteDeleted to be 'deleted', got %q", domain.FavoriteDeleted)
	}
}

func TestFavoriteProductStruct(t *testing.T) {
	now := time.Now()
	minP := domain.MoneyVND("100000")
	maxP := domain.MoneyVND("200000")
	inStock := true

	fav := domain.FavoriteProduct{
		ID:              "product-123",
		Name:            "iPhone 15",
		Model:           "Pro Max",
		Brand:           "Apple",
		Category:        domain.Category{ID: "cat-1", Name: "Smartphones"},
		PrimaryImageURL: "https://example.com/img.jpg",
		Availability:    domain.FavoriteActive,
		MinPriceVND:     &minP,
		MaxPriceVND:     &maxP,
		InStock:         &inStock,
		FavoritedAt:     now,
	}

	if fav.ID != "product-123" || fav.Name != "iPhone 15" || fav.Availability != domain.FavoriteActive {
		t.Fatalf("unexpected favorite product struct: %+v", fav)
	}
	if fav.MinPriceVND == nil || *fav.MinPriceVND != "100000" {
		t.Errorf("expected MinPriceVND 100000, got %v", fav.MinPriceVND)
	}
	if fav.InStock == nil || *fav.InStock != true {
		t.Errorf("expected InStock true, got %v", fav.InStock)
	}
}
