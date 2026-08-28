package http

import (
	"commerce-backend/internal/domain"
	"commerce-backend/internal/usecase/review"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
)

type AdminReviewHandler struct {
	reviewUC *review.ReviewUseCase
}

func NewAdminReviewHandler(reviewUC *review.ReviewUseCase) *AdminReviewHandler {
	return &AdminReviewHandler{
		reviewUC: reviewUC,
	}
}

func (h *AdminReviewHandler) ListReviews(c *gin.Context) {
	ctx := c.Request.Context()

	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))
	ratingFilter, _ := strconv.Atoi(c.Query("rating"))
	hasReplyFilter := c.Query("has_reply")

	result, err := h.reviewUC.GetAdminReviews(ctx, int16(ratingFilter), hasReplyFilter, page, limit)
	if err != nil {
		c.Error(err)
		return
	}

	if limit <= 0 {
		limit = 10
	}
	totalPages := (result.Total + int64(limit) - 1) / int64(limit)
	if totalPages == 0 {
		totalPages = 1
	}

	writePaginatedSuccess(c, http.StatusOK, "Admin reviews retrieved successfully", result.Reviews, PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      int(result.Total),
		TotalPages: int(totalPages),
		HasNext:    page < int(totalPages),
		HasPrev:    page > 1,
	})
}

func (h *AdminReviewHandler) UpdateReply(c *gin.Context) {
	ctx := c.Request.Context()
	reviewID := c.Param("id")

	var req struct {
		Reply string `json:"reply"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.Error(domain.NewValidationError(map[string]string{
			"body": "Định dạng không hợp lệ",
		}))
		return
	}

	updated, err := h.reviewUC.UpdateAdminReply(ctx, reviewID, &req.Reply)
	if err != nil {
		c.Error(err)
		return
	}

	writeSuccess(c, http.StatusOK, "Cập nhật phản hồi thành công", updated)
}

func (h *AdminReviewHandler) DeleteReply(c *gin.Context) {
	ctx := c.Request.Context()
	reviewID := c.Param("id")

	updated, err := h.reviewUC.UpdateAdminReply(ctx, reviewID, nil)
	if err != nil {
		c.Error(err)
		return
	}

	writeSuccess(c, http.StatusOK, "Xóa phản hồi thành công", updated)
}

