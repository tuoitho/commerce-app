package http

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	reviewuc "commerce-backend/internal/usecase/review"
)

type reviewHandler struct {
	uc *reviewuc.ReviewUseCase
}

func newReviewHandler(uc *reviewuc.ReviewUseCase) *reviewHandler {
	return &reviewHandler{uc: uc}
}

func (h *reviewHandler) createReview(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	orderID := c.Param("id")
	orderItemID := c.Param("itemId")

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, domain.MaxReviewMultipartSizeBytes)

	form, err := c.MultipartForm()
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"body": "Dữ liệu yêu cầu multipart không hợp lệ hoặc vượt quá giới hạn 80MB",
		}))
		return
	}

	ratingStr := form.Value["rating"]
	if len(ratingStr) == 0 || strings.TrimSpace(ratingStr[0]) == "" {
		writeError(c, domain.NewValidationError(map[string]string{
			"rating": "Số sao đánh giá là bắt buộc",
		}))
		return
	}

	ratingVal, err := strconv.ParseInt(strings.TrimSpace(ratingStr[0]), 10, 16)
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"rating": "Số sao đánh giá phải là số nguyên từ 1 đến 5",
		}))
		return
	}

	var comment string
	if comments, ok := form.Value["comment"]; ok && len(comments) > 0 {
		comment = comments[0]
	}

	var images []reviewuc.ReviewFileInput
	if imageHeaders, ok := form.File["images"]; ok {
		for _, fh := range imageHeaders {
			file, err := fh.Open()
			if err != nil {
				writeError(c, domain.NewValidationError(map[string]string{
					"images": "Không thể mở tệp ảnh đính kèm",
				}))
				return
			}
			defer file.Close()
			images = append(images, reviewuc.ReviewFileInput{
				Reader:      file,
				Size:        fh.Size,
				ContentType: fh.Header.Get("Content-Type"),
				Filename:    fh.Filename,
			})
		}
	}

	var video *reviewuc.ReviewFileInput
	if videoHeaders, ok := form.File["video"]; ok && len(videoHeaders) > 0 {
		fh := videoHeaders[0]
		file, err := fh.Open()
		if err != nil {
			writeError(c, domain.NewValidationError(map[string]string{
				"video": "Không thể mở tệp video đính kèm",
			}))
			return
		}
		defer file.Close()
		video = &reviewuc.ReviewFileInput{
			Reader:      file,
			Size:        fh.Size,
			ContentType: fh.Header.Get("Content-Type"),
			Filename:    fh.Filename,
		}
	}

	rev, err := h.uc.CreateReview(c.Request.Context(), userID, orderID, orderItemID, int16(ratingVal), comment, images, video)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Đánh giá sản phẩm thành công", rev)
}

func (h *reviewHandler) updateReview(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	orderID := c.Param("id")
	orderItemID := c.Param("itemId")

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, domain.MaxReviewMultipartSizeBytes)

	form, err := c.MultipartForm()
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"body": "Dữ liệu yêu cầu multipart không hợp lệ hoặc vượt quá giới hạn 80MB",
		}))
		return
	}

	ratingStr := form.Value["rating"]
	if len(ratingStr) == 0 || strings.TrimSpace(ratingStr[0]) == "" {
		writeError(c, domain.NewValidationError(map[string]string{
			"rating": "Số sao đánh giá là bắt buộc",
		}))
		return
	}

	ratingVal, err := strconv.ParseInt(strings.TrimSpace(ratingStr[0]), 10, 16)
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"rating": "Số sao đánh giá phải là số nguyên từ 1 đến 5",
		}))
		return
	}

	var comment string
	if comments, ok := form.Value["comment"]; ok && len(comments) > 0 {
		comment = comments[0]
	}

	var retainedMediaIDs []string
	if ids, ok := form.Value["retainedMediaIds"]; ok {
		for _, id := range ids {
			trimmed := strings.TrimSpace(id)
			if trimmed != "" {
				retainedMediaIDs = append(retainedMediaIDs, trimmed)
			}
		}
	}

	var images []reviewuc.ReviewFileInput
	if imageHeaders, ok := form.File["images"]; ok {
		for _, fh := range imageHeaders {
			file, err := fh.Open()
			if err != nil {
				writeError(c, domain.NewValidationError(map[string]string{
					"images": "Không thể mở tệp ảnh đính kèm",
				}))
				return
			}
			defer file.Close()
			images = append(images, reviewuc.ReviewFileInput{
				Reader:      file,
				Size:        fh.Size,
				ContentType: fh.Header.Get("Content-Type"),
				Filename:    fh.Filename,
			})
		}
	}

	var video *reviewuc.ReviewFileInput
	if videoHeaders, ok := form.File["video"]; ok && len(videoHeaders) > 0 {
		fh := videoHeaders[0]
		file, err := fh.Open()
		if err != nil {
			writeError(c, domain.NewValidationError(map[string]string{
				"video": "Không thể mở tệp video đính kèm",
			}))
			return
		}
		defer file.Close()
		video = &reviewuc.ReviewFileInput{
			Reader:      file,
			Size:        fh.Size,
			ContentType: fh.Header.Get("Content-Type"),
			Filename:    fh.Filename,
		}
	}

	rev, err := h.uc.UpdateReview(c.Request.Context(), userID, orderID, orderItemID, int16(ratingVal), comment, retainedMediaIDs, images, video)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Cập nhật đánh giá thành công", rev)
}

