package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	cartuc "commerce-backend/internal/usecase/cart"
)

type cartHandler struct{ uc *cartuc.UseCase }

func newCartHandler(uc *cartuc.UseCase) *cartHandler { return &cartHandler{uc: uc} }

type cartResponse struct {
	Items             []cartItemResponse `json:"items"`
	TotalUnits        int64              `json:"totalUnits"`
	SelectedLineCount int                `json:"selectedLineCount"`
	SelectedTotalVND  string             `json:"selectedTotalVnd"`
	ShippingFeeVND    string             `json:"shippingFeeVnd"`
}


type cartItemResponse struct {
	ID            string              `json:"id"`
	VariantID     string              `json:"variantId"`
	ProductID     string              `json:"productId"`
	BrandName     string              `json:"brandName"`
	ProductName   string              `json:"productName"`
	Model         string              `json:"model"`
	ImageURL      string              `json:"imageUrl"`
	Options       []domain.CartOption `json:"options"`
	UnitPriceVND  *string             `json:"unitPriceVnd"`
	LineTotalVND  *string             `json:"lineTotalVnd"`
	StockQuantity int64               `json:"stockQuantity"`
	Quantity      int64               `json:"quantity"`
	Selected      bool                `json:"selected"`
	Availability  string              `json:"availability"`
	IsLivePrice   bool                `json:"isLivePrice"`
}

type addCartItemRequest struct {
	VariantID string `json:"variantId"`
}
type quantityRequest struct {
	Quantity int64 `json:"quantity"`
}
type selectionRequest struct {
	Selected bool `json:"selected"`
}

func (h *cartHandler) Get(c *gin.Context) {
	cart, err := h.uc.Get(c, callerUserID(c))
	h.respond(c, cart, err, "")
}

func (h *cartHandler) AddItem(c *gin.Context) {
	var req addCartItemRequest
	if !bindCartJSON(c, &req) {
		return
	}
	cart, err := h.uc.AddVariant(c, callerUserID(c), req.VariantID)
	h.respond(c, cart, err, "Đã thêm sản phẩm vào giỏ hàng")
}

func (h *cartHandler) SetQuantity(c *gin.Context) {
	var req quantityRequest
	if !bindCartJSON(c, &req) {
		return
	}
	cart, err := h.uc.SetQuantity(c, callerUserID(c), c.Param("itemId"), req.Quantity)
	h.respond(c, cart, err, "Đã cập nhật số lượng")
}

func (h *cartHandler) SetSelection(c *gin.Context) {
	var req selectionRequest
	if !bindCartJSON(c, &req) {
		return
	}
	cart, err := h.uc.SetSelected(c, callerUserID(c), c.Param("itemId"), req.Selected)
	h.respond(c, cart, err, "Đã cập nhật lựa chọn")
}

func (h *cartHandler) SetAllSelection(c *gin.Context) {
	var req selectionRequest
	if !bindCartJSON(c, &req) {
		return
	}
	cart, err := h.uc.SetAllSelected(c, callerUserID(c), req.Selected)
	h.respond(c, cart, err, "Đã cập nhật tất cả lựa chọn")
}

func (h *cartHandler) RemoveItem(c *gin.Context) {
	cart, err := h.uc.Remove(c, callerUserID(c), c.Param("itemId"))
	h.respond(c, cart, err, "Đã xóa sản phẩm khỏi giỏ hàng")
}

func bindCartJSON(c *gin.Context, value any) bool {
	if err := c.ShouldBindJSON(value); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "invalid JSON body"}))
		return false
	}
	return true
}

func (h *cartHandler) respond(c *gin.Context, cart *domain.Cart, err error, message string) {
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, message, toCartResponse(cart))
}

func toCartResponse(cart *domain.Cart) cartResponse {
	items := make([]cartItemResponse, 0, len(cart.Items))
	for _, item := range cart.Items {
		items = append(items, cartItemResponse{
			ID: item.ID, VariantID: item.VariantID, ProductID: item.ProductID,
			BrandName: item.BrandName, ProductName: item.ProductName, Model: item.Model,
			ImageURL: item.ImageURL, Options: item.Options, UnitPriceVND: moneyPtr(item.UnitPriceVND),
			LineTotalVND: moneyPtr(item.LineTotalVND), StockQuantity: item.StockQuantity,
			Quantity: item.Quantity, Selected: item.Selected, Availability: string(item.Availability),
			IsLivePrice: item.IsLivePrice,
		})
	}
	return cartResponse{
		Items:             items,
		TotalUnits:        cart.TotalUnits,
		SelectedLineCount: cart.SelectedLineCount,
		SelectedTotalVND:  string(cart.SelectedTotalVND),
		ShippingFeeVND:    string(cart.ShippingFeeVND),
	}
}


func moneyPtr(value *domain.MoneyVND) *string {
	if value == nil {
		return nil
	}
	result := string(*value)
	return &result
}
