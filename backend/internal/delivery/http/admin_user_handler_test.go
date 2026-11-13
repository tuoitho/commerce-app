package http

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	usermgmtuc "commerce-backend/internal/usecase/usermgmt"
)

const (
	testUserID      = "7b0c6c0e-8a5e-4c1b-9a3e-1f2d3c4b5a69"
	testAdminID     = "0f1e2d3c-4b5a-4968-8776-655443322110"
	missingUserID   = "11111111-2222-4333-8444-555555555555"
	userMgmtFeature = "admin-user-management"
)

type mockUserAdminRepo struct {
	lastFilter domain.UserListFilter
	items      []domain.UserListItem
	total      int64
	details    map[string]*domain.UserAdminDetail
}

func (m *mockUserAdminRepo) ListUsers(ctx context.Context, filter domain.UserListFilter) ([]domain.UserListItem, int64, error) {
	m.lastFilter = filter
	return m.items, m.total, nil
}

func (m *mockUserAdminRepo) LockCustomer(ctx context.Context, id string, reason *string) (bool, error) {
	d, ok := m.details[id]
	if !ok || d.User.Role != domain.RoleCustomer || d.User.Status != domain.UserStatusActive {
		return false, nil
	}
	lockedAt := time.Date(2026, 11, 13, 1, 0, 0, 0, time.UTC)
	d.User.Status = domain.UserStatusLocked
	d.User.LockedAt = &lockedAt
	d.User.LockReason = reason
	return true, nil
}

func (m *mockUserAdminRepo) UnlockUser(ctx context.Context, id string) (bool, error) {
	d, ok := m.details[id]
	if !ok || d.User.Status != domain.UserStatusLocked {
		return false, nil
	}
	d.User.Status = domain.UserStatusActive
	d.User.LockedAt = nil
	d.User.LockReason = nil
	return true, nil
}

func (m *mockUserAdminRepo) GetUserDetail(ctx context.Context, id string) (*domain.UserAdminDetail, error) {
	if d, ok := m.details[id]; ok {
		copied := *d
		return &copied, nil
	}
	return nil, domain.ErrUserNotFound
}

func setupAdminUserTestRouter(repo domain.UserAdminRepository, logger *slog.Logger) (*gin.Engine, *jwt.Manager) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	r := gin.New()
	NewRouter(r, Dependencies{
		UserMgmt:   usermgmtuc.New(usermgmtuc.Dependencies{Repo: repo}),
		JWT:        manager,
		RefreshTTL: 7 * 24 * time.Hour,
		Logger:     logger,
	})
	return r, manager
}

func lockedCustomerDetail() *domain.UserAdminDetail {
	lockedAt := time.Date(2026, 11, 12, 8, 0, 0, 0, time.UTC)
	reason := "Spam đánh giá"
	return &domain.UserAdminDetail{
		User: domain.User{
			ID: testUserID, Email: "khach@example.com", Role: domain.RoleCustomer,
			Status: domain.UserStatusLocked, LockedAt: &lockedAt, LockReason: &reason,
			CreatedAt: time.Date(2026, 11, 1, 2, 3, 4, 0, time.UTC),
		},
		OrderSummary: domain.UserOrderSummary{TotalOrders: 3, DeliveredOrders: 1, DeliveredTotalVnd: "25990000"},
		RecentOrders: []domain.UserRecentOrder{
			{ID: "a1b2c3d4-0000-4000-8000-000000000003", Status: "delivered", TotalVnd: "25990000", CreatedAt: time.Date(2026, 11, 10, 5, 0, 0, 0, time.UTC)},
			{ID: "a1b2c3d4-0000-4000-8000-000000000002", Status: "cancelled", TotalVnd: "990000", CreatedAt: time.Date(2026, 11, 5, 5, 0, 0, 0, time.UTC)},
		},
	}
}

