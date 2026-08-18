package catalog_test

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
	cataloguc "commerce-backend/internal/usecase/catalog"
	"commerce-backend/internal/usecase/catalog/fakerepos"
)

func setupAdminUseCase() (*cataloguc.UseCase, *fakerepos.Catalog) {
	repo := fakerepos.NewCatalog()
	repo.AddCategory(domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"})
	repo.AddCategory(domain.Category{ID: "22222222-2222-2222-2222-222222222222", Name: "Máy tính"})

	uc := cataloguc.New(cataloguc.Dependencies{Catalog: repo})
	return uc, repo
}

func TestAdminUseCase_ListAdminProducts_IncludesVariantLessProducts(t *testing.T) {
	uc, repo := setupAdminUseCase()
	ctx := context.Background()

	// Product with no variants
	repo.AddProduct(domain.Product{
		ID:            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		Name:          "Phone No Variant",
		Model:         "NV-1",
		Brand:         "Xiaomi",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Price:         "10000000",
		Currency:      "VND",
		StockQuantity: 15,
		Active:        true,
		ImageURLs:     []string{"https://example.com/phone.jpg"},
	})

	products, err := uc.ListAdminProducts(ctx, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(products) != 1 {
		t.Fatalf("expected 1 product, got %d", len(products))
	}
	if products[0].Name != "Phone No Variant" {
		t.Errorf("expected product name 'Phone No Variant', got %q", products[0].Name)
	}
	if products[0].Brand != "Xiaomi" {
		t.Errorf("expected brand 'Xiaomi', got %q", products[0].Brand)
	}
}

func TestAdminUseCase_ListAdminProducts_QueryFilter(t *testing.T) {
	uc, repo := setupAdminUseCase()
	ctx := context.Background()

	repo.AddProduct(domain.Product{
		ID:       "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		Name:     "iPhone 15 Pro",
		Model:    "A3102",
		Brand:    "Apple",
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Active:   true,
	})
	repo.AddProduct(domain.Product{
		ID:       "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
		Name:     "MacBook Pro",
		Model:    "M3 Max",
		Brand:    "Apple",
		Category: domain.Category{ID: "22222222-2222-2222-2222-222222222222", Name: "Máy tính"},
		Active:   true,
	})

	// Search by name
	res, err := uc.ListAdminProducts(ctx, "iPhone")
	if err != nil || len(res) != 1 || res[0].ID != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" {
		t.Fatalf("failed search by name: %v, len: %d", err, len(res))
	}

	// Search by category name
	res, err = uc.ListAdminProducts(ctx, "Máy tính")
	if err != nil || len(res) != 1 || res[0].ID != "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" {
		t.Fatalf("failed search by category: %v, len: %d", err, len(res))
	}

	// Search by brand
	res, err = uc.ListAdminProducts(ctx, "apple")
	if err != nil || len(res) != 2 {
		t.Fatalf("failed search by brand: %v, len: %d", err, len(res))
	}
}

func TestAdminUseCase_ListAdminProducts_ExcludesInactive(t *testing.T) {
	uc, repo := setupAdminUseCase()
	ctx := context.Background()

	pActive := domain.Product{
		ID:       "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		Name:     "Active Phone",
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Active:   true,
	}
	pInactive := domain.Product{
		ID:       "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
		Name:     "Deleted Phone",
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Active:   false,
	}
	repo.AddProductWithActiveState(pActive, true)
	repo.AddProductWithActiveState(pInactive, false)

	res, err := uc.ListAdminProducts(ctx, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res) != 1 || res[0].ID != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" {
		t.Fatalf("expected only active product, got %d items", len(res))
	}
}

