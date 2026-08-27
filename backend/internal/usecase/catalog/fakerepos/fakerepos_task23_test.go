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

func TestTask23_ListCategoriesReturnsAllCategories(t *testing.T) {
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
	if len(categories) != 3 {
		t.Fatalf("unexpected categories count: %+v", categories)
	}
}

func TestFakeCatalog_CreateAndUpdateProductWithVariants(t *testing.T) {
	ctx := context.Background()
	repo := NewCatalog()
	repo.AddCategory(domain.Category{ID: "cat-phone", Name: "Phones"})

	// 1. Create with variants
	input := domain.SaveProductInput{
		Name:        "iPhone 15",
		Model:       "IP15",
		Brand:       "Apple",
		Description: "Latest model",
		CategoryID:  "cat-phone",
		HasVariants: true,
		OptionGroups: []domain.OptionGroupInput{
			{
				ID:    "grp-color",
				Label: "Màu sắc",
				Values: []domain.OptionValueInput{
					{ID: "val-blue", Label: "Xanh"},
					{ID: "val-black", Label: "Đen"},
				},
			},
		},
		Variants: []domain.VariantInput{
			{
				ID:             "var-1",
				OptionValueIDs: map[string]string{"grp-color": "val-blue"},
				PriceVND:       "20000000",
				StockQuantity:  5,
				Active:         true,
			},
			{
				ID:             "var-2",
				OptionValueIDs: map[string]string{"grp-color": "val-black"},
				PriceVND:       "22000000",
				StockQuantity:  3,
				Active:         true,
			},
			{
				ID:             "var-3",
				OptionValueIDs: map[string]string{"grp-color": "val-black"},
				PriceVND:       "18000000",
				StockQuantity:  10,
				Active:         false,
			},
		},
	}

	created, err := repo.CreateProduct(ctx, input)
	if err != nil {
		t.Fatalf("create product with variants failed: %v", err)
	}
	if created.Price != "20000000" || created.MinPriceVND != "20000000" || created.MaxPriceVND != "22000000" {
		t.Fatalf("created price range mismatch: min=%s max=%s price=%s", created.MinPriceVND, created.MaxPriceVND, created.Price)
	}
	if created.StockQuantity != 8 {
		t.Fatalf("expected total active stock = 8, got %d", created.StockQuantity)
	}
	if len(created.OptionGroups) != 1 || len(created.Variants) != 3 {
		t.Fatalf("expected 1 group and 3 variants, got %d groups and %d variants", len(created.OptionGroups), len(created.Variants))
	}

	// 2. Update to simple product mode (no variants)
	updateSimple := domain.SaveProductInput{
		Name:          "iPhone 15 Simple",
		Model:         "IP15",
		Brand:         "Apple",
		Description:   "Converted to simple product",
		CategoryID:    "cat-phone",
		Price:         "19900000",
		StockQuantity: 50,
		HasVariants:   false,
	}

	updated, err := repo.UpdateProduct(ctx, created.ID, updateSimple)
	if err != nil {
		t.Fatalf("update to simple product failed: %v", err)
	}
	if updated.Price != "19900000" || updated.StockQuantity != 50 {
		t.Fatalf("updated simple product mismatch: price=%s stock=%d", updated.Price, updated.StockQuantity)
	}
	if len(updated.OptionGroups) != 0 || len(updated.Variants) != 0 {
		t.Fatalf("expected 0 groups and 0 variants after simple switch, got %d groups and %d variants", len(updated.OptionGroups), len(updated.Variants))
	}

	// 3. Update back to variant mode
	updateVariant := domain.SaveProductInput{
		Name:        "iPhone 15 Multi",
		Model:       "IP15",
		Brand:       "Apple",
		Description: "Converted back to multi-variant",
		CategoryID:  "cat-phone",
		HasVariants: true,
		OptionGroups: []domain.OptionGroupInput{
			{
				ID:    "grp-storage",
				Label: "Dung lượng",
				Values: []domain.OptionValueInput{
					{ID: "val-128", Label: "128GB"},
				},
			},
		},
		Variants: []domain.VariantInput{
			{
				ID:             "var-128",
				OptionValueIDs: map[string]string{"grp-storage": "val-128"},
				PriceVND:       "25000000",
				StockQuantity:  12,
				Active:         true,
			},
		},
	}

	updatedVar, err := repo.UpdateProduct(ctx, created.ID, updateVariant)
	if err != nil {
		t.Fatalf("update to variant product failed: %v", err)
	}
	if updatedVar.Price != "25000000" || updatedVar.StockQuantity != 12 {
		t.Fatalf("updated variant product mismatch: price=%s stock=%d", updatedVar.Price, updatedVar.StockQuantity)
	}
	if len(updatedVar.OptionGroups) != 1 || len(updatedVar.Variants) != 1 {
		t.Fatalf("expected 1 group and 1 variant, got %d groups and %d variants", len(updatedVar.OptionGroups), len(updatedVar.Variants))
	}
}
