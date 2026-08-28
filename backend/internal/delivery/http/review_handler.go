package http

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	reviewuc "commerce-backend/internal/usecase/review"
)

type reviewHandler struct {
	uc *reviewuc.UseCase
}

func newReviewHandler(uc *reviewuc.UseCase) *reviewHandler {
	return &reviewHandler{uc: uc}
}

type createReviewPayloadJSON struct {
	Rating  *int                          `json:"rating"`
	Comment string                        `json:"comment"`
	Media   []reviewuc.MediaManifestItem `json:"media"`
}

type editReviewPayloadJSON struct {
	Rating  *int                          `json:"rating"`
	Comment string                        `json:"comment"`
	Media   []reviewuc.MediaManifestItem `json:"media"`
}

func (h *reviewHandler) Create(c *gin.Context) {
	orderID := c.Param("id")
	orderItemID := c.Param("orderItemId")
	if _, err := uuid.Parse(orderID); err != nil {
		respondError(c, 404, "order_not_found", "Không tìm thấy đơn hàng", nil)
		return
	}
	if _, err := uuid.Parse(orderItemID); err != nil {
		respondError(c, 404, "order_not_found", "Không tìm thấy đơn hàng", nil)
		return
	}

	userID := c.GetString(contextUserKey)
	if userID == "" {
		respondError(c, 401, "unauthorized", "Vui lòng đăng nhập để đánh giá sản phẩm", nil)
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", map[string]string{
			"payload": "Yêu cầu phải ở định dạng multipart/form-data",
		})
		return
	}

	payloadValues := form.Value["payload"]
	if len(payloadValues) == 0 || strings.TrimSpace(payloadValues[0]) == "" {
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", map[string]string{
			"payload": "Thiếu dữ liệu đánh giá",
		})
		return
	}

	var payload createReviewPayloadJSON
	if err := json.Unmarshal([]byte(payloadValues[0]), &payload); err != nil {
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", map[string]string{
			"payload": "Dữ liệu JSON không hợp lệ",
		})
		return
	}

	filesHeader := form.File["files"]
	fileUploads := make([]reviewuc.FileUpload, len(filesHeader))
	for i, fh := range filesHeader {
		f, err := fh.Open()
		if err != nil {
			respondError(c, 500, "internal", "Đã xảy ra lỗi hệ thống", nil)
			return
		}
		defer f.Close()
		fileUploads[i] = reviewuc.FileUpload{
			Index:        i,
			Reader:       f,
			DeclaredSize: fh.Size,
		}
	}

	ratingVal := 0
	ratingSet := false
	if payload.Rating != nil {
		ratingVal = *payload.Rating
		ratingSet = true
	}

	input := reviewuc.CreateInput{
		OrderID:     orderID,
		OrderItemID: orderItemID,
		UserID:      userID,
		Rating:      ratingVal,
		RatingSet:   ratingSet,
		Comment:     payload.Comment,
		Media:       payload.Media,
		Files:       fileUploads,
	}

	rev, err := h.uc.CreateReview(c.Request.Context(), input)
	if err != nil {
		writeError(c, err)
		return
	}

	c.JSON(http.StatusCreated, ResponseEnvelope{
		Success: true,
		Message: "Tạo đánh giá thành công",
		Data:    rev,
		Error:   nil,
		Meta: ResponseMeta{
			Timestamp: time.Now().UTC(),
		},
	})
}

