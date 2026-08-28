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

