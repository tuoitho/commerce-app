package domain

import (
	"context"
	"io"
	"regexp"
	"time"
)

const (
	MaxProductSpecGroups        = 12
	MaxProductSpecItemsPerGroup = 20
	MaxProductSpecGroupLen      = 80
	MaxProductSpecLabelLen      = 80
	MaxProductSpecValueLen      = 300
	MaxProductImageBytes        int64 = 10 * 1024 * 1024 // 10 MB
	MaxProductImageRequestBytes int64 = 11 * 1024 * 1024 // 11 MB multipart ceiling
)

var ProductImageKeyRegex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$`)

type SpecItem struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type SpecGroup struct {
	Group string     `json:"group"`
	Items []SpecItem `json:"items"`
}

type VariantFlashSale struct {
	FlashSaleID   string    `json:"flashSaleId"`
	CampaignName  string    `json:"campaignName"`
	FlashPriceVND MoneyVND  `json:"flashPriceVnd"`
	Quota         int       `json:"quota"`
	SoldQuantity  int       `json:"soldQuantity"`
	EndsAt        time.Time `json:"endsAt"`
}

type ProductSort string

const (
	ProductSortDefault     ProductSort = ""
	ProductSortBestselling ProductSort = "bestselling"
	ProductSortNewest      ProductSort = "newest"
	ProductSortPriceAsc    ProductSort = "price_asc"
	ProductSortPriceDesc   ProductSort = "price_desc"
	ProductSortRatingDesc  ProductSort = "rating_desc"
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
	// LivePriceVND is the live-session price in effect, if any; PriceVND stays
	// the regular price.
	LivePriceVND *MoneyVND
	// LiveRemaining is the live-price quota left, nil when unlimited or no live price.
	LiveRemaining *int
	// FlashSale is the currently running Flash Sale campaign metadata for this variant, if any.
	FlashSale *VariantFlashSale
}

type Product struct {
	ID            string
	Name          string
	Description   string
	Category      Category
	Brand         string
	Model         string
	Featured      bool
	Active        bool
	Specs         []SpecGroup
	OptionGroups  []OptionGroup
	Variants      []ProductVariant
	MinPriceVND   MoneyVND
	MaxPriceVND   MoneyVND
	Price         string
	Currency      string
	ImageURLs     []string
	StockQuantity int64
	AverageRating float64
	ReviewCount   int64
	SoldCount     int64
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
	Brands      []string
	MinPriceVND *MoneyVND
	MaxPriceVND *MoneyVND
	MinPrice    string
	MaxPrice    string
	InStock     *bool
	Featured    *bool
	Sort        ProductSort
	MinRating   *float64
}

type OptionValueInput struct {
	ID       string
	Label    string
	Position int
}

type OptionGroupInput struct {
	ID       string
	Label    string
	Position int
	Values   []OptionValueInput
}

type VariantInput struct {
	ID             string
	OptionValueIDs map[string]string
	PriceVND       string
	StockQuantity  int64
	Active         bool
}

type SaveProductInput struct {
	Name          string
	Model         string
	Brand         string
	Description   string
	CategoryID    string
	Price         string
	Currency      string
	StockQuantity int64
	Featured      bool
	ImageURLs     []string
	Specs         []SpecGroup
	HasVariants   bool
	OptionGroups  []OptionGroupInput
	Variants      []VariantInput
}

type UploadProductImageInput struct {
	Reader              io.Reader
	Size                int64
	DeclaredContentType string
}

type UploadedProductImage struct {
	Key       string `json:"key"`
	URL       string `json:"url"`
	MimeType  string `json:"mimeType"`
	SizeBytes int64  `json:"sizeBytes"`
}

type CatalogRepository interface {
	CategoryAdminRepository
	ListCategories(ctx context.Context) ([]Category, error)
	ListBrands(ctx context.Context) ([]string, error)
	ListProducts(ctx context.Context, f ProductFilter) ([]Product, error)
	ListFeaturedProducts(ctx context.Context) ([]Product, error)
	GetProductByID(ctx context.Context, id string) (*Product, error)

	ListAdminProducts(ctx context.Context, query string) ([]Product, error)
	GetAdminProductByID(ctx context.Context, id string) (*Product, error)
	CreateProduct(ctx context.Context, input SaveProductInput) (*Product, error)
	UpdateProduct(ctx context.Context, id string, input SaveProductInput) (*Product, error)
	DeleteProduct(ctx context.Context, id string) error
	GetCategoryByID(ctx context.Context, id string) (*Category, error)
}

type CategoryAdminRepository interface {
	ListAdminCategories(ctx context.Context) ([]Category, error)
	CreateCategory(ctx context.Context, name string) (*Category, error)
	UpdateCategory(ctx context.Context, id, name string) (*Category, error)
	DeleteCategory(ctx context.Context, id string) (*Category, error)
}