func (h *reviewHandler) GetOwnedReview(c *gin.Context) {
	reviewID := c.Param("reviewId")
	if _, err := uuid.Parse(reviewID); err != nil {
		respondError(c, 404, "review_not_found", "Không tìm thấy đánh giá", nil)
		return
	}

	userID := c.GetString(contextUserKey)
	if userID == "" {
		respondError(c, 401, "unauthorized", "Vui lòng đăng nhập để đánh giá sản phẩm", nil)
		return
	}

	rev, err := h.uc.GetOwnedReview(c.Request.Context(), reviewID, userID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Thông tin đánh giá", rev)
}

func (h *reviewHandler) EditOwnedReview(c *gin.Context) {
	reviewID := c.Param("reviewId")
	if _, err := uuid.Parse(reviewID); err != nil {
		respondError(c, 404, "review_not_found", "Không tìm thấy đánh giá", nil)
		return
	}

	userID := c.GetString(contextUserKey)
	if userID == "" {
		respondError(c, 401, "unauthorized", "Vui lòng đăng nhập để đánh giá sản phẩm", nil)
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", map[string]string{
			"payload": "Yêu cầu phải ở định dạng multipart/form-data",
		})
		return
	}

	payloadValues := form.Value["payload"]
	if len(payloadValues) == 0 || strings.TrimSpace(payloadValues[0]) == "" {
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", map[string]string{
			"payload": "Thiếu dữ liệu đánh giá",
		})
		return
	}

	var payload editReviewPayloadJSON
	if err := json.Unmarshal([]byte(payloadValues[0]), &payload); err != nil {
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", map[string]string{
			"payload": "Dữ liệu JSON không hợp lệ",
		})
		return
	}

	filesHeader := form.File["files"]
	fileUploads := make([]reviewuc.FileUpload, len(filesHeader))
	for i, fh := range filesHeader {
		f, err := fh.Open()
		if err != nil {
			respondError(c, 500, "internal", "Đã xảy ra lỗi hệ thống", nil)
			return
		}
		defer f.Close()
		fileUploads[i] = reviewuc.FileUpload{
			Index:        i,
			Reader:       f,
			DeclaredSize: fh.Size,
		}
	}

	ratingVal := 0
	ratingSet := false
	if payload.Rating != nil {
		ratingVal = *payload.Rating
		ratingSet = true
	}

	input := reviewuc.EditInput{
		ReviewID:  reviewID,
		UserID:    userID,
		Rating:    ratingVal,
		RatingSet: ratingSet,
		Comment:   payload.Comment,
		Media:     payload.Media,
		Files:     fileUploads,
	}

	rev, err := h.uc.EditReview(c.Request.Context(), input)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Cập nhật đánh giá thành công", rev)
}

func (h *reviewHandler) ListProductReviews(c *gin.Context) {
	productID := c.Param("id")
	if _, err := uuid.Parse(productID); err != nil {
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", map[string]string{
			"productId": "Mã sản phẩm không hợp lệ",
		})
		return
	}

	page := 1
	limit := 10

	fields := make(map[string]string)
	if rawPage := c.Query("page"); rawPage != "" {
		p, err := strconv.Atoi(rawPage)
		if err != nil || p <= 0 {
			fields["page"] = "Trang phải là số nguyên dương"
		} else {
			page = p
		}
	}

	if rawLimit := c.Query("limit"); rawLimit != "" {
		l, err := strconv.Atoi(rawLimit)
		if err != nil || l < 1 || l > 50 {
			fields["limit"] = "Số lượng trên mỗi trang phải từ 1 đến 50"
		} else {
			limit = l
		}
	}

	if len(fields) > 0 {
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", fields)
		return
	}

	currentUserID := c.GetString(contextUserKey)
	reviews, total, err := h.uc.ListProductReviews(c.Request.Context(), productID, page, limit, currentUserID)
	if err != nil {
		writeError(c, err)
		return
	}

	totalPages := 0
	if total > 0 {
		totalPages = int(math.Ceil(float64(total) / float64(limit)))
	}

	writePaginatedSuccess(c, http.StatusOK, "Danh sách đánh giá sản phẩm", reviews, PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      int(total),
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	})
}

func (h *reviewHandler) ListOwnedReviews(c *gin.Context) {
	userID := c.GetString(contextUserKey)
	if userID == "" {
		respondError(c, http.StatusUnauthorized, "unauthorized", "Vui lòng đăng nhập để đánh giá sản phẩm", nil)
		return
	}

	page := 1
	limit := 10

	fields := make(map[string]string)
	if rawPage := c.Query("page"); rawPage != "" {
		p, err := strconv.Atoi(rawPage)
		if err != nil || p <= 0 {
			fields["page"] = "Trang phải là số nguyên dương"
		} else {
			page = p
		}
	}

	if rawLimit := c.Query("limit"); rawLimit != "" {
		l, err := strconv.Atoi(rawLimit)
		if err != nil || l < 1 || l > 50 {
			fields["limit"] = "Số lượng trên mỗi trang phải từ 1 đến 50"
		} else {
			limit = l
		}
	}

	if len(fields) > 0 {
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", fields)
		return
	}

	items, total, err := h.uc.ListOwnedReviews(c.Request.Context(), userID, page, limit)
	if err != nil {
		writeError(c, err)
		return
	}

	totalPages := 0
	if total > 0 {
		totalPages = int(math.Ceil(float64(total) / float64(limit)))
	}

	writePaginatedSuccess(c, http.StatusOK, "Danh sách đánh giá của tôi", items, PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      int(total),
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	})
}
