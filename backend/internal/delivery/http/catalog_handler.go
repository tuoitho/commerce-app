package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	cataloguc "commerce-backend/internal/usecase/catalog"
)

type catalogHandler struct {
	uc *cataloguc.UseCase
}

func newCatalogHandler(uc *cataloguc.UseCase) *catalogHandler {
	return &catalogHandler{uc: uc}
}

type categoryResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type productSummaryResponse struct {
	ID              string           `json:"id"`
	Name            string           `json:"name"`
	Category        categoryResponse `json:"category"`
	Price           string           `json:"price"`
	Currency        string           `json:"currency"`
	PrimaryImageURL string           `json:"primaryImageUrl"`
	InStock         bool             `json:"inStock"`
}

type productDetailResponse struct {
	ID            string           `json:"id"`
	Name          string           `json:"name"`
	Description   string           `json:"description"`
	Category      categoryResponse `json:"category"`
	Price         string           `json:"price"`
	Currency      string           `json:"currency"`
	ImageURLs     []string         `json:"imageUrls"`
	StockQuantity int              `json:"stockQuantity"`
	InStock       bool             `json:"inStock"`
	CreatedAt     time.Time        `json:"createdAt"`
	UpdatedAt     time.Time        `json:"updatedAt"`
}

func (h *catalogHandler) ListCategories(c *gin.Context) {
	categories, err := h.uc.ListCategories(c)
	if err != nil {
		writeError(c, err)
		return
	}
	out := make([]categoryResponse, 0, len(categories))
	for _, cat := range categories {
		out = append(out, categoryResponse{ID: cat.ID, Name: cat.Name})
	}
	c.JSON(http.StatusOK, gin.H{"categories": out})
}

func (h *catalogHandler) ListProducts(c *gin.Context) {
	filter := domain.ProductFilter{
		Query:      c.Query("q"),
		CategoryID: c.Query("category_id"),
		MinPrice:   c.Query("min_price"),
		MaxPrice:   c.Query("max_price"),
	}
	if raw, ok := c.GetQuery("in_stock"); ok {
		var inStock bool
		switch raw {
		case "true":
			inStock = true
		case "false":
			inStock = false
		default:
			writeError(c, domain.NewFilterValidationError(map[string]string{"in_stock": "must be true or false"}))
			return
		}
		filter.InStock = &inStock
	}

	products, err := h.uc.SearchProducts(c, filter)
	if err != nil {
		writeError(c, err)
		return
	}
	out := make([]productSummaryResponse, 0, len(products))
	for _, p := range products {
		out = append(out, toSummaryResponse(p))
	}
	c.JSON(http.StatusOK, gin.H{"products": out})
}

func (h *catalogHandler) GetProduct(c *gin.Context) {
	product, err := h.uc.GetProduct(c, c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toDetailResponse(*product))
}

func toSummaryResponse(p domain.Product) productSummaryResponse {
	return productSummaryResponse{
		ID:              p.ID,
		Name:            p.Name,
		Category:        categoryResponse{ID: p.Category.ID, Name: p.Category.Name},
		Price:           p.Price,
		Currency:        p.Currency,
		PrimaryImageURL: p.PrimaryImageURL(),
		InStock:         p.InStock(),
	}
}

func toDetailResponse(p domain.Product) productDetailResponse {
	images := p.ImageURLs
	if images == nil {
		images = []string{}
	}
	return productDetailResponse{
		ID:            p.ID,
		Name:          p.Name,
		Description:   p.Description,
		Category:      categoryResponse{ID: p.Category.ID, Name: p.Category.Name},
		Price:         p.Price,
		Currency:      p.Currency,
		ImageURLs:     images,
		StockQuantity: p.StockQuantity,
		InStock:       p.InStock(),
		CreatedAt:     p.CreatedAt,
		UpdatedAt:     p.UpdatedAt,
	}
}
