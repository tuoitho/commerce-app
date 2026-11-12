package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	dashboarduc "commerce-backend/internal/usecase/dashboard"
)

type mockDashboardRepoForHTTP struct {
	getDataFn func(ctx context.Context, rangeStart, rangeEnd time.Time, loc *time.Location) (*domain.DashboardRawData, error)
}

func (m *mockDashboardRepoForHTTP) GetDashboardData(ctx context.Context, rangeStart, rangeEnd time.Time, loc *time.Location) (*domain.DashboardRawData, error) {
	if m.getDataFn != nil {
		return m.getDataFn(ctx, rangeStart, rangeEnd, loc)
	}
	return &domain.DashboardRawData{}, nil
}

func setupAdminDashboardTestRouter(repo domain.DashboardRepository, clock func() time.Time, logger *slog.Logger) (*gin.Engine, *jwt.Manager) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	uc := dashboarduc.New(dashboarduc.Dependencies{
		Repo:  repo,
		Clock: clock,
	})
	r := gin.New()
	NewRouter(r, Dependencies{
		Dashboard:  uc,
		JWT:        manager,
		RefreshTTL: 7 * 24 * time.Hour,
		Logger:     logger,
	})
	return r, manager
}

func buildStandardDashboardRawData() *domain.DashboardRawData {
	return &domain.DashboardRawData{
		DailyDelivered: []domain.DashboardDailyDelivered{
			{Date: "2026-11-08", DeliveredVnd: "50000000", DeliveredOrders: 2},
			{Date: "2026-11-12", DeliveredVnd: "75990000", DeliveredOrders: 3},
		},
		DailyRefunded: []domain.DashboardDailyRefunded{
			{Date: "2026-11-10", RefundedVnd: "25990000"},
		},
		OrdersSummary: domain.DashboardOrdersSummary{
			NewInRange:       12,
			CancelledInRange: 1,
			ByStatus: map[string]int64{
				"pending_confirmation": 3,
				"confirmed":            1,
				"preparing":            2,
				"shipped":              4,
				"delivered":            40,
				"cancel_requested":     1,
				"cancelled":            6,
				"partially_returned":   1,
				"returned":             2,
			},
		},
		PendingWork: domain.DashboardPendingWork{
			PendingConfirmationOrders: 3,
			CancelRequestedOrders:     1,
			PendingApprovalReturns:    2,
			ReceivedReturns:           1,
			UnrepliedReviews:          7,
			UnreadConversations:       4,
		},
		TopProducts: []domain.DashboardTopProduct{
			{
				ProductID:    "11111111-1111-1111-1111-111111111111",
				Name:         "iPhone 16 Pro",
				Brand:        "Apple",
				ImageURL:     "https://example.com/image.jpg",
				Active:       true,
				QuantitySold: 9,
				RevenueVnd:   "233910000",
			},
		},
		LowStock: domain.DashboardLowStockData{
			Threshold: 5,
			Total:     14,
			Items: []domain.DashboardLowStockItem{
				{
					VariantID:   "22222222-2222-2222-2222-222222222222",
					ProductID:   "11111111-1111-1111-1111-111111111111",
					ProductName: "iPhone 16 Pro",
					Options: []domain.CartOption{
						{GroupLabel: "Dung lượng", ValueLabel: "256GB"},
					},
					StockQuantity: 0,
				},
			},
		},
	}
}

func TestAdminDashboardHandler_AuthGuards(t *testing.T) {
	snapshotPath := filepath.Join("..", "..", "..", "..", ".dream", "specs", "admin-dashboard", "contract-snapshots.json")
	repo := &mockDashboardRepoForHTTP{}
	fixedNow := time.Date(2026, 11, 12, 10, 15, 42, 0, domain.VietnamLocation)
	router, manager := setupAdminDashboardTestRouter(repo, func() time.Time { return fixedNow }, nil)

	t.Run("401 Unauthorized when missing bearer token", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/dashboard", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)

		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "unauthorized", resp.Error.Code)

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"admin-dashboard",
			"unauthenticated_401",
			"API-ADMIN-DASHBOARD@1",
			"GET /api/v1/admin/dashboard",
			nil,
			w,
		)
	})

	t.Run("403 Forbidden when caller is customer role", func(t *testing.T) {
		customerToken, err := manager.GenerateAccessToken("cust-123", domain.RoleCustomer, 15*time.Minute)
		require.NoError(t, err)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/dashboard", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)

		var resp ResponseEnvelope
		err = json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "forbidden", resp.Error.Code)

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"admin-dashboard",
			"forbidden_403",
			"API-ADMIN-DASHBOARD@1",
			"GET /api/v1/admin/dashboard",
			nil,
			w,
		)
	})
}

