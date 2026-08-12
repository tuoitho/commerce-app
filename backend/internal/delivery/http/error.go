package http

import (
	"errors"
	"log"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
)

type errorBody struct {
	Error errorBodyDetail `json:"error"`
}

type errorBodyDetail struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func writeError(c *gin.Context, err error) {
	var valErr *domain.ValidationError
	var filterErr *domain.FilterValidationError
	switch {
	case errors.As(err, &valErr):
		c.JSON(400, errorBody{Error: errorBodyDetail{
			Code:    "validation_error",
			Message: "validation failed",
			Fields:  valErr.Fields,
		}})
	case errors.As(err, &filterErr):
		c.JSON(400, errorBody{Error: errorBodyDetail{
			Code:    "invalid_filter",
			Message: "invalid product collection criteria",
			Fields:  filterErr.Fields,
		}})
	case errors.Is(err, domain.ErrInvalidProductID):
		c.JSON(400, errorBody{Error: errorBodyDetail{Code: "invalid_product_id", Message: "invalid product id"}})
	case errors.Is(err, domain.ErrProductNotFound):
		c.JSON(404, errorBody{Error: errorBodyDetail{Code: "product_not_found", Message: "product not found"}})
	case errors.Is(err, domain.ErrEmailInUse):
		c.JSON(409, errorBody{Error: errorBodyDetail{Code: "email_in_use", Message: "email is already in use"}})
	case errors.Is(err, domain.ErrInvalidCredentials):
		c.JSON(401, errorBody{Error: errorBodyDetail{Code: "invalid_credentials", Message: "invalid email or password"}})
	case errors.Is(err, domain.ErrInvalidToken):
		c.JSON(401, errorBody{Error: errorBodyDetail{Code: "invalid_token", Message: "invalid or expired token"}})
	case errors.Is(err, domain.ErrNotFound):
		c.JSON(404, errorBody{Error: errorBodyDetail{Code: "not_found", Message: "resource not found"}})
	default:
		log.Printf("internal error: %v", err)
		c.JSON(500, errorBody{Error: errorBodyDetail{Code: "internal", Message: "internal server error"}})
	}
}
