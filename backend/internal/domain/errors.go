package domain

import "errors"

var (
	ErrValidation       = errors.New("validation failed")
	ErrEmailInUse       = errors.New("email already in use")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken     = errors.New("invalid token")
	ErrNotFound         = errors.New("not found")
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