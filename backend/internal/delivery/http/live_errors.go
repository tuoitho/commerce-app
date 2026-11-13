package http

import (
	"errors"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
)

// writeLiveError writes the envelope for livestream errors and reports whether
// err was one of them.
func writeLiveError(c *gin.Context, err error) bool {
	var quotaErr *domain.LiveQuotaExceededError
	switch {
	case errors.As(err, &quotaErr):
		respondError(c, 409, "live_quota_exceeded", quotaErr.Error(), nil)
	case errors.Is(err, domain.ErrLivestreamNotFound):
		respondError(c, 404, "livestream_not_found", "Không tìm thấy phiên live", nil)
	case errors.Is(err, domain.ErrLivestreamAlreadyActive):
		respondError(c, 409, "livestream_already_active", "Đang có một phiên live khác diễn ra", nil)
	case errors.Is(err, domain.ErrLivestreamEnded):
		respondError(c, 409, "livestream_ended", "Phiên live đã kết thúc", nil)
	case errors.Is(err, domain.ErrLiveCommentNotFound):
		respondError(c, 404, "livestream_comment_not_found", "Không tìm thấy bình luận", nil)
	case errors.Is(err, domain.ErrRateLimited):
		respondError(c, 429, "rate_limited", "Bạn bình luận quá nhanh, vui lòng thử lại sau giây lát", nil)
	case errors.Is(err, domain.ErrMediaServerUnavailable):
		respondError(c, 503, "media_server_unavailable", "Không kết nối được máy chủ phát video", nil)
	default:
		return false
	}
	return true
}
