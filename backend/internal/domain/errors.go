package domain

import (
	"errors"
	"strings"
)

var (
	ErrValidation              = errors.New("validation failed")
	ErrEmailInUse              = errors.New("email already in use")
	ErrInvalidCredentials      = errors.New("invalid credentials")
	ErrInvalidToken            = errors.New("invalid token")
	ErrForbidden               = errors.New("forbidden")
	ErrNotFound                = errors.New("not found")
	ErrProductNotFound         = errors.New("product not found")
	ErrInvalidProductID        = errors.New("invalid product id")
	ErrInvalidCategoryID       = errors.New("invalid category id")
	ErrCategoryNameInUse       = errors.New("category name in use")
	ErrCategoryNotFound        = errors.New("category not found")
	ErrCategoryInUse           = errors.New("category in use")
	ErrInvalidMoneyVND         = errors.New("invalid VND amount")
	ErrCartItemNotFound        = errors.New("cart item not found")
	ErrVariantNotFound         = errors.New("variant not found")
	ErrVariantUnavailable      = errors.New("variant unavailable")
	ErrOutOfStock              = errors.New("out of stock")
	ErrStockLimit              = errors.New("stock limit reached")
	ErrCartItemUnavailable     = errors.New("cart item unavailable")
	ErrCartEmpty               = errors.New("cart empty")
	ErrAddressNotFound         = errors.New("address not found")
	ErrOrderNotFound           = errors.New("order not found")
	ErrOrderNotCancellable     = errors.New("order not cancellable")
	ErrOrderNotCancelRequested = errors.New("order not cancel requested")
	ErrOrderActionNotAllowed   = errors.New("order action not allowed")

	ErrReturnNotFound          = errors.New("return request not found")
	ErrReturnNotAllowed        = errors.New("return not allowed")
	ErrReturnWindowExpired     = errors.New("return window expired")
	ErrReturnRequestExists     = errors.New("return request exists")
	ErrReturnItemLimitExceeded = errors.New("return item limit exceeded")
	ErrReturnActionNotAllowed  = errors.New("return action not allowed")

	ErrReviewNotEligible      = errors.New("review not eligible")
	ErrReviewAlreadyExists    = errors.New("review already exists")
	ErrReviewEditLimitReached = errors.New("review edit limit reached")
	ErrReviewNotFound         = errors.New("review not found")
	ErrReviewMediaNotFound    = errors.New("review media not found")
	ErrReviewResponseConflict = errors.New("review response conflict")
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
