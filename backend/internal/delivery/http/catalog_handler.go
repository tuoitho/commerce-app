package http

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	cataloguc "commerce-backend/internal/usecase/catalog"
)

type favoriteReader interface {
	GetFavoriteProductIDs(ctx context.Context, userID string, productIDs []string) ([]string, error)
}

type reviewSummaryReader interface {
	GetProductReviewSummary(ctx context.Context, productID string) (*domain.ReviewSummary, error)
}

type catalogHandler struct {
	uc        *cataloguc.UseCase
	favorites favoriteReader
	reviews   reviewSummaryReader
}

func newCatalogHandler(uc *cataloguc.UseCase, favorites favoriteReader, reviews reviewSummaryReader) *catalogHandler {
	return &catalogHandler{uc: uc, favorites: favorites, reviews: reviews}
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
	Viewer          viewerState      `json:"viewer"`
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
	ReviewSummary domain.ReviewSummary  `json:"reviewSummary"`
	CreatedAt     time.Time             `json:"createdAt"`
	UpdatedAt     time.Time             `json:"updatedAt"`
	Viewer        viewerState           `json:"viewer"`
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

func (h *catalogHandler) getFavoriteMap(c *gin.Context, products []domain.Product) (map[string]bool, error) {
	favMap := make(map[string]bool)
	userID := callerUserID(c)
	if userID == "" || h.favorites == nil || len(products) == 0 {
		return favMap, nil
	}
	ids := make([]string, len(products))
	for i, p := range products {
		ids[i] = p.ID
	}
	favs, err := h.favorites.GetFavoriteProductIDs(c.Request.Context(), userID, ids)
	if err != nil {
		return nil, err
	}
	for _, id := range favs {
		favMap[id] = true
	}
	return favMap, nil
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

	if pageSet || limitSet {
		if page < 1 {
			page = 1
		}
		if limit < 1 {
			limit = 6
		}
		total := len(products)
		totalPages := 0
		if total > 0 {
			totalPages = (total + limit - 1) / limit
		}
		offset := (page - 1) * limit
		var pageProducts []domain.Product
		if offset < total {
			end := offset + limit
			if end > total {
				end = total
			}
			pageProducts = products[offset:end]
		} else {
			pageProducts = []domain.Product{}
		}

		favMap, err := h.getFavoriteMap(c, pageProducts)
		if err != nil {
			writeError(c, err)
			return
		}

		pageItems := make([]productSummaryResponse, 0, len(pageProducts))
		for _, p := range pageProducts {
			pageItems = append(pageItems, toSummaryResponse(p, favMap[p.ID]))
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

	favMap, err := h.getFavoriteMap(c, products)
	if err != nil {
		writeError(c, err)
		return
	}

	out := make([]productSummaryResponse, 0, len(products))
	for _, p := range products {
		out = append(out, toSummaryResponse(p, favMap[p.ID]))
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
	favMap, err := h.getFavoriteMap(c, products)
	if err != nil {
		writeError(c, err)
		return
	}
	out := make([]productSummaryResponse, 0, len(products))
	for _, p := range products {
		out = append(out, toSummaryResponse(p, favMap[p.ID]))
	}
	writeSuccess(c, http.StatusOK, "", out)
}

func (h *catalogHandler) GetProduct(c *gin.Context) {
	product, err := h.uc.GetProduct(c, c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	isFav := false
	userID := callerUserID(c)
	if userID != "" && h.favorites != nil {
		favs, err := h.favorites.GetFavoriteProductIDs(c.Request.Context(), userID, []string{product.ID})
		if err != nil {
			writeError(c, err)
			return
		}
		if len(favs) > 0 && favs[0] == product.ID {
			isFav = true
		}
	}

	var reviewSummary domain.ReviewSummary
	if h.reviews != nil {
		sum, err := h.reviews.GetProductReviewSummary(c.Request.Context(), product.ID)
		if err == nil && sum != nil {
			reviewSummary = *sum
		}
	}

	writeSuccess(c, http.StatusOK, "", toDetailResponse(*product, isFav, reviewSummary))
}

func toSummaryResponse(p domain.Product, isFavorite bool) productSummaryResponse {
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
		Viewer:          viewerState{IsFavorite: isFavorite},
	}
}

func toDetailResponse(p domain.Product, isFavorite bool, reviewSummary domain.ReviewSummary) productDetailResponse {
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
		ReviewSummary: reviewSummary,
		CreatedAt:     p.CreatedAt,
		UpdatedAt:     p.UpdatedAt,
		Viewer:        viewerState{IsFavorite: isFavorite},
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
