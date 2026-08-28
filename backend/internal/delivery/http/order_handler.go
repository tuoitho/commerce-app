package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	orderuc "commerce-backend/internal/usecase/order"
)

type orderHandler struct {
	uc *orderuc.UseCase
}

func newOrderHandler(uc *orderuc.UseCase) *orderHandler {
	return &orderHandler{uc: uc}
}

type orderItemResponse struct {
	ID           string              `json:"id"`
	VariantID    string              `json:"variantId"`
	ProductID    string              `json:"productId"`
	BrandName    string              `json:"brandName"`
	ProductName  string              `json:"productName"`
	Model        string              `json:"model"`
	ImageURL     string              `json:"imageUrl"`
	Options      []domain.CartOption `json:"options"`
	UnitPriceVND string              `json:"unitPriceVnd"`
	Quantity     int64               `json:"quantity"`
	LineTotalVND string              `json:"lineTotalVnd"`
}

type returnEligibilityResponse struct {
	Eligible bool       `json:"eligible"`
	Deadline *time.Time `json:"deadline"`
}

type returnRequestItemResponse struct {
	OrderItemID       string              `json:"orderItemId"`
	VariantID         string              `json:"variantId"`
	ProductID         string              `json:"productId"`
	BrandName         string              `json:"brandName"`
	ProductName       string              `json:"productName"`
	Model             string              `json:"model"`
	ImageURL          string              `json:"imageUrl"`
	Options           []domain.CartOption `json:"options"`
	Quantity          int64               `json:"quantity"`
	UnitPriceVND      string              `json:"unitPriceVnd"`
	LineTotalVND      string              `json:"lineTotalVnd"`
	ReceivedVariantID *string             `json:"receivedVariantId,omitempty"`
}

type returnRequestResponse struct {
	ID                string                      `json:"id"`
	OrderID           string                      `json:"orderId"`
	UserID            string                      `json:"userId,omitempty"`
	BuyerEmail        string                      `json:"buyerEmail,omitempty"`
	Status            string                      `json:"status"`
	ReasonCode        string                      `json:"reasonCode"`
	Description       string                      `json:"description"`
	RejectReason      string                      `json:"rejectReason"`
	ExpectedRefundVND string                      `json:"expectedRefundVnd"`
	RefundAmountVND   *string                     `json:"refundAmountVnd"`
	RefundedByUserID  *string                     `json:"refundedByUserId,omitempty"`
	Items             []returnRequestItemResponse `json:"items"`
	CreatedAt         time.Time                   `json:"createdAt"`
	UpdatedAt         time.Time                   `json:"updatedAt"`
	ApprovedAt        *time.Time                  `json:"approvedAt"`
	RejectedAt        *time.Time                  `json:"rejectedAt"`
	ReceivedAt        *time.Time                  `json:"receivedAt"`
	RefundedAt        *time.Time                  `json:"refundedAt"`
	CancelledAt       *time.Time                  `json:"cancelledAt"`
}

