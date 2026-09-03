package http_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	delivery "commerce-backend/internal/delivery/http"
	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/storage"
	reviewuc "commerce-backend/internal/usecase/review"
)

func createValidJPEGData() []byte {
	return []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01}
}

func createValidMP4Data() []byte {
	return []byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'm', 'p', '4', '2', 0x00, 0x00, 0x00, 0x00}
}

func hashAndSize(data []byte) (string, int64) {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:]), int64(len(data))
}

func setupReviewTestEngine(reviewUC *reviewuc.UseCase, jwtMgr *jwt.Manager) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	delivery.NewRouter(router, delivery.Dependencies{
		Review:     reviewUC,
		JWT:        jwtMgr,
		RefreshTTL: 720 * time.Hour,
	})
	return router
}

func TestReviewHandler_CreateValidation(t *testing.T) {
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")
	customerToken, _ := jwtMgr.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)
	adminToken, _ := jwtMgr.GenerateAccessToken("99999999-9999-9999-9999-999999999999", domain.RoleAdmin, 15*time.Minute)

	store := storage.NewMemoryStorage("test-bucket")
	uc := reviewuc.New(reviewuc.Dependencies{
		Reviews: repository.NewReviewRepository(nil),
		Storage: store,
	})
	engine := setupReviewTestEngine(uc, jwtMgr)

	orderID := "22222222-2222-2222-2222-222222222222"
	itemID := "33333333-3333-3333-3333-333333333333"
	url := fmt.Sprintf("/api/v1/orders/%s/items/%s/review", orderID, itemID)

	t.Run("PURCHASED-REVIEW-API-041: admin gets 403 forbidden", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPost, url, nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("PURCHASED-REVIEW-API-027: invalid rating 0 returns 400 validation_error", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		payloadJSON := `{"rating":0,"comment":"Valid comment"}`
		_ = writer.WriteField("payload", payloadJSON)
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPost, url, body)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "validation_error") || !strings.Contains(w.Body.String(), "rating") {
			t.Fatalf("expected validation_error on rating, got %s", w.Body.String())
		}
	})

	t.Run("PURCHASED-REVIEW-API-028: comment > 1000 chars returns 400 validation_error", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		payloadJSON := fmt.Sprintf(`{"rating":5,"comment":"%s"}`, strings.Repeat("a", 1001))
		_ = writer.WriteField("payload", payloadJSON)
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPost, url, body)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "validation_error") || !strings.Contains(w.Body.String(), "comment") {
			t.Fatalf("expected validation_error on comment, got %s", w.Body.String())
		}
	})

	t.Run("PURCHASED-REVIEW-API-006: >5 media items returns 400 validation_error", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		payloadJSON := `{"rating":5,"comment":"Valid","media":[{"source":"upload","uploadIndex":0,"sha256":"` + strings.Repeat("a", 64) + `","sizeBytes":10},{"source":"upload","uploadIndex":1,"sha256":"` + strings.Repeat("b", 64) + `","sizeBytes":10},{"source":"upload","uploadIndex":2,"sha256":"` + strings.Repeat("c", 64) + `","sizeBytes":10},{"source":"upload","uploadIndex":3,"sha256":"` + strings.Repeat("d", 64) + `","sizeBytes":10},{"source":"upload","uploadIndex":4,"sha256":"` + strings.Repeat("e", 64) + `","sizeBytes":10},{"source":"upload","uploadIndex":5,"sha256":"` + strings.Repeat("f", 64) + `","sizeBytes":10}]}`
		_ = writer.WriteField("payload", payloadJSON)
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPost, url, body)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "validation_error") || !strings.Contains(w.Body.String(), "media") {
			t.Fatalf("expected validation_error on media, got %s", w.Body.String())
		}
	})
}

