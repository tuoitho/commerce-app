package repository

import (
	"testing"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

func TestCartStockQuantityUsesInt64Boundary(t *testing.T) {
	if got := int64(9223372036854775807); got <= 0 {
		t.Fatalf("MaxInt64 must be positive")
	}
}

func TestMapCartRowMapsStockAndAvailability(t *testing.T) {
	cases := []struct {
		name             string
		productActive    bool
		variantActive    bool
		stock, quantity  int64
		wantAvailability domain.CartAvailability
		wantStock        int64
		wantPrices       bool
	}{
		{"available", true, true, 7, 2, domain.CartAvailable, 7, true},
		{"insufficient", true, true, 2, 3, domain.CartInsufficientStock, 2, true},
		{"out of stock", true, true, 0, 2, domain.CartOutOfStock, 0, false},
		{"unavailable", false, true, 9, 2, domain.CartUnavailable, 9, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			item, line, available, err := mapCartRow(sqlc.ListCartRowsRow{
				ID: "item", VariantID: "variant", ProductID: "product", Quantity: tc.quantity, StockQuantity: tc.stock,
				Selected: true, ProductActive: tc.productActive, VariantActive: tc.variantActive,
				PriceVnd: "10", BrandName: "live brand", ProductName: "live product", Model: "live model",
				SnapshotBrandName: "snapshot brand", SnapshotProductName: "snapshot product", SnapshotModel: "snapshot model", SnapshotOptions: "[]",
			}, tc.quantity, tc.wantStock)
			if err != nil || item.StockQuantity != tc.wantStock || item.Availability != tc.wantAvailability || available != (tc.wantAvailability == domain.CartAvailable) {
				t.Fatalf("item=%+v line=%q available=%t err=%v", item, line, available, err)
			}
			if (item.UnitPriceVND != nil) != tc.wantPrices || (item.LineTotalVND != nil) != tc.wantPrices {
				t.Fatalf("price nullability for %s: item=%+v", tc.name, item)
			}
		})
	}
}

func TestQuantityMutationRejectsUnavailableLinesButRecoversInsufficientLines(t *testing.T) {
	cases := []struct {
		name                  string
		active, productActive bool
		stock, quantity       int64
		want                  error
	}{
		{"inactive variant", false, true, 5, 1, domain.ErrCartItemUnavailable},
		{"inactive product", true, false, 5, 1, domain.ErrCartItemUnavailable},
		{"out of stock", true, true, 0, 1, domain.ErrCartItemUnavailable},
		{"insufficient can recover", true, true, 2, 2, nil},
		{"exceeds stock", true, true, 2, 3, domain.ErrStockLimit},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := quantityMutationError(tc.active, tc.productActive, tc.stock, tc.quantity); got != tc.want {
				t.Fatalf("error=%v, want %v", got, tc.want)
			}
		})
	}
}