func activeAdminDetail() *domain.UserAdminDetail {
	return &domain.UserAdminDetail{
		User: domain.User{
			ID: testAdminID, Email: "quan.tri@example.com", Role: domain.RoleAdmin,
			Status: domain.UserStatusActive, CreatedAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC),
		},
		OrderSummary: domain.UserOrderSummary{DeliveredTotalVnd: "0"},
	}
}

func newMockUserAdminRepo() *mockUserAdminRepo {
	return &mockUserAdminRepo{
		items: []domain.UserListItem{
			{ID: testUserID, Email: "khach@example.com", Role: domain.RoleCustomer, Status: domain.UserStatusLocked, OrderCount: 3, CreatedAt: time.Date(2026, 11, 1, 2, 3, 4, 0, time.UTC)},
			{ID: testAdminID, Email: "quan.tri@example.com", Role: domain.RoleAdmin, Status: domain.UserStatusActive, OrderCount: 0, CreatedAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)},
		},
		total: 2,
		details: map[string]*domain.UserAdminDetail{
			testUserID:  lockedCustomerDetail(),
			testAdminID: activeAdminDetail(),
		},
	}
}

func doAdminUserRequest(t *testing.T, router *gin.Engine, token, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		require.NoError(t, json.NewEncoder(&buf).Encode(body))
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func adminToken(t *testing.T, manager *jwt.Manager) string {
	t.Helper()
	token, err := manager.GenerateAccessToken(testAdminID, domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)
	return token
}

type envelopeBody struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
	Error   *struct {
		Code    string            `json:"code"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	} `json:"error"`
	Meta struct {
		Pagination *PaginationMeta `json:"pagination"`
	} `json:"meta"`
}

func decodeEnvelope(t *testing.T, w *httptest.ResponseRecorder) envelopeBody {
	t.Helper()
	var env envelopeBody
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &env), w.Body.String())
	return env
}

// Requirement 1.3: every user management route requires an admin session.
func TestAdminUserHandler_AuthGuards(t *testing.T) {
	router, manager := setupAdminUserTestRouter(newMockUserAdminRepo(), nil)
	customerToken, err := manager.GenerateAccessToken(testUserID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	routes := []struct{ method, path string }{
		{http.MethodGet, "/api/v1/admin/users"},
		{http.MethodGet, "/api/v1/admin/users/" + testUserID},
	}
	for _, rt := range routes {
		w := doAdminUserRequest(t, router, "", rt.method, rt.path, nil)
		assert.Equal(t, http.StatusUnauthorized, w.Code, rt.path)
		w = doAdminUserRequest(t, router, customerToken, rt.method, rt.path, nil)
		assert.Equal(t, http.StatusForbidden, w.Code, rt.path)
		assert.Equal(t, "forbidden", decodeEnvelope(t, w).Error.Code)
	}

	w := doAdminUserRequest(t, router, "", http.MethodGet, "/api/v1/admin/users", nil)
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "unauthenticated_401", "API-ADMIN-USERS@1", "GET /api/v1/admin/users", nil, w)
	w = doAdminUserRequest(t, router, customerToken, http.MethodGet, "/api/v1/admin/users", nil)
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "forbidden_403", "API-ADMIN-USERS@1", "GET /api/v1/admin/users", nil, w)
}

// Requirements 2.1, 2.3, 3.1–3.4: list returns summaries with pagination meta.
func TestAdminUserHandler_List(t *testing.T) {
	repo := newMockUserAdminRepo()
	repo.total = 41
	router, manager := setupAdminUserTestRouter(repo, nil)

	w := doAdminUserRequest(t, router, adminToken(t, manager), http.MethodGet, "/api/v1/admin/users?search=%20Khach%20&role=customer&status=locked&page=2&limit=20", nil)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, domain.UserListFilter{Search: "Khach", Role: "customer", Status: "locked", Limit: 20, Offset: 20}, repo.lastFilter)

	env := decodeEnvelope(t, w)
	assert.Equal(t, "Users retrieved successfully", env.Message)
	require.NotNil(t, env.Meta.Pagination)
	assert.Equal(t, PaginationMeta{Page: 2, Limit: 20, Total: 41, TotalPages: 3, HasNext: true, HasPrev: true}, *env.Meta.Pagination)

	var items []map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &items))
	require.Len(t, items, 2)
	assert.Equal(t, map[string]any{
		"id": testUserID, "email": "khach@example.com", "role": "customer", "status": "locked",
		"orderCount": float64(3), "createdAt": "2026-11-01T02:03:04Z",
	}, items[0])

	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "list_users_200", "API-ADMIN-USERS@1", "GET /api/v1/admin/users", nil, w)
}

// Requirement 2.4, 2.7: defaults apply and an empty result keeps an array and zero pages.
func TestAdminUserHandler_ListEmptyDefaults(t *testing.T) {
	repo := newMockUserAdminRepo()
	repo.items = nil
	repo.total = 0
	router, manager := setupAdminUserTestRouter(repo, nil)

	w := doAdminUserRequest(t, router, adminToken(t, manager), http.MethodGet, "/api/v1/admin/users", nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, domain.UserListFilter{Limit: 20, Offset: 0}, repo.lastFilter)
	env := decodeEnvelope(t, w)
	assert.JSONEq(t, "[]", string(env.Data))
	assert.Equal(t, PaginationMeta{Page: 1, Limit: 20, Total: 0, TotalPages: 0}, *env.Meta.Pagination)
}

// Requirements 2.7, 3.6, 3.7: paging and search errors are validation_error, unknown filters invalid_filter.
func TestAdminUserHandler_ListValidation(t *testing.T) {
	router, manager := setupAdminUserTestRouter(newMockUserAdminRepo(), nil)
	token := adminToken(t, manager)

	cases := map[string][]string{
		"/api/v1/admin/users?page=0":                                           {"page"},
		"/api/v1/admin/users?page=abc":                                         {"page"},
		"/api/v1/admin/users?page=":                                            {"page"},
		"/api/v1/admin/users?limit=101":                                        {"limit"},
		"/api/v1/admin/users?limit=x":                                          {"limit"},
		"/api/v1/admin/users?search=" + strings.Repeat("a", 101) + "&role=bad": {"search"},
	}
	for path, fields := range cases {
		w := doAdminUserRequest(t, router, token, http.MethodGet, path, nil)
		require.Equal(t, http.StatusBadRequest, w.Code, path)
		env := decodeEnvelope(t, w)
		assert.Equal(t, "validation_error", env.Error.Code, path)
		for _, f := range fields {
			assert.Contains(t, env.Error.Fields, f, path)
		}
	}
	w := doAdminUserRequest(t, router, token, http.MethodGet, "/api/v1/admin/users?page=0&limit=101", nil)
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "validation_error_400", "API-ADMIN-USERS@1", "GET /api/v1/admin/users", nil, w)

	w = doAdminUserRequest(t, router, token, http.MethodGet, "/api/v1/admin/users?role=owner&status=banned", nil)
	require.Equal(t, http.StatusBadRequest, w.Code)
	env := decodeEnvelope(t, w)
	assert.Equal(t, "invalid_filter", env.Error.Code)
	assert.Equal(t, map[string]string{"role": "Giá trị lọc không hợp lệ", "status": "Giá trị lọc không hợp lệ"}, env.Error.Fields)
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "invalid_filter_400", "API-ADMIN-USERS@1", "GET /api/v1/admin/users", nil, w)
}

// Requirements 4.1–4.3: detail returns account, lock data, order summary and recent orders.
func TestAdminUserHandler_Get(t *testing.T) {
	router, manager := setupAdminUserTestRouter(newMockUserAdminRepo(), nil)
	token := adminToken(t, manager)

	w := doAdminUserRequest(t, router, token, http.MethodGet, "/api/v1/admin/users/"+testUserID, nil)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	env := decodeEnvelope(t, w)
	assert.Equal(t, "User retrieved successfully", env.Message)
	assert.JSONEq(t, `{
		"id": "`+testUserID+`",
		"email": "khach@example.com",
		"role": "customer",
		"status": "locked",
		"createdAt": "2026-11-01T02:03:04Z",
		"lockedAt": "2026-11-12T08:00:00Z",
		"lockReason": "Spam đánh giá",
		"orderSummary": {"totalOrders": 3, "deliveredOrders": 1, "deliveredTotalVnd": "25990000", "lastOrderAt": "2026-11-10T05:00:00Z"},
		"recentOrders": [
			{"id": "a1b2c3d4-0000-4000-8000-000000000003", "status": "delivered", "totalVnd": "25990000", "createdAt": "2026-11-10T05:00:00Z"},
			{"id": "a1b2c3d4-0000-4000-8000-000000000002", "status": "cancelled", "totalVnd": "990000", "createdAt": "2026-11-05T05:00:00Z"}
		]
	}`, string(env.Data))
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "get_user_200", "API-ADMIN-USERS@1", "GET /api/v1/admin/users/:id", nil, w)

	w = doAdminUserRequest(t, router, token, http.MethodGet, "/api/v1/admin/users/"+testAdminID, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{
		"id": "`+testAdminID+`",
		"email": "quan.tri@example.com",
		"role": "admin",
		"status": "active",
		"createdAt": "2026-10-01T00:00:00Z",
		"lockedAt": null,
		"lockReason": null,
		"orderSummary": {"totalOrders": 0, "deliveredOrders": 0, "deliveredTotalVnd": "0", "lastOrderAt": null},
		"recentOrders": []
	}`, string(decodeEnvelope(t, w).Data))
}

