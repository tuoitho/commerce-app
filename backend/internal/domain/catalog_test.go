package domain

import (
	"testing"
)

func TestProductInStock_WithoutVariants(t *testing.T) {
	inStockProd := Product{StockQuantity: 5}
	if !inStockProd.InStock() {
		t.Errorf("expected product with stock=5 to be in stock")
	}

	outOfStockProd := Product{StockQuantity: 0}
	if outOfStockProd.InStock() {
		t.Errorf("expected product with stock=0 to be out of stock")
	}
}

func TestProductInStock_WithVariants(t *testing.T) {
	tests := []struct {
		name     string
		variants []ProductVariant
		want     bool
	}{
		{
			name: "single active variant with stock > 0",
			variants: []ProductVariant{
				{ID: "v-1", Active: true, StockQuantity: 10},
			},
			want: true,
		},
		{
			name: "single active variant with stock = 0",
			variants: []ProductVariant{
				{ID: "v-1", Active: true, StockQuantity: 0},
			},
			want: false,
		},
		{
			name: "single inactive variant with stock > 0",
			variants: []ProductVariant{
				{ID: "v-1", Active: false, StockQuantity: 10},
			},
			want: false,
		},
		{
			name: "multiple variants - one active in stock, one out of stock",
			variants: []ProductVariant{
				{ID: "v-1", Active: true, StockQuantity: 0},
				{ID: "v-2", Active: true, StockQuantity: 5},
			},
			want: true,
		},
		{
			name: "multiple variants - one inactive with stock, one active with 0 stock",
			variants: []ProductVariant{
				{ID: "v-1", Active: false, StockQuantity: 10},
				{ID: "v-2", Active: true, StockQuantity: 0},
			},
			want: false,
		},
		{
			name: "multiple variants - all inactive",
			variants: []ProductVariant{
				{ID: "v-1", Active: false, StockQuantity: 10},
				{ID: "v-2", Active: false, StockQuantity: 5},
			},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := Product{
				Variants: tt.variants,
			}
			if got := p.InStock(); got != tt.want {
				t.Errorf("Product.InStock() = %v, want %v", got, tt.want)
			}
		})
	}
}
