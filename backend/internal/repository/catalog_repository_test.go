package repository

import (
	"testing"
	"time"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

func TestAssembleProductPreservesVNDPrecisionAndOptionGraph(t *testing.T) {
	product, err := assembleProduct("product", "Phone", "M1", "Apple", "desc", "cat-1", "Điện thoại", true, true, time.Time{}, time.Time{}, nil,
		[]sqlc.ListProductOptionGroupsRow{{ID: "color", Label: "Color", Position: 0}, {ID: "storage", Label: "Storage", Position: 1}},
		[]sqlc.ListProductOptionValuesRow{{ID: "black", GroupID: "color", Label: "Black", Position: 0}, {ID: "256", GroupID: "storage", Label: "256 GB", Position: 0}},
		[]variantRow{{ID: "variant", PriceVnd: "99999999999999999999999999999999999999", StockQuantity: 7, Active: true}},
		[]sqlc.ListVariantOptionValuesRow{{VariantID: "variant", GroupID: "storage", OptionValueID: "256"}, {VariantID: "variant", GroupID: "color", OptionValueID: "black"}},
		"", "VND", 0,
	)
	if err != nil {
		t.Fatal(err)
	}
	if product.Brand != "Apple" || product.Category.Name != "Điện thoại" {
		t.Fatalf("unexpected brand or category: brand=%q category=%+v", product.Brand, product.Category)
	}
	if len(product.OptionGroups) != 2 || product.OptionGroups[0].Values[0].ID != "black" {
		t.Fatalf("unexpected option ordering: %+v", product.OptionGroups)
	}
	if got := string(product.Variants[0].PriceVND); got != "99999999999999999999999999999999999999" {
		t.Fatalf("price = %q, precision was not preserved", got)
	}
	if got := product.Variants[0].OptionValueIDs["color"]; got != "black" {
		t.Fatalf("color option = %q", got)
	}
	if product.MinPriceVND != product.Variants[0].PriceVND || product.MaxPriceVND != product.Variants[0].PriceVND || product.Price != string(product.MinPriceVND) || product.Currency != "VND" || !product.InStock() {
		t.Fatalf("unexpected active variant projection: %+v", product)
	}
}

func TestAssembleProductProjectsVariantRangeAndAvailability(t *testing.T) {
	product, err := assembleProduct("product", "Phone", "M1", "Apple", "", "cat-1", "Điện thoại", false, true, time.Time{}, time.Time{}, nil, nil, nil,
		[]variantRow{
			{ID: "out", PriceVnd: "100", StockQuantity: 0, Active: true},
			{ID: "in", PriceVnd: "99999999999999999999999999999999999999", StockQuantity: 3, Active: true},
		}, nil, "", "VND", 0)
	if err != nil {
		t.Fatal(err)
	}
	if product.MinPriceVND != "100" || product.MaxPriceVND != "99999999999999999999999999999999999999" {
		t.Fatalf("range = %q..%q", product.MinPriceVND, product.MaxPriceVND)
	}
	if !product.InStock() {
		t.Fatalf("availability = stock %d, inStock %v", product.StockQuantity, product.InStock())
	}
}

func TestAssembleProductPreservesMaxInt64Stock(t *testing.T) {
	stock := int64(9223372036854775807)
	product, err := assembleProduct("product", "Phone", "M1", "Apple", "", "cat-1", "Điện thoại", false, true, time.Time{}, time.Time{}, nil, nil, nil,
		[]variantRow{{ID: "variant", PriceVnd: "100", StockQuantity: stock, Active: true}}, nil, "", "VND", 0)
	if err != nil {
		t.Fatal(err)
	}
	if product.Variants[0].StockQuantity != stock || !product.InStock() {
		t.Fatalf("stock = %q, inStock=%t", product.Variants[0].StockQuantity, product.InStock())
	}
}

func TestAssembleProductWithoutVariants(t *testing.T) {
	product, err := assembleProduct("product-nv", "Single Product", "M1", "Xiaomi", "desc", "cat-1", "Điện thoại", true, true, time.Time{}, time.Time{}, []string{"https://img.com/1.jpg"}, nil, nil, nil, nil, "15000000", "VND", 25)
	if err != nil {
		t.Fatal(err)
	}
	if product.Price != "15000000" || product.MinPriceVND != "15000000" || product.MaxPriceVND != "15000000" {
		t.Fatalf("unexpected price: %+v", product)
	}
	if product.StockQuantity != 25 || !product.InStock() {
		t.Fatalf("unexpected stock: %+v", product)
	}
	if len(product.ImageURLs) != 1 || product.PrimaryImageURL() != "https://img.com/1.jpg" {
		t.Fatalf("unexpected images: %+v", product)
	}
}

func TestAssembleProductAllInactiveVariantsFallback(t *testing.T) {
	product, err := assembleProduct("product-all-inactive", "Inactive Variant Phone", "M1", "Apple", "", "cat-1", "Điện thoại", false, true, time.Time{}, time.Time{}, nil, nil, nil,
		[]variantRow{
			{ID: "v1", PriceVnd: "2000000", StockQuantity: 10, Active: false},
			{ID: "v2", PriceVnd: "5000000", StockQuantity: 5, Active: false},
		}, nil, "", "VND", 0)
	if err != nil {
		t.Fatal(err)
	}
	if product.MinPriceVND != "2000000" || product.MaxPriceVND != "5000000" || product.Price != "2000000" {
		t.Fatalf("expected min/max price from all variants when none active, got min=%q max=%q price=%q", product.MinPriceVND, product.MaxPriceVND, product.Price)
	}
	if product.StockQuantity != 0 || product.InStock() {
		t.Fatalf("expected total stock = 0 and inStock = false when all variants inactive, got stock=%d inStock=%v", product.StockQuantity, product.InStock())
	}
}

func TestAssembleProductMixedActiveInactiveVariants(t *testing.T) {
	product, err := assembleProduct("product-mixed", "Mixed Variant Phone", "M1", "Apple", "", "cat-1", "Điện thoại", false, true, time.Time{}, time.Time{}, nil, nil, nil,
		[]variantRow{
			{ID: "v1", PriceVnd: "1000000", StockQuantity: 10, Active: false},
			{ID: "v2", PriceVnd: "3000000", StockQuantity: 5, Active: true},
			{ID: "v3", PriceVnd: "8000000", StockQuantity: 2, Active: true},
		}, nil, "", "VND", 0)
	if err != nil {
		t.Fatal(err)
	}
	if product.MinPriceVND != "3000000" || product.MaxPriceVND != "8000000" || product.Price != "3000000" {
		t.Fatalf("expected min/max price from active variants only, got min=%q max=%q price=%q", product.MinPriceVND, product.MaxPriceVND, product.Price)
	}
	if product.StockQuantity != 7 || !product.InStock() {
		t.Fatalf("expected total active stock = 7, got stock=%d inStock=%v", product.StockQuantity, product.InStock())
	}
}

func TestComputeVariantTotals(t *testing.T) {
	t.Run("all active variants", func(t *testing.T) {
		variants := []domain.VariantInput{
			{PriceVND: "1000000", StockQuantity: 5, Active: true},
			{PriceVND: "2000000", StockQuantity: 10, Active: true},
			{PriceVND: "1500000", StockQuantity: 3, Active: true},
		}
		minP, maxP, totalStock, err := computeVariantTotals(variants)
		if err != nil {
			t.Fatal(err)
		}
		if minP != "1000000" || maxP != "2000000" || totalStock != 18 {
			t.Fatalf("unexpected totals: min=%s max=%s stock=%d", minP, maxP, totalStock)
		}
	})

	t.Run("mixed active and inactive", func(t *testing.T) {
		variants := []domain.VariantInput{
			{PriceVND: "500000", StockQuantity: 50, Active: false},
			{PriceVND: "1000000", StockQuantity: 5, Active: true},
			{PriceVND: "3000000", StockQuantity: 2, Active: true},
		}
		minP, maxP, totalStock, err := computeVariantTotals(variants)
		if err != nil {
			t.Fatal(err)
		}
		if minP != "1000000" || maxP != "3000000" || totalStock != 7 {
			t.Fatalf("unexpected totals: min=%s max=%s stock=%d", minP, maxP, totalStock)
		}
	})

	t.Run("all inactive fallback", func(t *testing.T) {
		variants := []domain.VariantInput{
			{PriceVND: "1000000", StockQuantity: 5, Active: false},
			{PriceVND: "3000000", StockQuantity: 2, Active: false},
		}
		minP, maxP, totalStock, err := computeVariantTotals(variants)
		if err != nil {
			t.Fatal(err)
		}
		if minP != "1000000" || maxP != "3000000" || totalStock != 0 {
			t.Fatalf("unexpected totals: min=%s max=%s stock=%d", minP, maxP, totalStock)
		}
	})

	t.Run("empty variants", func(t *testing.T) {
		minP, maxP, totalStock, err := computeVariantTotals(nil)
		if err != nil {
			t.Fatal(err)
		}
		if minP != "0" || maxP != "0" || totalStock != 0 {
			t.Fatalf("unexpected totals: min=%s max=%s stock=%d", minP, maxP, totalStock)
		}
	})

	t.Run("invalid price error", func(t *testing.T) {
		variants := []domain.VariantInput{
			{PriceVND: "invalid", StockQuantity: 5, Active: true},
		}
		_, _, _, err := computeVariantTotals(variants)
		if err == nil {
			t.Fatal("expected error on invalid price")
		}
	})
}


