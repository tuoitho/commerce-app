package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	flashsaleuc "commerce-backend/internal/usecase/flashsale"
)

type flashSaleHandler struct {
	uc *flashsaleuc.UseCase
}

func newFlashSaleHandler(uc *flashsaleuc.UseCase) *flashSaleHandler {
	return &flashSaleHandler{uc: uc}
}

func (h *flashSaleHandler) GetCurrent(c *gin.Context) {
	campaign, err := h.uc.GetCurrentPublic(c.Request.Context())
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Lấy thông tin Flash Sale thành công", campaign)
}
