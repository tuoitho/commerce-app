package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type favoriteDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type FavoriteRepository struct {
	db favoriteDB
}

func NewFavoriteRepository(db favoriteDB) *FavoriteRepository {
	return &FavoriteRepository{db: db}
}

var _ domain.FavoriteRepository = (*FavoriteRepository)(nil)

func (r *FavoriteRepository) List(ctx context.Context, userID string) ([]domain.FavoriteProduct, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrNotFound
	}
	q := sqlc.New(r.db)
	rows, err := q.ListFavorites(ctx, userID)
	if err != nil {
		return nil, err
	}
	items := make([]domain.FavoriteProduct, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapFavoriteRow(row))
	}
	return items, nil
}

func (r *FavoriteRepository) Add(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrNotFound
	}
	if _, err := uuid.Parse(productID); err != nil {
		return nil, domain.ErrProductNotFound
	}

	return r.transaction(ctx, userID, func(q *sqlc.Queries) error {
		rowsAffected, err := q.AddFavoriteIfPublic(ctx, sqlc.AddFavoriteIfPublicParams{
			UserID:    userID,
			ProductID: productID,
		})
		if err != nil {
			return err
		}
		if rowsAffected > 0 {
			return nil
		}

		// If 0 rows were inserted, check if already favorited (idempotent 200)
		// or if product is non-public / missing (404)
		_, err = q.IsProductFavorited(ctx, sqlc.IsProductFavoritedParams{
			UserID:    userID,
			ProductID: productID,
		})
		if err == nil {
			return nil
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrProductNotFound
		}
		return err
	})
}

func (r *FavoriteRepository) Remove(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrNotFound
	}
	if _, err := uuid.Parse(productID); err != nil {
		return r.List(ctx, userID)
	}

	return r.transaction(ctx, userID, func(q *sqlc.Queries) error {
		return q.DeleteFavorite(ctx, sqlc.DeleteFavoriteParams{
			UserID:    userID,
			ProductID: productID,
		})
	})
}

func (r *FavoriteRepository) transaction(ctx context.Context, userID string, mutate func(*sqlc.Queries) error) ([]domain.FavoriteProduct, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	if err := mutate(q); err != nil {
		return nil, err
	}

	rows, err := q.ListFavorites(ctx, userID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	items := make([]domain.FavoriteProduct, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapFavoriteRow(row))
	}

	return items, nil
}

func mapFavoriteRow(row sqlc.ListFavoritesRow) domain.FavoriteProduct {
	fav := domain.FavoriteProduct{
		ID:              row.ProductID,
		Name:            row.ProductName,
		Model:           row.ProductModel,
		Brand:           row.ProductBrand,
		Category:        domain.Category{ID: row.CategoryID, Name: row.CategoryName},
		PrimaryImageURL: row.PrimaryImageUrl,
		FavoritedAt:     row.FavoritedAt,
	}

	if !row.ProductActive {
		fav.Availability = domain.FavoriteDeleted
		return fav
	}

	if row.ActiveVariantCount == 0 {
		fav.Availability = domain.FavoriteUnavailable
		return fav
	}

	fav.Availability = domain.FavoriteActive
	minP := domain.MoneyVND(row.MinPriceVnd)
	maxP := domain.MoneyVND(row.MaxPriceVnd)
	fav.MinPriceVND = &minP
	fav.MaxPriceVND = &maxP
	inStock := row.HasActiveStock
	fav.InStock = &inStock

	return fav
}
