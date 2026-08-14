package catalog

import (
	"context"
	"math/big"
	"regexp"
	"strconv"
	"strings"

	"commerce-backend/internal/domain"
)

var (
	uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
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

func (uc *UseCase) ListFeaturedProducts(ctx context.Context) ([]domain.Product, error) {
	return uc.catalog.ListFeaturedProducts(ctx)
}

func (uc *UseCase) GetProduct(ctx context.Context, id string) (*domain.Product, error) {
	if !uuidPattern.MatchString(id) {
		return nil, domain.ErrInvalidProductID
	}
	return uc.catalog.GetProductByID(ctx, id)
}

func (uc *UseCase) validateFilter(f *domain.ProductFilter) error {
	f.Query = strings.TrimSpace(f.Query)
	if f.CategoryID != "" && len(f.CategoryIDs) == 0 {
		f.CategoryIDs = []string{f.CategoryID}
	}
	for i := range f.CategoryIDs {
		f.CategoryIDs[i] = strings.TrimSpace(f.CategoryIDs[i])
	}
	fields := map[string]string{}

	for _, id := range f.CategoryIDs {
		if !uuidPattern.MatchString(id) {
			fields["category_id"] = "must be a valid category id"
		}
	}
	if f.MinPriceVND != nil && !validMoney(string(*f.MinPriceVND)) {
		fields["min_price"] = "must be a canonical non-negative VND integer"
	}
	if f.MaxPriceVND != nil && !validMoney(string(*f.MaxPriceVND)) {
		fields["max_price"] = "must be a canonical non-negative VND integer"
	}
	if f.MinPriceVND != nil && f.MaxPriceVND != nil && validMoney(string(*f.MinPriceVND)) && validMoney(string(*f.MaxPriceVND)) {
		min, _ := new(big.Int).SetString(string(*f.MinPriceVND), 10)
		max, _ := new(big.Int).SetString(string(*f.MaxPriceVND), 10)
		if min.Cmp(max) > 0 {
			fields["min_price"] = "must be less than or equal to max_price"
			fields["max_price"] = "must be greater than or equal to min_price"
		}
	}
	if f.MinPrice != "" && !validLegacyDecimal(f.MinPrice) {
		fields["min_price"] = "must be a non-negative decimal value"
	}
	if f.MaxPrice != "" && !validLegacyDecimal(f.MaxPrice) {
		fields["max_price"] = "must be a non-negative decimal value"
	}
	if f.MinPrice != "" && f.MaxPrice != "" && validLegacyDecimal(f.MinPrice) && validLegacyDecimal(f.MaxPrice) {
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

func validMoney(s string) bool {
	return len(s) <= 38 && domain.MoneyVND(s).IsCanonical()
}

func validLegacyDecimal(s string) bool {
	return strings.TrimSpace(s) != "" && regexp.MustCompile(`^(?:[0-9]+|[0-9]*\.[0-9]+)$`).MatchString(s)
}
