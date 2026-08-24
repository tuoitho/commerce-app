package domain

import (
	"context"
	"time"
)

type FavoriteAvailability string

const (
	FavoriteActive      FavoriteAvailability = "active"
	FavoriteUnavailable FavoriteAvailability = "unavailable"
	FavoriteDeleted     FavoriteAvailability = "deleted"
)

type FavoriteProduct struct {
	ID              string
	Name            string
	Model           string
	Brand           string
	Category        Category
	PrimaryImageURL string
	Availability    FavoriteAvailability
	MinPriceVND     *MoneyVND
	MaxPriceVND     *MoneyVND
	InStock         *bool
	FavoritedAt     time.Time
}

type FavoriteRepository interface {
	List(ctx context.Context, userID string) ([]FavoriteProduct, error)
	Add(ctx context.Context, userID, productID string) ([]FavoriteProduct, error)
	Remove(ctx context.Context, userID, productID string) ([]FavoriteProduct, error)
}
