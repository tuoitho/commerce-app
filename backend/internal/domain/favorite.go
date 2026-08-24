package domain

import (
	"context"
	"time"
)

type FavoriteProductSummary struct {
	ID              string
	Name            string
	Model           string
	Brand           string
	Category        Category
	MinPriceVND     MoneyVND
	MaxPriceVND     MoneyVND
	Price           string
	Currency        string
	PrimaryImageURL string
	InStock         bool
	Active          bool
	FavoritedAt     time.Time
}

type FavoritePagination struct {
	Page       int
	Limit      int
	Total      int
	TotalPages int
	HasNext    bool
	HasPrev    bool
}

type PaginatedFavorites struct {
	Items      []FavoriteProductSummary
	Pagination FavoritePagination
}

type FavoriteRepository interface {
	AddFavorite(ctx context.Context, userID, productID string) error
	RemoveFavorite(ctx context.Context, userID, productID string) error
	GetFavoriteProductIDs(ctx context.Context, userID string, productIDs []string) ([]string, error)
	ListFavorites(ctx context.Context, userID string, page, limit int) (PaginatedFavorites, error)
}