// Requirement 4.4: unknown and malformed ids are user_not_found.
func TestAdminUserHandler_GetNotFound(t *testing.T) {
	router, manager := setupAdminUserTestRouter(newMockUserAdminRepo(), nil)
	token := adminToken(t, manager)

	for _, id := range []string{missingUserID, "not-a-uuid"} {
		w := doAdminUserRequest(t, router, token, http.MethodGet, "/api/v1/admin/users/"+id, nil)
		require.Equal(t, http.StatusNotFound, w.Code, id)
		env := decodeEnvelope(t, w)
		assert.Equal(t, "user_not_found", env.Error.Code)
		assert.Equal(t, "Không tìm thấy người dùng", env.Error.Message)
	}
	w := doAdminUserRequest(t, router, token, http.MethodGet, "/api/v1/admin/users/"+missingUserID, nil)
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "user_not_found_404", "API-ADMIN-USERS@1", "GET /api/v1/admin/users/:id", nil, w)
}

const activeCustomerID = "22222222-3333-4444-8555-666666666666"

func newLockMockRepo() *mockUserAdminRepo {
	repo := newMockUserAdminRepo()
	repo.details[activeCustomerID] = &domain.UserAdminDetail{
		User: domain.User{
			ID: activeCustomerID, Email: "active.customer@example.com", Role: domain.RoleCustomer,
			Status: domain.UserStatusActive, CreatedAt: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
		},
		OrderSummary: domain.UserOrderSummary{TotalOrders: 1, DeliveredTotalVnd: "0"},
		RecentOrders: []domain.UserRecentOrder{
			{ID: "a1b2c3d4-0000-4000-8000-000000000009", Status: "pending_confirmation", TotalVnd: "1500000", CreatedAt: time.Date(2026, 11, 11, 3, 0, 0, 0, time.UTC)},
		},
	}
	return repo
}

