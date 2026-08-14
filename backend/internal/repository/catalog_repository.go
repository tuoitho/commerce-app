package repository

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type CatalogRepository struct {
	q *sqlc.Queries
}

func NewCatalogRepository(pool Querier) *CatalogRepository {
	return &CatalogRepository{q: sqlc.New(pool)}
}

func (r *CatalogRepository) ListCategories(ctx context.Context) ([]domain.Category, error) {
	rows, err := r.q.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Category, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Category{ID: row.ID, Name: row.Name})
	}
	return out, nil
}

func (r *CatalogRepository) ListProducts(ctx context.Context, f domain.ProductFilter) ([]domain.Product, error) {
	if err := validateProductPriceFilter(f); err != nil {
		return nil, err
	}
	params := sqlc.ListProductsParams{
		Q:           pgtype.Text{String: f.Query, Valid: f.Query != ""},
		MinPriceVnd: toNumeric(moneyString(f.MinPriceVND)),
		MaxPriceVnd: toNumeric(moneyString(f.MaxPriceVND)),
	}
	categoryIDs := f.CategoryIDs
	if len(categoryIDs) == 0 && f.CategoryID != "" {
		categoryIDs = []string{f.CategoryID}
	}
	params.CategoryIds = categoryIDs
	if f.InStock != nil {
		params.InStock = pgtype.Bool{Bool: *f.InStock, Valid: true}
	}
	if f.Featured != nil {
		params.Featured = pgtype.Bool{Bool: *f.Featured, Valid: true}
	}

	rows, err := r.q.ListProducts(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Product, 0, len(rows))
	for _, row := range rows {
		images := []string(nil)
		if row.PrimaryImageUrl != "" {
			images = []string{row.PrimaryImageUrl}
		}
		p, err := r.mapProduct(ctx, row.ID, row.Name, row.Model, row.Description, row.CategoryID, row.CategoryName, row.Featured, row.Active, row.CreatedAt, row.UpdatedAt, images)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

func (r *CatalogRepository) ListFeaturedProducts(ctx context.Context) ([]domain.Product, error) {
	featured := true
	return r.ListProducts(ctx, domain.ProductFilter{Featured: &featured})
}

func (r *CatalogRepository) GetProductByID(ctx context.Context, id string) (*domain.Product, error) {
	row, err := r.q.GetProductByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrProductNotFound
		}
		return nil, err
	}
	images, err := r.q.ListProductImages(ctx, id)
	if err != nil {
		return nil, err
	}
	p, err := r.mapProduct(ctx, row.ID, row.Name, row.Model, row.Description, row.CategoryID, row.CategoryName, row.Featured, row.Active, row.CreatedAt, row.UpdatedAt, images)
	return &p, err
}

func (r *CatalogRepository) mapProduct(ctx context.Context, id, name, model, description, categoryID, categoryName string, featured, active bool, createdAt, updatedAt time.Time, images []string) (domain.Product, error) {
	groups, err := r.q.ListProductOptionGroups(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}
	values, err := r.q.ListProductOptionValues(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}
	variants, err := r.q.ListActiveProductVariants(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}
	links, err := r.q.ListVariantOptionValues(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}

	return assembleProduct(id, name, model, description, categoryID, categoryName, featured, active, createdAt, updatedAt, images, groups, values, variants, links)
}

func assembleProduct(id, name, model, description, categoryID, categoryName string, featured, active bool, createdAt, updatedAt time.Time, images []string, groups []sqlc.ListProductOptionGroupsRow, values []sqlc.ListProductOptionValuesRow, variants []sqlc.ListActiveProductVariantsRow, links []sqlc.ListVariantOptionValuesRow) (domain.Product, error) {
	optionGroups := make([]domain.OptionGroup, 0, len(groups))
	for _, group := range groups {
		mapped := domain.OptionGroup{ID: group.ID, Label: group.Label, Position: int(group.Position)}
		for _, value := range values {
			if value.GroupID == group.ID {
				mapped.Values = append(mapped.Values, domain.OptionValue{ID: value.ID, Label: value.Label})
			}
		}
		optionGroups = append(optionGroups, mapped)
	}
	optionIDs := make(map[string]map[string]string, len(variants))
	for _, link := range links {
		if optionIDs[link.VariantID] == nil {
			optionIDs[link.VariantID] = map[string]string{}
		}
		optionIDs[link.VariantID][link.GroupID] = link.OptionValueID
	}
	mappedVariants := make([]domain.ProductVariant, 0, len(variants))
	var minPrice, maxPrice *big.Int
	for _, variant := range variants {
		price, ok := new(big.Int).SetString(variant.PriceVnd, 10)
		if !ok || price.Sign() < 0 {
			return domain.Product{}, fmt.Errorf("invalid VND price %q", variant.PriceVnd)
		}
		if minPrice == nil || price.Cmp(minPrice) < 0 {
			minPrice = price
		}
		if maxPrice == nil || price.Cmp(maxPrice) > 0 {
			maxPrice = price
		}
		mappedVariants = append(mappedVariants, domain.ProductVariant{ID: variant.ID, OptionValueIDs: optionIDs[variant.ID], PriceVND: domain.MoneyVND(variant.PriceVnd), StockQuantity: variant.StockQuantity, Active: variant.Active})
	}
	product := domain.Product{ID: id, Name: name, Model: model, Description: description, Category: domain.Category{ID: categoryID, Name: categoryName}, Brand: domain.Category{ID: categoryID, Name: categoryName}, Featured: featured, Active: active, OptionGroups: optionGroups, Variants: mappedVariants, ImageURLs: images, CreatedAt: createdAt, UpdatedAt: updatedAt, Currency: "VND"}
	if minPrice != nil {
		product.MinPriceVND = domain.MoneyVND(minPrice.String())
		product.MaxPriceVND = domain.MoneyVND(maxPrice.String())
		product.Price = minPrice.String()
	}
	return product, nil
}

func toNumeric(s string) pgtype.Numeric {
	if s == "" {
		return pgtype.Numeric{}
	}
	var n pgtype.Numeric
	if err := n.Scan(s); err != nil {
		return pgtype.Numeric{}
	}
	return n
}

func moneyString(value *domain.MoneyVND) string {
	if value == nil {
		return ""
	}
	return string(*value)
}

func validateProductPriceFilter(f domain.ProductFilter) error {
	fields := map[string]string{}
	if f.MinPrice != "" {
		fields["min_price"] = "legacy price bounds are not supported; use min_price as a canonical VND value"
	}
	if f.MaxPrice != "" {
		fields["max_price"] = "legacy price bounds are not supported; use max_price as a canonical VND value"
	}
	for field, value := range map[string]*domain.MoneyVND{
		"min_price": f.MinPriceVND,
		"max_price": f.MaxPriceVND,
	} {
		if value != nil && (len(*value) > 38 || !value.IsCanonical()) {
			fields[field] = "must be a canonical non-negative VND integer"
		}
	}
	if len(fields) > 0 {
		return domain.NewFilterValidationError(fields)
	}
	return nil
}