func toReturnRequestResponse(rr *domain.ReturnRequest, isAdmin bool) *returnRequestResponse {
	if rr == nil {
		return nil
	}
	items := make([]returnRequestItemResponse, len(rr.Items))
	for i, item := range rr.Items {
		items[i] = returnRequestItemResponse{
			OrderItemID:  item.OrderItemID,
			VariantID:    item.VariantID,
			ProductID:    item.ProductID,
			BrandName:    item.BrandName,
			ProductName:  item.ProductName,
			Model:        item.Model,
			ImageURL:     item.ImageURL,
			Options:      item.Options,
			Quantity:     item.Quantity,
			UnitPriceVND: string(item.UnitPriceVND),
			LineTotalVND: string(item.LineTotalVND),
		}
		if isAdmin {
			items[i].ReceivedVariantID = item.ReceivedVariantID
		}
	}

	var refundAmountStr *string
	if rr.RefundAmountVND != nil {
		s := string(*rr.RefundAmountVND)
		refundAmountStr = &s
	}

	resp := &returnRequestResponse{
		ID:                rr.ID,
		OrderID:           rr.OrderID,
		Status:            string(rr.Status),
		ReasonCode:        string(rr.ReasonCode),
		Description:       rr.Description,
		RejectReason:      rr.RejectReason,
		ExpectedRefundVND: string(rr.ExpectedRefundVND),
		RefundAmountVND:   refundAmountStr,
		Items:             items,
		CreatedAt:         rr.CreatedAt,
		UpdatedAt:         rr.UpdatedAt,
		ApprovedAt:        rr.ApprovedAt,
		RejectedAt:        rr.RejectedAt,
		ReceivedAt:        rr.ReceivedAt,
		RefundedAt:        rr.RefundedAt,
		CancelledAt:       rr.CancelledAt,
	}
	if isAdmin {
		resp.UserID = rr.UserID
		resp.BuyerEmail = rr.BuyerEmail
		resp.RefundedByUserID = rr.RefundedByUserID
	}
	return resp
}

type orderResponse struct {
	ID                  string                     `json:"id"`
	UserID              string                     `json:"userId"`
	Status              string                     `json:"status"`
	PaymentMethod       string                     `json:"paymentMethod"`
	RecipientName       string                     `json:"recipientName"`
	Phone               string                     `json:"phone"`
	ProvinceName        string                     `json:"provinceName"`
	WardName            string                     `json:"wardName"`
	DetailAddress       string                     `json:"detailAddress"`
	SubtotalVND         string                     `json:"subtotalVnd"`
	ShippingFeeVND      string                     `json:"shippingFeeVnd"`
	TotalVND            string                     `json:"totalVnd"`
	Items               []orderItemResponse        `json:"items"`
	CreatedAt           time.Time                  `json:"createdAt"`
	UpdatedAt           time.Time                  `json:"updatedAt"`
	ConfirmedAt         *time.Time                 `json:"confirmedAt,omitempty"`
	CancelledAt         *time.Time                 `json:"cancelledAt,omitempty"`
	DeliveredAt         *time.Time                 `json:"deliveredAt,omitempty"`
	CancellableUntil    *time.Time                 `json:"cancellableUntil,omitempty"`
	ReturnEligibility   *returnEligibilityResponse `json:"returnEligibility,omitempty"`
	LatestReturnRequest *returnRequestResponse     `json:"latestReturnRequest"`
}

func toOrderResponse(order domain.Order) orderResponse {
	items := make([]orderItemResponse, len(order.Items))
	for i, item := range order.Items {
		items[i] = orderItemResponse{
			ID:           item.ID,
			VariantID:    item.VariantID,
			ProductID:    item.ProductID,
			BrandName:    item.BrandName,
			ProductName:  item.ProductName,
			Model:        item.Model,
			ImageURL:     item.ImageURL,
			Options:      item.Options,
			UnitPriceVND: string(item.UnitPriceVND),
			Quantity:     item.Quantity,
			LineTotalVND: string(item.LineTotalVND),
		}
	}

	var returnEligibility *returnEligibilityResponse
	if order.ReturnEligibility != nil {
		returnEligibility = &returnEligibilityResponse{
			Eligible: order.ReturnEligibility.Eligible,
			Deadline: order.ReturnEligibility.Deadline,
		}
	}

	return orderResponse{
		ID:                  order.ID,
		UserID:              order.UserID,
		Status:              string(order.Status),
		PaymentMethod:       order.PaymentMethod,
		RecipientName:       order.ShippingInfo.RecipientName,
		Phone:               order.ShippingInfo.Phone,
		ProvinceName:        order.ShippingInfo.ProvinceName,
		WardName:            order.ShippingInfo.WardName,
		DetailAddress:       order.ShippingInfo.DetailAddress,
		SubtotalVND:         string(order.SubtotalVND),
		ShippingFeeVND:      string(order.ShippingFeeVND),
		TotalVND:            string(order.TotalVND),
		Items:               items,
		CreatedAt:           order.CreatedAt,
		UpdatedAt:           order.UpdatedAt,
		ConfirmedAt:         order.ConfirmedAt,
		CancelledAt:         order.CancelledAt,
		DeliveredAt:         order.DeliveredAt,
		CancellableUntil:    order.CancellableUntil,
		ReturnEligibility:   returnEligibility,
		LatestReturnRequest: toReturnRequestResponse(order.LatestReturnRequest, false),
	}
}