// Requirements 5.2, 8.6: locking an active customer returns the locked detail and logs ids only.
func TestAdminUserHandler_Lock(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelInfo}))
	router, manager := setupAdminUserTestRouter(newLockMockRepo(), logger)

	body := map[string]any{"reason": "  Spam đánh giá  "}
	w := doAdminUserRequest(t, router, adminToken(t, manager), http.MethodPost, "/api/v1/admin/users/"+activeCustomerID+"/lock", body)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	env := decodeEnvelope(t, w)
	assert.Equal(t, "User locked successfully", env.Message)
	var data map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &data))
	assert.Equal(t, "locked", data["status"])
	assert.Equal(t, "Spam đánh giá", data["lockReason"])
	assert.Equal(t, "2026-11-13T01:00:00Z", data["lockedAt"])
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "lock_user_200", "API-ADMIN-USERS@1", "POST /api/v1/admin/users/:id/lock", body, w)

	logged := logs.String()
	assert.Contains(t, logged, "admin user locked")
	assert.Contains(t, logged, "admin_id="+testAdminID)
	assert.Contains(t, logged, "user_id="+activeCustomerID)
	assert.NotContains(t, logged, "Spam")
	assert.NotContains(t, logged, "active.customer@example.com")
}

// Requirement 5.2: the body is optional; an empty body or {} locks without a reason.
func TestAdminUserHandler_LockWithoutBody(t *testing.T) {
	for _, raw := range []string{"", "{}", `{"reason": null}`, `{"reason": "   "}`} {
		router, manager := setupAdminUserTestRouter(newLockMockRepo(), nil)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/"+activeCustomerID+"/lock", strings.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken(t, manager))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code, "body %q: %s", raw, w.Body.String())
		var data map[string]any
		require.NoError(t, json.Unmarshal(decodeEnvelope(t, w).Data, &data))
		assert.Nil(t, data["lockReason"], raw)
	}
}

