package http

import (
	"net/http"
	"strconv"
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
	Model           string           `json:"model"`
	Brand           string           `json:"brand"`
	Category        categoryResponse `json:"category"`
	MinPriceVND     string           `json:"minPriceVnd"`
	MaxPriceVND     string           `json:"maxPriceVnd"`
	Price           string           `json:"price"`
	Currency        string           `json:"currency"`
	PrimaryImageURL string           `json:"primaryImageUrl"`
	InStock         bool             `json:"inStock"`
}

type productDetailResponse struct {
	ID            string                `json:"id"`
	Name          string                `json:"name"`
	Model         string                `json:"model"`
	Description   string                `json:"description"`
	Brand         string                `json:"brand"`
	Category      categoryResponse      `json:"category"`
	MinPriceVND   string                `json:"minPriceVnd"`
	MaxPriceVND   string                `json:"maxPriceVnd"`
	Price         string                `json:"price"`
	Currency      string                `json:"currency"`
	ImageURLs     []string              `json:"imageUrls"`
	StockQuantity int64                 `json:"stockQuantity"`
	InStock       bool                  `json:"inStock"`
	Featured      bool                  `json:"featured"`
	Active        bool                  `json:"active"`
	OptionGroups  []optionGroupResponse `json:"optionGroups"`
	Variants      []variantResponse     `json:"variants"`
	CreatedAt     time.Time             `json:"createdAt"`
	UpdatedAt     time.Time             `json:"updatedAt"`
}

type optionGroupResponse struct {
	ID       string                `json:"id"`
	Label    string                `json:"label"`
	Position int                   `json:"position"`
	Values   []optionValueResponse `json:"values"`
}

type optionValueResponse struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type variantResponse struct {
	ID             string            `json:"id"`
	OptionValueIDs map[string]string `json:"optionValueIds"`
	PriceVND       string            `json:"priceVnd"`
	StockQuantity  int64             `json:"stockQuantity"`
	Active         bool              `json:"active"`
}

// liveVariantResponse adds the live-session price in effect to a variant.
// Only the storefront product detail exposes it; admin responses keep the
// plain variantResponse.
type liveVariantResponse struct {
	variantResponse
	LivePriceVND  *string `json:"livePriceVnd"`
	LiveRemaining *int    `json:"liveRemaining"`
}

type storefrontProductDetailResponse struct {
	productDetailResponse
	Variants []liveVariantResponse `json:"variants"`
}

func toStorefrontDetailResponse(p domain.Product) storefrontProductDetailResponse {
	base := toDetailResponse(p)
	variants := make([]liveVariantResponse, len(base.Variants))
	for i, v := range base.Variants {
		variants[i] = liveVariantResponse{
			variantResponse: v,
			LivePriceVND:    moneyPtr(p.Variants[i].LivePriceVND),
			LiveRemaining:   p.Variants[i].LiveRemaining,
		}
	}
	return storefrontProductDetailResponse{productDetailResponse: base, Variants: variants}
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
	writeSuccess(c, http.StatusOK, "", out)
}

func (h *catalogHandler) ListBrands(c *gin.Context) {
	brands, err := h.uc.ListBrands(c)
	if err != nil {
		writeError(c, err)
		return
	}
	if brands == nil {
		brands = []string{}
	}
	writeSuccess(c, http.StatusOK, "", brands)
}

