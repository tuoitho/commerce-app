package http

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	dashboarduc "commerce-backend/internal/usecase/dashboard"
)

type adminDashboardHandler struct {
	useCase *dashboarduc.UseCase
	logger  *slog.Logger
}

func newAdminDashboardHandler(uc *dashboarduc.UseCase, logger *slog.Logger) *adminDashboardHandler {
	return &adminDashboardHandler{
		useCase: uc,
		logger:  logger,
	}
}

func (h *adminDashboardHandler) GetDashboard(c *gin.Context) {
	rawRange := c.Query("range")
	r := domain.DashboardRange(rawRange)
	if rawRange == "" {
		r = domain.DashboardRange7d
	}

	snapshot, err := h.useCase.GetDashboard(c.Request.Context(), r)
	if err != nil {
		var filterErr *domain.FilterValidationError
		if !errors.As(err, &filterErr) {
			if h.logger != nil {
				h.logger.Error("get dashboard failed", "range", rawRange, "error", err)
			}
		}
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Dashboard retrieved successfully", snapshot)
}
