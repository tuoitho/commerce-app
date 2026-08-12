package domain

import "errors"

var (
	ErrValidation         = errors.New("validation failed")
	ErrEmailInUse         = errors.New("email already in use")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid token")
	ErrNotFound           = errors.New("not found")
	ErrProductNotFound    = errors.New("product not found")
	ErrInvalidProductID   = errors.New("invalid product id")
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
