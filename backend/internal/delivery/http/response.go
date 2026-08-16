package http

import (
	"time"

	"github.com/gin-gonic/gin"
)

type PaginationMeta struct {
	Page       int  `json:"page"`
	Limit      int  `json:"limit"`
	Total      int  `json:"total"`
	TotalPages int  `json:"totalPages"`
	HasNext    bool `json:"hasNext"`
	HasPrev    bool `json:"hasPrev"`
}

type ResponseMeta struct {
	Timestamp  time.Time       `json:"timestamp"`
	Pagination *PaginationMeta `json:"pagination,omitempty"`
}

type ResponseEnvelope struct {
	Success bool             `json:"success"`
	Message string           `json:"message"`
	Data    any              `json:"data"`
	Error   *errorBodyDetail `json:"error"`
	Meta    ResponseMeta     `json:"meta"`
}

func writeSuccess(c *gin.Context, status int, message string, data any) {
	c.JSON(status, ResponseEnvelope{
		Success: true,
		Message: message,
		Data:    data,
		Error:   nil,
		Meta: ResponseMeta{
			Timestamp: time.Now().UTC(),
		},
	})
}

func writePaginatedSuccess(c *gin.Context, status int, message string, data any, pagination PaginationMeta) {
	c.JSON(status, ResponseEnvelope{
		Success: true,
		Message: message,
		Data:    data,
		Error:   nil,
		Meta: ResponseMeta{
			Timestamp:  time.Now().UTC(),
			Pagination: &pagination,
		},
	})
}
