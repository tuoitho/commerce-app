package fakerepos

import (
	"context"
	"testing"

	"commerce-backend/internal/domain"
)

func TestTask23_GetProductByIDReturnsPublicActiveVariantGraphCopy(t *testing.T) {
	repo := NewCatalog()
	activeValue := domain.OptionValue{ID: "value-active", Label: "Active"}
	inactiveValue := domain.OptionValue{ID: "value-inactive", Label: "Inactive"}
	repo.AddProductWithActiveState(domain.Product{
		ID:           "product",
		Category:     domain.Category{ID: "category", Name: "Phones"},
		OptionGroups: []domain.OptionGroup{{ID: "group", Label: "Storage", Values: []domain.OptionValue{activeValue, inactiveValue}}},
		Variants: []domain.ProductVariant{
			{ID: "active", Active: true, StockQuantity: 1, PriceVND: "100", OptionValueIDs: map[string]string{"group": activeValue.ID}},
			{ID: "inactive", Active: false, StockQuantity: 9, PriceVND: "200", OptionValueIDs: map[string]string{"group": inactiveValue.ID}},
		},
	}, true)

	product, err := repo.GetProductByID(context.Background(), "product")
	if err != nil {
		t.Fatal(err)
	}
	if len(product.Variants) != 1 || product.Variants[0].ID != "active" {
		t.Fatalf("unexpected public variants: %+v", product.Variants)
	}
	if len(product.OptionGroups) != 1 || len(product.OptionGroups[0].Values) != 1 || product.OptionGroups[0].Values[0].ID != activeValue.ID {
		t.Fatalf("unexpected public option graph: %+v", product.OptionGroups)
	}
	product.Variants[0].OptionValueIDs["group"] = "mutated"
	product.OptionGroups[0].Values[0].Label = "mutated"
	product.Variants = nil
	again, err := repo.GetProductByID(context.Background(), "product")
	if err != nil || len(again.Variants) != 1 || again.Variants[0].OptionValueIDs["group"] != activeValue.ID || again.OptionGroups[0].Values[0].Label != activeValue.Label {
		t.Fatalf("caller mutation leaked into repository: %+v, %v", again, err)
	}
}

func TestTask23_ListCategoriesOnlyReturnsPublicCategories(t *testing.T) {
	repo := NewCatalog()
	repo.AddCategory(domain.Category{ID: "public", Name: "Public"})
	repo.AddCategory(domain.Category{ID: "inactive", Name: "Inactive"})
	repo.AddCategory(domain.Category{ID: "novariant", Name: "No Variant"})
	repo.AddProductWithActiveState(domain.Product{ID: "active-product", Category: domain.Category{ID: "public", Name: "Public"}, Variants: []domain.ProductVariant{{ID: "active", Active: true}}}, true)
	repo.AddProductWithActiveState(domain.Product{ID: "inactive-product", Category: domain.Category{ID: "inactive", Name: "Inactive"}, Variants: []domain.ProductVariant{{ID: "inactive", Active: true}}}, false)
	repo.AddProductWithActiveState(domain.Product{ID: "variant-product", Category: domain.Category{ID: "novariant", Name: "No Variant"}, Variants: []domain.ProductVariant{{ID: "inactive", Active: false}}}, true)

	categories, err := repo.ListCategories(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(categories) != 1 || categories[0].ID != "public" {
		t.Fatalf("unexpected public categories: %+v", categories)
	}
}
