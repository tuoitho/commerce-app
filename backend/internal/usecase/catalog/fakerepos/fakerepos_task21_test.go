package fakerepos

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
)

const fakeAppleID = "11111111-1111-1111-1111-111111111111"

func TestTask21_ListProductsEvaluatesPriceAndStockAcrossAllVariants(t *testing.T) {
	repo := NewCatalog()
	repo.AddCategory(domain.Category{ID: fakeAppleID, Name: "Apple"})
	repo.AddProduct(domain.Product{
		ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", Active: true,
		Brand:    "Apple",
		Category: domain.Category{ID: fakeAppleID, Name: "Apple"},
		Variants: []domain.ProductVariant{
			{ID: "1", PriceVND: "100", StockQuantity: 0, Active: true},
			{ID: "2", PriceVND: "200", StockQuantity: 3, Active: true},
		},
	})
	inStock := true
	products, err := repo.ListProducts(context.Background(), domain.ProductFilter{MinPriceVND: domain.MoneyVNDPtr("100"), MaxPriceVND: domain.MoneyVNDPtr("100"), InStock: &inStock})
	if err != nil || len(products) != 1 {
		t.Fatalf("product should match independent predicates, products=%+v err=%v", products, err)
	}
}

func TestTask21_PublicFakePathsExcludeIneligibleProducts(t *testing.T) {
	repo := NewCatalog()
	repo.AddProduct(domain.Product{ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", Featured: true, Active: false,
		Variants: []domain.ProductVariant{{ID: "1", Active: true}}})
	repo.AddProduct(domain.Product{ID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", Featured: true, Active: true,
		Variants: []domain.ProductVariant{{ID: "2", Active: false}}})
	featured, err := repo.ListFeaturedProducts(context.Background())
	if err != nil || len(featured) != 0 {
		t.Fatalf("ineligible featured products leaked: %+v %v", featured, err)
	}
	_, err = repo.GetProductByID(context.Background(), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("inactive detail error = %v", err)
	}
}

func TestTask21_PublicFakePathsExcludeActiveProductsWithoutVariants(t *testing.T) {
	repo := NewCatalog()
	productID := "cccccccc-cccc-cccc-cccc-cccccccccccc"
	repo.AddProduct(domain.Product{ID: productID, Featured: true, Active: true})

	products, err := repo.ListProducts(context.Background(), domain.ProductFilter{})
	if err != nil || len(products) != 0 {
		t.Fatalf("zero-variant product leaked from list: %+v %v", products, err)
	}
	featured, err := repo.ListFeaturedProducts(context.Background())
	if err != nil || len(featured) != 0 {
		t.Fatalf("zero-variant product leaked from featured: %+v %v", featured, err)
	}
	_, err = repo.GetProductByID(context.Background(), productID)
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("zero-variant detail error = %v", err)
	}
}

func TestTask21_PublicFakePathsExcludeExplicitlyInactiveZeroVariantProduct(t *testing.T) {
	repo := NewCatalog()
	productID := "dddddddd-dddd-dddd-dddd-dddddddddddd"
	repo.AddProduct(domain.Product{
		ID: productID, Active: false, Featured: true,
		Brand:    "Apple",
		Category: domain.Category{ID: fakeAppleID, Name: "Apple"},
		Model:    "inactive-model", Price: "100", Currency: "VND",
	})

	products, err := repo.ListProducts(context.Background(), domain.ProductFilter{})
	if err != nil || len(products) != 0 {
		t.Fatalf("explicitly inactive product leaked from list: %+v %v", products, err)
	}
	featured, err := repo.ListFeaturedProducts(context.Background())
	if err != nil || len(featured) != 0 {
		t.Fatalf("explicitly inactive product leaked from featured: %+v %v", featured, err)
	}
	_, err = repo.GetProductByID(context.Background(), productID)
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("explicitly inactive detail error = %v", err)
	}
}

func TestTask21_PublicFakePathsExcludeExplicitlyInactiveLegacyProduct(t *testing.T) {
	repo := NewCatalog()
	productID := "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
	repo.AddProductWithActiveState(domain.Product{
		ID: productID, Featured: true, Price: "100", Currency: "VND", StockQuantity: 5,
	}, false)

	products, err := repo.ListProducts(context.Background(), domain.ProductFilter{})
	if err != nil || len(products) != 0 {
		t.Fatalf("explicitly inactive legacy product leaked from list: %+v %v", products, err)
	}
	featured, err := repo.ListFeaturedProducts(context.Background())
	if err != nil || len(featured) != 0 {
		t.Fatalf("explicitly inactive legacy product leaked from featured: %+v %v", featured, err)
	}
	_, err = repo.GetProductByID(context.Background(), productID)
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("explicitly inactive legacy detail error = %v", err)
	}
}

func TestTask21_UnknownValidCategoryIsIgnoredByFake(t *testing.T) {
	repo := NewCatalog()
	repo.AddCategory(domain.Category{ID: fakeAppleID, Name: "Apple"})
	repo.AddProduct(domain.Product{ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", Active: true,
		Brand:    "Apple",
		Category: domain.Category{ID: fakeAppleID, Name: "Apple"},
		Variants: []domain.ProductVariant{{ID: "legacy", Active: true}}})
	products, err := repo.ListProducts(context.Background(), domain.ProductFilter{CategoryIDs: []string{
		"22222222-2222-2222-2222-222222222222",
	}})
	if err != nil || len(products) != 1 {
		t.Fatalf("unknown valid category should be ignored: %+v %v", products, err)
	}
}
