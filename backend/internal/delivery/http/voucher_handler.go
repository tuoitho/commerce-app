package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	voucheruc "commerce-backend/internal/usecase/voucher"
)

type voucherHandler struct {
	uc *voucheruc.UseCase
}

func newVoucherHandler(uc *voucheruc.UseCase) *voucherHandler {
	return &voucherHandler{uc: uc}
}

func (h *voucherHandler) ListAvailable(c *gin.Context) {
	items, err := h.uc.ListAvailable(c.Request.Context(), callerUserID(c))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Lấy danh sách mã giảm giá khả dụng thành công", items)
}
