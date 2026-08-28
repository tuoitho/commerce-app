package http_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	delivery "commerce-backend/internal/delivery/http"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/storage"
	reviewuc "commerce-backend/internal/usecase/review"
)

func TestMediaHandler_Proxy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")

	store := storage.NewMemoryStorage("test-bucket")
	ctx := context.Background()

	// Put test image in store
	testData := createValidJPEGData()
	_, _ = store.PutObject(ctx, "reviews/test-op/img1.jpg", bytes.NewReader(testData), int64(len(testData)), "image/jpeg")

	uc := reviewuc.New(reviewuc.Dependencies{
		Reviews: nil, // will test 404 / 503 behavior
		Storage: store,
	})

	router := gin.New()
	delivery.NewRouter(router, delivery.Dependencies{
		Review:     uc,
		JWT:        jwtMgr,
		RefreshTTL: 720 * time.Hour,
	})

	t.Run("PURCHASED-REVIEW-API-023: non-existent media UUID returns 404 without body", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/media/reviews/00000000-0000-0000-0000-000000000000", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
	})

	t.Run("PURCHASED-REVIEW-API-023: malformed media UUID returns 404", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/media/reviews/not-a-valid-uuid", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
	})
}
