package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
)

func setupAdminTestRouter() (*gin.Engine, *jwt.Manager) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	guard := newGuard(manager)

	r := gin.New()
	admin := r.Group("/api/v1/admin")
	admin.Use(guard.AuthRequired, guard.RequireAdmin())
	{
		admin.GET("/ping", func(c *gin.Context) {
			writeSuccess(c, http.StatusOK, "admin pong", gin.H{"status": "ok"})
		})
	}
	return r, manager
}

func TestAdminGuard_NoAuthHeader_Returns401(t *testing.T) {
	router, _ := setupAdminTestRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ping", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestAdminGuard_InvalidToken_Returns401(t *testing.T) {
	router, _ := setupAdminTestRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ping", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestAdminGuard_CustomerRole_Returns403ForbiddenWithVietnameseMessage(t *testing.T) {
	router, manager := setupAdminTestRouter()

	customerToken, err := manager.GenerateAccessToken("cust-1", domain.RoleCustomer, 15*time.Minute)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ping", nil)
	req.Header.Set("Authorization", "Bearer "+customerToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}

	if env.Success {
		t.Fatalf("expected success to be false, got true")
	}
	if env.Error == nil {
		t.Fatalf("expected error object, got nil")
	}
	if env.Error.Code != "forbidden" {
		t.Fatalf("expected error.code to be 'forbidden', got %s", env.Error.Code)
	}
	if env.Error.Message != "Bạn không có quyền thực hiện thao tác này" {
		t.Fatalf("expected Vietnamese error message, got %s", env.Error.Message)
	}
}

func TestAdminGuard_AdminRole_AllowsAccess(t *testing.T) {
	router, manager := setupAdminTestRouter()

	adminToken, err := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/ping", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}
}
