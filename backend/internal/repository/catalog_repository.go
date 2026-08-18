package repository

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type catalogDB interface {
	sqlc.DBTX
}

type txStarter interface {
	Begin(context.Context) (pgx.Tx, error)
}

type variantRow struct {
	ID            string
	PriceVnd      string
	StockQuantity int64
	Active        bool
}

type CatalogRepository struct {
	db Querier
	q  *sqlc.Queries
}

func NewCatalogRepository(pool Querier) *CatalogRepository {
	return &CatalogRepository{
		db: pool,
		q:  sqlc.New(pool),
	}
}

func (r *CatalogRepository) withTx(ctx context.Context, fn func(q *sqlc.Queries) error) error {
	if starter, ok := r.db.(txStarter); ok {
		tx, err := starter.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)
		if err := fn(sqlc.New(tx)); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	return fn(r.q)
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

func (r *CatalogRepository) ListBrands(ctx context.Context) ([]string, error) {
	rows, err := r.q.ListBrands(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, row)
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
	if len(f.Brands) > 0 {
		params.Brands = f.Brands
	}
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
		p, err := r.mapProduct(ctx, row.ID, row.Name, row.Model, row.Brand, row.Description, row.CategoryID, row.CategoryName, row.Featured, row.Active, row.CreatedAt, row.UpdatedAt, images)
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
	p, err := r.mapProduct(ctx, row.ID, row.Name, row.Model, row.Brand, row.Description, row.CategoryID, row.CategoryName, row.Featured, row.Active, row.CreatedAt, row.UpdatedAt, images)
	return &p, err
}

func (r *CatalogRepository) GetCategoryByID(ctx context.Context, id string) (*domain.Category, error) {
	row, err := r.q.GetCategoryByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &domain.Category{ID: row.ID, Name: row.Name}, nil
}

func (r *CatalogRepository) ListAdminProducts(ctx context.Context, query string) ([]domain.Product, error) {
	rows, err := r.q.ListAdminProducts(ctx, pgtype.Text{String: query, Valid: query != ""})
	if err != nil {
		return nil, err
	}
	out := make([]domain.Product, 0, len(rows))
	for _, row := range rows {
		images := []string(nil)
		if row.PrimaryImageUrl != "" {
			images = []string{row.PrimaryImageUrl}
		}
		p, err := r.mapAdminProductWithDefaults(ctx, row.ID, row.Name, row.Model, row.Brand, row.Description, row.CategoryID, row.CategoryName, row.Featured, row.Active, row.CreatedAt, row.UpdatedAt, images, row.Price, row.Currency, row.StockQuantity)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

func (r *CatalogRepository) GetAdminProductByID(ctx context.Context, id string) (*domain.Product, error) {
	row, err := r.q.GetAdminProductByID(ctx, id)
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
	p, err := r.mapAdminProductWithDefaults(ctx, row.ID, row.Name, row.Model, row.Brand, row.Description, row.CategoryID, row.CategoryName, row.Featured, row.Active, row.CreatedAt, row.UpdatedAt, images, row.Price, row.Currency, row.StockQuantity)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *CatalogRepository) CreateProduct(ctx context.Context, input domain.SaveProductInput) (*domain.Product, error) {
	currency := input.Currency
	if currency == "" {
		currency = "VND"
	}
	price := input.Price
	stockQuantity := input.StockQuantity

	if input.HasVariants && len(input.OptionGroups) > 0 {
		minP, _, totalStock, err := computeVariantTotals(input.Variants)
		if err != nil {
			return nil, err
		}
		price = minP
		stockQuantity = totalStock
	}

	var productID string

	err := r.withTx(ctx, func(q *sqlc.Queries) error {
		row, err := q.CreateProduct(ctx, sqlc.CreateProductParams{
			CategoryID:    input.CategoryID,
			Name:          input.Name,
			Description:   input.Description,
			Price:         toNumeric(price),
			Currency:      currency,
			StockQuantity: stockQuantity,
			Model:         input.Model,
			Brand:         input.Brand,
			Featured:      input.Featured,
		})
		if err != nil {
			return err
		}
		productID = row.ID

		for i, url := range input.ImageURLs {
			if err := q.CreateProductImage(ctx, sqlc.CreateProductImageParams{
				ProductID: row.ID,
				Url:       url,
				Position:  int32(i),
			}); err != nil {
				return err
			}
		}

		if input.HasVariants && len(input.OptionGroups) > 0 {
			for _, group := range input.OptionGroups {
				groupID := group.ID
				if groupID == "" {
					groupID = uuid.New().String()
				}
				if err := q.CreateProductOptionGroup(ctx, sqlc.CreateProductOptionGroupParams{
					ID:        groupID,
					ProductID: row.ID,
					Label:     group.Label,
					Position:  int32(group.Position),
				}); err != nil {
					return err
				}
				for _, val := range group.Values {
					valID := val.ID
					if valID == "" {
						valID = uuid.New().String()
					}
					if err := q.CreateProductOptionValue(ctx, sqlc.CreateProductOptionValueParams{
						ID:        valID,
						ProductID: row.ID,
						GroupID:   groupID,
						Label:     val.Label,
						Position:  int32(val.Position),
					}); err != nil {
						return err
					}
				}
			}

			for _, v := range input.Variants {
				variantID := v.ID
				if variantID == "" {
					variantID = uuid.New().String()
				}
				if err := q.CreateProductVariant(ctx, sqlc.CreateProductVariantParams{
					ID:            variantID,
					ProductID:     row.ID,
					PriceVnd:      toNumeric(v.PriceVND),
					StockQuantity: v.StockQuantity,
					Active:        v.Active,
				}); err != nil {
					return err
				}
				for groupID, valID := range v.OptionValueIDs {
					if err := q.CreateVariantOptionValue(ctx, sqlc.CreateVariantOptionValueParams{
						VariantID:     variantID,
						ProductID:     row.ID,
						GroupID:       groupID,
						OptionValueID: valID,
					}); err != nil {
						return err
					}
				}
			}
		} else {
			baseVariantID := uuid.New().String()
			if err := q.CreateProductVariant(ctx, sqlc.CreateProductVariantParams{
				ID:            baseVariantID,
				ProductID:     row.ID,
				PriceVnd:      toNumeric(price),
				StockQuantity: stockQuantity,
				Active:        true,
			}); err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return r.GetAdminProductByID(ctx, productID)
}

func (r *CatalogRepository) UpdateProduct(ctx context.Context, id string, input domain.SaveProductInput) (*domain.Product, error) {
	currency := input.Currency
	if currency == "" {
		currency = "VND"
	}
	price := input.Price
	stockQuantity := input.StockQuantity

	if input.HasVariants && len(input.OptionGroups) > 0 {
		minP, _, totalStock, err := computeVariantTotals(input.Variants)
		if err != nil {
			return nil, err
		}
		price = minP
		stockQuantity = totalStock
	}

	err := r.withTx(ctx, func(q *sqlc.Queries) error {
		_, err := q.UpdateProduct(ctx, sqlc.UpdateProductParams{
			ID:            id,
			CategoryID:    input.CategoryID,
			Name:          input.Name,
			Description:   input.Description,
			Price:         toNumeric(price),
			Currency:      currency,
			StockQuantity: stockQuantity,
			Model:         input.Model,
			Brand:         input.Brand,
			Featured:      input.Featured,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.ErrProductNotFound
			}
			return err
		}

		if err := q.DeleteProductImages(ctx, id); err != nil {
			return err
		}
		for i, url := range input.ImageURLs {
			if err := q.CreateProductImage(ctx, sqlc.CreateProductImageParams{
				ProductID: id,
				Url:       url,
				Position:  int32(i),
			}); err != nil {
				return err
			}
		}

		if !input.HasVariants || len(input.OptionGroups) == 0 {
			if err := q.DeleteVariantOptionValues(ctx, id); err != nil {
				return err
			}
			if err := q.SoftDeleteProductVariants(ctx, id); err != nil {
				return err
			}
			if err := q.DeleteProductOptionValues(ctx, id); err != nil {
				return err
			}
			if err := q.DeleteProductOptionGroups(ctx, id); err != nil {
				return err
			}
			if err := q.UpdateProductPriceAndStock(ctx, sqlc.UpdateProductPriceAndStockParams{
				ID:            id,
				Price:         toNumeric(input.Price),
				StockQuantity: input.StockQuantity,
			}); err != nil {
				return err
			}
			baseVariantID := uuid.New().String()
			if err := q.CreateProductVariant(ctx, sqlc.CreateProductVariantParams{
				ID:            baseVariantID,
				ProductID:     id,
				PriceVnd:      toNumeric(input.Price),
				StockQuantity: input.StockQuantity,
				Active:        true,
			}); err != nil {
				return err
			}
		} else {
			if err := q.DeleteVariantOptionValues(ctx, id); err != nil {
				return err
			}
			if err := q.DeleteProductOptionValues(ctx, id); err != nil {
				return err
			}
			if err := q.DeleteProductOptionGroups(ctx, id); err != nil {
				return err
			}

			existingVariants, err := q.ListProductVariants(ctx, id)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			existingMap := make(map[string]bool, len(existingVariants))
			for _, ev := range existingVariants {
				existingMap[ev.ID] = true
			}
			incomingMap := make(map[string]bool, len(input.Variants))
			for _, v := range input.Variants {
				if v.ID != "" {
					incomingMap[v.ID] = true
				}
			}

			for _, ev := range existingVariants {
				if !incomingMap[ev.ID] {
					if err := q.SoftDeleteProductVariant(ctx, sqlc.SoftDeleteProductVariantParams{
						ID:        ev.ID,
						ProductID: id,
					}); err != nil {
						return err
					}
				}
			}

			for i, v := range input.Variants {
				variantID := v.ID
				if variantID == "" {
					variantID = uuid.New().String()
					input.Variants[i].ID = variantID
				}
				if existingMap[variantID] {
					if err := q.UpdateProductVariant(ctx, sqlc.UpdateProductVariantParams{
						ID:            variantID,
						ProductID:     id,
						PriceVnd:      toNumeric(v.PriceVND),
						StockQuantity: v.StockQuantity,
						Active:        v.Active,
					}); err != nil {
						return err
					}
				} else {
					if err := q.CreateProductVariant(ctx, sqlc.CreateProductVariantParams{
						ID:            variantID,
						ProductID:     id,
						PriceVnd:      toNumeric(v.PriceVND),
						StockQuantity: v.StockQuantity,
						Active:        v.Active,
					}); err != nil {
						return err
					}
				}
			}

			for _, group := range input.OptionGroups {
				groupID := group.ID
				if groupID == "" {
					groupID = uuid.New().String()
				}
				if err := q.CreateProductOptionGroup(ctx, sqlc.CreateProductOptionGroupParams{
					ID:        groupID,
					ProductID: id,
					Label:     group.Label,
					Position:  int32(group.Position),
				}); err != nil {
					return err
				}
				for _, val := range group.Values {
					valID := val.ID
					if valID == "" {
						valID = uuid.New().String()
					}
					if err := q.CreateProductOptionValue(ctx, sqlc.CreateProductOptionValueParams{
						ID:        valID,
						ProductID: id,
						GroupID:   groupID,
						Label:     val.Label,
						Position:  int32(val.Position),
					}); err != nil {
						return err
					}
				}
			}

			for _, v := range input.Variants {
				for groupID, valID := range v.OptionValueIDs {
					if err := q.CreateVariantOptionValue(ctx, sqlc.CreateVariantOptionValueParams{
						VariantID:     v.ID,
						ProductID:     id,
						GroupID:       groupID,
						OptionValueID: valID,
					}); err != nil {
						return err
					}
				}
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return r.GetAdminProductByID(ctx, id)
}

func (r *CatalogRepository) DeleteProduct(ctx context.Context, id string) error {
	_, err := r.q.SoftDeleteProduct(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrProductNotFound
		}
		return err
	}
	return nil
}

func (r *CatalogRepository) mapProduct(ctx context.Context, id, name, model, brand, description, categoryID, categoryName string, featured, active bool, createdAt, updatedAt time.Time, images []string) (domain.Product, error) {
	return r.mapProductWithDefaults(ctx, id, name, model, brand, description, categoryID, categoryName, featured, active, createdAt, updatedAt, images, "", "VND", 0)
}

func (r *CatalogRepository) mapProductWithDefaults(ctx context.Context, id, name, model, brand, description, categoryID, categoryName string, featured, active bool, createdAt, updatedAt time.Time, images []string, defaultPrice, defaultCurrency string, defaultStock int64) (domain.Product, error) {
	groups, err := r.q.ListProductOptionGroups(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}
	values, err := r.q.ListProductOptionValues(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}
	activeVariants, err := r.q.ListActiveProductVariants(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}
	links, err := r.q.ListVariantOptionValues(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}

	rows := make([]variantRow, len(activeVariants))
	for i, v := range activeVariants {
		rows[i] = variantRow{
			ID:            v.ID,
			PriceVnd:      v.PriceVnd,
			StockQuantity: v.StockQuantity,
			Active:        v.Active,
		}
	}

	return assembleProduct(id, name, model, brand, description, categoryID, categoryName, featured, active, createdAt, updatedAt, images, groups, values, rows, links, defaultPrice, defaultCurrency, defaultStock)
}

func (r *CatalogRepository) mapAdminProductWithDefaults(ctx context.Context, id, name, model, brand, description, categoryID, categoryName string, featured, active bool, createdAt, updatedAt time.Time, images []string, defaultPrice, defaultCurrency string, defaultStock int64) (domain.Product, error) {
	groups, err := r.q.ListProductOptionGroups(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}
	values, err := r.q.ListProductOptionValues(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}
	allVariants, err := r.q.ListProductVariants(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}
	links, err := r.q.ListVariantOptionValues(ctx, id)
	if err != nil {
		return domain.Product{}, err
	}

	rows := make([]variantRow, len(allVariants))
	for i, v := range allVariants {
		rows[i] = variantRow{
			ID:            v.ID,
			PriceVnd:      v.PriceVnd,
			StockQuantity: v.StockQuantity,
			Active:        v.Active,
		}
	}

	return assembleProduct(id, name, model, brand, description, categoryID, categoryName, featured, active, createdAt, updatedAt, images, groups, values, rows, links, defaultPrice, defaultCurrency, defaultStock)
}

func assembleProduct(id, name, model, brand, description, categoryID, categoryName string, featured, active bool, createdAt, updatedAt time.Time, images []string, groups []sqlc.ListProductOptionGroupsRow, values []sqlc.ListProductOptionValuesRow, variants []variantRow, links []sqlc.ListVariantOptionValuesRow, defaultPrice, defaultCurrency string, defaultStock int64) (domain.Product, error) {
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
	var minActivePrice, maxActivePrice *big.Int
	var minAllPrice, maxAllPrice *big.Int
	var totalActiveStock int64

	for _, variant := range variants {
		if len(optionGroups) == 0 && !variant.Active && defaultPrice != "" {
			continue
		}
		price, ok := new(big.Int).SetString(variant.PriceVnd, 10)
		if !ok || price.Sign() < 0 {
			return domain.Product{}, fmt.Errorf("invalid VND price %q", variant.PriceVnd)
		}
		if minAllPrice == nil || price.Cmp(minAllPrice) < 0 {
			minAllPrice = price
		}
		if maxAllPrice == nil || price.Cmp(maxAllPrice) > 0 {
			maxAllPrice = price
		}
		if variant.Active {
			if minActivePrice == nil || price.Cmp(minActivePrice) < 0 {
				minActivePrice = price
			}
			if maxActivePrice == nil || price.Cmp(maxActivePrice) > 0 {
				maxActivePrice = price
			}
			totalActiveStock += variant.StockQuantity
		}
		mappedVariants = append(mappedVariants, domain.ProductVariant{
			ID:             variant.ID,
			OptionValueIDs: optionIDs[variant.ID],
			PriceVND:       domain.MoneyVND(variant.PriceVnd),
			StockQuantity:  variant.StockQuantity,
			Active:         variant.Active,
		})
	}

	product := domain.Product{
		ID:            id,
		Name:          name,
		Model:         model,
		Brand:         brand,
		Description:   description,
		Category:      domain.Category{ID: categoryID, Name: categoryName},
		Featured:      featured,
		Active:        active,
		OptionGroups:  optionGroups,
		Variants:      mappedVariants,
		ImageURLs:     images,
		CreatedAt:     createdAt,
		UpdatedAt:     updatedAt,
		Currency:      defaultCurrency,
		StockQuantity: defaultStock,
		Price:         defaultPrice,
	}
	if product.Currency == "" {
		product.Currency = "VND"
	}

	if len(mappedVariants) > 0 {
		if minActivePrice != nil {
			product.MinPriceVND = domain.MoneyVND(minActivePrice.String())
			product.MaxPriceVND = domain.MoneyVND(maxActivePrice.String())
			product.Price = minActivePrice.String()
			product.StockQuantity = totalActiveStock
		} else if minAllPrice != nil {
			product.MinPriceVND = domain.MoneyVND(minAllPrice.String())
			product.MaxPriceVND = domain.MoneyVND(maxAllPrice.String())
			product.Price = minAllPrice.String()
			product.StockQuantity = 0
		}
	} else if defaultPrice != "" {
		product.MinPriceVND = domain.MoneyVND(defaultPrice)
		product.MaxPriceVND = domain.MoneyVND(defaultPrice)
	}
	return product, nil
}

func computeVariantTotals(variants []domain.VariantInput) (minPrice string, maxPrice string, totalStock int64, err error) {
	var minActive, maxActive *big.Int
	var minAll, maxAll *big.Int
	var activeStock int64

	for _, v := range variants {
		priceStr := v.PriceVND
		if priceStr == "" {
			return "", "", 0, fmt.Errorf("variant price cannot be empty")
		}
		p, ok := new(big.Int).SetString(priceStr, 10)
		if !ok || p.Sign() < 0 {
			return "", "", 0, fmt.Errorf("invalid VND price %q", priceStr)
		}
		if minAll == nil || p.Cmp(minAll) < 0 {
			minAll = p
		}
		if maxAll == nil || p.Cmp(maxAll) > 0 {
			maxAll = p
		}
		if v.Active {
			if minActive == nil || p.Cmp(minActive) < 0 {
				minActive = p
			}
			if maxActive == nil || p.Cmp(maxActive) > 0 {
				maxActive = p
			}
			activeStock += v.StockQuantity
		}
	}

	if minActive != nil {
		return minActive.String(), maxActive.String(), activeStock, nil
	}
	if minAll != nil {
		return minAll.String(), maxAll.String(), 0, nil
	}
	return "0", "0", 0, nil
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

var _ domain.CatalogRepository = (*CatalogRepository)(nil)
