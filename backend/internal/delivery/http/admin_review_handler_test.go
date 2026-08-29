package http

import (
	"bytes"
	"context"
	"encoding/json"
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
	reviewuc "commerce-backend/internal/usecase/review"
)

func setupAdminReviewHandlerTestRouter(repo domain.ReviewRepository) (*gin.Engine, *jwt.Manager) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	uc := reviewuc.NewReviewUseCase(repo, nil, nil)
	r := gin.New()

	NewRouter(r, Dependencies{
		Review:     uc,
		JWT:        manager,
		RefreshTTL: 7 * 24 * time.Hour,
	})

	return r, manager
}

func TestAdminReviewHandler_AuthGuards(t *testing.T) {
	repo := &mockReviewRepoForHTTP{}
	router, manager := setupAdminReviewHandlerTestRouter(repo)

	customerToken, err := manager.GenerateAccessToken("cust-1", domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	endpoints := []struct {
		method string
		url    string
		body   string
	}{
		{method: http.MethodGet, url: "/api/v1/admin/reviews", body: ""},
		{method: http.MethodPut, url: "/api/v1/admin/reviews/rev-1/reply", body: `{"reply":"Test"}`},
		{method: http.MethodDelete, url: "/api/v1/admin/reviews/rev-1/reply", body: ""},
	}

	for _, ep := range endpoints {
		t.Run(ep.method+" "+ep.url+" - unauthenticated returns 401", func(t *testing.T) {
			var bodyReader *bytes.Reader
			if ep.body != "" {
				bodyReader = bytes.NewReader([]byte(ep.body))
			} else {
				bodyReader = bytes.NewReader([]byte{})
			}
			req := httptest.NewRequest(ep.method, ep.url, bodyReader)
			if ep.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			assert.Equal(t, http.StatusUnauthorized, w.Code)
		})

		t.Run(ep.method+" "+ep.url+" - customer token returns 403", func(t *testing.T) {
			var bodyReader *bytes.Reader
			if ep.body != "" {
				bodyReader = bytes.NewReader([]byte(ep.body))
			} else {
				bodyReader = bytes.NewReader([]byte{})
			}
			req := httptest.NewRequest(ep.method, ep.url, bodyReader)
			req.Header.Set("Authorization", "Bearer "+customerToken)
			if ep.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			assert.Equal(t, http.StatusForbidden, w.Code)
		})
	}
}

func TestAdminReviewHandler_ListReviews(t *testing.T) {
	adminEmail := "customer@example.com"
	replyContent := "Cảm ơn bạn đã ủng hộ!"
	now := time.Now()

	var capturedRating int16
	var capturedHasReply string
	var capturedPage, capturedLimit int

	repo := &mockReviewRepoForHTTP{
		getAdminReviewsFn: func(ctx context.Context, ratingFilter int16, hasReplyFilter string, page, limit int) (*domain.AdminReviewsResult, error) {
			capturedRating = ratingFilter
			capturedHasReply = hasReplyFilter
			capturedPage = page
			capturedLimit = limit

			return &domain.AdminReviewsResult{
				Reviews: []domain.AdminReview{
					{
						ID:             "rev-1",
						OrderItemID:    "item-1",
						Rating:         5,
						Comment:        "Sản phẩm rất tốt",
						AdminReply:     &replyContent,
						AdminRepliedAt: &now,
						ReviewerEmail:  &adminEmail,
						Product: domain.UserReviewProduct{
							ID:        "prod-1",
							Name:      "iPhone 15",
							BrandName: "Apple",
						},
						CreatedAt: now,
					},
				},
				Total: 1,
			}, nil
		},
	}

	router, manager := setupAdminReviewHandlerTestRouter(repo)
	adminToken, err := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/reviews?page=2&limit=10&rating=5&has_reply=yes", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, int16(5), capturedRating)
	assert.Equal(t, "yes", capturedHasReply)
	assert.Equal(t, 2, capturedPage)
	assert.Equal(t, 10, capturedLimit)

	var resp struct {
		Success bool                 `json:"success"`
		Message string               `json:"message"`
		Data    []domain.AdminReview `json:"data"`
		Meta    struct {
			Pagination PaginationMeta `json:"pagination"`
		} `json:"meta"`
	}
	err = json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.True(t, resp.Success)
	require.Len(t, resp.Data, 1)
	assert.Equal(t, "rev-1", resp.Data[0].ID)
	assert.Equal(t, &replyContent, resp.Data[0].AdminReply)
	assert.Equal(t, 1, resp.Meta.Pagination.Total)
}

func TestAdminReviewHandler_UpdateReply(t *testing.T) {
	repo := &mockReviewRepoForHTTP{
		updateAdminReplyFn: func(ctx context.Context, reviewID string, reply *string) (*domain.Review, error) {
			return &domain.Review{
				ID:         reviewID,
				AdminReply: reply,
			}, nil
		},
	}

	router, manager := setupAdminReviewHandlerTestRouter(repo)
	adminToken, err := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)

	t.Run("Validation failure - empty reply", func(t *testing.T) {
		body := `{"reply": "   "}`
		req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/reviews/rev-1/reply", bytes.NewReader([]byte(body)))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("Validation failure - too long reply", func(t *testing.T) {
		longText := strings.Repeat("A", 1001)
		body, _ := json.Marshal(map[string]string{"reply": longText})
		req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/reviews/rev-1/reply", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("Success", func(t *testing.T) {
		body := `{"reply": "Cảm ơn bạn nhiều nhé!"}`
		req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/reviews/rev-1/reply", bytes.NewReader([]byte(body)))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp struct {
			Success bool          `json:"success"`
			Message string        `json:"message"`
			Data    domain.Review `json:"data"`
		}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Cập nhật phản hồi thành công", resp.Message)
		require.NotNil(t, resp.Data.AdminReply)
		assert.Equal(t, "Cảm ơn bạn nhiều nhé!", *resp.Data.AdminReply)
	})
}

func TestAdminReviewHandler_DeleteReply(t *testing.T) {
	repo := &mockReviewRepoForHTTP{
		updateAdminReplyFn: func(ctx context.Context, reviewID string, reply *string) (*domain.Review, error) {
			return &domain.Review{
				ID:         reviewID,
				AdminReply: nil,
			}, nil
		},
	}

	router, manager := setupAdminReviewHandlerTestRouter(repo)
	adminToken, err := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/reviews/rev-1/reply", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Success bool          `json:"success"`
		Message string        `json:"message"`
		Data    domain.Review `json:"data"`
	}
	err = json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.True(t, resp.Success)
	assert.Equal(t, "Xóa phản hồi thành công", resp.Message)
	assert.Nil(t, resp.Data.AdminReply)
}
