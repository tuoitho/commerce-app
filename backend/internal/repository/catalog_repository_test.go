package repository

import (
	"testing"
	"time"

	"commerce-backend/internal/repository/sqlc"
)

func TestAssembleProductPreservesVNDPrecisionAndOptionGraph(t *testing.T) {
	product, err := assembleProduct("product", "Phone", "M1", "desc", "brand", "Apple", true, true, time.Time{}, time.Time{}, nil,
		[]sqlc.ListProductOptionGroupsRow{{ID: "color", Label: "Color", Position: 0}, {ID: "storage", Label: "Storage", Position: 1}},
		[]sqlc.ListProductOptionValuesRow{{ID: "black", GroupID: "color", Label: "Black", Position: 0}, {ID: "256", GroupID: "storage", Label: "256 GB", Position: 0}},
		[]sqlc.ListActiveProductVariantsRow{{ID: "variant", PriceVnd: "99999999999999999999999999999999999999", StockQuantity: 7, Active: true}},
		[]sqlc.ListVariantOptionValuesRow{{VariantID: "variant", GroupID: "storage", OptionValueID: "256"}, {VariantID: "variant", GroupID: "color", OptionValueID: "black"}},
	)
	if err != nil {
		t.Fatal(err)
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
	product, err := assembleProduct("product", "Phone", "M1", "", "brand", "Apple", false, true, time.Time{}, time.Time{}, nil, nil, nil,
		[]sqlc.ListActiveProductVariantsRow{
			{ID: "out", PriceVnd: "100", StockQuantity: 0, Active: true},
			{ID: "in", PriceVnd: "99999999999999999999999999999999999999", StockQuantity: 3, Active: true},
		}, nil)
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
	product, err := assembleProduct("product", "Phone", "M1", "", "brand", "Apple", false, true, time.Time{}, time.Time{}, nil, nil, nil,
		[]sqlc.ListActiveProductVariantsRow{{ID: "variant", PriceVnd: "100", StockQuantity: stock, Active: true}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if product.Variants[0].StockQuantity != stock || !product.InStock() {
		t.Fatalf("stock = %q, inStock=%t", product.Variants[0].StockQuantity, product.InStock())
	}
}
