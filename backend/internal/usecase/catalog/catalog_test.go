package catalog

import (
	"context"
	"errors"
	"testing"
	"time"

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

func TestListBrands_DistinctAlphabeticalAndVisibleOnly(t *testing.T) {
	fake := fakerepos.NewCatalog()
	fake.AddCategory(domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"})

	// Active product with active variant - Apple
	fake.AddProductWithActiveState(domain.Product{
		ID:       "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		Name:     "iPhone 15",
		Brand:    "Apple",
		Active:   true,
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"},
		Variants: []domain.ProductVariant{{ID: "v1", Active: true, StockQuantity: 5}},
	}, true)

	// Another active product - Apple (should deduplicate)
	fake.AddProductWithActiveState(domain.Product{
		ID:       "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
		Name:     "iPad Air",
		Brand:    "Apple",
		Active:   true,
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"},
		Variants: []domain.ProductVariant{{ID: "v2", Active: true, StockQuantity: 2}},
	}, true)

	// Active product - Xiaomi
	fake.AddProductWithActiveState(domain.Product{
		ID:       "cccccccc-cccc-cccc-cccc-cccccccccccc",
		Name:     "Xiaomi 14",
		Brand:    "Xiaomi",
		Active:   true,
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"},
		Variants: []domain.ProductVariant{{ID: "v3", Active: true, StockQuantity: 10}},
	}, true)

	// Inactive product - Samsung (should be excluded)
	fake.AddProductWithActiveState(domain.Product{
		ID:       "dddddddd-dddd-dddd-dddd-dddddddddddd",
		Name:     "Galaxy S24",
		Brand:    "Samsung",
		Active:   false,
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"},
		Variants: []domain.ProductVariant{{ID: "v4", Active: true, StockQuantity: 10}},
	}, false)

	// Product with no active variants - Google (should be excluded)
	fake.AddProductWithActiveState(domain.Product{
		ID:       "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
		Name:     "Pixel 8",
		Brand:    "Google",
		Active:   true,
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"},
		Variants: []domain.ProductVariant{{ID: "v5", Active: false, StockQuantity: 10}},
	}, true)

	// Product with empty brand string (should be excluded)
	fake.AddProductWithActiveState(domain.Product{
		ID:       "ffffffff-ffff-ffff-ffff-ffffffffffff",
		Name:     "Generic Gadget",
		Brand:    "",
		Active:   true,
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Electronics"},
		Variants: []domain.ProductVariant{{ID: "v6", Active: true, StockQuantity: 10}},
	}, true)

	uc := New(Dependencies{Catalog: fake})
	brands, err := uc.ListBrands(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if len(brands) != 2 {
		t.Fatalf("expected 2 distinct brands, got %d: %v", len(brands), brands)
	}
	if brands[0] != "Apple" || brands[1] != "Xiaomi" {
		t.Fatalf("expected ['Apple', 'Xiaomi'], got %v", brands)
	}
}

func TestSearchProducts_FilterByBrand_CaseInsensitiveAndMultiSelect(t *testing.T) {
	fake := fakerepos.NewCatalog()
	fake.AddCategory(domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Phones"})

	fake.AddProductWithActiveState(domain.Product{
		ID:       "11111111-0000-0000-0000-000000000001",
		Name:     "iPhone 15",
		Brand:    "Apple",
		Active:   true,
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Phones"},
		Variants: []domain.ProductVariant{{ID: "v1", Active: true, StockQuantity: 5}},
	}, true)

	fake.AddProductWithActiveState(domain.Product{
		ID:       "11111111-0000-0000-0000-000000000002",
		Name:     "Xiaomi 14",
		Brand:    "Xiaomi",
		Active:   true,
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Phones"},
		Variants: []domain.ProductVariant{{ID: "v2", Active: true, StockQuantity: 5}},
	}, true)

	fake.AddProductWithActiveState(domain.Product{
		ID:       "11111111-0000-0000-0000-000000000003",
		Name:     "Galaxy S24",
		Brand:    "Samsung",
		Active:   true,
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Phones"},
		Variants: []domain.ProductVariant{{ID: "v3", Active: true, StockQuantity: 5}},
	}, true)

	uc := New(Dependencies{Catalog: fake})

	// Single brand case-insensitive match (apple -> Apple)
	res, err := uc.SearchProducts(context.Background(), domain.ProductFilter{Brands: []string{"apple"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 1 || res[0].Brand != "Apple" {
		t.Fatalf("expected 1 Apple product, got %v", res)
	}

	// Multiple brands (OR logic: apple OR XIAOMI)
	res, err = uc.SearchProducts(context.Background(), domain.ProductFilter{Brands: []string{"apple", "XIAOMI"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 2 {
		t.Fatalf("expected 2 products for Apple OR Xiaomi, got %d", len(res))
	}

	// Empty and whitespace brand entries are ignored during validation
	res, err = uc.SearchProducts(context.Background(), domain.ProductFilter{Brands: []string{"  ", "", "  Samsung  "}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 1 || res[0].Brand != "Samsung" {
		t.Fatalf("expected 1 Samsung product after trimming/dropping empty brands, got %v", res)
	}
}

type filterSpyRepo struct {
	fakerepos.Catalog
	lastFilter domain.ProductFilter
}

func (r *filterSpyRepo) ListProducts(ctx context.Context, f domain.ProductFilter) ([]domain.Product, error) {
	r.lastFilter = f
	return r.Catalog.ListProducts(ctx, f)
}

type stubErrorRepo struct {
	err error
}

func (r *stubErrorRepo) ListCategories(context.Context) ([]domain.Category, error) { return nil, r.err }
func (r *stubErrorRepo) ListBrands(context.Context) ([]string, error)             { return nil, r.err }
func (r *stubErrorRepo) ListProducts(context.Context, domain.ProductFilter) ([]domain.Product, error) {
	return nil, r.err
}
func (r *stubErrorRepo) ListFeaturedProducts(context.Context) ([]domain.Product, error) {
	return nil, r.err
}
func (r *stubErrorRepo) GetProductByID(context.Context, string) (*domain.Product, error) {
	return nil, r.err
}
func (r *stubErrorRepo) ListAdminProducts(context.Context, string) ([]domain.Product, error) {
	return nil, r.err
}
func (r *stubErrorRepo) GetAdminProductByID(context.Context, string) (*domain.Product, error) {
	return nil, r.err
}
func (r *stubErrorRepo) CreateProduct(context.Context, domain.SaveProductInput) (*domain.Product, error) {
	return nil, r.err
}
func (r *stubErrorRepo) UpdateProduct(context.Context, string, domain.SaveProductInput) (*domain.Product, error) {
	return nil, r.err
}
func (r *stubErrorRepo) DeleteProduct(context.Context, string) error { return r.err }
func (r *stubErrorRepo) GetCategoryByID(context.Context, string) (*domain.Category, error) {
	return nil, r.err
}

func TestSearchProducts_NormalizesBrandModelAndRepeatedCategories(t *testing.T) {
	spy := &filterSpyRepo{}
	uc := New(Dependencies{Catalog: spy})
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{
		Query: "  iPhone  ", CategoryIDs: []string{"11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"},
		MinPriceVND: domain.MoneyVNDPtr("10000000000000000000000000000000000000"),
	})
	if err != nil || len(products) != 0 {
		t.Fatalf("unexpected result: products=%v err=%v", products, err)
	}
	if spy.lastFilter.Query != "iPhone" || len(spy.lastFilter.CategoryIDs) != 2 {
		t.Fatalf("filter was not normalized: %+v", spy.lastFilter)
	}
}

func TestSearchProducts_IgnoresNonexistentCategory(t *testing.T) {
	spy := &filterSpyRepo{}
	spy.AddCategory(domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Apple"})
	uc := New(Dependencies{Catalog: spy})
	_, err := uc.SearchProducts(context.Background(), domain.ProductFilter{CategoryIDs: []string{
		"33333333-3333-3333-3333-333333333333",
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(spy.lastFilter.CategoryIDs) != 1 {
		t.Fatalf("repository should receive valid UUID for pass-through: %+v", spy.lastFilter)
	}
}

func TestSearchProducts_RejectsMalformedCategoryID(t *testing.T) {
	fake := fakerepos.NewCatalog()
	uc := New(Dependencies{Catalog: fake})
	_, err := uc.SearchProducts(context.Background(), domain.ProductFilter{CategoryIDs: []string{"not-a-uuid"}})
	var filterErr *domain.FilterValidationError
	if !errors.As(err, &filterErr) {
		t.Fatalf("expected filter validation error, got %v", err)
	}
}

func TestSearchProducts_RejectsNonCanonicalMoneyAndReversedRange(t *testing.T) {
	fake := fakerepos.NewCatalog()
	uc := New(Dependencies{Catalog: fake})
	for name, filter := range map[string]domain.ProductFilter{
		"leading zero": {MinPriceVND: domain.MoneyVNDPtr("01")},
		"decimal":      {MinPriceVND: domain.MoneyVNDPtr("1.0")},
		"too long":     {MinPriceVND: domain.MoneyVNDPtr("100000000000000000000000000000000000000")},
		"reversed":     {MinPriceVND: domain.MoneyVNDPtr("20"), MaxPriceVND: domain.MoneyVNDPtr("10")},
	} {
		t.Run(name, func(t *testing.T) {
			var err *domain.FilterValidationError
			_, gotErr := uc.SearchProducts(context.Background(), filter)
			if !errors.As(gotErr, &err) {
				t.Fatal("expected filter validation error")
			}
		})
	}
}

func TestGetProduct_PreservesPhoneProjection(t *testing.T) {
	now := time.Now()
	phoneID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	p := domain.Product{
		ID: phoneID, Brand: "Apple", Model: "A3294", Featured: true, Active: true, CreatedAt: now, UpdatedAt: now,
		OptionGroups: []domain.OptionGroup{{ID: "33333333-3333-3333-3333-333333333333", Label: "Color"}},
		Variants:     []domain.ProductVariant{{ID: "44444444-4444-4444-4444-444444444444", PriceVND: "999", StockQuantity: 2, Active: true}},
	}
	fake := fakerepos.NewCatalog()
	fake.AddProductWithActiveState(p, true)
	uc := New(Dependencies{Catalog: fake})

	featured, err := uc.ListFeaturedProducts(context.Background())
	if err != nil || len(featured) != 1 || !featured[0].Featured {
		t.Fatalf("unexpected featured: %+v %v", featured, err)
	}
	detail, err := uc.GetProduct(context.Background(), phoneID)
	if err != nil || detail.Model != "A3294" || len(detail.Variants) != 1 || !detail.CreatedAt.Equal(now) {
		t.Fatalf("unexpected detail: %+v %v", detail, err)
	}
}

func TestGetProduct_PropagatesRepositoryErrors(t *testing.T) {
	repoErr := errors.New("catalog unavailable")
	uc := New(Dependencies{Catalog: &stubErrorRepo{err: repoErr}})
	if _, err := uc.ListFeaturedProducts(context.Background()); !errors.Is(err, repoErr) {
		t.Fatalf("featured error = %v, want %v", err, repoErr)
	}
	if _, err := uc.GetProduct(context.Background(), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"); !errors.Is(err, repoErr) {
		t.Fatalf("detail error = %v, want %v", err, repoErr)
	}
}

func TestGetProduct_NotFoundRemainsDomainError(t *testing.T) {
	uc := New(Dependencies{Catalog: &stubErrorRepo{err: domain.ErrProductNotFound}})
	_, err := uc.GetProduct(context.Background(), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

