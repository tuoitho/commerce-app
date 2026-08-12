package catalog

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/usecase/catalog/fakerepos"
)

func newTestEnv(t *testing.T) (*UseCase, *fakerepos.Catalog) {
	t.Helper()
	fake := fakerepos.NewCatalog()
	fake.AddCategory(domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"})
	fake.AddCategory(domain.Category{ID: "22222222-2222-2222-2222-222222222222", Name: "Books"})
	fake.AddProduct(domain.Product{
		ID:            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		Name:          "Wireless Mouse",
		Description:   "A mouse without wires.",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"},
		Price:         "24.99",
		Currency:      "USD",
		ImageURLs:     []string{"https://example.com/mouse.jpg"},
		StockQuantity: 10,
	})
	fake.AddProduct(domain.Product{
		ID:            "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
		Name:          "Wireless Keyboard",
		Description:   "Types without wires.",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"},
		Price:         "59.90",
		Currency:      "USD",
		ImageURLs:     []string{"https://example.com/keyboard.jpg"},
		StockQuantity: 0,
	})
	fake.AddProduct(domain.Product{
		ID:            "cccccccc-cccc-cccc-cccc-cccccccccccc",
		Name:          "Go Programming",
		Description:   "A book about Go.",
		Category:      domain.Category{ID: "22222222-2222-2222-2222-222222222222", Name: "Books"},
		Price:         "39.00",
		Currency:      "USD",
		ImageURLs:     []string{"https://example.com/go.jpg"},
		StockQuantity: 3,
	})
	return New(Dependencies{Catalog: fake}), fake
}

func ids(products []domain.Product) map[string]bool {
	out := map[string]bool{}
	for _, p := range products {
		out[p.ID] = true
	}
	return out
}

func TestListCategories_SortedByName(t *testing.T) {
	uc, _ := newTestEnv(t)
	cats, err := uc.ListCategories(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(cats) != 2 {
		t.Fatalf("len = %d", len(cats))
	}
	if cats[0].Name != "Books" || cats[1].Name != "Electronics" {
		t.Fatalf("unexpected order: %q, %q", cats[0].Name, cats[1].Name)
	}
}

func TestSearchProducts_NoCriteria_ReturnsAll(t *testing.T) {
	uc, _ := newTestEnv(t)
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 3 {
		t.Fatalf("len = %d", len(products))
	}
}

func TestSearchProducts_NameMatchIsCaseInsensitiveAndPartial(t *testing.T) {
	uc, _ := newTestEnv(t)
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{Query: "WIRELESS"})
	if err != nil {
		t.Fatal(err)
	}
	got := ids(products)
	if !got["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"] || !got["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] {
		t.Fatalf("expected wireless products, got %v", got)
	}
	if got["cccccccc-cccc-cccc-cccc-cccccccccccc"] {
		t.Fatalf("unexpected book in results: %v", got)
	}
}

func TestSearchProducts_BlankQueryIsIgnored(t *testing.T) {
	uc, _ := newTestEnv(t)
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{Query: "   "})
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 3 {
		t.Fatalf("len = %d", len(products))
	}
}

func TestSearchProducts_FilterByCategory(t *testing.T) {
	uc, _ := newTestEnv(t)
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{
		CategoryID: "22222222-2222-2222-2222-222222222222",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 1 || products[0].ID != "cccccccc-cccc-cccc-cccc-cccccccccccc" {
		t.Fatalf("unexpected products: %+v", products)
	}
}

func TestSearchProducts_InclusivePriceRange(t *testing.T) {
	uc, _ := newTestEnv(t)
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{MinPrice: "25.00", MaxPrice: "60.00"})
	if err != nil {
		t.Fatal(err)
	}
	got := ids(products)
	if !got["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] || !got["cccccccc-cccc-cccc-cccc-cccccccccccc"] {
		t.Fatalf("unexpected products: %v", got)
	}
	if got["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"] {
		t.Fatalf("24.99 should be excluded by min 25.00: %v", got)
	}
}

