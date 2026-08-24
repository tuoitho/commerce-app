package repository

import (
	"context"
	"math/big"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type FavoriteRepository struct {
	db Querier
	q  *sqlc.Queries
}

func NewFavoriteRepository(pool Querier) *FavoriteRepository {
	return &FavoriteRepository{
		db: pool,
		q:  sqlc.New(pool),
	}
}

func (r *FavoriteRepository) AddFavorite(ctx context.Context, userID, productID string) error {
	rowsAffected, err := r.q.AddFavorite(ctx, sqlc.AddFavoriteParams{
		UserID: userID,
		ID:     productID,
	})
	if err != nil {
		return err
	}
	if rowsAffected > 0 {
		return nil
	}

	eligible, err := r.q.IsProductEligibleForFavorite(ctx, productID)
	if err != nil {
		return err
	}
	if !eligible {
		return domain.ErrProductNotFound
	}
	return nil
}

func (r *FavoriteRepository) RemoveFavorite(ctx context.Context, userID, productID string) error {
	return r.q.DeleteFavorite(ctx, sqlc.DeleteFavoriteParams{
		UserID:    userID,
		ProductID: productID,
	})
}

func (r *FavoriteRepository) GetFavoriteProductIDs(ctx context.Context, userID string, productIDs []string) ([]string, error) {
	if len(productIDs) == 0 {
		return []string{}, nil
	}
	ids, err := r.q.GetFavoriteProductIDs(ctx, sqlc.GetFavoriteProductIDsParams{
		UserID:  userID,
		Column2: productIDs,
	})
	if err != nil {
		return nil, err
	}
	if ids == nil {
		ids = []string{}
	}
	return ids, nil
}

func (r *FavoriteRepository) ListFavorites(ctx context.Context, userID string, page, limit int) (domain.PaginatedFavorites, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 12
	}

	totalCount, err := r.q.CountFavoritesByUserID(ctx, userID)
	if err != nil {
		return domain.PaginatedFavorites{}, err
	}
	total := int(totalCount)
	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	pagination := domain.FavoritePagination{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	offset := int32((page - 1) * limit)
	if offset < 0 {
		offset = 0
	}

	rows, err := r.q.ListFavoritesByUserID(ctx, sqlc.ListFavoritesByUserIDParams{
		UserID: userID,
		Limit:  int32(limit),
		Offset: offset,
	})
	if err != nil {
		return domain.PaginatedFavorites{}, err
	}

	items := make([]domain.FavoriteProductSummary, 0, len(rows))
	for _, row := range rows {
		variants, err := r.q.ListProductVariants(ctx, row.ProductID)
		if err != nil {
			return domain.PaginatedFavorites{}, err
		}
		items = append(items, mapFavoriteProductSummary(row, variants))
	}

	return domain.PaginatedFavorites{
		Items:      items,
		Pagination: pagination,
	}, nil
}

func mapFavoriteProductSummary(row sqlc.ListFavoritesByUserIDRow, variants []sqlc.ListProductVariantsRow) domain.FavoriteProductSummary {
	var minActivePrice, maxActivePrice *big.Int
	var minAllPrice, maxAllPrice *big.Int
	var totalActiveStock int64
	hasActiveVariant := false

	for _, v := range variants {
		p, ok := new(big.Int).SetString(v.PriceVnd, 10)
		if !ok || p.Sign() < 0 {
			continue
		}
		if minAllPrice == nil || p.Cmp(minAllPrice) < 0 {
			minAllPrice = p
		}
		if maxAllPrice == nil || p.Cmp(maxAllPrice) > 0 {
			maxAllPrice = p
		}
		if v.Active {
			hasActiveVariant = true
			if minActivePrice == nil || p.Cmp(minActivePrice) < 0 {
				minActivePrice = p
			}
			if maxActivePrice == nil || p.Cmp(maxActivePrice) > 0 {
				maxActivePrice = p
			}
			totalActiveStock += v.StockQuantity
		}
	}

	currency := row.DefaultCurrency
	if currency == "" {
		currency = "VND"
	}

	isEligible := row.ProductActive && hasActiveVariant

	var minPriceVND, maxPriceVND, price string
	var inStock bool

	if isEligible {
		if minActivePrice != nil {
			minPriceVND = minActivePrice.String()
			maxPriceVND = maxActivePrice.String()
			price = minActivePrice.String()
		}
		inStock = totalActiveStock > 0
	} else {
		if minAllPrice != nil {
			minPriceVND = minAllPrice.String()
			maxPriceVND = maxAllPrice.String()
			price = minAllPrice.String()
		} else if row.DefaultPrice != "" {
			minPriceVND = row.DefaultPrice
			maxPriceVND = row.DefaultPrice
			price = row.DefaultPrice
		}
		inStock = false
	}

	return domain.FavoriteProductSummary{
		ID:              row.ProductID,
		Name:            row.Name,
		Model:           row.Model,
		Brand:           row.Brand,
		Category:        domain.Category{ID: row.CategoryID, Name: row.CategoryName},
		MinPriceVND:     domain.MoneyVND(minPriceVND),
		MaxPriceVND:     domain.MoneyVND(maxPriceVND),
		Price:           price,
		Currency:        currency,
		PrimaryImageURL: row.PrimaryImageUrl,
		InStock:         inStock,
		Active:          isEligible,
		FavoritedAt:     row.FavoritedAt,
	}
}