func TestAdminUseCase_GetAdminProduct_Success(t *testing.T) {
	uc, repo := setupAdminUseCase()
	ctx := context.Background()

	id := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.AddProduct(domain.Product{
		ID:            id,
		Name:          "Redmi Note 13",
		Model:         "RN13",
		Brand:         "Xiaomi",
		Description:   "A great phone",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Price:         "5000000",
		Currency:      "VND",
		StockQuantity: 100,
		Active:        true,
		ImageURLs:     []string{"https://example.com/img1.jpg"},
	})

	prod, err := uc.GetAdminProduct(ctx, id)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if prod.ID != id || prod.Name != "Redmi Note 13" || prod.Brand != "Xiaomi" {
		t.Errorf("mismatched product detail: %+v", prod)
	}
}

func TestAdminUseCase_GetAdminProduct_NotFound(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	_, err := uc.GetAdminProduct(ctx, "99999999-9999-9999-9999-999999999999")
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("expected ErrProductNotFound, got %v", err)
	}
}

func TestAdminUseCase_GetAdminProduct_InvalidID(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	_, err := uc.GetAdminProduct(ctx, "not-a-uuid")
	if !errors.Is(err, domain.ErrInvalidProductID) {
		t.Fatalf("expected ErrInvalidProductID, got %v", err)
	}
}

func TestAdminUseCase_CreateProduct_Success(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	input := domain.SaveProductInput{
		Name:          "Galaxy S24 Ultra",
		Model:         "SM-S928B",
		Brand:         "Samsung",
		Description:   "Flagship Samsung phone",
		CategoryID:    "11111111-1111-1111-1111-111111111111",
		Price:         "31990000",
		Currency:      "VND",
		StockQuantity: 25,
		Featured:      true,
		ImageURLs:     []string{"https://example.com/s24_1.jpg", "https://example.com/s24_2.jpg"},
	}

	created, err := uc.CreateProduct(ctx, input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if created.ID == "" {
		t.Errorf("expected generated ID")
	}
	if created.Name != "Galaxy S24 Ultra" || created.Brand != "Samsung" {
		t.Errorf("mismatched name/brand: %+v", created)
	}
	if !created.Active {
		t.Errorf("expected product to be active")
	}
	if len(created.ImageURLs) != 2 {
		t.Errorf("expected 2 image urls, got %d", len(created.ImageURLs))
	}
}

func TestAdminUseCase_CreateProduct_Validations(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	tests := []struct {
		name          string
		input         domain.SaveProductInput
		expectedField string
	}{
		{
			name: "missing name",
			input: domain.SaveProductInput{
				Name:       "",
				CategoryID: "11111111-1111-1111-1111-111111111111",
				Price:      "100000",
			},
			expectedField: "name",
		},
		{
			name: "invalid category UUID",
			input: domain.SaveProductInput{
				Name:       "Test",
				CategoryID: "not-uuid",
				Price:      "100000",
			},
			expectedField: "categoryId",
		},
		{
			name: "invalid price format",
			input: domain.SaveProductInput{
				Name:       "Test",
				CategoryID: "11111111-1111-1111-1111-111111111111",
				Price:      "-5000",
			},
			expectedField: "price",
		},
		{
			name: "negative stock quantity",
			input: domain.SaveProductInput{
				Name:          "Test",
				CategoryID:    "11111111-1111-1111-1111-111111111111",
				Price:         "100000",
				StockQuantity: -1,
			},
			expectedField: "stockQuantity",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := uc.CreateProduct(ctx, tt.input)
			if err == nil {
				t.Fatalf("expected validation error, got nil")
			}
			var valErr *domain.ValidationError
			if !errors.As(err, &valErr) {
				t.Fatalf("expected domain.ValidationError, got %v", err)
			}
			if valErr.Fields[tt.expectedField] == "" {
				t.Fatalf("expected error on field %q, got fields: %+v", tt.expectedField, valErr.Fields)
			}
		})
	}
}