func (h *reviewHandler) getPublicReviews(c *gin.Context) {
	productID := c.Param("id")

	page := 1
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}

	limit := 10
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 10 {
		limit = l
	}

	res, err := h.uc.GetPublicReviews(c.Request.Context(), productID, page, limit)
	if err != nil {
		writeError(c, err)
		return
	}

	totalPages := 0
	if res.Total > 0 {
		totalPages = int((res.Total + int64(limit) - 1) / int64(limit))
	}

	pagination := PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      int(res.Total),
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	data := gin.H{
		"summary": res.Summary,
		"reviews": res.Reviews,
	}

	writePaginatedSuccess(c, http.StatusOK, "Lấy danh sách đánh giá thành công", data, pagination)
}

func (h *reviewHandler) getUserReviews(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	var ratingFilter int16 = 0
	if r := c.Query("rating"); r != "" {
		val, err := strconv.ParseInt(r, 10, 16)
		if err != nil || val < 0 || val > 5 {
			writeError(c, domain.NewValidationError(map[string]string{
				"rating": "Số sao lọc không hợp lệ, phải là số nguyên từ 0 đến 5",
			}))
			return
		}
		ratingFilter = int16(val)
	}

	page := 1
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}

	limit := 10
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 10 {
		limit = l
	}

	res, err := h.uc.GetUserReviews(c.Request.Context(), userID, ratingFilter, page, limit)
	if err != nil {
		writeError(c, err)
		return
	}

	totalPages := 0
	if res.Total > 0 {
		totalPages = int((res.Total + int64(limit) - 1) / int64(limit))
	}

	pagination := PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      int(res.Total),
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	data := gin.H{
		"reviews": res.Reviews,
	}

	writePaginatedSuccess(c, http.StatusOK, "Lấy lịch sử đánh giá thành công", data, pagination)
}

func (h *reviewHandler) getMedia(c *gin.Context) {
	mediaID := c.Param("mediaId")
	rangeHeader := c.GetHeader("Range")

	media, err := h.uc.GetReviewMedia(c.Request.Context(), mediaID)
	if err != nil {
		if errors.Is(err, domain.ErrReviewMediaNotFound) {
			c.Status(http.StatusNotFound)
			return
		}
		c.Status(http.StatusInternalServerError)
		return
	}

	c.Header("Content-Type", media.MimeType)
	c.Header("Accept-Ranges", "bytes")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", "inline")
	c.Header("Cache-Control", "public, no-cache")

	if c.Request.Method == http.MethodHead {
		c.Header("Content-Length", strconv.FormatInt(media.SizeBytes, 10))
		c.Status(http.StatusOK)
		return
	}

	if rangeHeader != "" && strings.HasPrefix(rangeHeader, "bytes=") {
		rangeSpec := strings.TrimPrefix(rangeHeader, "bytes=")
		parts := strings.Split(rangeSpec, "-")
		if len(parts) == 2 {
			start, err1 := strconv.ParseInt(parts[0], 10, 64)
			var end int64 = media.SizeBytes - 1
			var err2 error
			if parts[1] != "" {
				end, err2 = strconv.ParseInt(parts[1], 10, 64)
			}
			if err1 == nil && err2 == nil && start >= 0 && end >= start && start < media.SizeBytes {
				if end >= media.SizeBytes {
					end = media.SizeBytes - 1
				}
				length := end - start + 1
				stream, _, err := h.uc.StreamMedia(c.Request.Context(), mediaID, start, length)
				if err != nil {
					c.Status(http.StatusServiceUnavailable)
					return
				}
				defer stream.Close()

				c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, media.SizeBytes))
				c.Header("Content-Length", strconv.FormatInt(length, 10))
				c.Status(http.StatusPartialContent)
				_, _ = io.Copy(c.Writer, stream)
				return
			}
		}
	}

	stream, _, err := h.uc.StreamMedia(c.Request.Context(), mediaID, 0, 0)
	if err != nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	defer stream.Close()

	c.Header("Content-Length", strconv.FormatInt(media.SizeBytes, 10))
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, stream)
}
