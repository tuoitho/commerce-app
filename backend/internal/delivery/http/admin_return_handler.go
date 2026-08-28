package http

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	returnuc "commerce-backend/internal/usecase/returns"
)

type AdminReturnHandler struct {
	returnUC *returnuc.UseCase
}

func NewAdminReturnHandler(returnUC *returnuc.UseCase) *AdminReturnHandler {
	return &AdminReturnHandler{returnUC: returnUC}
}

func newAdminReturnHandler(returnUC *returnuc.UseCase) *AdminReturnHandler {
	return NewAdminReturnHandler(returnUC)
}

type adminReturnSummaryResponse struct {
	ID                string    `json:"id"`
	OrderID           string    `json:"orderId"`
	UserID            string    `json:"userId"`
	BuyerEmail        string    `json:"buyerEmail"`
	Status            string    `json:"status"`
	ReasonCode        string    `json:"reasonCode"`
	ExpectedRefundVND string    `json:"expectedRefundVnd"`
	CreatedAt         time.Time `json:"createdAt"`
}

type rejectReturnRequestPayload struct {
	RejectReason string `json:"rejectReason"`
}

type receiveItemMappingPayload struct {
	OrderItemID       string `json:"orderItemId"`
	ReceivedVariantID string `json:"receivedVariantId"`
}

type receiveReturnRequestPayload struct {
	Items []receiveItemMappingPayload `json:"items"`
}

type variantOptionResponse struct {
	VariantID     string              `json:"variantId"`
	ProductID     string              `json:"productId"`
	BrandName     string              `json:"brandName"`
	ProductName   string              `json:"productName"`
	Model         string              `json:"model"`
	Options       []domain.CartOption `json:"options"`
	StockQuantity int64               `json:"stockQuantity"`
	ProductActive bool                `json:"productActive"`
	VariantActive bool                `json:"variantActive"`
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

	returns, total, err := h.returnUC.AdminList(c.Request.Context(), status, page, limit)
	if err != nil {
		writeError(c, err)
		return
	}

	out := make([]adminReturnSummaryResponse, len(returns))
	for i, r := range returns {
		out[i] = adminReturnSummaryResponse{
			ID:                r.ID,
			OrderID:           r.OrderID,
			UserID:            r.UserID,
			BuyerEmail:        r.BuyerEmail,
			Status:            string(r.Status),
			ReasonCode:        string(r.ReasonCode),
			ExpectedRefundVND: string(r.ExpectedRefundVND),
			CreatedAt:         r.CreatedAt,
		}
	}

	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	pagination := PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	writePaginatedSuccess(c, http.StatusOK, "Thành công", out, pagination)
}

func (h *AdminReturnHandler) VariantOptions(c *gin.Context) {
	q := c.Query("q")
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

	items, total, err := h.returnUC.AdminSearchVariantOptions(c.Request.Context(), q, page, limit)
	if err != nil {
		writeError(c, err)
		return
	}

	out := make([]variantOptionResponse, len(items))
	for i, it := range items {
		out[i] = variantOptionResponse{
			VariantID:     it.VariantID,
			ProductID:     it.ProductID,
			BrandName:     it.BrandName,
			ProductName:   it.ProductName,
			Model:         it.Model,
			Options:       it.Options,
			StockQuantity: it.StockQuantity,
			ProductActive: it.ProductActive,
			VariantActive: it.VariantActive,
		}
	}

	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	pagination := PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	writePaginatedSuccess(c, http.StatusOK, "Thành công", out, pagination)
}

func (h *AdminReturnHandler) GetByID(c *gin.Context) {
	returnID := c.Param("returnId")
	ret, err := h.returnUC.AdminGetByID(c.Request.Context(), returnID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thành công", toReturnRequestResponse(ret, true))
}

func (h *AdminReturnHandler) Approve(c *gin.Context) {
	returnID := c.Param("returnId")
	ret, err := h.returnUC.AdminApprove(c.Request.Context(), returnID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Duyệt yêu cầu trả hàng thành công", toReturnRequestResponse(ret, true))
}

func (h *AdminReturnHandler) Reject(c *gin.Context) {
	returnID := c.Param("returnId")

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	decoder := json.NewDecoder(bytes.NewReader(bodyBytes))
	decoder.DisallowUnknownFields()
	var req rejectReturnRequestPayload
	if err := decoder.Decode(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	ret, err := h.returnUC.AdminReject(c.Request.Context(), returnID, req.RejectReason)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Từ chối yêu cầu trả hàng thành công", toReturnRequestResponse(ret, true))
}

func (h *AdminReturnHandler) Receive(c *gin.Context) {
	returnID := c.Param("returnId")

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	decoder := json.NewDecoder(bytes.NewReader(bodyBytes))
	decoder.DisallowUnknownFields()
	var req receiveReturnRequestPayload
	if err := decoder.Decode(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	mappings := make([]domain.ReceiveItemMapping, len(req.Items))
	for i, it := range req.Items {
		mappings[i] = domain.ReceiveItemMapping{
			OrderItemID:       it.OrderItemID,
			ReceivedVariantID: it.ReceivedVariantID,
		}
	}

	ret, err := h.returnUC.AdminReceive(c.Request.Context(), returnID, mappings)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Xác nhận nhận hàng trả thành công", toReturnRequestResponse(ret, true))
}

func (h *AdminReturnHandler) Refund(c *gin.Context) {
	returnID := c.Param("returnId")
	adminUserID := callerUserID(c)

	ret, err := h.returnUC.AdminRefund(c.Request.Context(), returnID, adminUserID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Hoàn tiền yêu cầu trả hàng thành công", toReturnRequestResponse(ret, true))
}