func TestReviewHandler_ListProductReviewsValidation(t *testing.T) {
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")
	store := storage.NewMemoryStorage("test-bucket")
	uc := reviewuc.New(reviewuc.Dependencies{
		Reviews: nil,
		Storage: store,
	})
	engine := setupReviewTestEngine(uc, jwtMgr)

	t.Run("invalid productId returns 400 validation_error", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/products/invalid-uuid/reviews", nil)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "validation_error") || !strings.Contains(w.Body.String(), "productId") {
			t.Fatalf("expected validation_error on productId, got %s", w.Body.String())
		}
	})

	t.Run("page <= 0 returns 400 validation_error", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/products/11111111-1111-1111-1111-111111111111/reviews?page=0", nil)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "validation_error") || !strings.Contains(w.Body.String(), "page") {
			t.Fatalf("expected validation_error on page, got %s", w.Body.String())
		}
	})

	t.Run("limit > 50 returns 400 validation_error", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/products/11111111-1111-1111-1111-111111111111/reviews?limit=51", nil)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "validation_error") || !strings.Contains(w.Body.String(), "limit") {
			t.Fatalf("expected validation_error on limit, got %s", w.Body.String())
		}
	})

	t.Run("valid query returns 200 with empty list", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/products/11111111-1111-1111-1111-111111111111/reviews?page=1&limit=10", nil)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestReviewHandler_ListOwnedReviews(t *testing.T) {
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")
	customerToken, _ := jwtMgr.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)
	adminToken, _ := jwtMgr.GenerateAccessToken("99999999-9999-9999-9999-999999999999", domain.RoleAdmin, 15*time.Minute)

	store := storage.NewMemoryStorage("test-bucket")
	uc := reviewuc.New(reviewuc.Dependencies{
		Reviews: repository.NewReviewRepository(nil),
		Storage: store,
	})
	engine := setupReviewTestEngine(uc, jwtMgr)

	t.Run("PURCHASED-REVIEW-API-R3-003: missing auth returns 401 unauthorized", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews", nil)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "unauthorized") {
			t.Fatalf("expected unauthorized error code, got %s", w.Body.String())
		}
	})

	t.Run("PURCHASED-REVIEW-API-R3-009: invalid token returns 401 invalid_token", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews", nil)
		req.Header.Set("Authorization", "Bearer invalid-or-malformed-token")
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "invalid_token") {
			t.Fatalf("expected invalid_token error code, got %s", w.Body.String())
		}
	})

	t.Run("PURCHASED-REVIEW-API-R3-004: admin token returns 403 forbidden", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "forbidden") {
			t.Fatalf("expected forbidden error code, got %s", w.Body.String())
		}
	})

	t.Run("PURCHASED-REVIEW-API-R3-005: invalid page returns 400 validation_error", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews?page=0", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "validation_error") || !strings.Contains(w.Body.String(), "page") {
			t.Fatalf("expected validation_error on page, got %s", w.Body.String())
		}
	})

	t.Run("PURCHASED-REVIEW-API-R3-005: invalid limit returns 400 validation_error", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews?limit=51", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "validation_error") || !strings.Contains(w.Body.String(), "limit") {
			t.Fatalf("expected validation_error on limit, got %s", w.Body.String())
		}
	})

	t.Run("PURCHASED-REVIEW-API-R3-002: authenticated customer with no reviews returns 200 with empty list", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews?page=1&limit=10", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `"data":[]`) {
			t.Fatalf("expected empty data array, got %s", w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `"total":0`) || !strings.Contains(w.Body.String(), `"totalPages":0`) {
			t.Fatalf("expected total 0 and totalPages 0 in meta pagination, got %s", w.Body.String())
		}
	})
}