func TestSearchProducts_InStock(t *testing.T) {
	uc, _ := newTestEnv(t)
	inStock := true
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{InStock: &inStock})
	if err != nil {
		t.Fatal(err)
	}
	got := ids(products)
	if !got["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"] || !got["cccccccc-cccc-cccc-cccc-cccccccccccc"] {
		t.Fatalf("unexpected in-stock products: %v", got)
	}
	if got["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] {
		t.Fatalf("out-of-stock product should be excluded: %v", got)
	}
}

func TestSearchProducts_OutOfStock(t *testing.T) {
	uc, _ := newTestEnv(t)
	inStock := false
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{InStock: &inStock})
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 1 || products[0].ID != "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" {
		t.Fatalf("unexpected products: %+v", products)
	}
}

func TestSearchProducts_CombinedCriteria(t *testing.T) {
	uc, _ := newTestEnv(t)
	inStock := true
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{
		Query:      "wireless",
		CategoryID: "11111111-1111-1111-1111-111111111111",
		MinPrice:   "20.00",
		InStock:    &inStock,
	})
	if err != nil {
		t.Fatal(err)
	}
	got := ids(products)
	if len(got) != 1 || !got["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"] {
		t.Fatalf("expected only the in-stock wireless mouse, got %v", got)
	}
}

func TestSearchProducts_NoMatchReturnsEmpty(t *testing.T) {
	uc, _ := newTestEnv(t)
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{Query: "nope"})
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 0 {
		t.Fatalf("expected empty result, got %d", len(products))
	}
}

func TestSearchProducts_InvalidCategoryID(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.SearchProducts(context.Background(), domain.ProductFilter{CategoryID: "not-a-uuid"})
	var fe *domain.FilterValidationError
	if !errors.As(err, &fe) {
		t.Fatalf("expected filter validation error, got %v", err)
	}
	if fe.Fields["category_id"] == "" {
		t.Fatalf("expected category_id field error: %+v", fe.Fields)
	}
}

func TestSearchProducts_InvalidPrice(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.SearchProducts(context.Background(), domain.ProductFilter{MinPrice: "-5"})
	var fe *domain.FilterValidationError
	if !errors.As(err, &fe) {
		t.Fatalf("expected filter validation error, got %v", err)
	}
	if fe.Fields["min_price"] == "" {
		t.Fatalf("expected min_price field error: %+v", fe.Fields)
	}
}

func TestSearchProducts_ReversedPriceRange(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.SearchProducts(context.Background(), domain.ProductFilter{MinPrice: "50.00", MaxPrice: "10.00"})
	var fe *domain.FilterValidationError
	if !errors.As(err, &fe) {
		t.Fatalf("expected filter validation error, got %v", err)
	}
	if fe.Fields["min_price"] == "" || fe.Fields["max_price"] == "" {
		t.Fatalf("expected both price fields: %+v", fe.Fields)
	}
}

func TestSearchProducts_InvalidStock(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.SearchProducts(context.Background(), domain.ProductFilter{InStock: nil})
	if err != nil {
		t.Fatalf("absent stock must be allowed, got %v", err)
	}
}

func TestGetProduct_Existing(t *testing.T) {
	uc, _ := newTestEnv(t)
	product, err := uc.GetProduct(context.Background(), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	if err != nil {
		t.Fatal(err)
	}
	if product.Name != "Wireless Mouse" || product.StockQuantity != 10 || !product.InStock() {
		t.Fatalf("unexpected product: %+v", product)
	}
}

func TestGetProduct_OutOfStockReportsFalse(t *testing.T) {
	uc, _ := newTestEnv(t)
	product, err := uc.GetProduct(context.Background(), "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
	if err != nil {
		t.Fatal(err)
	}
	if product.StockQuantity != 0 || product.InStock() {
		t.Fatalf("expected out-of-stock product: %+v", product)
	}
}

func TestGetProduct_MalformedID(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.GetProduct(context.Background(), "junk")
	if !errors.Is(err, domain.ErrInvalidProductID) {
		t.Fatalf("expected ErrInvalidProductID, got %v", err)
	}
}

func TestGetProduct_Missing(t *testing.T) {
	uc, _ := newTestEnv(t)
	_, err := uc.GetProduct(context.Background(), "99999999-9999-9999-9999-999999999999")
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("expected ErrProductNotFound, got %v", err)
	}
}