func TestAdminDashboardHandler_Validation(t *testing.T) {
	snapshotPath := filepath.Join("..", "..", "..", "..", ".dream", "specs", "admin-dashboard", "contract-snapshots.json")
	repo := &mockDashboardRepoForHTTP{}
	fixedNow := time.Date(2026, 11, 12, 10, 15, 42, 0, domain.VietnamLocation)
	router, manager := setupAdminDashboardTestRouter(repo, func() time.Time { return fixedNow }, nil)

	adminToken, err := manager.GenerateAccessToken("admin-123", domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)

	t.Run("400 Bad Request on invalid range parameter", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/dashboard?range=1y", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "invalid_filter", resp.Error.Code)
		assert.Equal(t, "Kỳ báo cáo không hợp lệ", resp.Error.Fields["range"])

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"admin-dashboard",
			"invalid_filter_400",
			"API-ADMIN-DASHBOARD@1",
			"GET /api/v1/admin/dashboard?range=1y",
			nil,
			w,
		)
	})
}

func TestAdminDashboardHandler_GetDashboard(t *testing.T) {
	snapshotPath := filepath.Join("..", "..", "..", "..", ".dream", "specs", "admin-dashboard", "contract-snapshots.json")
	fixedNow := time.Date(2026, 11, 12, 10, 15, 42, 0, domain.VietnamLocation)

	repo := &mockDashboardRepoForHTTP{
		getDataFn: func(ctx context.Context, rangeStart, rangeEnd time.Time, loc *time.Location) (*domain.DashboardRawData, error) {
			return buildStandardDashboardRawData(), nil
		},
	}

	router, manager := setupAdminDashboardTestRouter(repo, func() time.Time { return fixedNow }, nil)
	adminToken, err := manager.GenerateAccessToken("admin-123", domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)

	t.Run("200 OK with default 7d range", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/dashboard", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp struct {
			Success bool                     `json:"success"`
			Message string                   `json:"message"`
			Data    domain.DashboardSnapshot `json:"data"`
		}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Dashboard retrieved successfully", resp.Message)
		assert.Equal(t, domain.DashboardRange7d, resp.Data.Range)
		assert.Equal(t, domain.MoneyVND("125990000"), resp.Data.Revenue.DeliveredVnd)
		assert.Equal(t, domain.MoneyVND("25990000"), resp.Data.Revenue.RefundedVnd)
		assert.Equal(t, "100000000", resp.Data.Revenue.NetVnd)
		assert.Equal(t, int64(5), resp.Data.Revenue.DeliveredOrders)
		assert.Equal(t, domain.MoneyVND("25198000"), resp.Data.Revenue.AverageOrderVnd)
		require.Len(t, resp.Data.DailyRevenue, 7)
		require.Len(t, resp.Data.Orders.ByStatus, 9)
		assert.Equal(t, int64(3), resp.Data.PendingWork.PendingConfirmationOrders)
		require.Len(t, resp.Data.TopProducts, 1)
		require.Len(t, resp.Data.LowStock.Items, 1)

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"admin-dashboard",
			"get_dashboard_default_200",
			"API-ADMIN-DASHBOARD@1",
			"GET /api/v1/admin/dashboard",
			nil,
			w,
		)
	})

	t.Run("200 OK with range=today", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/dashboard?range=today", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp struct {
			Success bool                     `json:"success"`
			Message string                   `json:"message"`
			Data    domain.DashboardSnapshot `json:"data"`
		}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, domain.DashboardRangeToday, resp.Data.Range)
		require.Len(t, resp.Data.DailyRevenue, 1)
		assert.Equal(t, "2026-11-12", resp.Data.DailyRevenue[0].Date)

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"admin-dashboard",
			"get_dashboard_today_200",
			"API-ADMIN-DASHBOARD@1",
			"GET /api/v1/admin/dashboard?range=today",
			nil,
			w,
		)
	})
}

func TestAdminDashboardHandler_UnexpectedErrorLogsAndReturns500(t *testing.T) {
	logBuf := &bytes.Buffer{}
	handler := slog.NewJSONHandler(logBuf, nil)
	logger := slog.New(handler)

	repo := &mockDashboardRepoForHTTP{
		getDataFn: func(ctx context.Context, rangeStart, rangeEnd time.Time, loc *time.Location) (*domain.DashboardRawData, error) {
			return nil, errors.New("unexpected database error")
		},
	}

	router, manager := setupAdminDashboardTestRouter(repo, nil, logger)
	adminToken, err := manager.GenerateAccessToken("admin-123", domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/dashboard?range=7d", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var resp ResponseEnvelope
	err = json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.False(t, resp.Success)
	assert.Equal(t, "internal", resp.Error.Code)

	// Verify error log contains range
	logStr := logBuf.String()
	assert.Contains(t, logStr, "get dashboard failed")
	assert.Contains(t, logStr, `"range":"7d"`)
}
