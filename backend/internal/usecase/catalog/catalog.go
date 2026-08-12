package catalog

import (
	"context"
	"regexp"
	"strconv"
	"strings"

	"commerce-backend/internal/domain"
)

var (
	uuidPattern    = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	decimalPattern = regexp.MustCompile(`^(?:[0-9]+|[0-9]*\.[0-9]+)$`)
)

type Dependencies struct {
	Catalog domain.CatalogRepository
}

type UseCase struct {
	catalog domain.CatalogRepository
}

func New(deps Dependencies) *UseCase {
	return &UseCase{catalog: deps.Catalog}
}

func (uc *UseCase) ListCategories(ctx context.Context) ([]domain.Category, error) {
	return uc.catalog.ListCategories(ctx)
}

func (uc *UseCase) SearchProducts(ctx context.Context, f domain.ProductFilter) ([]domain.Product, error) {
	if err := uc.validateFilter(&f); err != nil {
		return nil, err
	}
	return uc.catalog.ListProducts(ctx, f)
}

func (uc *UseCase) GetProduct(ctx context.Context, id string) (*domain.Product, error) {
	if !uuidPattern.MatchString(id) {
		return nil, domain.ErrInvalidProductID
	}
	return uc.catalog.GetProductByID(ctx, id)
}

func (uc *UseCase) validateFilter(f *domain.ProductFilter) error {
	f.Query = strings.TrimSpace(f.Query)
	fields := map[string]string{}

	if f.CategoryID != "" && !uuidPattern.MatchString(f.CategoryID) {
		fields["category_id"] = "must be a valid category id"
	}
	if f.MinPrice != "" && !validDecimal(f.MinPrice) {
		fields["min_price"] = "must be a non-negative decimal value"
	}
	if f.MaxPrice != "" && !validDecimal(f.MaxPrice) {
		fields["max_price"] = "must be a non-negative decimal value"
	}
	if f.MinPrice != "" && f.MaxPrice != "" && validDecimal(f.MinPrice) && validDecimal(f.MaxPrice) {
		min, _ := strconv.ParseFloat(f.MinPrice, 64)
		max, _ := strconv.ParseFloat(f.MaxPrice, 64)
		if min > max {
			fields["min_price"] = "must be less than or equal to max_price"
			fields["max_price"] = "must be greater than or equal to min_price"
		}
	}
	if len(fields) > 0 {
		return domain.NewFilterValidationError(fields)
	}
	return nil
}

func validDecimal(s string) bool {
	return decimalPattern.MatchString(s)
}
