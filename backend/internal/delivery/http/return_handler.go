package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	returnsuc "commerce-backend/internal/usecase/returns"
)

type returnHandler struct {
	uc *returnsuc.UseCase
}

func newReturnHandler(uc *returnsuc.UseCase) *returnHandler {
	return &returnHandler{uc: uc}
}

type returnItemResponse struct {
	ID           string `json:"id"`
	OrderItemID  string `json:"orderItemId"`
	ProductName  string `json:"productName"`
	ImageURL     string `json:"imageUrl"`
	UnitPriceVND string `json:"unitPriceVnd"`
	Quantity     int64  `json:"quantity"`
}

type returnRequestResponse struct {
	ID              string               `json:"id"`
	OrderID         string               `json:"orderId"`
	Status          string               `json:"status"`
	ReasonCode      string               `json:"reasonCode"`
	Description     string               `json:"description"`
	RejectReason    string               `json:"rejectReason"`
	Items           []returnItemResponse `json:"items"`
	RefundAmountVND *string              `json:"refundAmountVnd,omitempty"`
	CreatedAt       time.Time            `json:"createdAt"`
	UpdatedAt       time.Time            `json:"updatedAt"`
	ApprovedAt      *time.Time           `json:"approvedAt,omitempty"`
	RejectedAt      *time.Time           `json:"rejectedAt,omitempty"`
	ReceivedAt      *time.Time           `json:"receivedAt,omitempty"`
	RefundedAt      *time.Time           `json:"refundedAt,omitempty"`
	CancelledAt     *time.Time           `json:"cancelledAt,omitempty"`
}

func toReturnItemResponse(item domain.ReturnRequestItem) returnItemResponse {
	return returnItemResponse{
		ID:           item.ID,
		OrderItemID:  item.OrderItemID,
		ProductName:  item.ProductName,
		ImageURL:     item.ImageURL,
		UnitPriceVND: string(item.UnitPriceVND),
		Quantity:     item.Quantity,
	}
}

func toReturnRequestResponse(request domain.ReturnRequest) returnRequestResponse {
	items := make([]returnItemResponse, len(request.Items))
	for i, item := range request.Items {
		items[i] = toReturnItemResponse(item)
	}

	resp := returnRequestResponse{
		ID:           request.ID,
		OrderID:      request.OrderID,
		Status:       string(request.Status),
		ReasonCode:   string(request.ReasonCode),
		Description:  request.Description,
		RejectReason: request.RejectReason,
		Items:        items,
		CreatedAt:    request.CreatedAt,
		UpdatedAt:    request.UpdatedAt,
		ApprovedAt:   request.ApprovedAt,
		RejectedAt:   request.RejectedAt,
		ReceivedAt:   request.ReceivedAt,
		RefundedAt:   request.RefundedAt,
		CancelledAt:  request.CancelledAt,
	}
	if request.Status == domain.ReturnStatusRefunded && request.RefundAmountVND != "" {
		amount := string(request.RefundAmountVND)
		resp.RefundAmountVND = &amount
	}
	return resp
}

type returnItemRequest struct {
	OrderItemID string `json:"orderItemId"`
	Quantity    int64  `json:"quantity"`
}

type createReturnRequestInput struct {
	Items       []returnItemRequest `json:"items"`
	ReasonCode  string              `json:"reasonCode"`
	Description string              `json:"description"`
}

func (h *returnHandler) Create(c *gin.Context) {
	var req createReturnRequestInput
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	orderID := c.Param("id")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	items := make([]domain.ReturnItemInput, len(req.Items))
	for i, item := range req.Items {
		items[i] = domain.ReturnItemInput{
			OrderItemID: item.OrderItemID,
			Quantity:    item.Quantity,
		}
	}

	request, err := h.uc.Create(c.Request.Context(), userID, orderID, req.ReasonCode, req.Description, items)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Tạo yêu cầu trả hàng thành công", toReturnRequestResponse(*request))
}

func (h *returnHandler) ListByOrder(c *gin.Context) {
	orderID := c.Param("id")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	requests, err := h.uc.ListByOrder(c.Request.Context(), userID, orderID)
	if err != nil {
		writeError(c, err)
		return
	}

	resp := make([]returnRequestResponse, len(requests))
	for i, request := range requests {
		resp[i] = toReturnRequestResponse(request)
	}

	writeSuccess(c, http.StatusOK, "Lấy danh sách yêu cầu trả hàng thành công", resp)
}

func (h *returnHandler) Cancel(c *gin.Context) {
	requestID := c.Param("requestId")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	request, err := h.uc.Cancel(c.Request.Context(), userID, requestID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Rút yêu cầu trả hàng thành công", toReturnRequestResponse(*request))
}
