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

func (h *voucherHandler) ListDiscover(c *gin.Context) {
	items, err := h.uc.ListDiscover(c.Request.Context(), callerUserID(c))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Lấy danh sách mã giảm giá đang phát hành thành công", items)
}

func (h *voucherHandler) Claim(c *gin.Context) {
	item, err := h.uc.Claim(c.Request.Context(), callerUserID(c), c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Lưu mã giảm giá vào ví thành công", item)
}

func (h *voucherHandler) ListWallet(c *gin.Context) {
	items, err := h.uc.ListWallet(c.Request.Context(), callerUserID(c), c.Query("status"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Lấy ví mã giảm giá thành công", items)
}
