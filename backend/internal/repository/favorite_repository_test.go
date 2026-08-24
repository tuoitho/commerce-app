package repository

import (
	"testing"
	"time"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

func TestMapFavoriteRow(t *testing.T) {
	now := time.Now()
	cases := []struct {
		name             string
		row              sqlc.ListFavoritesRow
		wantAvailability domain.FavoriteAvailability
		wantPrices       bool
		wantInStock      *bool
	}{
		{
			name: "active product with active in-stock variant",
			row: sqlc.ListFavoritesRow{
				ProductID:          "p1",
				ProductName:        "Product 1",
				ProductModel:       "M1",
				ProductBrand:       "Brand 1",
				ProductActive:      true,
				CategoryID:         "c1",
				CategoryName:       "Cat 1",
				PrimaryImageUrl:    "https://example.com/p1.jpg",
				ActiveVariantCount: 2,
				MinPriceVnd:        "100000",
				MaxPriceVnd:        "200000",
				HasActiveStock:     true,
				FavoritedAt:        now,
			},
			wantAvailability: domain.FavoriteActive,
			wantPrices:       true,
			wantInStock:      boolPtr(true),
		},
		{
			name: "active product with active variant but out of stock",
			row: sqlc.ListFavoritesRow{
				ProductID:          "p2",
				ProductName:        "Product 2",
				ProductModel:       "M2",
				ProductBrand:       "Brand 2",
				ProductActive:      true,
				CategoryID:         "c1",
				CategoryName:       "Cat 1",
				PrimaryImageUrl:    "",
				ActiveVariantCount: 1,
				MinPriceVnd:        "150000",
				MaxPriceVnd:        "150000",
				HasActiveStock:     false,
				FavoritedAt:        now,
			},
			wantAvailability: domain.FavoriteActive,
			wantPrices:       true,
			wantInStock:      boolPtr(false),
		},
		{
			name: "active product with 0 active variants (unavailable)",
			row: sqlc.ListFavoritesRow{
				ProductID:          "p3",
				ProductName:        "Product 3",
				ProductModel:       "M3",
				ProductBrand:       "Brand 3",
				ProductActive:      true,
				CategoryID:         "c1",
				CategoryName:       "Cat 1",
				PrimaryImageUrl:    "https://example.com/p3.jpg",
				ActiveVariantCount: 0,
				MinPriceVnd:        "",
				MaxPriceVnd:        "",
				HasActiveStock:     false,
				FavoritedAt:        now,
			},
			wantAvailability: domain.FavoriteUnavailable,
			wantPrices:       false,
			wantInStock:      nil,
		},
		{
			name: "soft-deleted product (deleted)",
			row: sqlc.ListFavoritesRow{
				ProductID:          "p4",
				ProductName:        "Product 4",
				ProductModel:       "M4",
				ProductBrand:       "Brand 4",
				ProductActive:      false,
				CategoryID:         "c1",
				CategoryName:       "Cat 1",
				PrimaryImageUrl:    "https://example.com/p4.jpg",
				ActiveVariantCount: 1,
				MinPriceVnd:        "100000",
				MaxPriceVnd:        "100000",
				HasActiveStock:     true,
				FavoritedAt:        now,
			},
			wantAvailability: domain.FavoriteDeleted,
			wantPrices:       false,
			wantInStock:      nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := mapFavoriteRow(tc.row)
			if got.ID != tc.row.ProductID {
				t.Errorf("got ID %q, want %q", got.ID, tc.row.ProductID)
			}
			if got.Name != tc.row.ProductName {
				t.Errorf("got Name %q, want %q", got.Name, tc.row.ProductName)
			}
			if got.Model != tc.row.ProductModel {
				t.Errorf("got Model %q, want %q", got.Model, tc.row.ProductModel)
			}
			if got.Brand != tc.row.ProductBrand {
				t.Errorf("got Brand %q, want %q", got.Brand, tc.row.ProductBrand)
			}
			if got.Category.ID != tc.row.CategoryID || got.Category.Name != tc.row.CategoryName {
				t.Errorf("got Category %+v, want ID=%q Name=%q", got.Category, tc.row.CategoryID, tc.row.CategoryName)
			}
			if got.PrimaryImageURL != tc.row.PrimaryImageUrl {
				t.Errorf("got PrimaryImageURL %q, want %q", got.PrimaryImageURL, tc.row.PrimaryImageUrl)
			}
			if got.Availability != tc.wantAvailability {
				t.Errorf("got Availability %q, want %q", got.Availability, tc.wantAvailability)
			}
			if tc.wantPrices {
				if got.MinPriceVND == nil || string(*got.MinPriceVND) != tc.row.MinPriceVnd {
					t.Errorf("got MinPriceVND %v, want %q", got.MinPriceVND, tc.row.MinPriceVnd)
				}
				if got.MaxPriceVND == nil || string(*got.MaxPriceVND) != tc.row.MaxPriceVnd {
					t.Errorf("got MaxPriceVND %v, want %q", got.MaxPriceVND, tc.row.MaxPriceVnd)
				}
			} else {
				if got.MinPriceVND != nil {
					t.Errorf("expected MinPriceVND to be nil, got %v", got.MinPriceVND)
				}
				if got.MaxPriceVND != nil {
					t.Errorf("expected MaxPriceVND to be nil, got %v", got.MaxPriceVND)
				}
			}
			if tc.wantInStock == nil {
				if got.InStock != nil {
					t.Errorf("expected InStock to be nil, got %v", got.InStock)
				}
			} else {
				if got.InStock == nil || *got.InStock != *tc.wantInStock {
					t.Errorf("got InStock %v, want %v", got.InStock, *tc.wantInStock)
				}
			}
			if !got.FavoritedAt.Equal(tc.row.FavoritedAt) {
				t.Errorf("got FavoritedAt %v, want %v", got.FavoritedAt, tc.row.FavoritedAt)
			}
		})
	}
}

func boolPtr(b bool) *bool {
	return &b
}
