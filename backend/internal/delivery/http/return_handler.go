package http

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	returnuc "commerce-backend/internal/usecase/returns"
)

type returnHandler struct {
	uc *returnuc.UseCase
}

func newReturnHandler(uc *returnuc.UseCase) *returnHandler {
	return &returnHandler{uc: uc}
}

type createReturnRequestPayload struct {
	OrderItemIDs []string                `json:"orderItemIds"`
	ReasonCode   domain.ReturnReasonCode `json:"reasonCode"`
	Description  string                  `json:"description"`
}

func (h *returnHandler) Create(c *gin.Context) {
	orderID := c.Param("id")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	decoder := json.NewDecoder(bytes.NewReader(bodyBytes))
	decoder.DisallowUnknownFields()
	var req createReturnRequestPayload
	if err := decoder.Decode(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	res, err := h.uc.Create(c.Request.Context(), userID, orderID, req.OrderItemIDs, req.ReasonCode, req.Description)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Tạo yêu cầu trả hàng thành công", toReturnRequestResponse(res, false))
}

func (h *returnHandler) Cancel(c *gin.Context) {
	orderID := c.Param("id")
	returnID := c.Param("returnId")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	res, err := h.uc.Cancel(c.Request.Context(), userID, orderID, returnID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Hủy yêu cầu trả hàng thành công", toReturnRequestResponse(res, false))
}
