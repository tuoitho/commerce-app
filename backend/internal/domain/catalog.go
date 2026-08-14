package domain

import (
	"context"
	"time"
)

type Category struct {
	ID   string
	Name string
}

type MoneyVND string

type OptionValue struct {
	ID    string
	Label string
}

type OptionGroup struct {
	ID       string
	Label    string
	Position int
	Values   []OptionValue
}

type ProductVariant struct {
	ID             string
	OptionValueIDs map[string]string
	PriceVND       MoneyVND
	StockQuantity  int64
	Active         bool
}

type Product struct {
	ID            string
	Name          string
	Description   string
	Category      Category
	Brand         Category
	Model         string
	Featured      bool
	Active        bool
	OptionGroups  []OptionGroup
	Variants      []ProductVariant
	MinPriceVND   MoneyVND
	MaxPriceVND   MoneyVND
	Price         string
	Currency      string
	ImageURLs     []string
	StockQuantity int64
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (p *Product) InStock() bool {
	if len(p.Variants) > 0 {
		for _, variant := range p.Variants {
			if variant.Active && variant.StockQuantity > 0 {
				return true
			}
		}
		return false
	}
	return p.StockQuantity > 0
}

func (p *Product) PrimaryImageURL() string {
	if len(p.ImageURLs) > 0 {
		return p.ImageURLs[0]
	}
	return ""
}

type ProductFilter struct {
	Query       string
	CategoryIDs []string
	CategoryID  string
	MinPriceVND *MoneyVND
	MaxPriceVND *MoneyVND
	MinPrice    string
	MaxPrice    string
	InStock     *bool
	Featured    *bool
}

type CatalogRepository interface {
	ListCategories(ctx context.Context) ([]Category, error)
	ListProducts(ctx context.Context, f ProductFilter) ([]Product, error)
	ListFeaturedProducts(ctx context.Context) ([]Product, error)
	GetProductByID(ctx context.Context, id string) (*Product, error)
}
