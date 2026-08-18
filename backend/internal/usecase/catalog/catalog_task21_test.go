package catalog

import (
	"context"
	"errors"
	"testing"
	"time"

	"commerce-backend/internal/domain"
)

const (
	brandApple  = "11111111-1111-1111-1111-111111111111"
	brandXiaomi = "22222222-2222-2222-2222-222222222222"
	phoneID     = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
)

type task21Repo struct {
	products    []domain.Product
	categories  []domain.Category
	listFilter  domain.ProductFilter
	featured    []domain.Product
	featuredErr error
	detail      *domain.Product
	detailErr   error
}

func (r *task21Repo) ListCategories(context.Context) ([]domain.Category, error) {
	return r.categories, nil
}
func (r *task21Repo) ListProducts(_ context.Context, f domain.ProductFilter) ([]domain.Product, error) {
	r.listFilter = f
	return r.products, nil
}
func (r *task21Repo) ListFeaturedProducts(context.Context) ([]domain.Product, error) {
	return r.featured, r.featuredErr
}
func (r *task21Repo) GetProductByID(context.Context, string) (*domain.Product, error) {
	return r.detail, r.detailErr
}
func (r *task21Repo) ListAdminProducts(context.Context, string) ([]domain.Product, error) {
	return nil, nil
}
func (r *task21Repo) GetAdminProductByID(context.Context, string) (*domain.Product, error) {
	return nil, nil
}
func (r *task21Repo) CreateProduct(context.Context, domain.SaveProductInput) (*domain.Product, error) {
	return nil, nil
}
func (r *task21Repo) UpdateProduct(context.Context, string, domain.SaveProductInput) (*domain.Product, error) {
	return nil, nil
}
func (r *task21Repo) DeleteProduct(context.Context, string) error {
	return nil
}
func (r *task21Repo) GetCategoryByID(context.Context, string) (*domain.Category, error) {
	return nil, nil
}

func TestTask21_SearchProductsNormalizesBrandModelAndRepeatedCategories(t *testing.T) {
	repo := &task21Repo{}
	uc := New(Dependencies{Catalog: repo})
	products, err := uc.SearchProducts(context.Background(), domain.ProductFilter{
		Query: "  iPhone  ", CategoryIDs: []string{brandApple, brandXiaomi},
		MinPriceVND: domain.MoneyVNDPtr("10000000000000000000000000000000000000"),
	})
	if err != nil || products != nil {
		t.Fatalf("unexpected result: products=%v err=%v", products, err)
	}
	if repo.listFilter.Query != "iPhone" || len(repo.listFilter.CategoryIDs) != 2 {
		t.Fatalf("filter was not normalized: %+v", repo.listFilter)
	}
}

func TestTask21_SearchProductsIgnoresNonexistentCategory(t *testing.T) {
	repo := &task21Repo{categories: []domain.Category{{ID: brandApple, Name: "Apple"}}}
	uc := New(Dependencies{Catalog: repo})
	_, err := uc.SearchProducts(context.Background(), domain.ProductFilter{CategoryIDs: []string{
		"33333333-3333-3333-3333-333333333333",
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(repo.listFilter.CategoryIDs) != 1 {
		t.Fatalf("repository should receive valid UUID for pass-through: %+v", repo.listFilter)
	}
}

func TestTask21_SearchProductsRejectsMalformedCategoryID(t *testing.T) {
	uc := New(Dependencies{Catalog: &task21Repo{}})
	_, err := uc.SearchProducts(context.Background(), domain.ProductFilter{CategoryIDs: []string{"not-a-uuid"}})
	var filterErr *domain.FilterValidationError
	if !errors.As(err, &filterErr) {
		t.Fatalf("expected filter validation error, got %v", err)
	}
}

func TestTask21_RejectsNonCanonicalMoneyAndReversedRange(t *testing.T) {
	uc := New(Dependencies{Catalog: &task21Repo{}})
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

func TestTask21_FeaturedAndDetailPreservePhoneProjection(t *testing.T) {
	now := time.Now()
	p := domain.Product{ID: phoneID, Brand: "Apple", Model: "A3294", Featured: true, Active: true, CreatedAt: now, UpdatedAt: now,
		OptionGroups: []domain.OptionGroup{{ID: "33333333-3333-3333-3333-333333333333", Label: "Color"}},
		Variants:     []domain.ProductVariant{{ID: "44444444-4444-4444-4444-444444444444", PriceVND: "999", StockQuantity: 2, Active: true}}}
	repo := &task21Repo{featured: []domain.Product{p}, detail: &p}
	uc := New(Dependencies{Catalog: repo})
	featured, err := uc.ListFeaturedProducts(context.Background())
	if err != nil || len(featured) != 1 || !featured[0].Featured {
		t.Fatalf("unexpected featured: %+v %v", featured, err)
	}
	detail, err := uc.GetProduct(context.Background(), phoneID)
	if err != nil || detail.Model != "A3294" || len(detail.Variants) != 1 || !detail.CreatedAt.Equal(now) {
		t.Fatalf("unexpected detail: %+v %v", detail, err)
	}
}

func TestTask21_FeaturedAndDetailPropagateRepositoryErrors(t *testing.T) {
	repoErr := errors.New("catalog unavailable")
	repo := &task21Repo{featuredErr: repoErr, detailErr: repoErr}
	uc := New(Dependencies{Catalog: repo})
	if _, err := uc.ListFeaturedProducts(context.Background()); !errors.Is(err, repoErr) {
		t.Fatalf("featured error = %v, want %v", err, repoErr)
	}
	if _, err := uc.GetProduct(context.Background(), phoneID); !errors.Is(err, repoErr) {
		t.Fatalf("detail error = %v, want %v", err, repoErr)
	}
}

func TestTask21_DetailNotFoundAndRepositoryErrorsRemainDomainErrors(t *testing.T) {
	repo := &task21Repo{detailErr: domain.ErrProductNotFound}
	uc := New(Dependencies{Catalog: repo})
	_, err := uc.GetProduct(context.Background(), phoneID)
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}