// Requirement 5.10: malformed JSON and long reasons are validation errors.
func TestAdminUserHandler_LockValidation(t *testing.T) {
	router, manager := setupAdminUserTestRouter(newLockMockRepo(), nil)
	token := adminToken(t, manager)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/"+activeCustomerID+"/lock", strings.NewReader("{bad"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
	env := decodeEnvelope(t, w)
	assert.Equal(t, "validation_error", env.Error.Code)
	assert.Equal(t, "Định dạng không hợp lệ", env.Error.Fields["body"])

	body := map[string]any{"reason": strings.Repeat("ạ", 501)}
	w = doAdminUserRequest(t, router, token, http.MethodPost, "/api/v1/admin/users/"+activeCustomerID+"/lock", body)
	require.Equal(t, http.StatusBadRequest, w.Code)
	env = decodeEnvelope(t, w)
	assert.Equal(t, "Lý do khóa tối đa 500 ký tự", env.Error.Fields["reason"])
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "lock_reason_validation_400", "API-ADMIN-USERS@1", "POST /api/v1/admin/users/:id/lock", map[string]any{"reason": "<501 characters>"}, w)

	// The account stays active after both rejected requests.
	w = doAdminUserRequest(t, router, token, http.MethodGet, "/api/v1/admin/users/"+activeCustomerID, nil)
	var data map[string]any
	require.NoError(t, json.Unmarshal(decodeEnvelope(t, w).Data, &data))
	assert.Equal(t, "active", data["status"])
}

