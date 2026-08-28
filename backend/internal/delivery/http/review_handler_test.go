package http

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/storage/reviewmedia"
	reviewuc "commerce-backend/internal/usecase/review"
)

type mockReviewRepoForHTTP struct {
	createReviewFn func(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error)
	updateReviewFn func(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error)
	getByIDFn      func(ctx context.Context, id string) (*domain.Review, error)
	getByItemFn    func(ctx context.Context, orderItemID string) (*domain.Review, error)
	listByItemsFn  func(ctx context.Context, orderItemIDs []string) (map[string]*domain.Review, error)
	getMediaByIDFn func(ctx context.Context, mediaID string) (*domain.ReviewMedia, error)
	getPublicFn    func(ctx context.Context, productID string, page, limit int) (*domain.ProductReviewsResult, error)
}

func (m *mockReviewRepoForHTTP) CreateReview(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error) {
	if m.createReviewFn != nil {
		return m.createReviewFn(ctx, input)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) UpdateReview(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error) {
	if m.updateReviewFn != nil {
		return m.updateReviewFn(ctx, input)
	}
	return nil, nil, nil
}

func (m *mockReviewRepoForHTTP) GetReviewByID(ctx context.Context, id string) (*domain.Review, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) GetReviewByOrderItemID(ctx context.Context, orderItemID string) (*domain.Review, error) {
	if m.getByItemFn != nil {
		return m.getByItemFn(ctx, orderItemID)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) ListReviewsByOrderItemIDs(ctx context.Context, orderItemIDs []string) (map[string]*domain.Review, error) {
	if m.listByItemsFn != nil {
		return m.listByItemsFn(ctx, orderItemIDs)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) GetReviewMediaByID(ctx context.Context, mediaID string) (*domain.ReviewMedia, error) {
	if m.getMediaByIDFn != nil {
		return m.getMediaByIDFn(ctx, mediaID)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) GetPublicReviewsByProductID(ctx context.Context, productID string, page, limit int) (*domain.ProductReviewsResult, error) {
	if m.getPublicFn != nil {
		return m.getPublicFn(ctx, productID, page, limit)
	}
	return nil, nil
}

func setupReviewTestRouter(repo domain.ReviewRepository, store domain.ReviewMediaStore, jwtMgr *jwt.Manager) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	uc := reviewuc.NewReviewUseCase(repo, store, nil)
	NewRouter(r, Dependencies{
		Review:     uc,
		JWT:        jwtMgr,
		RefreshTTL: 7 * 24 * time.Hour,
	})
	return r
}

func TestCreateReview_HTTPHandler(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	userID := uuid.NewString()
	orderID := uuid.NewString()
	itemID := uuid.NewString()

	token, err := jwtMgr.GenerateAccessToken(userID, domain.RoleCustomer, 2*time.Hour)
	require.NoError(t, err)

	t.Run("Success 201 Created", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepoForHTTP{
			createReviewFn: func(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error) {
				return &domain.Review{
					ID:          uuid.NewString(),
					OrderItemID: input.OrderItemID,
					Rating:      input.Rating,
					Comment:     input.Comment,
					Media:       []domain.ReviewMedia{},
					CanEdit:     true,
					Edited:      false,
					CreatedAt:   time.Now().UTC(),
					UpdatedAt:   time.Now().UTC(),
				}, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("rating", "5")
		_ = writer.WriteField("comment", "Sản phẩm rất tốt!")
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/items/%s/review", orderID, itemID), body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Đánh giá sản phẩm thành công", resp.Message)
	})

	t.Run("Validation Error: Missing rating", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("comment", "No rating")
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/items/%s/review", orderID, itemID), body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "rating")
	})

	t.Run("401 Unauthorized when no token", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("rating", "5")
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/items/%s/review", orderID, itemID), body)
		req.Header.Set("Content-Type", writer.FormDataContentType())

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("409 Review Not Eligible", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepoForHTTP{
			createReviewFn: func(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error) {
				return nil, domain.ErrReviewNotEligible
			},
		}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("rating", "4")
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/items/%s/review", orderID, itemID), body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusConflict, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "review_not_eligible", resp.Error.Code)
		assert.Equal(t, "Sản phẩm chưa đủ điều kiện đánh giá", resp.Message)
	})

	t.Run("409 Review Already Exists", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepoForHTTP{
			createReviewFn: func(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error) {
				return nil, domain.ErrReviewAlreadyExists
			},
		}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("rating", "4")
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/items/%s/review", orderID, itemID), body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusConflict, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "review_already_exists", resp.Error.Code)
		assert.Equal(t, "Sản phẩm trong đơn hàng đã được đánh giá", resp.Message)
	})
}

func TestUpdateReview_HTTPHandler(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	userID := uuid.NewString()
	orderID := uuid.NewString()
	itemID := uuid.NewString()
	reviewID := uuid.NewString()

	token, err := jwtMgr.GenerateAccessToken(userID, domain.RoleCustomer, 2*time.Hour)
	require.NoError(t, err)

	t.Run("Success 200 OK", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepoForHTTP{
			updateReviewFn: func(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error) {
				return &domain.Review{
					ID:          reviewID,
					OrderItemID: input.OrderItemID,
					Rating:      input.Rating,
					Comment:     input.Comment,
					Media:       []domain.ReviewMedia{},
					CanEdit:     false,
					Edited:      true,
					CreatedAt:   time.Now().UTC().Add(-1 * time.Hour),
					UpdatedAt:   time.Now().UTC(),
				}, nil, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("rating", "4")
		_ = writer.WriteField("comment", "Cập nhật đánh giá")
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/orders/%s/items/%s/review", orderID, itemID), body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Cập nhật đánh giá thành công", resp.Message)
	})

	t.Run("409 Review Edit Limit Reached", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepoForHTTP{
			updateReviewFn: func(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error) {
				return nil, nil, domain.ErrReviewEditLimitReached
			},
		}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("rating", "3")
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/orders/%s/items/%s/review", orderID, itemID), body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusConflict, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "review_edit_limit_reached", resp.Error.Code)
		assert.Equal(t, "Đánh giá chỉ được chỉnh sửa một lần", resp.Message)
	})
}