func TestAdminUseCase_CreateProduct_CategoryNotFound(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	input := domain.SaveProductInput{
		Name:       "Product X",
		CategoryID: "99999999-9999-9999-9999-999999999999",
		Price:      "100000",
	}

	_, err := uc.CreateProduct(ctx, input)
	if err == nil {
		t.Fatalf("expected error for non-existent category")
	}
	var valErr *domain.ValidationError
	if !errors.As(err, &valErr) {
		t.Fatalf("expected domain.ValidationError, got %v", err)
	}
	if valErr.Fields["categoryId"] == "" {
		t.Fatalf("expected categoryId error field, got: %+v", valErr.Fields)
	}
}

func TestAdminUseCase_UpdateProduct_Success(t *testing.T) {
	uc, repo := setupAdminUseCase()
	ctx := context.Background()

	id := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.AddProduct(domain.Product{
		ID:            id,
		Name:          "Old Name",
		Model:         "Old Model",
		Brand:         "Old Brand",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Price:         "10000",
		Currency:      "VND",
		StockQuantity: 5,
		Active:        true,
	})

	input := domain.SaveProductInput{
		Name:          "New Name",
		Model:         "New Model",
		Brand:         "New Brand",
		Description:   "Updated description",
		CategoryID:    "22222222-2222-2222-2222-222222222222",
		Price:         "20000",
		Currency:      "VND",
		StockQuantity: 10,
		Featured:      true,
		ImageURLs:     []string{"https://example.com/updated.jpg"},
	}

	updated, err := uc.UpdateProduct(ctx, id, input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Name != "New Name" || updated.Brand != "New Brand" || updated.Category.ID != "22222222-2222-2222-2222-222222222222" {
		t.Errorf("mismatched updated fields: %+v", updated)
	}
	if !updated.Active {
		t.Errorf("expected product to stay active")
	}
}

func TestAdminUseCase_UpdateProduct_NotFound(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	input := domain.SaveProductInput{
		Name:       "New Name",
		CategoryID: "11111111-1111-1111-1111-111111111111",
		Price:      "20000",
	}

	_, err := uc.UpdateProduct(ctx, "99999999-9999-9999-9999-999999999999", input)
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("expected ErrProductNotFound, got %v", err)
	}
}

func TestAdminUseCase_DeleteProduct_SoftDelete(t *testing.T) {
	uc, repo := setupAdminUseCase()
	ctx := context.Background()

	id := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.AddProduct(domain.Product{
		ID:       id,
		Name:     "To Delete",
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Active:   true,
	})

	// Delete the product
	err := uc.DeleteProduct(ctx, id)
	if err != nil {
		t.Fatalf("unexpected error deleting product: %v", err)
	}

	// Should not be retrievable by ID
	_, err = uc.GetAdminProduct(ctx, id)
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("expected ErrProductNotFound after delete, got %v", err)
	}

	// Should not appear in admin list
	list, err := uc.ListAdminProducts(ctx, "")
	if err != nil {
		t.Fatalf("unexpected error listing products: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected 0 products in list after soft delete, got %d", len(list))
	}
}

func TestAdminUseCase_DeleteProduct_NotFound(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	err := uc.DeleteProduct(ctx, "99999999-9999-9999-9999-999999999999")
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("expected ErrProductNotFound, got %v", err)
	}
}