// Requirements 5.8, 5.9, 5.11: lock conflicts and missing targets.
func TestAdminUserHandler_LockConflicts(t *testing.T) {
	router, manager := setupAdminUserTestRouter(newLockMockRepo(), nil)
	token := adminToken(t, manager)

	w := doAdminUserRequest(t, router, token, http.MethodPost, "/api/v1/admin/users/"+testAdminID+"/lock", nil)
	require.Equal(t, http.StatusConflict, w.Code)
	env := decodeEnvelope(t, w)
	assert.Equal(t, "cannot_lock_admin", env.Error.Code)
	assert.Equal(t, "Không thể khóa tài khoản quản trị viên", env.Error.Message)
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "cannot_lock_admin_409", "API-ADMIN-USERS@1", "POST /api/v1/admin/users/:id/lock", nil, w)

	w = doAdminUserRequest(t, router, token, http.MethodPost, "/api/v1/admin/users/"+testUserID+"/lock", nil)
	require.Equal(t, http.StatusConflict, w.Code)
	env = decodeEnvelope(t, w)
	assert.Equal(t, "user_already_locked", env.Error.Code)
	assert.Equal(t, "Tài khoản đã bị khóa trước đó", env.Error.Message)
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "user_already_locked_409", "API-ADMIN-USERS@1", "POST /api/v1/admin/users/:id/lock", nil, w)

	for _, id := range []string{missingUserID, "not-a-uuid"} {
		w = doAdminUserRequest(t, router, token, http.MethodPost, "/api/v1/admin/users/"+id+"/lock", nil)
		require.Equal(t, http.StatusNotFound, w.Code, id)
		assert.Equal(t, "user_not_found", decodeEnvelope(t, w).Error.Code)
	}
}

// Requirements 6.2, 6.4, 6.5, 8.6: unlock clears lock data, conflicts on non-locked accounts.
func TestAdminUserHandler_Unlock(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelInfo}))
	router, manager := setupAdminUserTestRouter(newLockMockRepo(), logger)
	token := adminToken(t, manager)

	w := doAdminUserRequest(t, router, token, http.MethodPost, "/api/v1/admin/users/"+testUserID+"/unlock", nil)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	env := decodeEnvelope(t, w)
	assert.Equal(t, "User unlocked successfully", env.Message)
	var data map[string]any
	require.NoError(t, json.Unmarshal(env.Data, &data))
	assert.Equal(t, "active", data["status"])
	assert.Nil(t, data["lockedAt"])
	assert.Nil(t, data["lockReason"])
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "unlock_user_200", "API-ADMIN-USERS@1", "POST /api/v1/admin/users/:id/unlock", nil, w)
	assert.Contains(t, logs.String(), "admin user unlocked")
	assert.Contains(t, logs.String(), "user_id="+testUserID)
	assert.NotContains(t, logs.String(), "khach@example.com")

	for _, id := range []string{testUserID, testAdminID} {
		w = doAdminUserRequest(t, router, token, http.MethodPost, "/api/v1/admin/users/"+id+"/unlock", nil)
		require.Equal(t, http.StatusConflict, w.Code, id)
		env = decodeEnvelope(t, w)
		assert.Equal(t, "user_not_locked", env.Error.Code)
		assert.Equal(t, "Tài khoản không ở trạng thái bị khóa", env.Error.Message)
	}
	assertOrRecordContractSnapshot(t, userMgmtSnapshotPath, userMgmtFeature, "user_not_locked_409", "API-ADMIN-USERS@1", "POST /api/v1/admin/users/:id/unlock", nil, w)

	w = doAdminUserRequest(t, router, token, http.MethodPost, "/api/v1/admin/users/"+missingUserID+"/unlock", nil)
	require.Equal(t, http.StatusNotFound, w.Code)
}

// Requirement 1.3: lock and unlock require an admin session and change nothing otherwise.
func TestAdminUserHandler_LockAuthGuards(t *testing.T) {
	repo := newLockMockRepo()
	router, manager := setupAdminUserTestRouter(repo, nil)
	customerToken, err := manager.GenerateAccessToken(activeCustomerID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	for _, action := range []string{"lock", "unlock"} {
		path := "/api/v1/admin/users/" + activeCustomerID + "/" + action
		assert.Equal(t, http.StatusUnauthorized, doAdminUserRequest(t, router, "", http.MethodPost, path, nil).Code)
		assert.Equal(t, http.StatusForbidden, doAdminUserRequest(t, router, customerToken, http.MethodPost, path, nil).Code)
	}
	assert.Equal(t, domain.UserStatusActive, repo.details[activeCustomerID].User.Status)
}
