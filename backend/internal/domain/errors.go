package domain

import (
	"errors"
	"fmt"
	"strings"
)

var (
	ErrValidation          = errors.New("validation failed")
	ErrEmailInUse          = errors.New("email already in use")
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrInvalidToken        = errors.New("invalid token")
	ErrAccountLocked       = errors.New("account locked")
	ErrForbidden           = errors.New("forbidden")
	ErrNotFound            = errors.New("not found")
	ErrProductNotFound     = errors.New("product not found")
	ErrInvalidProductID    = errors.New("invalid product id")
	ErrInvalidCategoryID   = errors.New("invalid category id")
	ErrCategoryNameInUse   = errors.New("category name in use")
	ErrCategoryNotFound    = errors.New("category not found")
	ErrCategoryInUse       = errors.New("category in use")
	ErrInvalidMoneyVND     = errors.New("invalid VND amount")
	ErrCartItemNotFound    = errors.New("cart item not found")
	ErrVariantNotFound     = errors.New("variant not found")
	ErrVariantUnavailable  = errors.New("variant unavailable")
	ErrOutOfStock          = errors.New("out of stock")
	ErrStockLimit          = errors.New("stock limit reached")
	ErrCartItemUnavailable = errors.New("cart item unavailable")
	ErrCartEmpty           = errors.New("cart empty")
	ErrAddressNotFound     = errors.New("address not found")
	ErrOrderNotFound       = errors.New("order not found")
	ErrOrderNotCancellable     = errors.New("order not cancellable")
	ErrOrderNotCancelRequested = errors.New("order not cancel requested")
	ErrOrderActionNotAllowed   = errors.New("order action not allowed")
	ErrMomoAmountOutOfRange    = errors.New("momo amount out of range")
	ErrMomoInvalidCallback     = errors.New("invalid momo callback")
	ErrMomoGateway             = errors.New("momo gateway error")
	ErrPaymentRetryNotAllowed  = errors.New("payment retry not allowed")
	ErrReturnNotEligible       = errors.New("return not eligible")
	ErrReturnRequestOpen       = errors.New("return request open")
	ErrReturnAlreadyRefunded   = errors.New("return already refunded")
	ErrReturnRequestNotFound   = errors.New("return request not found")
	ErrReturnTransitionNotAllowed = errors.New("return transition not allowed")
	ErrOrderItemNotFound       = errors.New("order item not found")
	ErrReviewNotFound          = errors.New("review not found")
	ErrReviewReplyNotFound     = errors.New("review reply not found")
	ErrReviewNotEligible       = errors.New("review not eligible")
	ErrReviewAlreadyExists     = errors.New("review already exists")
	ErrReviewEditLimitReached  = errors.New("review edit limit reached")
	ErrReviewMediaNotFound     = errors.New("review media not found")
	ErrChatAttachmentNotFound  = errors.New("chat attachment not found")
	ErrChatMediaForbidden      = errors.New("chat media forbidden")
	ErrConversationNotFound    = errors.New("conversation not found")
	ErrPostNotFound            = errors.New("post not found")
	ErrPostCommentNotFound     = errors.New("post comment not found")
	ErrPostMediaNotFound       = errors.New("post media not found")
	ErrNotificationNotFound    = errors.New("notification not found")
	ErrUserNotFound            = errors.New("user not found")
	ErrCannotLockAdmin         = errors.New("cannot lock admin")
	ErrUserAlreadyLocked       = errors.New("user already locked")
	ErrUserNotLocked           = errors.New("user not locked")
	ErrAvatarNotFound          = errors.New("avatar not found")
	ErrProductImageNotFound    = errors.New("product image not found")
	ErrOTPRateLimited          = errors.New("otp rate limited")
	ErrEmailDeliveryFailed     = errors.New("email delivery failed")
	ErrInvalidOrExpiredOTP     = errors.New("invalid or expired otp")
	ErrFlashSaleNotFound          = errors.New("flash sale not found")
	ErrFlashSaleTimeOverlap       = errors.New("flash sale time overlap")
	ErrFlashSaleHasOrders         = errors.New("flash sale has orders")
	ErrVoucherCodeInUse           = errors.New("voucher code in use")
	ErrVoucherInUse               = errors.New("voucher in use")
	ErrVoucherImmutableFields     = errors.New("voucher immutable fields")
	ErrVoucherUsageLimitTooLow    = errors.New("voucher usage limit too low")
	ErrVoucherNotFound            = errors.New("voucher not found")
	ErrVoucherInactive            = errors.New("voucher inactive")
	ErrVoucherNotStarted          = errors.New("voucher not started")
	ErrVoucherExpired             = errors.New("voucher expired")
	ErrVoucherExhausted           = errors.New("voucher exhausted")
	ErrVoucherUserLimitReached    = errors.New("voucher user limit reached")
	ErrVoucherNotClaimed          = errors.New("voucher not claimed")
	ErrVoucherScopeMismatch       = errors.New("voucher scope mismatch")
	ErrBuyAgainAllUnavailable     = errors.New("buy again all unavailable")
	ErrExpressDeliveryUnavailable = errors.New("express delivery unavailable")
)

