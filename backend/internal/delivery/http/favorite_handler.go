package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	favoriteuc "commerce-backend/internal/usecase/favorite"
)

type favoriteHandler struct {
	uc *favoriteuc.UseCase
}

func newFavoriteHandler(uc *favoriteuc.UseCase) *favoriteHandler {
	return &favoriteHandler{uc: uc}
}

type favoriteProductResponse struct {
	ID              string           `json:"id"`
	Name            string           `json:"name"`
	Model           string           `json:"model"`
	Brand           string           `json:"brand"`
	Category        categoryResponse `json:"category"`
	PrimaryImageURL string           `json:"primaryImageUrl"`
	Availability    string           `json:"availability"`
	MinPriceVND     *string          `json:"minPriceVnd"`
	MaxPriceVND     *string          `json:"maxPriceVnd"`
	InStock         *bool            `json:"inStock"`
}

func (h *favoriteHandler) List(c *gin.Context) {
	if h.uc == nil {
		writeSuccess(c, http.StatusOK, "", []favoriteProductResponse{})
		return
	}
	items, err := h.uc.List(c, callerUserID(c))
	h.respond(c, items, err, "")
}

func (h *favoriteHandler) Add(c *gin.Context) {
	if h.uc == nil {
		writeSuccess(c, http.StatusOK, "Đã thêm sản phẩm vào danh sách yêu thích", []favoriteProductResponse{})
		return
	}
	items, err := h.uc.Add(c, callerUserID(c), c.Param("productId"))
	h.respond(c, items, err, "Đã thêm sản phẩm vào danh sách yêu thích")
}

func (h *favoriteHandler) Remove(c *gin.Context) {
	if h.uc == nil {
		writeSuccess(c, http.StatusOK, "Đã xóa sản phẩm khỏi danh sách yêu thích", []favoriteProductResponse{})
		return
	}
	items, err := h.uc.Remove(c, callerUserID(c), c.Param("productId"))
	h.respond(c, items, err, "Đã xóa sản phẩm khỏi danh sách yêu thích")
}

func (h *favoriteHandler) respond(c *gin.Context, items []domain.FavoriteProduct, err error, message string) {
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, message, toFavoriteListResponse(items))
}

func toFavoriteProductResponse(fav domain.FavoriteProduct) favoriteProductResponse {
	resp := favoriteProductResponse{
		ID:              fav.ID,
		Name:            fav.Name,
		Model:           fav.Model,
		Brand:           fav.Brand,
		Category:        categoryResponse{ID: fav.Category.ID, Name: fav.Category.Name},
		PrimaryImageURL: fav.PrimaryImageURL,
		Availability:    string(fav.Availability),
	}

	if fav.Availability == domain.FavoriteActive {
		if fav.MinPriceVND != nil {
			minStr := string(*fav.MinPriceVND)
			resp.MinPriceVND = &minStr
		}
		if fav.MaxPriceVND != nil {
			maxStr := string(*fav.MaxPriceVND)
			resp.MaxPriceVND = &maxStr
		}
		if fav.InStock != nil {
			inStock := *fav.InStock
			resp.InStock = &inStock
		}
	}

	return resp
}

func toFavoriteListResponse(items []domain.FavoriteProduct) []favoriteProductResponse {
	out := make([]favoriteProductResponse, 0, len(items))
	for _, item := range items {
		out = append(out, toFavoriteProductResponse(item))
	}
	return out
}
