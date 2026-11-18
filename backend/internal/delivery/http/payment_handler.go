package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	orderuc "commerce-backend/internal/usecase/order"
)

type paymentHandler struct {
	uc *orderuc.UseCase
}

func newPaymentHandler(uc *orderuc.UseCase) *paymentHandler {
	return &paymentHandler{uc: uc}
}

// flexString accepts either a JSON string or an unquoted JSON integer token without float64 precision loss.
type flexString string

func (f *flexString) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return errors.New("null callback string")
	}
	if trimmed[0] == '"' {
		var s string
		if err := json.Unmarshal(trimmed, &s); err != nil {
			return err
		}
		*f = flexString(s)
		return nil
	}
	if !isIntegerLiteral(trimmed) {
		return errors.New("invalid callback string token")
	}
	*f = flexString(trimmed)
	return nil
}

// flexInt accepts either a JSON integer or a quoted integer string (e.g. from URL query parameters).
type flexInt int

func (f *flexInt) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return errors.New("null callback int")
	}
	var raw string
	if trimmed[0] == '"' {
		if err := json.Unmarshal(trimmed, &raw); err != nil {
			return err
		}
		raw = strings.TrimSpace(raw)
	} else {
		if !isIntegerLiteral(trimmed) {
			return errors.New("invalid callback int token")
		}
		raw = string(trimmed)
	}
	val, err := strconv.Atoi(raw)
	if err != nil {
		return err
	}
	*f = flexInt(val)
	return nil
}

func isIntegerLiteral(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	start := 0
	if b[0] == '-' {
		if len(b) == 1 {
			return false
		}
		start = 1
	}
	for i := start; i < len(b); i++ {
		if b[i] < '0' || b[i] > '9' {
			return false
		}
	}
	return true
}

type momoCallbackRequest struct {
	PartnerCode  flexString `json:"partnerCode"`
	OrderID      flexString `json:"orderId"`
	RequestID    flexString `json:"requestId"`
	Amount       flexString `json:"amount"`
	OrderInfo    flexString `json:"orderInfo"`
	OrderType    flexString `json:"orderType"`
	TransID      flexString `json:"transId"`
	ResultCode   flexInt    `json:"resultCode"`
	Message      flexString `json:"message"`
	PayType      flexString `json:"payType"`
	ResponseTime flexString `json:"responseTime"`
	ExtraData    flexString `json:"extraData"`
	Signature    flexString `json:"signature"`
}

func (r momoCallbackRequest) toPayload() domain.MomoCallbackPayload {
	return domain.MomoCallbackPayload{
		PartnerCode:  string(r.PartnerCode),
		OrderID:      string(r.OrderID),
		RequestID:    string(r.RequestID),
		Amount:       string(r.Amount),
		OrderInfo:    string(r.OrderInfo),
		OrderType:    string(r.OrderType),
		TransID:      string(r.TransID),
		ResultCode:   int(r.ResultCode),
		Message:      string(r.Message),
		PayType:      string(r.PayType),
		ResponseTime: string(r.ResponseTime),
		ExtraData:    string(r.ExtraData),
		Signature:    string(r.Signature),
	}
}

func (h *paymentHandler) HandleMomoReturn(c *gin.Context) {
	var req momoCallbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.ErrMomoInvalidCallback)
		return
	}
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	userID := callerUserID(c)
	order, err := h.uc.HandleMomoReturn(c.Request.Context(), userID, req.toPayload())
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Xác thực thanh toán MoMo thành công", toOrderResponse(*order))
}

func (h *paymentHandler) HandleMomoIPN(c *gin.Context) {
	var req momoCallbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.ErrMomoInvalidCallback)
		return
	}
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	if err := h.uc.HandleMomoIPN(c.Request.Context(), req.toPayload()); err != nil {
		writeError(c, err)
		return
	}

	c.Status(http.StatusNoContent)
}
