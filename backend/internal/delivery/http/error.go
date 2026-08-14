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
	case errors.Is(err, domain.ErrCartItemNotFound):
		c.JSON(404, errorBody{Error: errorBodyDetail{Code: "cart_item_not_found", Message: "cart item not found"}})
	case errors.Is(err, domain.ErrVariantNotFound):
		c.JSON(404, errorBody{Error: errorBodyDetail{Code: "variant_not_found", Message: "variant not found"}})
	case errors.Is(err, domain.ErrVariantUnavailable):
		c.JSON(409, errorBody{Error: errorBodyDetail{Code: "variant_unavailable", Message: "variant is unavailable"}})
	case errors.Is(err, domain.ErrOutOfStock):
		c.JSON(409, errorBody{Error: errorBodyDetail{Code: "out_of_stock", Message: "variant is out of stock"}})
	case errors.Is(err, domain.ErrStockLimit):
		c.JSON(409, errorBody{Error: errorBodyDetail{Code: "stock_limit", Message: "quantity exceeds available stock"}})
	case errors.Is(err, domain.ErrCartItemUnavailable):
		c.JSON(409, errorBody{Error: errorBodyDetail{Code: "cart_item_unavailable", Message: "cart item is unavailable"}})
	default:
		log.Printf("internal error: %v", err)
		c.JSON(500, errorBody{Error: errorBodyDetail{Code: "internal", Message: "internal server error"}})
	}
}
