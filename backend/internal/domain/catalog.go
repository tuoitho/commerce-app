package domain

import (
	"context"
	"time"
)

type Category struct {
	ID   string
	Name string
}

type Product struct {
	ID            string
	Name          string
	Description   string
	Category      Category
	Price         string
	Currency      string
	ImageURLs     []string
	StockQuantity int
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (p *Product) InStock() bool {
	return p.StockQuantity > 0
}

func (p *Product) PrimaryImageURL() string {
	if len(p.ImageURLs) > 0 {
		return p.ImageURLs[0]
	}
	return ""
}

type ProductFilter struct {
	Query      string
	CategoryID string
	MinPrice   string
	MaxPrice   string
	InStock    *bool
}

type CatalogRepository interface {
	ListCategories(ctx context.Context) ([]Category, error)
	ListProducts(ctx context.Context, f ProductFilter) ([]Product, error)
	GetProductByID(ctx context.Context, id string) (*Product, error)
}
