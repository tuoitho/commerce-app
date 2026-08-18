package domain

import "errors"

var (
	ErrValidation          = errors.New("validation failed")
	ErrEmailInUse          = errors.New("email already in use")
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrInvalidToken        = errors.New("invalid token")
	ErrForbidden           = errors.New("forbidden")
	ErrNotFound            = errors.New("not found")
	ErrProductNotFound     = errors.New("product not found")
	ErrInvalidProductID    = errors.New("invalid product id")
	ErrInvalidMoneyVND     = errors.New("invalid VND amount")
	ErrCartItemNotFound    = errors.New("cart item not found")
	ErrVariantNotFound     = errors.New("variant not found")
	ErrVariantUnavailable  = errors.New("variant unavailable")
	ErrOutOfStock          = errors.New("out of stock")
	ErrStockLimit          = errors.New("stock limit reached")
	ErrCartItemUnavailable = errors.New("cart item unavailable")
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
