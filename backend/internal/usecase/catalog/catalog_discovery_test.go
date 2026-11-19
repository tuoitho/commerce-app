package catalog

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/usecase/catalog/fakerepos"
)

func setupDiscoveryTestEnv(t *testing.T) (*UseCase, *fakerepos.Catalog) {
	t.Helper()
	fake := fakerepos.NewCatalog()
	catPhones := domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"}
	fake.AddCategory(catPhones)

	t1 := time.Date(2026, 10, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	t3 := time.Date(2026, 10, 3, 10, 0, 0, 0, time.UTC)

	fake.AddProductWithActiveState(domain.Product{
		ID:            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
		Name:          "Alpha Phone",
		Model:         "AP-1",
		Brand:         "Apple",
		Category:      catPhones,
		Featured:      true,
		AverageRating: 4.2,
		ReviewCount:   10,
		SoldCount:     50,
		CreatedAt:     t1,
		UpdatedAt:     t1,
		Variants:      []domain.ProductVariant{{ID: "v1", PriceVND: "20000000", StockQuantity: 5, Active: true}},
	}, true)

	fake.AddProductWithActiveState(domain.Product{
		ID:            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
		Name:          "Beta Phone Đặc Biệt",
		Model:         "BP-2",
		Brand:         "Samsung",
		Category:      catPhones,
		Featured:      false,
		AverageRating: 4.9,
		ReviewCount:   25,
		SoldCount:     120,
		CreatedAt:     t2,
		UpdatedAt:     t2,
		Variants:      []domain.ProductVariant{{ID: "v2", PriceVND: "10000000", StockQuantity: 8, Active: true}},
	}, true)

	fake.AddProductWithActiveState(domain.Product{
		ID:            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
		Name:          "Gamma Mới",
		Model:         "GM-3",
		Brand:         "Xiaomi",
		Category:      catPhones,
		Featured:      false,
		AverageRating: 0,
		ReviewCount:   0,
		SoldCount:     5,
		CreatedAt:     t3,
		UpdatedAt:     t3,
		Variants:      []domain.ProductVariant{{ID: "v3", PriceVND: "30000000", StockQuantity: 3, Active: true}},
	}, true)

	return New(Dependencies{Catalog: fake}), fake
}

func TestSearchProducts_VietnameseUnaccentedAndStats(t *testing.T) {
	uc, _ := setupDiscoveryTestEnv(t)
	ctx := context.Background()

	// Matches "Điện thoại" category without diacritics and maps đ -> d
	allPhones, err := uc.SearchProducts(ctx, domain.ProductFilter{Query: "dien thoai"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(allPhones) != 3 {
		t.Fatalf("expected 3 products matching unaccented category, got %d", len(allPhones))
	}

	// Matches "Đặc Biệt" with "dac biet"
	dacBiet, err := uc.SearchProducts(ctx, domain.ProductFilter{Query: "dac biet"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dacBiet) != 1 || dacBiet[0].ID != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2" {
		t.Fatalf("expected Beta Phone Đặc Biệt, got %+v", dacBiet)
	}
	if dacBiet[0].AverageRating != 4.9 || dacBiet[0].ReviewCount != 25 || dacBiet[0].SoldCount != 120 {
		t.Fatalf("expected stats preserved, got avg=%v reviews=%d sold=%d", dacBiet[0].AverageRating, dacBiet[0].ReviewCount, dacBiet[0].SoldCount)
	}

	featured, err := uc.ListFeaturedProducts(ctx)
	if err != nil || len(featured) != 1 {
		t.Fatalf("unexpected featured: %+v err=%v", featured, err)
	}
	if featured[0].AverageRating != 4.2 || featured[0].ReviewCount != 10 || featured[0].SoldCount != 50 {
		t.Fatalf("expected stats on featured product, got %+v", featured[0])
	}
}

func TestSearchProducts_ServerSortingModes(t *testing.T) {
	uc, _ := setupDiscoveryTestEnv(t)
	ctx := context.Background()

	cases := []struct {
		name string
		sort domain.ProductSort
		want []string
	}{
		{
			name: "default alphabetical",
			sort: domain.ProductSortDefault,
			want: []string{"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"},
		},
		{
			name: "bestselling",
			sort: domain.ProductSortBestselling,
			want: []string{"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"},
		},
		{
			name: "newest",
			sort: domain.ProductSortNewest,
			want: []string{"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"},
		},
		{
			name: "price_asc",
			sort: domain.ProductSortPriceAsc,
			want: []string{"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"},
		},
		{
			name: "price_desc",
			sort: domain.ProductSortPriceDesc,
			want: []string{"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"},
		},
		{
			name: "rating_desc",
			sort: domain.ProductSortRatingDesc,
			want: []string{"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := uc.SearchProducts(ctx, domain.ProductFilter{Sort: tc.sort})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("len = %d, want %d", len(got), len(tc.want))
			}
			for i := range tc.want {
				if got[i].ID != tc.want[i] {
					t.Fatalf("index %d: got %s, want %s", i, got[i].ID, tc.want[i])
				}
			}
		})
	}
}

func TestSearchProducts_MinRatingFilter(t *testing.T) {
	uc, _ := setupDiscoveryTestEnv(t)
	ctx := context.Background()

	min45 := 4.5
	res, err := uc.SearchProducts(ctx, domain.ProductFilter{MinRating: &min45})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res) != 1 || res[0].ID != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2" {
		t.Fatalf("expected only product 2 (>=4.5), got %+v", res)
	}

	min1 := 1.0
	res2, err := uc.SearchProducts(ctx, domain.ProductFilter{MinRating: &min1})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res2) != 2 {
		t.Fatalf("expected 2 reviewed products (excluding unreviewed), got %d", len(res2))
	}
}

func TestSearchProducts_InvalidSortAndMinRating(t *testing.T) {
	uc, _ := setupDiscoveryTestEnv(t)
	ctx := context.Background()

	_, err := uc.SearchProducts(ctx, domain.ProductFilter{Sort: "popular"})
	var fe *domain.FilterValidationError
	if !errors.As(err, &fe) || fe.Fields["sort"] == "" {
		t.Fatalf("expected invalid_filter on sort, got %v", err)
	}

	for _, bad := range []float64{0, 0.9, 5.1, -1, math.NaN(), math.Inf(1)} {
		val := bad
		_, err := uc.SearchProducts(ctx, domain.ProductFilter{MinRating: &val})
		var fe2 *domain.FilterValidationError
		if !errors.As(err, &fe2) || fe2.Fields["min_rating"] == "" {
			t.Fatalf("expected invalid_filter on min_rating=%v, got %v", bad, err)
		}
	}
}