func TestAdminUseCase_CreateProduct_WithVariants_Success(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	input := domain.SaveProductInput{
		Name:        "iPhone 15 Pro Max",
		Model:       "A3106",
		Brand:       "Apple",
		Description: "Flagship iPhone with titanium design",
		CategoryID:  "11111111-1111-1111-1111-111111111111",
		Currency:    "VND",
		Featured:    true,
		ImageURLs:   []string{"https://example.com/ip15_1.jpg"},
		HasVariants: true,
		OptionGroups: []domain.OptionGroupInput{
			{
				ID:       "group-color",
				Label:    "Màu sắc",
				Position: 0,
				Values: []domain.OptionValueInput{
					{ID: "val-color-natural", Label: "Titan Tự Nhiên", Position: 0},
					{ID: "val-color-black", Label: "Titan Đen", Position: 1},
				},
			},
			{
				ID:       "group-storage",
				Label:    "Dung lượng",
				Position: 1,
				Values: []domain.OptionValueInput{
					{ID: "val-storage-256", Label: "256GB", Position: 0},
					{ID: "val-storage-512", Label: "512GB", Position: 1},
				},
			},
		},
		Variants: []domain.VariantInput{
			{
				ID:             "var-natural-256",
				OptionValueIDs: map[string]string{"group-color": "val-color-natural", "group-storage": "val-storage-256"},
				PriceVND:       "29990000",
				StockQuantity:  10,
				Active:         true,
			},
			{
				ID:             "var-natural-512",
				OptionValueIDs: map[string]string{"group-color": "val-color-natural", "group-storage": "val-storage-512"},
				PriceVND:       "34990000",
				StockQuantity:  5,
				Active:         true,
			},
			{
				ID:             "var-black-256",
				OptionValueIDs: map[string]string{"group-color": "val-color-black", "group-storage": "val-storage-256"},
				PriceVND:       "29990000",
				StockQuantity:  8,
				Active:         true,
			},
			{
				ID:             "var-black-512",
				OptionValueIDs: map[string]string{"group-color": "val-color-black", "group-storage": "val-storage-512"},
				PriceVND:       "34990000",
				StockQuantity:  0,
				Active:         false,
			},
		},
	}

	created, err := uc.CreateProduct(ctx, input)
	if err != nil {
		t.Fatalf("unexpected error creating product with variants: %v", err)
	}

	if len(created.OptionGroups) != 2 {
		t.Fatalf("expected 2 option groups, got %d", len(created.OptionGroups))
	}
	if len(created.Variants) != 4 {
		t.Fatalf("expected 4 variants, got %d", len(created.Variants))
	}
	if created.Price != "29990000" {
		t.Errorf("expected computed price 29990000, got %s", created.Price)
	}
	if created.StockQuantity != 23 {
		t.Errorf("expected active stock sum 23, got %d", created.StockQuantity)
	}
}