func (h *catalogHandler) ListProducts(c *gin.Context) {
	minPrice, minPriceSet := c.GetQuery("min_price")
	maxPrice, maxPriceSet := c.GetQuery("max_price")
	pageStr, pageSet := c.GetQuery("page")
	limitStr, limitSet := c.GetQuery("limit")

	fields := map[string]string{}
	if minPriceSet && minPrice == "" {
		fields["min_price"] = "must not be empty"
	}
	if maxPriceSet && maxPrice == "" {
		fields["max_price"] = "must not be empty"
	}

	var page, limit int
	if pageSet {
		if pageStr == "" {
			fields["page"] = "must not be empty"
		} else {
			p, err := strconv.Atoi(pageStr)
			if err != nil || p < 1 {
				fields["page"] = "must be a positive integer"
			} else {
				page = p
			}
		}
	}

	if limitSet {
		if limitStr == "" {
			fields["limit"] = "must not be empty"
		} else {
			l, err := strconv.Atoi(limitStr)
			if err != nil || l < 1 || l > 100 {
				fields["limit"] = "must be a positive integer between 1 and 100"
			} else {
				limit = l
			}
		}
	}

	if len(fields) > 0 {
		writeError(c, domain.NewFilterValidationError(fields))
		return
	}

	filter := domain.ProductFilter{
		Query:       c.Query("q"),
		CategoryIDs: c.QueryArray("category_id"),
		Brands:      c.QueryArray("brand"),
		MinPriceVND: moneyQuery(minPrice),
		MaxPriceVND: moneyQuery(maxPrice),
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

	if pageSet || limitSet {
		if page < 1 {
			page = 1
		}
		if limit < 1 {
			limit = 6
		}
		total := len(out)
		totalPages := 0
		if total > 0 {
			totalPages = (total + limit - 1) / limit
		}
		offset := (page - 1) * limit
		var pageItems []productSummaryResponse
		if offset < total {
			end := offset + limit
			if end > total {
				end = total
			}
			pageItems = out[offset:end]
		} else {
			pageItems = []productSummaryResponse{}
		}

		pagination := PaginationMeta{
			Page:       page,
			Limit:      limit,
			Total:      total,
			TotalPages: totalPages,
			HasNext:    page < totalPages,
			HasPrev:    page > 1,
		}
		writePaginatedSuccess(c, http.StatusOK, "", pageItems, pagination)
		return
	}

	writeSuccess(c, http.StatusOK, "", out)
}

func moneyQuery(value string) *domain.MoneyVND {
	if value == "" {
		return nil
	}
	money := domain.MoneyVND(value)
	return &money
}

func (h *catalogHandler) ListFeaturedProducts(c *gin.Context) {
	products, err := h.uc.ListFeaturedProducts(c)
	if err != nil {
		writeError(c, err)
		return
	}
	out := make([]productSummaryResponse, 0, len(products))
	for _, p := range products {
		out = append(out, toSummaryResponse(p))
	}
	writeSuccess(c, http.StatusOK, "", out)
}

func (h *catalogHandler) GetProduct(c *gin.Context) {
	product, err := h.uc.GetProduct(c, c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "", toStorefrontDetailResponse(*product))
}

func toSummaryResponse(p domain.Product) productSummaryResponse {
	return productSummaryResponse{
		ID:              p.ID,
		Name:            p.Name,
		Model:           p.Model,
		Brand:           p.Brand,
		Category:        categoryResponse{ID: p.Category.ID, Name: p.Category.Name},
		MinPriceVND:     string(p.MinPriceVND),
		MaxPriceVND:     string(p.MaxPriceVND),
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
		Model:         p.Model,
		Description:   p.Description,
		Brand:         p.Brand,
		Category:      categoryResponse{ID: p.Category.ID, Name: p.Category.Name},
		MinPriceVND:   string(p.MinPriceVND),
		MaxPriceVND:   string(p.MaxPriceVND),
		Price:         p.Price,
		Currency:      p.Currency,
		ImageURLs:     images,
		StockQuantity: p.StockQuantity,
		InStock:       p.InStock(),
		Featured:      p.Featured,
		Active:        p.Active,
		OptionGroups:  toOptionGroupResponses(p.OptionGroups),
		Variants:      toVariantResponses(p.Variants),
		CreatedAt:     p.CreatedAt,
		UpdatedAt:     p.UpdatedAt,
	}
}

func toOptionGroupResponses(groups []domain.OptionGroup) []optionGroupResponse {
	out := make([]optionGroupResponse, 0, len(groups))
	for _, group := range groups {
		values := make([]optionValueResponse, 0, len(group.Values))
		for _, value := range group.Values {
			values = append(values, optionValueResponse{ID: value.ID, Label: value.Label})
		}
		out = append(out, optionGroupResponse{ID: group.ID, Label: group.Label, Position: group.Position, Values: values})
	}
	return out
}

func toVariantResponses(variants []domain.ProductVariant) []variantResponse {
	out := make([]variantResponse, 0, len(variants))
	for _, variant := range variants {
		optIDs := variant.OptionValueIDs
		if optIDs == nil {
			optIDs = make(map[string]string)
		}
		out = append(out, variantResponse{
			ID:             variant.ID,
			OptionValueIDs: optIDs,
			PriceVND:       string(variant.PriceVND),
			StockQuantity:  variant.StockQuantity,
			Active:         variant.Active,
		})
	}
	return out
}
