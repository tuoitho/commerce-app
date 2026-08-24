package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	returnsuc "commerce-backend/internal/usecase/returns"
)

type AdminReturnHandler struct {
	uc *returnsuc.UseCase
}

func newAdminReturnHandler(uc *returnsuc.UseCase) *AdminReturnHandler {
	return &AdminReturnHandler{uc: uc}
}

type adminReturnRequestResponse struct {
	ID              string               `json:"id"`
	OrderID         string               `json:"orderId"`
	UserID          string               `json:"buyerUserId"`
	BuyerEmail      string               `json:"buyerEmail"`
	Status          string               `json:"status"`
	ReasonCode      string               `json:"reasonCode"`
	Description     string               `json:"description"`
	RejectReason    string               `json:"rejectReason"`
	Items           []returnItemResponse `json:"items"`
	RefundAmountVND *string              `json:"refundAmountVnd,omitempty"`
	OrderTotalVND   string               `json:"orderTotalVnd"`
	ShippingFeeVND  string               `json:"shippingFeeVnd"`
	SuggestedVND    string               `json:"suggestedRefundVnd"`
	CreatedAt       time.Time            `json:"createdAt"`
	UpdatedAt       time.Time            `json:"updatedAt"`
	ApprovedAt      *time.Time           `json:"approvedAt,omitempty"`
	RejectedAt      *time.Time           `json:"rejectedAt,omitempty"`
	ReceivedAt      *time.Time           `json:"receivedAt,omitempty"`
	RefundedAt      *time.Time           `json:"refundedAt,omitempty"`
	CancelledAt     *time.Time           `json:"cancelledAt,omitempty"`
}

func toAdminReturnRequestResponse(request domain.ReturnRequest) adminReturnRequestResponse {
	base := toReturnRequestResponse(request)
	return adminReturnRequestResponse{
		ID:              base.ID,
		OrderID:         base.OrderID,
		UserID:          request.UserID,
		BuyerEmail:      request.BuyerEmail,
		Status:          base.Status,
		ReasonCode:      base.ReasonCode,
		Description:     base.Description,
		RejectReason:    base.RejectReason,
		Items:           base.Items,
		RefundAmountVND: base.RefundAmountVND,
		OrderTotalVND:   string(request.OrderTotalVND),
		ShippingFeeVND:  string(request.ShippingFeeVND),
		SuggestedVND:    string(request.SuggestedRefundVND),
		CreatedAt:       base.CreatedAt,
		UpdatedAt:       base.UpdatedAt,
		ApprovedAt:      base.ApprovedAt,
		RejectedAt:      base.RejectedAt,
		ReceivedAt:      base.ReceivedAt,
		RefundedAt:      base.RefundedAt,
		CancelledAt:     base.CancelledAt,
	}
}

func (h *AdminReturnHandler) List(c *gin.Context) {
	status := c.Query("status")
	pageStr, pageSet := c.GetQuery("page")
	limitStr, limitSet := c.GetQuery("limit")

	fields := map[string]string{}
	page := 1
	limit := 20

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
		writeError(c, domain.NewValidationError(fields))
		return
	}

	requests, err := h.uc.AdminList(c.Request.Context(), status)
	if err != nil {
		writeError(c, err)
		return
	}

	out := make([]adminReturnRequestResponse, 0, len(requests))
	for _, request := range requests {
		out = append(out, toAdminReturnRequestResponse(request))
	}

	total := len(out)
	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}
	offset := (page - 1) * limit
	var pageItems []adminReturnRequestResponse
	if offset < total {
		end := offset + limit
		if end > total {
			end = total
		}
		pageItems = out[offset:end]
	} else {
		pageItems = []adminReturnRequestResponse{}
	}

	pagination := PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	writePaginatedSuccess(c, http.StatusOK, "Thành công", pageItems, pagination)
}

func (h *AdminReturnHandler) GetByID(c *gin.Context) {
	request, err := h.uc.AdminGetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thành công", toAdminReturnRequestResponse(*request))
}

type rejectReturnInput struct {
	Reason string `json:"reason"`
}

func (h *AdminReturnHandler) Approve(c *gin.Context) {
	h.handleAction(c, domain.ReturnActionApprove, "", "")
}

func (h *AdminReturnHandler) Reject(c *gin.Context) {
	var req rejectReturnInput
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"reason": "Vui lòng nhập lý do từ chối"}))
		return
	}
	h.handleAction(c, domain.ReturnActionReject, req.Reason, "")
}

func (h *AdminReturnHandler) Receive(c *gin.Context) {
	h.handleAction(c, domain.ReturnActionReceive, "", "")
}

type recordRefundInput struct {
	Amount string `json:"amount"`
}

func (h *AdminReturnHandler) RecordRefund(c *gin.Context) {
	var req recordRefundInput
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"amount": "Số tiền hoàn phải là số nguyên VND lớn hơn 0"}))
		return
	}
	h.handleAction(c, domain.ReturnActionRefund, "", req.Amount)
}

func (h *AdminReturnHandler) handleAction(c *gin.Context, action domain.ReturnAdminAction, reason, amount string) {
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	requestID := c.Param("id")
	adminUserID := callerUserID(c)

	request, err := h.uc.AdminAction(c.Request.Context(), requestID, string(action), reason, amount, adminUserID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thành công", toAdminReturnRequestResponse(*request))
}
