package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	liveuc "commerce-backend/internal/usecase/live"
)

type liveHandler struct {
	uc *liveuc.UseCase
}

func newLiveHandler(uc *liveuc.UseCase) *liveHandler {
	return &liveHandler{uc: uc}
}

func (h *liveHandler) current(c *gin.Context) {
	summary, err := h.uc.CurrentSummary(c.Request.Context())
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Live session retrieved successfully", summary)
}

func (h *liveHandler) session(c *gin.Context) {
	view, err := h.uc.SessionView(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Live session retrieved successfully", view)
}

type liveCommentRequest struct {
	Content string `json:"content"`
}

func (h *liveHandler) comment(c *gin.Context) {
	var req liveCommentRequest
	if !bindLiveJSON(c, &req) {
		return
	}
	comment, err := h.uc.Comment(c.Request.Context(), c.Param("id"), callerUserID(c), callerRole(c), req.Content)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusCreated, "Đã gửi bình luận", comment)
}

type liveVariantRequest struct {
	VariantID    string `json:"variantId"`
	LivePriceVnd string `json:"livePriceVnd"`
	Quota        *int   `json:"quota"`
}

type liveProductRequest struct {
	ProductID string               `json:"productId"`
	Variants  []liveVariantRequest `json:"variants"`
}

type createLiveSessionRequest struct {
	Title    string               `json:"title"`
	Products []liveProductRequest `json:"products"`
}

type replaceLiveProductsRequest struct {
	Products []liveProductRequest `json:"products"`
}

type pinLiveProductRequest struct {
	ProductID *string `json:"productId"`
}

func toLiveProductInputs(products []liveProductRequest) []domain.LiveProductInput {
	inputs := make([]domain.LiveProductInput, len(products))
	for i, p := range products {
		inputs[i] = domain.LiveProductInput{ProductID: p.ProductID}
		for _, v := range p.Variants {
			inputs[i].Variants = append(inputs[i].Variants, domain.LiveVariantInput{
				VariantID:    v.VariantID,
				LivePriceVND: domain.MoneyVND(v.LivePriceVnd),
				Quota:        v.Quota,
			})
		}
	}
	return inputs
}

func bindLiveJSON(c *gin.Context, target any) bool {
	if err := c.ShouldBindJSON(target); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return false
	}
	return true
}

type adminLiveHandler struct {
	uc *liveuc.UseCase
}

func newAdminLiveHandler(uc *liveuc.UseCase) *adminLiveHandler {
	return &adminLiveHandler{uc: uc}
}

func (h *adminLiveHandler) current(c *gin.Context) {
	session, err := h.uc.AdminCurrent(c.Request.Context())
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Live session retrieved successfully", session)
}

func (h *adminLiveHandler) get(c *gin.Context) {
	session, err := h.uc.AdminSession(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Live session retrieved successfully", session)
}

func (h *adminLiveHandler) create(c *gin.Context) {
	var req createLiveSessionRequest
	if !bindLiveJSON(c, &req) {
		return
	}
	session, err := h.uc.Create(c.Request.Context(), callerUserID(c), req.Title, toLiveProductInputs(req.Products))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusCreated, "Đã bắt đầu phiên live", session)
}

func (h *adminLiveHandler) replaceProducts(c *gin.Context) {
	var req replaceLiveProductsRequest
	if !bindLiveJSON(c, &req) {
		return
	}
	session, err := h.uc.ReplaceProducts(c.Request.Context(), c.Param("id"), toLiveProductInputs(req.Products))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Đã cập nhật giỏ hàng live", session)
}

func (h *adminLiveHandler) pin(c *gin.Context) {
	var req pinLiveProductRequest
	if !bindLiveJSON(c, &req) {
		return
	}
	session, err := h.uc.SetPin(c.Request.Context(), c.Param("id"), req.ProductID)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Đã cập nhật sản phẩm ghim", session)
}

func (h *adminLiveHandler) comment(c *gin.Context) {
	var req liveCommentRequest
	if !bindLiveJSON(c, &req) {
		return
	}
	comment, err := h.uc.Comment(c.Request.Context(), c.Param("id"), callerUserID(c), domain.RoleAdmin, req.Content)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusCreated, "Đã gửi bình luận", comment)
}

func (h *adminLiveHandler) hideComment(c *gin.Context) {
	comment, err := h.uc.HideComment(c.Request.Context(), c.Param("commentId"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Đã ẩn bình luận", comment)
}

func (h *adminLiveHandler) end(c *gin.Context) {
	session, err := h.uc.End(c.Request.Context(), c.Param("id"), domain.LiveEndReasonAdmin)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Đã kết thúc phiên live", session)
}
