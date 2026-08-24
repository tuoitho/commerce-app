package http

import (
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	favoriteuc "commerce-backend/internal/usecase/favorite"
)

var favUUIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type favoriteHandler struct {
	uc *favoriteuc.UseCase
}

func newFavoriteHandler(uc *favoriteuc.UseCase) *favoriteHandler {
	return &favoriteHandler{uc: uc}
}

type viewerState struct {
	IsFavorite bool `json:"isFavorite"`
}

type favoriteStateResponse struct {
	ProductID  string `json:"productId"`
	IsFavorite bool   `json:"isFavorite"`
}

type favoriteProductSummaryResponse struct {
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
	Active          bool             `json:"active"`
	FavoritedAt     time.Time        `json:"favoritedAt"`
}

func (h *favoriteHandler) List(c *gin.Context) {
	userID := callerUserID(c)
	pageStr, pageSet := c.GetQuery("page")
	limitStr, limitSet := c.GetQuery("limit")

	fields := map[string]string{}
	page := 1
	limit := 12

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
			if err != nil || l != 12 {
				fields["limit"] = "must be 12"
			} else {
				limit = l
			}
		}
	}

	if len(fields) > 0 {
		writeError(c, domain.NewValidationError(fields))
		return
	}

	res, err := h.uc.ListFavorites(c.Request.Context(), userID, page, limit)
	if err != nil {
		writeError(c, err)
		return
	}

	items := make([]favoriteProductSummaryResponse, 0, len(res.Items))
	for _, item := range res.Items {
		items = append(items, favoriteProductSummaryResponse{
			ID:    item.ID,
			Name:  item.Name,
			Model: item.Model,
			Brand: item.Brand,
			Category: categoryResponse{
				ID:   item.Category.ID,
				Name: item.Category.Name,
			},
			MinPriceVND:     string(item.MinPriceVND),
			MaxPriceVND:     string(item.MaxPriceVND),
			Price:           item.Price,
			Currency:        item.Currency,
			PrimaryImageURL: item.PrimaryImageURL,
			InStock:         item.InStock,
			Viewer:          viewerState{IsFavorite: true},
			Active:          item.Active,
			FavoritedAt:     item.FavoritedAt,
		})
	}

	pagination := PaginationMeta{
		Page:       res.Pagination.Page,
		Limit:      res.Pagination.Limit,
		Total:      res.Pagination.Total,
		TotalPages: res.Pagination.TotalPages,
		HasNext:    res.Pagination.HasNext,
		HasPrev:    res.Pagination.HasPrev,
	}

	writePaginatedSuccess(c, http.StatusOK, "", items, pagination)
}

func (h *favoriteHandler) Add(c *gin.Context) {
	userID := callerUserID(c)
	productID := c.Param("productId")

	if !favUUIDPattern.MatchString(productID) {
		writeError(c, domain.NewValidationError(map[string]string{"productId": "must be a valid UUID"}))
		return
	}

	err := h.uc.AddFavorite(c.Request.Context(), userID, productID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Đã thêm sản phẩm vào yêu thích", favoriteStateResponse{
		ProductID:  productID,
		IsFavorite: true,
	})
}

func (h *favoriteHandler) Remove(c *gin.Context) {
	userID := callerUserID(c)
	productID := c.Param("productId")

	if !favUUIDPattern.MatchString(productID) {
		writeError(c, domain.NewValidationError(map[string]string{"productId": "must be a valid UUID"}))
		return
	}

	err := h.uc.RemoveFavorite(c.Request.Context(), userID, productID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Đã bỏ sản phẩm khỏi yêu thích", favoriteStateResponse{
		ProductID:  productID,
		IsFavorite: false,
	})
}