func TestReviewHandler_AdminReviewResponseContractValidationAndAuth(t *testing.T) {
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")
	customerToken, _ := jwtMgr.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)
	adminToken, _ := jwtMgr.GenerateAccessToken("99999999-9999-9999-9999-999999999999", domain.RoleAdmin, 15*time.Minute)
	engine := setupReviewTestEngine(reviewuc.New(reviewuc.Dependencies{Reviews: repository.NewReviewRepository(nil), Storage: storage.NewMemoryStorage("test-bucket")}), jwtMgr)

	tests := []struct {
		name, method, target, token, body string
		status                            int
		contains                          []string
	}{
		{name: "R4-007 missing token", method: http.MethodGet, target: "/api/v1/admin/reviews", status: 401, contains: []string{`"code":"unauthorized"`, `"data":null`}},
		{name: "R4-007 invalid token", method: http.MethodGet, target: "/api/v1/admin/reviews", token: "invalid", status: 401, contains: []string{`"code":"invalid_token"`}},
		{name: "R4-007 customer forbidden", method: http.MethodGet, target: "/api/v1/admin/reviews", token: customerToken, status: 403, contains: []string{`"code":"forbidden"`, "Bạn không có quyền phản hồi đánh giá"}},
		{name: "R4-012 invalid page", method: http.MethodGet, target: "/api/v1/admin/reviews?page=0", token: adminToken, status: 400, contains: []string{`"code":"validation_error"`, `"page":`}},
		{name: "R4-012 invalid review id", method: http.MethodPost, target: "/api/v1/admin/reviews/not-a-uuid/response", token: adminToken, body: `{"content":"ok"}`, status: 400, contains: []string{`"reviewId":`}},
		{name: "R4-006 whitespace content", method: http.MethodPost, target: "/api/v1/admin/reviews/22222222-2222-2222-2222-222222222222/response", token: adminToken, body: `{"content":"   "}`, status: 400, contains: []string{`"content":`}},
		{name: "R4-012 unknown field", method: http.MethodPost, target: "/api/v1/admin/reviews/22222222-2222-2222-2222-222222222222/response", token: adminToken, body: `{"content":"ok","adminId":"x"}`, status: 400, contains: []string{`"body":`}},
		{name: "R4-012 invalid version", method: http.MethodPut, target: "/api/v1/admin/reviews/22222222-2222-2222-2222-222222222222/response", token: adminToken, body: `{"content":"ok","version":0}`, status: 400, contains: []string{`"version":`}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, _ := http.NewRequest(tt.method, tt.target, strings.NewReader(tt.body))
			if tt.token != "" {
				req.Header.Set("Authorization", "Bearer "+tt.token)
			}
			if tt.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, req)
			if w.Code != tt.status {
				t.Fatalf("status = %d, want %d: %s", w.Code, tt.status, w.Body.String())
			}
			for _, value := range tt.contains {
				if !strings.Contains(w.Body.String(), value) {
					t.Fatalf("response missing %q: %s", value, w.Body.String())
				}
			}
		})
	}
}

func TestReviewHandler_Rev4TypedValidationAndVietnameseAdminAuthMessages(t *testing.T) {
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")
	adminToken, _ := jwtMgr.GenerateAccessToken("99999999-9999-9999-9999-999999999999", domain.RoleAdmin, 15*time.Minute)
	engine := setupReviewTestEngine(reviewuc.New(reviewuc.Dependencies{Reviews: repository.NewReviewRepository(nil), Storage: storage.NewMemoryStorage("test-bucket")}), jwtMgr)

	tests := []struct {
		name, method, target, auth, body, field, message string
	}{
		{name: "typed content is a content field error", method: http.MethodPost, target: "/api/v1/admin/reviews/22222222-2222-2222-2222-222222222222/response", auth: "Bearer " + adminToken, body: `{"content":123}`, field: `"content":`, message: "Dữ liệu không hợp lệ"},
		{name: "typed version is a version field error", method: http.MethodPut, target: "/api/v1/admin/reviews/22222222-2222-2222-2222-222222222222/response", auth: "Bearer " + adminToken, body: `{"content":"ok","version":"1"}`, field: `"version":`, message: "Dữ liệu không hợp lệ"},
		{name: "missing auth uses Vietnamese message", method: http.MethodGet, target: "/api/v1/admin/reviews", message: "Vui lòng đăng nhập để phản hồi đánh giá"},
		{name: "malformed auth uses Vietnamese message", method: http.MethodGet, target: "/api/v1/admin/reviews", auth: "Basic abc", field: `"code":"unauthorized"`, message: "Vui lòng đăng nhập để phản hồi đánh giá"},
		{name: "invalid token uses Vietnamese message", method: http.MethodGet, target: "/api/v1/admin/reviews", auth: "Bearer invalid", field: `"code":"invalid_token"`, message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, _ := http.NewRequest(tt.method, tt.target, strings.NewReader(tt.body))
			if tt.auth != "" {
				req.Header.Set("Authorization", tt.auth)
			}
			if tt.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, req)
			if w.Code != http.StatusBadRequest && tt.method != http.MethodGet {
				t.Fatalf("status = %d, want 400: %s", w.Code, w.Body.String())
			}
			if tt.field != "" && !strings.Contains(w.Body.String(), tt.field) {
				t.Fatalf("response missing field %q: %s", tt.field, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), tt.message) {
				t.Fatalf("response missing Vietnamese message %q: %s", tt.message, w.Body.String())
			}
		})
	}
}