func TestAdminUseCase_CreateProduct_VariantValidations(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	tests := []struct {
		name          string
		input         domain.SaveProductInput
		expectedField string
		expectedMsg   string
	}{
		{
			name: "hasVariants true but empty option groups",
			input: domain.SaveProductInput{
				Name:         "Product Variant Test",
				CategoryID:   "11111111-1111-1111-1111-111111111111",
				HasVariants:  true,
				OptionGroups: []domain.OptionGroupInput{},
			},
			expectedField: "optionGroups",
			expectedMsg:   "Phải có ít nhất một nhóm thuộc tính",
		},
		{
			name: "option group with empty label",
			input: domain.SaveProductInput{
				Name:        "Product Variant Test",
				CategoryID:  "11111111-1111-1111-1111-111111111111",
				HasVariants: true,
				OptionGroups: []domain.OptionGroupInput{
					{
						Label: "  ",
						Values: []domain.OptionValueInput{
							{Label: "128GB"},
						},
					},
				},
				Variants: []domain.VariantInput{
					{PriceVND: "100000", StockQuantity: 5, Active: true},
				},
			},
			expectedField: "optionGroups[0].label",
			expectedMsg:   "Tên nhóm thuộc tính không được để trống",
		},
		{
			name: "option group without values",
			input: domain.SaveProductInput{
				Name:        "Product Variant Test",
				CategoryID:  "11111111-1111-1111-1111-111111111111",
				HasVariants: true,
				OptionGroups: []domain.OptionGroupInput{
					{
						Label:  "Dung lượng",
						Values: []domain.OptionValueInput{},
					},
				},
				Variants: []domain.VariantInput{
					{PriceVND: "100000", StockQuantity: 5, Active: true},
				},
			},
			expectedField: "optionGroups[0].values",
			expectedMsg:   "Nhóm thuộc tính phải có ít nhất một giá trị",
		},
		{
			name: "option group with duplicate values",
			input: domain.SaveProductInput{
				Name:        "Product Variant Test",
				CategoryID:  "11111111-1111-1111-1111-111111111111",
				HasVariants: true,
				OptionGroups: []domain.OptionGroupInput{
					{
						Label: "Dung lượng",
						Values: []domain.OptionValueInput{
							{Label: "128GB"},
							{Label: " 128gb "},
						},
					},
				},
				Variants: []domain.VariantInput{
					{PriceVND: "100000", StockQuantity: 5, Active: true},
				},
			},
			expectedField: "optionGroups[0].values",
			expectedMsg:   "Giá trị thuộc tính không được trùng nhau",
		},
		{
			name: "variant with invalid/negative price",
			input: domain.SaveProductInput{
				Name:        "Product Variant Test",
				CategoryID:  "11111111-1111-1111-1111-111111111111",
				HasVariants: true,
				OptionGroups: []domain.OptionGroupInput{
					{
						Label: "Màu sắc",
						Values: []domain.OptionValueInput{
							{Label: "Đen"},
						},
					},
				},
				Variants: []domain.VariantInput{
					{PriceVND: "-50000", StockQuantity: 5, Active: true},
				},
			},
			expectedField: "variants[0].priceVnd",
			expectedMsg:   "Giá biến thể phải là số không âm",
		},
		{
			name: "variant with negative stock",
			input: domain.SaveProductInput{
				Name:        "Product Variant Test",
				CategoryID:  "11111111-1111-1111-1111-111111111111",
				HasVariants: true,
				OptionGroups: []domain.OptionGroupInput{
					{
						Label: "Màu sắc",
						Values: []domain.OptionValueInput{
							{Label: "Đen"},
						},
					},
				},
				Variants: []domain.VariantInput{
					{PriceVND: "50000", StockQuantity: -2, Active: true},
				},
			},
			expectedField: "variants[0].stockQuantity",
			expectedMsg:   "Số lượng tồn kho không được âm",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := uc.CreateProduct(ctx, tt.input)
			if err == nil {
				t.Fatalf("expected validation error, got nil")
			}
			var valErr *domain.ValidationError
			if !errors.As(err, &valErr) {
				t.Fatalf("expected domain.ValidationError, got %v", err)
			}
			msg, ok := valErr.Fields[tt.expectedField]
			if !ok {
				t.Fatalf("expected error field %q, got fields: %+v", tt.expectedField, valErr.Fields)
			}
			if msg != tt.expectedMsg {
				t.Errorf("expected message %q, got %q", tt.expectedMsg, msg)
			}
		})
	}
}

func TestAdminUseCase_UpdateProduct_WithVariants_Success(t *testing.T) {
	uc, repo := setupAdminUseCase()
	ctx := context.Background()

	id := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.AddProduct(domain.Product{
		ID:            id,
		Name:          "Old Product",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Price:         "10000000",
		StockQuantity: 10,
		Active:        true,
	})

	input := domain.SaveProductInput{
		Name:        "Updated Multi-Variant Phone",
		Model:       "V2",
		Brand:       "Apple",
		CategoryID:  "11111111-1111-1111-1111-111111111111",
		HasVariants: true,
		OptionGroups: []domain.OptionGroupInput{
			{
				ID:       "grp-1",
				Label:    "Bộ nhớ",
				Position: 0,
				Values: []domain.OptionValueInput{
					{ID: "val-1", Label: "128GB"},
				},
			},
		},
		Variants: []domain.VariantInput{
			{
				ID:             "var-1",
				OptionValueIDs: map[string]string{"grp-1": "val-1"},
				PriceVND:       "15000000",
				StockQuantity:  20,
				Active:         true,
			},
		},
	}

	updated, err := uc.UpdateProduct(ctx, id, input)
	if err != nil {
		t.Fatalf("unexpected error updating product with variants: %v", err)
	}

	if len(updated.OptionGroups) != 1 || len(updated.Variants) != 1 {
		t.Fatalf("expected updated option groups and variants, got groups=%d, variants=%d", len(updated.OptionGroups), len(updated.Variants))
	}
	if updated.Price != "15000000" || updated.StockQuantity != 20 {
		t.Errorf("expected price 15000000 and stock 20, got price=%s stock=%d", updated.Price, updated.StockQuantity)
	}
}

