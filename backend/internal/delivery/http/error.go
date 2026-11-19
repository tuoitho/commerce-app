package http

import (
	"errors"
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
)

type errorBodyDetail struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func writeError(c *gin.Context, err error) {
	var valErr *domain.ValidationError
	var filterErr *domain.FilterValidationError
	var prodChangedErr *domain.ProductChangedError
	var voucherMinOrderErr *domain.VoucherMinOrderError
	var flashSaleQuotaErr *domain.FlashSaleQuotaExceededError

	if writeLiveError(c, err) {
		return
	}

	switch {
	case errors.As(err, &valErr):
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", valErr.Fields)
	case errors.As(err, &filterErr):
		respondError(c, 400, "invalid_filter", "Tiêu chí lọc sản phẩm không hợp lệ", filterErr.Fields)
	case errors.As(err, &prodChangedErr):
		respondError(c, 409, "product_changed", prodChangedErr.Error(), nil)
	case errors.As(err, &voucherMinOrderErr):
		respondError(c, 409, "voucher_min_order_not_met", voucherMinOrderErr.Error(), nil)
	case errors.As(err, &flashSaleQuotaErr):
		respondError(c, 409, "flash_sale_quota_exceeded", flashSaleQuotaErr.Error(), nil)
	case errors.Is(err, domain.ErrInvalidCategoryID):
		respondError(c, 400, "validation_error", "Mã danh mục không hợp lệ", map[string]string{"id": "Mã danh mục không hợp lệ"})
	case errors.Is(err, domain.ErrCategoryNameInUse):
		respondError(c, 409, "category_name_in_use", "Tên danh mục đã được sử dụng", nil)
	case errors.Is(err, domain.ErrCategoryNotFound):
		respondError(c, 404, "category_not_found", "Không tìm thấy danh mục", nil)
	case errors.Is(err, domain.ErrCategoryInUse):
		respondError(c, 409, "category_in_use", "Danh mục đang được sử dụng", nil)
	case errors.Is(err, domain.ErrInvalidProductID):
		respondError(c, 400, "invalid_product_id", "Mã sản phẩm không hợp lệ", nil)
	case errors.Is(err, domain.ErrProductNotFound):
		respondError(c, 404, "product_not_found", "Không tìm thấy sản phẩm", nil)
	case errors.Is(err, domain.ErrEmailInUse):
		respondError(c, 409, "email_in_use", "Email đã được sử dụng", nil)
	case errors.Is(err, domain.ErrInvalidCredentials):
		respondError(c, 401, "invalid_credentials", "Email hoặc mật khẩu không đúng", nil)
	case errors.Is(err, domain.ErrAccountLocked):
		respondError(c, 403, "account_locked", "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ.", nil)
	case errors.Is(err, domain.ErrInvalidToken):
		respondError(c, 401, "invalid_token", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn", nil)
	case errors.Is(err, domain.ErrForbidden):
		respondError(c, 403, "forbidden", "Bạn không có quyền thực hiện thao tác này", nil)
	case errors.Is(err, domain.ErrNotFound):
		respondError(c, 404, "not_found", "Không tìm thấy tài nguyên", nil)
	case errors.Is(err, domain.ErrCartItemNotFound):
		respondError(c, 404, "cart_item_not_found", "Không tìm thấy sản phẩm trong giỏ hàng", nil)
	case errors.Is(err, domain.ErrVariantNotFound):
		respondError(c, 404, "variant_not_found", "Không tìm thấy phân loại sản phẩm", nil)
	case errors.Is(err, domain.ErrVariantUnavailable):
		respondError(c, 409, "variant_unavailable", "Phân loại sản phẩm không khả dụng", nil)
	case errors.Is(err, domain.ErrOutOfStock):
		respondError(c, 409, "out_of_stock", "Phân loại sản phẩm đã hết hàng", nil)
	case errors.Is(err, domain.ErrStockLimit):
		respondError(c, 409, "stock_limit", "Số lượng vượt quá tồn kho", nil)
	case errors.Is(err, domain.ErrCartItemUnavailable):
		respondError(c, 409, "cart_item_unavailable", "Sản phẩm trong giỏ hàng không khả dụng", nil)
	case errors.Is(err, domain.ErrCartEmpty):
		respondError(c, 409, "cart_empty", "Không có sản phẩm nào để đặt hàng", nil)
	case errors.Is(err, domain.ErrAddressNotFound):
		respondError(c, 404, "address_not_found", "Không tìm thấy địa chỉ", nil)
	case errors.Is(err, domain.ErrOrderNotFound):
		respondError(c, 404, "order_not_found", "Không tìm thấy đơn hàng", nil)
	case errors.Is(err, domain.ErrOrderNotCancellable):
		respondError(c, 409, "order_not_cancellable", "Đơn hàng không thể hủy được nữa", nil)
	case errors.Is(err, domain.ErrOrderNotCancelRequested):
		respondError(c, 409, "order_not_cancel_request", "Đơn hàng không có yêu cầu hủy đang chờ", nil)
	case errors.Is(err, domain.ErrOrderActionNotAllowed):
		respondError(c, 409, "order_action_not_allowed", "Không thể thực hiện thao tác này trên đơn hàng ở trạng thái hiện tại", nil)
	case errors.Is(err, domain.ErrMomoInvalidCallback):
		respondError(c, 400, "invalid_momo_callback", "Dữ liệu xác thực thanh toán MoMo không hợp lệ", nil)
	case errors.Is(err, domain.ErrMomoAmountOutOfRange):
		respondError(c, 409, "momo_amount_out_of_range", "Cổng thanh toán MoMo chỉ hỗ trợ đơn hàng từ 1.000 ₫ đến 50.000.000 ₫", nil)
	case errors.Is(err, domain.ErrPaymentRetryNotAllowed):
		respondError(c, 409, "payment_retry_not_allowed", "Đơn hàng không đủ điều kiện để thanh toán lại qua MoMo", nil)
	case errors.Is(err, domain.ErrMomoGateway):
		respondError(c, 502, "momo_gateway_error", "Không thể kết nối cổng thanh toán MoMo. Vui lòng thử lại sau.", nil)
	case errors.Is(err, domain.ErrReturnRequestNotFound):
		respondError(c, 404, "return_request_not_found", "Không tìm thấy yêu cầu trả hàng", nil)
	case errors.Is(err, domain.ErrReturnNotEligible):
		respondError(c, 409, "return_not_eligible", "Đơn hàng không đủ điều kiện trả hàng", nil)
	case errors.Is(err, domain.ErrReturnRequestOpen):
		respondError(c, 409, "return_request_open", "Đơn hàng đang có yêu cầu trả hàng được xử lý", nil)
	case errors.Is(err, domain.ErrReturnAlreadyRefunded):
		respondError(c, 409, "return_already_refunded", "Đơn hàng đã được hoàn tiền trả hàng", nil)
	case errors.Is(err, domain.ErrReturnTransitionNotAllowed):
		respondError(c, 409, "return_transition_not_allowed", "Không thể thực hiện thao tác ở trạng thái hiện tại", nil)
	case errors.Is(err, domain.ErrOrderItemNotFound):
		respondError(c, 404, "order_item_not_found", "Không tìm thấy sản phẩm trong đơn hàng", nil)
	case errors.Is(err, domain.ErrReviewNotFound):
		respondError(c, 404, "review_not_found", "Không tìm thấy đánh giá", nil)
	case errors.Is(err, domain.ErrReviewReplyNotFound):
		respondError(c, 404, "review_reply_not_found", "Không tìm thấy phản hồi đánh giá", nil)
	case errors.Is(err, domain.ErrReviewNotEligible):
		respondError(c, 409, "review_not_eligible", "Sản phẩm chưa đủ điều kiện đánh giá", nil)
	case errors.Is(err, domain.ErrReviewAlreadyExists):
		respondError(c, 409, "review_already_exists", "Sản phẩm trong đơn hàng đã được đánh giá", nil)
	case errors.Is(err, domain.ErrReviewEditLimitReached):
		respondError(c, 409, "review_edit_limit_reached", "Đánh giá chỉ được chỉnh sửa một lần", nil)
	case errors.Is(err, domain.ErrReviewMediaNotFound):
		respondError(c, 404, "review_media_not_found", "Không tìm thấy tệp đính kèm", nil)
	case errors.Is(err, domain.ErrChatAttachmentNotFound):
		respondError(c, 404, "chat_attachment_not_found", "Không tìm thấy tệp đính kèm", nil)
	case errors.Is(err, domain.ErrChatMediaForbidden):
		respondError(c, 403, "forbidden", "Bạn không có quyền truy cập tệp đính kèm này", nil)
	case errors.Is(err, domain.ErrConversationNotFound):
		respondError(c, 404, "conversation_not_found", "Không tìm thấy cuộc hội thoại", nil)
	case errors.Is(err, domain.ErrPostNotFound):
		respondError(c, 404, "post_not_found", "Bài viết không tồn tại hoặc đã bị xóa", nil)
	case errors.Is(err, domain.ErrPostCommentNotFound):
		respondError(c, 404, "comment_not_found", "Bình luận không tồn tại hoặc đã bị xóa", nil)
	case errors.Is(err, domain.ErrPostMediaNotFound):
		respondError(c, 404, "post_media_not_found", "Không tìm thấy tệp đính kèm", nil)
	case errors.Is(err, domain.ErrUserNotFound):
		respondError(c, 404, "user_not_found", "Không tìm thấy người dùng", nil)
	case errors.Is(err, domain.ErrCannotLockAdmin):
		respondError(c, 409, "cannot_lock_admin", "Không thể khóa tài khoản quản trị viên", nil)
	case errors.Is(err, domain.ErrUserAlreadyLocked):
		respondError(c, 409, "user_already_locked", "Tài khoản đã bị khóa trước đó", nil)
	case errors.Is(err, domain.ErrUserNotLocked):
		respondError(c, 409, "user_not_locked", "Tài khoản không ở trạng thái bị khóa", nil)
	case errors.Is(err, domain.ErrNotificationNotFound):
		respondError(c, 404, "notification_not_found", "Không tìm thấy thông báo", nil)
	case errors.Is(err, domain.ErrAvatarNotFound):
		respondError(c, 404, "avatar_not_found", "Không tìm thấy ảnh đại diện", nil)
	case errors.Is(err, domain.ErrProductImageNotFound):
		respondError(c, 404, "product_image_not_found", "Không tìm thấy ảnh sản phẩm", nil)
	case errors.Is(err, domain.ErrOTPRateLimited):
		respondError(c, 429, "otp_rate_limited", "Bạn đã yêu cầu mã xác thực quá nhiều lần. Vui lòng thử lại sau 15 phút.", nil)
	case errors.Is(err, domain.ErrEmailDeliveryFailed):
		respondError(c, 502, "email_delivery_failed", "Không thể gửi email xác thực lúc này. Vui lòng thử lại sau.", nil)
	case errors.Is(err, domain.ErrInvalidOrExpiredOTP):
		respondError(c, 400, "invalid_or_expired_otp", "Mã xác thực không chính xác hoặc đã hết hạn", nil)
	case errors.Is(err, domain.ErrFlashSaleTimeOverlap):
		respondError(c, 409, "flash_sale_time_overlap", "Khung giờ chiến dịch bị trùng với một chiến dịch Flash Sale đang bật khác", nil)
	case errors.Is(err, domain.ErrFlashSaleNotFound):
		respondError(c, 404, "flash_sale_not_found", "Không tìm thấy chiến dịch Flash Sale", nil)
	case errors.Is(err, domain.ErrFlashSaleHasOrders):
		respondError(c, 409, "flash_sale_has_orders", "Không thể xóa chiến dịch Flash Sale đã phát sinh lượt mua", nil)
	case errors.Is(err, domain.ErrVoucherCodeInUse):
		respondError(c, 409, "voucher_code_in_use", "Mã giảm giá này đã tồn tại", nil)
	case errors.Is(err, domain.ErrVoucherInUse):
		respondError(c, 409, "voucher_in_use", "Không thể xóa mã giảm giá đã có đơn hàng sử dụng", nil)
	case errors.Is(err, domain.ErrVoucherImmutableFields):
		respondError(c, 409, "voucher_immutable_fields", "Không thể thay đổi mã hoặc loại giảm giá sau khi đã có lượt sử dụng", nil)
	case errors.Is(err, domain.ErrVoucherUsageLimitTooLow):
		respondError(c, 409, "voucher_usage_limit_too_low", "Giới hạn tổng lượt dùng không được nhỏ hơn số lượt đã sử dụng", nil)
	case errors.Is(err, domain.ErrVoucherNotFound):
		respondError(c, 404, "voucher_not_found", "Mã giảm giá không tồn tại", nil)
	case errors.Is(err, domain.ErrVoucherInactive):
		respondError(c, 409, "voucher_inactive", "Mã giảm giá hiện không hoạt động", nil)
	case errors.Is(err, domain.ErrVoucherNotStarted):
		respondError(c, 409, "voucher_not_started", "Mã giảm giá chưa đến thời gian áp dụng", nil)
	case errors.Is(err, domain.ErrVoucherExpired):
		respondError(c, 409, "voucher_expired", "Mã giảm giá đã hết hạn sử dụng", nil)
	case errors.Is(err, domain.ErrVoucherExhausted):
		respondError(c, 409, "voucher_exhausted", "Mã giảm giá đã hết lượt sử dụng", nil)
	case errors.Is(err, domain.ErrVoucherUserLimitReached):
		respondError(c, 409, "voucher_user_limit_reached", "Bạn đã sử dụng hết số lượt cho phép của mã giảm giá này", nil)
	case errors.Is(err, domain.ErrBuyAgainAllUnavailable):
		respondError(c, 409, "buy_again_all_unavailable", "Tất cả sản phẩm trong đơn hàng hiện đã hết hàng hoặc ngừng kinh doanh", nil)
	case errors.Is(err, domain.ErrExpressDeliveryUnavailable):
		respondError(c, 409, "express_delivery_unavailable", "Giao hàng hỏa tốc 2 giờ hiện chỉ áp dụng tại Hà Nội và TP. Hồ Chí Minh", nil)
	default:
		var l *slog.Logger
		if val, ok := c.Get(contextLoggerKey); ok {
			if lg, ok := val.(*slog.Logger); ok && lg != nil {
				l = lg
			}
		}
		if l == nil {
			l = slog.Default()
		}
		var method, path string
		if c.Request != nil {
			method = c.Request.Method
			if c.Request.URL != nil {
				path = c.Request.URL.Path
			}
		}
		l.Error("internal error", "error", err.Error(), "method", method, "path", path)
		respondError(c, 500, "internal", "Lỗi máy chủ nội bộ", nil)
	}
}

func respondError(c *gin.Context, status int, code, message string, fields map[string]string) {
	c.JSON(status, ResponseEnvelope{
		Success: false,
		Message: message,
		Data:    nil,
		Error: &errorBodyDetail{
			Code:    code,
			Message: message,
			Fields:  fields,
		},
		Meta: ResponseMeta{
			Timestamp: time.Now().UTC(),
		},
	})
}