type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string {
	return ErrValidation.Error()
}

func NewValidationError(fields map[string]string) *ValidationError {
	return &ValidationError{Fields: fields}
}

type FilterValidationError struct {
	Fields map[string]string
}

func (e *FilterValidationError) Error() string {
	return "invalid product collection criteria"
}

func NewFilterValidationError(fields map[string]string) *FilterValidationError {
	return &FilterValidationError{Fields: fields}
}

type ProductChangedError struct {
	Products []string
}

func (e *ProductChangedError) Error() string {
	if len(e.Products) == 1 {
		return "Sản phẩm " + e.Products[0] + " vừa được cập nhật. Vui lòng tải lại để xem thông tin mới nhất."
	}
	if len(e.Products) > 1 {
		return "Các sản phẩm " + strings.Join(e.Products, ", ") + " vừa được cập nhật. Vui lòng tải lại để xem thông tin mới nhất."
	}
	return "Sản phẩm vừa được cập nhật. Vui lòng tải lại để xem thông tin mới nhất."
}

func NewProductChangedError(products []string) *ProductChangedError {
	return &ProductChangedError{Products: products}
}

// FormatVND formats a canonical integer VND string with dot thousands separators (e.g. "10000000" -> "10.000.000").
func FormatVND(amount MoneyVND) string {
	s := strings.TrimSpace(string(amount))
	if s == "" {
		return "0"
	}
	neg := false
	if strings.HasPrefix(s, "-") {
		neg = true
		s = s[1:]
	}
	n := len(s)
	if n <= 3 {
		if neg {
			return "-" + s
		}
		return s
	}
	var b strings.Builder
	if neg {
		b.WriteByte('-')
	}
	rem := n % 3
	if rem == 0 {
		rem = 3
	}
	b.WriteString(s[:rem])
	for i := rem; i < n; i += 3 {
		b.WriteByte('.')
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

// VoucherMinOrderError indicates an order subtotal does not meet a voucher's minOrderVnd.
type VoucherMinOrderError struct {
	MinOrderVND MoneyVND
}

func (e *VoucherMinOrderError) Error() string {
	return fmt.Sprintf("Đơn hàng chưa đạt giá trị tối thiểu %s ₫ để áp dụng mã này", FormatVND(e.MinOrderVND))
}

// FlashSaleQuotaExceededError reports remaining Flash Sale units >= 1 but less than requested quantity.
type FlashSaleQuotaExceededError struct {
	ProductName string
	Remaining   int64
}

func (e *FlashSaleQuotaExceededError) Error() string {
	return fmt.Sprintf("Sản phẩm %s chỉ còn %d suất giá Flash Sale", e.ProductName, e.Remaining)
}


