package http

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	usermgmtuc "commerce-backend/internal/usecase/usermgmt"
)

const (
	defaultAdminUserPage  = 1
	defaultAdminUserLimit = 20
)

type AdminUserHandler struct {
	uc     *usermgmtuc.UseCase
	logger *slog.Logger
}

func newAdminUserHandler(uc *usermgmtuc.UseCase, logger *slog.Logger) *AdminUserHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &AdminUserHandler{uc: uc, logger: logger}
}

type adminUserSummaryResponse struct {
	ID         string    `json:"id"`
	Email      string    `json:"email"`
	Role       string    `json:"role"`
	Status     string    `json:"status"`
	OrderCount int64     `json:"orderCount"`
	CreatedAt  time.Time `json:"createdAt"`
}

type adminUserOrderSummaryResponse struct {
	TotalOrders       int64      `json:"totalOrders"`
	DeliveredOrders   int64      `json:"deliveredOrders"`
	DeliveredTotalVnd string     `json:"deliveredTotalVnd"`
	LastOrderAt       *time.Time `json:"lastOrderAt"`
}

type adminUserRecentOrderResponse struct {
	ID        string    `json:"id"`
	Status    string    `json:"status"`
	TotalVnd  string    `json:"totalVnd"`
	CreatedAt time.Time `json:"createdAt"`
}

type adminUserDetailResponse struct {
	ID           string                         `json:"id"`
	Email        string                         `json:"email"`
	Role         string                         `json:"role"`
	Status       string                         `json:"status"`
	CreatedAt    time.Time                      `json:"createdAt"`
	LockedAt     *time.Time                     `json:"lockedAt"`
	LockReason   *string                        `json:"lockReason"`
	OrderSummary adminUserOrderSummaryResponse  `json:"orderSummary"`
	RecentOrders []adminUserRecentOrderResponse `json:"recentOrders"`
}

func utcPtr(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

func toAdminUserDetailResponse(d *domain.UserAdminDetail) adminUserDetailResponse {
	totalVnd := d.OrderSummary.DeliveredTotalVnd
	if totalVnd == "" {
		totalVnd = "0"
	}
	orders := make([]adminUserRecentOrderResponse, 0, len(d.RecentOrders))
	for _, o := range d.RecentOrders {
		orders = append(orders, adminUserRecentOrderResponse{
			ID:        o.ID,
			Status:    o.Status,
			TotalVnd:  o.TotalVnd,
			CreatedAt: o.CreatedAt.UTC(),
		})
	}
	return adminUserDetailResponse{
		ID:         d.User.ID,
		Email:      d.User.Email,
		Role:       d.User.Role,
		Status:     d.User.Status,
		CreatedAt:  d.User.CreatedAt.UTC(),
		LockedAt:   utcPtr(d.User.LockedAt),
		LockReason: d.User.LockReason,
		OrderSummary: adminUserOrderSummaryResponse{
			TotalOrders:       d.OrderSummary.TotalOrders,
			DeliveredOrders:   d.OrderSummary.DeliveredOrders,
			DeliveredTotalVnd: totalVnd,
			LastOrderAt:       utcPtr(d.LastOrderAt()),
		},
		RecentOrders: orders,
	}
}

// parsePositiveQuery returns def when the parameter is absent and 0 when it is
// present but not an integer, so the use case reports it as invalid.
func parsePositiveQuery(c *gin.Context, key string, def int) int {
	raw, ok := c.GetQuery(key)
	if !ok {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return 0
	}
	return v
}

func (h *AdminUserHandler) List(c *gin.Context) {
	page := parsePositiveQuery(c, "page", defaultAdminUserPage)
	limit := parsePositiveQuery(c, "limit", defaultAdminUserLimit)

	res, err := h.uc.List(c.Request.Context(), usermgmtuc.ListInput{
		Search: c.Query("search"),
		Role:   c.Query("role"),
		Status: c.Query("status"),
		Page:   page,
		Limit:  limit,
	})
	if err != nil {
		writeError(c, err)
		return
	}

	out := make([]adminUserSummaryResponse, 0, len(res.Items))
	for _, u := range res.Items {
		out = append(out, adminUserSummaryResponse{
			ID:         u.ID,
			Email:      u.Email,
			Role:       u.Role,
			Status:     u.Status,
			OrderCount: u.OrderCount,
			CreatedAt:  u.CreatedAt.UTC(),
		})
	}

	total := int(res.Total)
	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}
	writePaginatedSuccess(c, http.StatusOK, "Users retrieved successfully", out, PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	})
}

func (h *AdminUserHandler) Get(c *gin.Context) {
	detail, err := h.uc.Get(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "User retrieved successfully", toAdminUserDetailResponse(detail))
}

type lockUserRequest struct {
	Reason *string `json:"reason"`
}

func (h *AdminUserHandler) Lock(c *gin.Context) {
	raw, err := c.GetRawData()
	if err != nil {
		writeError(c, err)
		return
	}
	var req lockUserRequest
	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &req); err != nil {
			writeError(c, domain.NewValidationError(map[string]string{
				"body": "Định dạng không hợp lệ",
			}))
			return
		}
	}

	userID := c.Param("id")
	detail, err := h.uc.Lock(c.Request.Context(), userID, req.Reason)
	if err != nil {
		writeError(c, err)
		return
	}
	h.logger.Info("admin user locked", "admin_id", callerUserID(c), "user_id", userID)
	writeSuccess(c, http.StatusOK, "User locked successfully", toAdminUserDetailResponse(detail))
}

func (h *AdminUserHandler) Unlock(c *gin.Context) {
	userID := c.Param("id")
	detail, err := h.uc.Unlock(c.Request.Context(), userID)
	if err != nil {
		writeError(c, err)
		return
	}
	h.logger.Info("admin user unlocked", "admin_id", callerUserID(c), "user_id", userID)
	writeSuccess(c, http.StatusOK, "User unlocked successfully", toAdminUserDetailResponse(detail))
}
