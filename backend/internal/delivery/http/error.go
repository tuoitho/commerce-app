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

	switch {
	case errors.As(err, &valErr):
		respondError(c, 400, "validation_error", "Dữ liệu không hợp lệ", valErr.Fields)
	case errors.As(err, &filterErr):
		respondError(c, 400, "invalid_filter", "Tiêu chí lọc sản phẩm không hợp lệ", filterErr.Fields)
	case errors.As(err, &prodChangedErr):
		respondError(c, 409, "product_changed", prodChangedErr.Error(), nil)
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