func TestAdminUseCase_CreateProduct_IncompleteVariantLinks(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	input := domain.SaveProductInput{
		Name:        "Incomplete Phone",
		Brand:       "Apple",
		CategoryID:  "11111111-1111-1111-1111-111111111111",
		HasVariants: true,
		OptionGroups: []domain.OptionGroupInput{
			{
				ID:    "grp-1",
				Label: "Dung lượng",
				Values: []domain.OptionValueInput{
					{ID: "val-1", Label: "128GB"},
				},
			},
			{
				ID:    "grp-2",
				Label: "Màu sắc",
				Values: []domain.OptionValueInput{
					{ID: "val-2", Label: "Đen"},
				},
			},
		},
		Variants: []domain.VariantInput{
			{
				ID:             "var-1",
				OptionValueIDs: map[string]string{"grp-1": "val-1"}, // missing grp-2
				PriceVND:       "15000000",
				StockQuantity:  10,
				Active:         true,
			},
		},
	}

	_, err := uc.CreateProduct(ctx, input)
	if err == nil {
		t.Fatal("expected validation error for incomplete variant links, got nil")
	}

	var valErr *domain.ValidationError
	if !errors.As(err, &valErr) {
		t.Fatalf("expected ValidationError, got %T (%v)", err, err)
	}
	if msg, ok := valErr.Fields["variants[0]"]; !ok || msg != "Mỗi biến thể phải chọn đầy đủ giá trị cho từng nhóm thuộc tính" {
		t.Errorf("expected error message for variants[0], got %v", valErr.Fields)
	}
}

func TestAdminUseCase_CreateProduct_DuplicateVariantCombinations(t *testing.T) {
	uc, _ := setupAdminUseCase()
	ctx := context.Background()

	input := domain.SaveProductInput{
		Name:        "Duplicate Combo Phone",
		Brand:       "Apple",
		CategoryID:  "11111111-1111-1111-1111-111111111111",
		HasVariants: true,
		OptionGroups: []domain.OptionGroupInput{
			{
				ID:    "grp-1",
				Label: "Dung lượng",
				Values: []domain.OptionValueInput{
					{ID: "val-1", Label: "128GB"},
					{ID: "val-2", Label: "256GB"},
				},
			},
		},
		Variants: []domain.VariantInput{
			{
				ID:             "var-1",
				OptionValueIDs: map[string]string{"grp-1": "val-1"},
				PriceVND:       "15000000",
				StockQuantity:  10,
				Active:         true,
			},
			{
				ID:             "var-2",
				OptionValueIDs: map[string]string{"grp-1": "val-1"}, // DUPLICATE val-1
				PriceVND:       "16000000",
				StockQuantity:  5,
				Active:         true,
			},
		},
	}

	_, err := uc.CreateProduct(ctx, input)
	if err == nil {
		t.Fatal("expected validation error for duplicate variant combinations, got nil")
	}

	var valErr *domain.ValidationError
	if !errors.As(err, &valErr) {
		t.Fatalf("expected ValidationError, got %T (%v)", err, err)
	}
	if msg, ok := valErr.Fields["variants[1]"]; !ok || msg != "Tổ hợp thuộc tính của biến thể bị trùng lặp" {
		t.Errorf("expected duplicate combination error message for variants[1], got %v", valErr.Fields)
	}
}