type orderLineRequest struct {
	VariantID    string `json:"variantId"`
	Quantity     int64  `json:"quantity"`
	ProductName  string `json:"productName"`
	UnitPriceVND string `json:"unitPriceVnd"`
}

type createOrderRequest struct {
	AddressID string             `json:"addressId"`
	Lines     []orderLineRequest `json:"lines"`
}

func (h *orderHandler) Create(c *gin.Context) {
	var req createOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	lines := make([]domain.OrderLineInput, len(req.Lines))
	for i, l := range req.Lines {
		lines[i] = domain.OrderLineInput{
			VariantID:    l.VariantID,
			Quantity:     l.Quantity,
			ProductName:  l.ProductName,
			UnitPriceVND: domain.MoneyVND(l.UnitPriceVND),
		}
	}

	order, err := h.uc.Create(c.Request.Context(), userID, req.AddressID, lines)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Tạo đơn hàng thành công", toOrderResponse(*order))
}

type orderStatsResponse struct {
	PendingConfirmation int `json:"pendingConfirmation"`
	AwaitingPickup      int `json:"awaitingPickup"`
	AwaitingDelivery    int `json:"awaitingDelivery"`
	AwaitingReview      int `json:"awaitingReview"`
}

func toOrderStatsResponse(stats domain.OrderStats) orderStatsResponse {
	return orderStatsResponse{
		PendingConfirmation: stats.PendingConfirmation,
		AwaitingPickup:      stats.AwaitingPickup,
		AwaitingDelivery:    stats.AwaitingDelivery,
		AwaitingReview:      stats.AwaitingReview,
	}
}

func (h *orderHandler) GetByID(c *gin.Context) {
	orderID := c.Param("id")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	order, err := h.uc.GetByID(c.Request.Context(), userID, orderID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy chi tiết đơn hàng thành công", toOrderResponse(*order))
}

func (h *orderHandler) List(c *gin.Context) {
	status := c.Query("status")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	orders, err := h.uc.List(c.Request.Context(), userID, domain.OrderStatusBucket(status))
	if err != nil {
		writeError(c, err)
		return
	}

	resp := make([]orderResponse, len(orders))
	for i, o := range orders {
		resp[i] = toOrderResponse(o)
	}

	writeSuccess(c, http.StatusOK, "Lấy danh sách đơn hàng thành công", resp)
}

func (h *orderHandler) Stats(c *gin.Context) {
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	stats, err := h.uc.Stats(c.Request.Context(), userID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy thống kê đơn hàng thành công", toOrderStatsResponse(stats))
}

func (h *orderHandler) Cancel(c *gin.Context) {
	orderID := c.Param("id")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	order, err := h.uc.Cancel(c.Request.Context(), userID, orderID)
	if err != nil {
		writeError(c, err)
		return
	}

	message := "Hủy đơn hàng thành công"
	if order.Status == domain.OrderStatusCancelRequested {
		message = "Gửi yêu cầu hủy đơn hàng thành công"
	}

	writeSuccess(c, http.StatusOK, message, toOrderResponse(*order))
}

func (h *orderHandler) UndoCancel(c *gin.Context) {
	orderID := c.Param("id")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	order, err := h.uc.UndoCancel(c.Request.Context(), userID, orderID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Hoàn tác yêu cầu hủy thành công", toOrderResponse(*order))
}


