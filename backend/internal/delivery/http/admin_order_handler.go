package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	orderuc "commerce-backend/internal/usecase/order"
)

type AdminOrderHandler struct {
	orderUC *orderuc.UseCase
}

func NewAdminOrderHandler(orderUC *orderuc.UseCase) *AdminOrderHandler {
	return &AdminOrderHandler{orderUC: orderUC}
}

func newAdminOrderHandler(orderUC *orderuc.UseCase) *AdminOrderHandler {
	return NewAdminOrderHandler(orderUC)
}

type adminOrderResponse struct {
	ID             string              `json:"id"`
	UserID         string              `json:"userId"`
	BuyerEmail     string              `json:"buyerEmail"`
	Status         string              `json:"status"`
	PaymentMethod  string              `json:"paymentMethod"`
	RecipientName  string              `json:"recipientName"`
	Phone          string              `json:"phone"`
	ProvinceName   string              `json:"provinceName"`
	WardName       string              `json:"wardName"`
	DetailAddress  string              `json:"detailAddress"`
	SubtotalVND    string              `json:"subtotalVnd"`
	ShippingFeeVND string              `json:"shippingFeeVnd"`
	TotalVND       string              `json:"totalVnd"`
	Items          []orderItemResponse `json:"items"`
	CreatedAt      time.Time           `json:"createdAt"`
	UpdatedAt      time.Time           `json:"updatedAt"`
	ConfirmedAt    *time.Time          `json:"confirmedAt,omitempty"`
	CancelledAt    *time.Time          `json:"cancelledAt,omitempty"`
}

func toAdminOrderResponse(order domain.Order) adminOrderResponse {
	base := toOrderResponse(order)
	return adminOrderResponse{
		ID:             base.ID,
		UserID:         base.UserID,
		BuyerEmail:     order.BuyerEmail,
		Status:         base.Status,
		PaymentMethod:  base.PaymentMethod,
		RecipientName:  base.RecipientName,
		Phone:          base.Phone,
		ProvinceName:   base.ProvinceName,
		WardName:       base.WardName,
		DetailAddress:  base.DetailAddress,
		SubtotalVND:    base.SubtotalVND,
		ShippingFeeVND: base.ShippingFeeVND,
		TotalVND:       base.TotalVND,
		Items:          base.Items,
		CreatedAt:      base.CreatedAt,
		UpdatedAt:      base.UpdatedAt,
		ConfirmedAt:    base.ConfirmedAt,
		CancelledAt:    base.CancelledAt,
	}
}

func (h *AdminOrderHandler) List(c *gin.Context) {
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

	orders, err := h.orderUC.AdminList(c.Request.Context(), status)
	if err != nil {
		writeError(c, err)
		return
	}

	out := make([]adminOrderResponse, 0, len(orders))
	for _, o := range orders {
		out = append(out, toAdminOrderResponse(o))
	}

	total := len(out)
	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}
	offset := (page - 1) * limit
	var pageItems []adminOrderResponse
	if offset < total {
		end := offset + limit
		if end > total {
			end = total
		}
		pageItems = out[offset:end]
	} else {
		pageItems = []adminOrderResponse{}
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

func (h *AdminOrderHandler) GetByID(c *gin.Context) {
	order, err := h.orderUC.AdminGetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thành công", toAdminOrderResponse(*order))
}

func (h *AdminOrderHandler) ConfirmPreparing(c *gin.Context) {
	order, err := h.orderUC.AdminTransition(c.Request.Context(), c.Param("id"), domain.OrderAdminActionConfirmPreparing)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thành công", toAdminOrderResponse(*order))
}

func (h *AdminOrderHandler) Ship(c *gin.Context) {
	order, err := h.orderUC.AdminTransition(c.Request.Context(), c.Param("id"), domain.OrderAdminActionShip)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thành công", toAdminOrderResponse(*order))
}

func (h *AdminOrderHandler) Deliver(c *gin.Context) {
	order, err := h.orderUC.AdminTransition(c.Request.Context(), c.Param("id"), domain.OrderAdminActionDeliver)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thành công", toAdminOrderResponse(*order))
}

func (h *AdminOrderHandler) ApproveCancel(c *gin.Context) {
	order, err := h.orderUC.AdminTransition(c.Request.Context(), c.Param("id"), domain.OrderAdminActionApproveCancel)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thành công", toAdminOrderResponse(*order))
}

func (h *AdminOrderHandler) DeclineCancel(c *gin.Context) {
	order, err := h.orderUC.AdminTransition(c.Request.Context(), c.Param("id"), domain.OrderAdminActionDeclineCancel)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thành công", toAdminOrderResponse(*order))
}