func TestDeleteReview_RouteAbsence(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	store := reviewmedia.NewFakeStore()
	repo := &mockReviewRepoForHTTP{}
	r := setupReviewTestRouter(repo, store, jwtMgr)

	token, _ := jwtMgr.GenerateAccessToken(uuid.NewString(), domain.RoleCustomer, 2*time.Hour)
	req, _ := http.NewRequest(http.MethodDelete, fmt.Sprintf("/api/v1/orders/%s/items/%s/review", uuid.NewString(), uuid.NewString()), nil)
	req.Header.Set("Authorization", "Bearer "+token)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// No DELETE route registered -> must be 404 or 405
	assert.True(t, w.Code == http.StatusNotFound || w.Code == http.StatusMethodNotAllowed, "DELETE route must not exist")
}

func TestGetPublicReviews_HTTPHandler(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	store := reviewmedia.NewFakeStore()
	productID := uuid.NewString()

	t.Run("Success 200 with reviews and summary", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{
			getPublicFn: func(ctx context.Context, pID string, page, limit int) (*domain.ProductReviewsResult, error) {
				masked := "c***@gmail.com"
				return &domain.ProductReviewsResult{
					Summary: domain.ProductReviewSummary{
						TotalReviews:  2,
						AverageRating: "4.5",
						RatingCounts: map[string]int64{
							"1": 0, "2": 0, "3": 0, "4": 1, "5": 1,
						},
					},
					Reviews: []domain.PublicReview{
						{
							ID:      uuid.NewString(),
							Rating:  5,
							Comment: "Tuyệt vời",
							Reviewer: domain.PublicReviewer{
								MaskedEmail: &masked,
							},
							Purchase: domain.PublicPurchase{
								Model: "256GB",
							},
							Media:     []domain.ReviewMedia{},
							CreatedAt: time.Now().UTC(),
							UpdatedAt: time.Now().UTC(),
						},
					},
					Total: 2,
				}, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/products/%s/reviews?page=1&limit=10", productID), nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Lấy danh sách đánh giá thành công", resp.Message)
		require.NotNil(t, resp.Meta.Pagination)
		assert.Equal(t, 2, resp.Meta.Pagination.Total)
		assert.Equal(t, 1, resp.Meta.Pagination.TotalPages)
	})

	t.Run("Success 200 with 0 reviews", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{
			getPublicFn: func(ctx context.Context, pID string, page, limit int) (*domain.ProductReviewsResult, error) {
				return &domain.ProductReviewsResult{
					Summary: domain.ProductReviewSummary{
						TotalReviews:  0,
						AverageRating: "0.0",
						RatingCounts: map[string]int64{
							"1": 0, "2": 0, "3": 0, "4": 0, "5": 0,
						},
					},
					Reviews: []domain.PublicReview{},
					Total:   0,
				}, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/products/%s/reviews", productID), nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
	})
}

func TestGetMedia_HTTPHandler(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	store := reviewmedia.NewFakeStore()
	mediaID := uuid.NewString()
	objectKey := "reviews/test/media.mp4"
	content := []byte("0123456789abcdefghijklmnopqrstuvwxyz") // 36 bytes

	_ = store.PutObject(context.Background(), objectKey, bytes.NewReader(content), int64(len(content)), "video/mp4")

	repo := &mockReviewRepoForHTTP{
		getMediaByIDFn: func(ctx context.Context, id string) (*domain.ReviewMedia, error) {
			if id == mediaID {
				return &domain.ReviewMedia{
					ID:        mediaID,
					Type:      domain.ReviewMediaTypeVideo,
					MimeType:  "video/mp4",
					ObjectKey: objectKey,
					SizeBytes: int64(len(content)),
				}, nil
			}
			return nil, domain.ErrReviewMediaNotFound
		},
	}

	r := setupReviewTestRouter(repo, store, jwtMgr)

	t.Run("GET Full Content 200 OK", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/media/reviews/"+mediaID, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "video/mp4", w.Header().Get("Content-Type"))
		assert.Equal(t, "bytes", w.Header().Get("Accept-Ranges"))
		assert.Equal(t, "nosniff", w.Header().Get("X-Content-Type-Options"))
		assert.Equal(t, "inline", w.Header().Get("Content-Disposition"))
		assert.Equal(t, "36", w.Header().Get("Content-Length"))
		assert.Equal(t, content, w.Body.Bytes())
	})

	t.Run("HEAD 200 OK without body", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodHead, "/media/reviews/"+mediaID, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "video/mp4", w.Header().Get("Content-Type"))
		assert.Equal(t, "36", w.Header().Get("Content-Length"))
		assert.Empty(t, w.Body.Bytes())
	})

	t.Run("Range GET 206 Partial Content", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/media/reviews/"+mediaID, nil)
		req.Header.Set("Range", "bytes=0-9")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusPartialContent, w.Code)
		assert.Equal(t, "video/mp4", w.Header().Get("Content-Type"))
		assert.Equal(t, "bytes 0-9/36", w.Header().Get("Content-Range"))
		assert.Equal(t, "10", w.Header().Get("Content-Length"))
		assert.Equal(t, []byte("0123456789"), w.Body.Bytes())
	})

	t.Run("404 Not Found on missing media", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/media/reviews/"+uuid.NewString(), nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})
}