func TestReviewHandler_VoteHelpfulness_AuthAndValidation(t *testing.T) {
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")
	customerToken, _ := jwtMgr.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)
	adminToken, _ := jwtMgr.GenerateAccessToken("99999999-9999-9999-9999-999999999999", domain.RoleAdmin, 15*time.Minute)
	engine := setupReviewTestEngine(reviewuc.New(reviewuc.Dependencies{Reviews: repository.NewReviewRepository(nil), Storage: storage.NewMemoryStorage("test-bucket")}), jwtMgr)

	t.Run("Vote without auth returns 401", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/reviews/22222222-2222-2222-2222-222222222222/vote", strings.NewReader(`{"vote":"helpful"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
	})

	t.Run("Vote with admin role returns 403", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/reviews/22222222-2222-2222-2222-222222222222/vote", strings.NewReader(`{"vote":"helpful"}`))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403", w.Code)
		}
	})

	t.Run("Vote with invalid reviewId returns 400", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/reviews/invalid-uuid/vote", strings.NewReader(`{"vote":"helpful"}`))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"reviewId":`) {
			t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
		}
	})

	t.Run("Vote with invalid vote type returns 400", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/reviews/22222222-2222-2222-2222-222222222222/vote", strings.NewReader(`{"vote":"unknown"}`))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"vote":`) {
			t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
		}
	})

	t.Run("Unvote without auth returns 401", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodDelete, "/api/v1/reviews/22222222-2222-2222-2222-222222222222/vote", nil)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
	})

	t.Run("Unvote with invalid reviewId returns 400", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodDelete, "/api/v1/reviews/invalid-uuid/vote", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"reviewId":`) {
			t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
		}
	})
}

func TestReviewHandler_AdminStatsAndSort_AuthAndValidation(t *testing.T) {
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")
	customerToken, _ := jwtMgr.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)
	adminToken, _ := jwtMgr.GenerateAccessToken("99999999-9999-9999-9999-999999999999", domain.RoleAdmin, 15*time.Minute)
	engine := setupReviewTestEngine(reviewuc.New(reviewuc.Dependencies{Reviews: repository.NewReviewRepository(nil), Storage: storage.NewMemoryStorage("test-bucket")}), jwtMgr)

	t.Run("Admin stats without auth returns 401", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/reviews/stats", nil)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
	})

	t.Run("Admin stats with customer token returns 403", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/reviews/stats", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403", w.Code)
		}
	})

	t.Run("Admin stats with admin token returns 200 with stats structure", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/reviews/stats", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200, body = %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `"totalReviews":`) || !strings.Contains(w.Body.String(), `"totalHelpful":`) {
			t.Fatalf("body missing metrics: %s", w.Body.String())
		}
	})

	t.Run("Admin reviews with invalid sort returns 400", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/reviews?sort=invalid_sort", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"sort":`) {
			t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
		}
	})

	t.Run("Admin reviews with invalid productId returns 400", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/reviews?productId=not-a-uuid", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"productId":`) {
			t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
		}
	})

	t.Run("Admin reviews with valid sort and productId returns 200", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/reviews?sort=most_helpful&productId=33333333-3333-3333-3333-333333333333", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200, body = %s", w.Code, w.Body.String())
		}
	})
}
