package http

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
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
	getPublicFn    func(ctx context.Context, productID string, viewerUserID *string, page, limit int) (*domain.ProductReviewsResult, error)
	getUserReviewsFn func(ctx context.Context, userID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error)
	getAdminReviewsFn func(ctx context.Context, ratingFilter int16, hasReplyFilter string, page, limit int) (*domain.AdminReviewsResult, error)
	updateAdminReplyFn func(ctx context.Context, reviewID string, reply *string) (*domain.Review, error)
	setReviewVoteFn func(ctx context.Context, reviewID, userID string, vote *domain.HelpfulnessVote) (*domain.HelpfulnessState, error)
	setReviewReplyVoteFn func(ctx context.Context, replyID, userID string, vote *domain.HelpfulnessVote) (*domain.HelpfulnessState, error)
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

func (m *mockReviewRepoForHTTP) GetPublicReviewsByProductID(ctx context.Context, productID string, viewerUserID *string, page, limit int) (*domain.ProductReviewsResult, error) {
	if m.getPublicFn != nil {
		return m.getPublicFn(ctx, productID, viewerUserID, page, limit)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) GetUserReviews(ctx context.Context, userID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error) {
	if m.getUserReviewsFn != nil {
		return m.getUserReviewsFn(ctx, userID, ratingFilter, page, limit)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) GetAdminReviews(ctx context.Context, ratingFilter int16, hasReplyFilter string, page, limit int) (*domain.AdminReviewsResult, error) {
	if m.getAdminReviewsFn != nil {
		return m.getAdminReviewsFn(ctx, ratingFilter, hasReplyFilter, page, limit)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) UpdateAdminReply(ctx context.Context, reviewID string, reply *string) (*domain.Review, error) {
	if m.updateAdminReplyFn != nil {
		return m.updateAdminReplyFn(ctx, reviewID, reply)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) SetReviewVote(ctx context.Context, reviewID, userID string, vote *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
	if m.setReviewVoteFn != nil {
		return m.setReviewVoteFn(ctx, reviewID, userID, vote)
	}
	return nil, nil
}

func (m *mockReviewRepoForHTTP) SetReviewReplyVote(ctx context.Context, replyID, userID string, vote *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
	if m.setReviewReplyVoteFn != nil {
		return m.setReviewReplyVoteFn(ctx, replyID, userID, vote)
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
	userID := "11111111-1111-1111-1111-111111111111"
	orderID := "22222222-2222-2222-2222-222222222222"
	itemID := "33333333-3333-3333-3333-333333333333"
	reviewID := "rev-101"
	snapshotPath := filepath.Join("..", "..", "..", "..", ".dream", "specs", "review-history", "contract-snapshots.json")
	createdAt := time.Date(2026, 10, 18, 9, 0, 0, 0, time.UTC)
	updatedAt := time.Date(2026, 10, 20, 10, 30, 0, 0, time.UTC)

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
					EditCount:   1,
					Media: []domain.ReviewMedia{
						{
							ID:        "media-101",
							Type:      domain.ReviewMediaTypeImage,
							MimeType:  "image/jpeg",
							URL:       "/media/reviews/media-101",
							CreatedAt: createdAt,
						},
					},
					CanEdit:   false,
					Edited:    true,
					CreatedAt: createdAt,
					UpdatedAt: updatedAt,
				}, nil, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("rating", "4")
		_ = writer.WriteField("comment", "Sau 2 tuần sử dụng pin vẫn rất ổn định, đáng tiền.")
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

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"review-history",
			"update_review_200",
			"API-ORDER-ITEM-REVIEW@1",
			"PUT /api/v1/orders/:id/items/:itemId/review",
			map[string]any{
				"rating":  4,
				"comment": "Sau 2 tuần sử dụng pin vẫn rất ổn định, đáng tiền.",
			},
			w,
		)
	})

	t.Run("400 Validation Error on invalid rating", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		_ = writer.WriteField("rating", "6")
		_ = writer.WriteField("comment", "Điểm số vượt quá phạm vi")
		_ = writer.Close()

		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/orders/%s/items/%s/review", orderID, itemID), body)
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

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"review-history",
			"update_review_validation_400",
			"API-ORDER-ITEM-REVIEW@1",
			"PUT /api/v1/orders/:id/items/:itemId/review",
			map[string]any{
				"rating":  6,
				"comment": "Điểm số vượt quá phạm vi",
			},
			w,
		)
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

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"review-history",
			"update_review_conflict_409",
			"API-ORDER-ITEM-REVIEW@1",
			"PUT /api/v1/orders/:id/items/:itemId/review",
			map[string]any{
				"rating": 3,
			},
			w,
		)
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
	customerID := uuid.NewString()
	adminID := uuid.NewString()

	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 2*time.Hour)
	require.NoError(t, err)

	adminToken, err := jwtMgr.GenerateAccessToken(adminID, domain.RoleAdmin, 2*time.Hour)
	require.NoError(t, err)

	t.Run("Anonymous GET without token returns vote counts with viewerVote null and preserves envelope", func(t *testing.T) {
		var capturedViewerID *string
		replyText := "Cảm ơn bạn đã đánh giá"
		replyID := uuid.NewString()
		repliedAt := time.Now().UTC().Add(-30 * time.Minute)

		repo := &mockReviewRepoForHTTP{
			getPublicFn: func(ctx context.Context, pID string, viewerUserID *string, page, limit int) (*domain.ProductReviewsResult, error) {
				capturedViewerID = viewerUserID
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
							Comment: "Đánh giá có reply",
							Reviewer: domain.PublicReviewer{
								MaskedEmail: &masked,
							},
							Purchase: domain.PublicPurchase{
								Model: "256GB",
							},
							Media: []domain.ReviewMedia{},
							Helpfulness: domain.HelpfulnessState{
								HelpfulCount:   10,
								UnhelpfulCount: 2,
								ViewerVote:     nil,
							},
							AdminReply:     &replyText,
							AdminRepliedAt: &repliedAt,
							AdminReplyID:   &replyID,
							AdminReplyHelpfulness: &domain.HelpfulnessState{
								HelpfulCount:   4,
								UnhelpfulCount: 0,
								ViewerVote:     nil,
							},
							CreatedAt: time.Now().UTC(),
							UpdatedAt: time.Now().UTC(),
						},
						{
							ID:      uuid.NewString(),
							Rating:  4,
							Comment: "Đánh giá không có reply",
							Reviewer: domain.PublicReviewer{
								MaskedEmail: &masked,
							},
							Purchase: domain.PublicPurchase{
								Model: "128GB",
							},
							Media: []domain.ReviewMedia{},
							Helpfulness: domain.HelpfulnessState{
								HelpfulCount:   0,
								UnhelpfulCount: 0,
								ViewerVote:     nil,
							},
							AdminReply:            nil,
							AdminRepliedAt:        nil,
							AdminReplyID:          nil,
							AdminReplyHelpfulness: nil,
							CreatedAt:             time.Now().UTC().Add(-1 * time.Hour),
							UpdatedAt:             time.Now().UTC().Add(-1 * time.Hour),
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
		assert.Nil(t, capturedViewerID, "Anonymous request must pass nil viewerUserID")

		var rawResp map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &rawResp)
		require.NoError(t, err)
		assert.True(t, rawResp["success"].(bool))
		assert.Equal(t, "Lấy danh sách đánh giá thành công", rawResp["message"])

		data := rawResp["data"].(map[string]interface{})
		reviews := data["reviews"].([]interface{})
		require.Len(t, reviews, 2)

		// Review 1 with reply
		rev1 := reviews[0].(map[string]interface{})
		h1 := rev1["helpfulness"].(map[string]interface{})
		assert.Equal(t, float64(10), h1["helpfulCount"])
		assert.Equal(t, float64(2), h1["unhelpfulCount"])
		assert.Nil(t, h1["viewerVote"])
		assert.Equal(t, replyText, rev1["adminReply"])
		assert.Equal(t, replyID, rev1["adminReplyId"])
		repHelp1 := rev1["adminReplyHelpfulness"].(map[string]interface{})
		assert.Equal(t, float64(4), repHelp1["helpfulCount"])
		assert.Equal(t, float64(0), repHelp1["unhelpfulCount"])
		assert.Nil(t, repHelp1["viewerVote"])

		// Review 2 without reply: reply fields omitted
		rev2 := reviews[1].(map[string]interface{})
		h2 := rev2["helpfulness"].(map[string]interface{})
		assert.Equal(t, float64(0), h2["helpfulCount"])
		assert.Equal(t, float64(0), h2["unhelpfulCount"])
		assert.Nil(t, h2["viewerVote"])
		assert.Nil(t, rev2["adminReply"])
		assert.Nil(t, rev2["adminReplyId"])
		assert.Nil(t, rev2["adminReplyHelpfulness"])
	})

	t.Run("Customer GET with valid token passes viewer ID and receives personalized viewerVote", func(t *testing.T) {
		var capturedViewerID *string
		helpfulVote := domain.HelpfulnessVoteHelpful

		repo := &mockReviewRepoForHTTP{
			getPublicFn: func(ctx context.Context, pID string, viewerUserID *string, page, limit int) (*domain.ProductReviewsResult, error) {
				capturedViewerID = viewerUserID
				masked := "c***@gmail.com"
				return &domain.ProductReviewsResult{
					Summary: domain.ProductReviewSummary{
						TotalReviews:  1,
						AverageRating: "5.0",
						RatingCounts:  map[string]int64{"5": 1},
					},
					Reviews: []domain.PublicReview{
						{
							ID:      uuid.NewString(),
							Rating:  5,
							Comment: "Đánh giá có vote của customer",
							Reviewer: domain.PublicReviewer{
								MaskedEmail: &masked,
							},
							Helpfulness: domain.HelpfulnessState{
								HelpfulCount:   5,
								UnhelpfulCount: 1,
								ViewerVote:     &helpfulVote,
							},
							CreatedAt: time.Now().UTC(),
							UpdatedAt: time.Now().UTC(),
						},
					},
					Total: 1,
				}, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/products/%s/reviews", productID), nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		require.NotNil(t, capturedViewerID)
		assert.Equal(t, customerID, *capturedViewerID)

		var rawResp map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &rawResp)
		require.NoError(t, err)
		data := rawResp["data"].(map[string]interface{})
		reviews := data["reviews"].([]interface{})
		require.Len(t, reviews, 1)

		rev := reviews[0].(map[string]interface{})
		h := rev["helpfulness"].(map[string]interface{})
		assert.Equal(t, "helpful", h["viewerVote"])
		assert.Equal(t, float64(5), h["helpfulCount"])
		assert.Equal(t, float64(1), h["unhelpfulCount"])
	})

	t.Run("Admin GET with valid token allows viewing without viewer selection (viewerVote null)", func(t *testing.T) {
		var capturedViewerID *string

		repo := &mockReviewRepoForHTTP{
			getPublicFn: func(ctx context.Context, pID string, viewerUserID *string, page, limit int) (*domain.ProductReviewsResult, error) {
				capturedViewerID = viewerUserID
				return &domain.ProductReviewsResult{
					Summary: domain.ProductReviewSummary{
						TotalReviews:  0,
						AverageRating: "0.0",
						RatingCounts:  map[string]int64{},
					},
					Reviews: []domain.PublicReview{},
					Total:   0,
				}, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/products/%s/reviews", productID), nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Nil(t, capturedViewerID, "Admin request must not set viewerUserID for customer personal votes")
	})

	t.Run("Invalid or expired token returns 401 invalid_token so client can refresh", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/products/%s/reviews", productID), nil)
		req.Header.Set("Authorization", "Bearer invalid-or-expired-token")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "invalid_token", resp.Error.Code)
	})

	t.Run("Malformed Authorization header returns 401 invalid_token", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		// Basic auth instead of Bearer
		req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/products/%s/reviews", productID), nil)
		req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "invalid_token", resp.Error.Code)
	})

	t.Run("Success 200 with 0 reviews", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{
			getPublicFn: func(ctx context.Context, pID string, viewerUserID *string, page, limit int) (*domain.ProductReviewsResult, error) {
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

func TestGetUserReviews_HTTPHandler(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	userID := "11111111-1111-1111-1111-111111111111"
	token, _ := jwtMgr.GenerateAccessToken(userID, "customer", 15*time.Minute)
	snapshotPath := filepath.Join("..", "..", "..", "..", ".dream", "specs", "review-history", "contract-snapshots.json")

	store := reviewmedia.NewFakeStore()

	t.Run("401 Unauthorized when missing token", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews/me", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"review-history",
			"unauthenticated_401",
			"API-USER-REVIEWS@1",
			"GET /api/v1/reviews/me",
			nil,
			w,
		)
	})

	t.Run("400 Bad Request on invalid rating query param", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews/me?rating=9", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"review-history",
			"get_user_reviews_validation_400",
			"API-USER-REVIEWS@1",
			"GET /api/v1/reviews/me",
			map[string]any{
				"rating": 9,
			},
			w,
		)
	})

	t.Run("200 OK returns Full Status Envelope with user reviews and pagination", func(t *testing.T) {
		var capturedRating int16
		var capturedPage, capturedLimit int
		img1 := "https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=300&q=80"
		img2 := "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=300&q=80"
		adminReplyText := "Cảm ơn quý khách đã tin tưởng lựa chọn AuraPhone! Chúc bạn có trải nghiệm tuyệt vời cùng iPhone 15 Pro Max."
		createdAt1 := time.Date(2026, 10, 18, 9, 0, 0, 0, time.UTC)
		repliedAt1 := time.Date(2026, 10, 18, 14, 15, 0, 0, time.UTC)
		createdAt2 := time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)
		updatedAt2 := time.Date(2026, 10, 14, 16, 45, 0, 0, time.UTC)

		repo := &mockReviewRepoForHTTP{
			getUserReviewsFn: func(ctx context.Context, uID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error) {
				capturedRating = ratingFilter
				capturedPage = page
				capturedLimit = limit
				return &domain.UserReviewsResult{
					Reviews: []domain.UserReview{
						{
							ID:             "rev-101",
							OrderItemID:    "33333333-3333-3333-3333-333333333333",
							Rating:         5,
							Comment:        "Máy chính hãng VNA đóng gói rất kỹ, màn hình 120Hz siêu mượt và camera zoom 5x cực kỳ sắc nét.",
							AdminReply:     &adminReplyText,
							AdminRepliedAt: &repliedAt1,
							Media: []domain.ReviewMedia{
								{
									ID:        "media-101",
									Type:      domain.ReviewMediaTypeImage,
									MimeType:  "image/jpeg",
									URL:       "/media/reviews/media-101",
									CreatedAt: createdAt1,
								},
								{
									ID:        "media-102",
									Type:      domain.ReviewMediaTypeVideo,
									MimeType:  "video/mp4",
									URL:       "/media/reviews/media-102",
									CreatedAt: createdAt1,
								},
							},
							CanEdit:   true,
							Edited:    false,
							EditCount: 0,
							CreatedAt: createdAt1,
							UpdatedAt: createdAt1,
							Product: domain.UserReviewProduct{
								ID:        "prod-101",
								Name:      "iPhone 15 Pro Max 256GB Titan Tự Nhiên",
								BrandName: "Apple",
								Model:     "A3106",
								ImageURL:  img1,
								Options: []domain.CartOption{
									{GroupLabel: "Màu sắc", ValueLabel: "Titan Tự Nhiên"},
									{GroupLabel: "Dung lượng", ValueLabel: "256GB"},
								},
							},
							Order: domain.UserReviewOrder{
								ID:        "22222222-2222-2222-2222-222222222222",
								CreatedAt: createdAt1.Add(-48 * time.Hour),
							},
						},
						{
							ID:          "rev-102",
							OrderItemID: "44444444-4444-4444-4444-444444444444",
							Rating:      4,
							Comment:     "Thiết kế vuông vức nam tính, bút S-Pen tiện lợi cho công việc ghi chú nhanh.",
							Media: []domain.ReviewMedia{
								{
									ID:        "media-201",
									Type:      domain.ReviewMediaTypeImage,
									MimeType:  "image/jpeg",
									URL:       "/media/reviews/media-201",
									CreatedAt: createdAt2,
								},
							},
							CanEdit:   false,
							Edited:    true,
							EditCount: 1,
							CreatedAt: createdAt2,
							UpdatedAt: updatedAt2,
							Product: domain.UserReviewProduct{
								ID:        "prod-102",
								Name:      "Samsung Galaxy S24 Ultra 5G 512GB",
								BrandName: "Samsung",
								Model:     "SM-S928B",
								ImageURL:  img2,
								Options: []domain.CartOption{
									{GroupLabel: "Màu sắc", ValueLabel: "Xám Titan"},
									{GroupLabel: "Dung lượng", ValueLabel: "512GB"},
								},
							},
							Order: domain.UserReviewOrder{
								ID:        "55555555-5555-5555-5555-555555555555",
								CreatedAt: createdAt2.Add(-72 * time.Hour),
							},
						},
					},
					Total: 2,
				}, nil
			},
		}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews/me?rating=5&page=1&limit=10", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, int16(5), capturedRating)
		assert.Equal(t, 1, capturedPage)
		assert.Equal(t, 10, capturedLimit)

		var resp struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
			Data    struct {
				Reviews []domain.UserReview `json:"reviews"`
			} `json:"data"`
			Meta struct {
				Pagination PaginationMeta `json:"pagination"`
			} `json:"meta"`
		}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Lấy lịch sử đánh giá thành công", resp.Message)
		require.Len(t, resp.Data.Reviews, 2)
		assert.Equal(t, "rev-101", resp.Data.Reviews[0].ID)
		assert.Equal(t, 2, resp.Meta.Pagination.Total)
		assert.Equal(t, 1, resp.Meta.Pagination.Page)

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"review-history",
			"get_user_reviews_200",
			"API-USER-REVIEWS@1",
			"GET /api/v1/reviews/me",
			nil,
			w,
		)
	})

	t.Run("200 OK returns empty list when user has no matching reviews", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{
			getUserReviewsFn: func(ctx context.Context, uID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error) {
				return &domain.UserReviewsResult{
					Reviews: []domain.UserReview{},
					Total:   0,
				}, nil
			},
		}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/reviews/me?page=1&limit=10", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		assertOrRecordContractSnapshot(
			t,
			snapshotPath,
			"review-history",
			"get_user_reviews_empty_200",
			"API-USER-REVIEWS@1",
			"GET /api/v1/reviews/me",
			nil,
			w,
		)
	})
}

func TestSetReviewHelpfulness_HTTPHandler(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	customerID := uuid.NewString()
	adminID := uuid.NewString()
	reviewID := uuid.NewString()

	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 2*time.Hour)
	require.NoError(t, err)

	adminToken, err := jwtMgr.GenerateAccessToken(adminID, domain.RoleAdmin, 2*time.Hour)
	require.NoError(t, err)

	store := reviewmedia.NewFakeStore()

	t.Run("200 OK - Vote helpful returns direct HelpfulnessState in Full Status Envelope", func(t *testing.T) {
		helpful := domain.HelpfulnessVoteHelpful
		var capturedReviewID, capturedUserID string
		var capturedVote *domain.HelpfulnessVote

		repo := &mockReviewRepoForHTTP{
			setReviewVoteFn: func(ctx context.Context, rID, uID string, v *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
				capturedReviewID = rID
				capturedUserID = uID
				capturedVote = v
				return &domain.HelpfulnessState{
					HelpfulCount:   13,
					UnhelpfulCount: 2,
					ViewerVote:     &helpful,
				}, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, reviewID, capturedReviewID)
		assert.Equal(t, customerID, capturedUserID)
		require.NotNil(t, capturedVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *capturedVote)

		var resp struct {
			Success bool                    `json:"success"`
			Message string                  `json:"message"`
			Data    domain.HelpfulnessState `json:"data"`
			Error   interface{}             `json:"error"`
			Meta    struct {
				Timestamp string `json:"timestamp"`
			} `json:"meta"`
		}
		err = json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Cập nhật bình chọn thành công", resp.Message)
		assert.Nil(t, resp.Error)
		assert.Equal(t, int64(13), resp.Data.HelpfulCount)
		assert.Equal(t, int64(2), resp.Data.UnhelpfulCount)
		require.NotNil(t, resp.Data.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *resp.Data.ViewerVote)
	})

	t.Run("200 OK - Vote unhelpful", func(t *testing.T) {
		unhelpful := domain.HelpfulnessVoteUnhelpful
		repo := &mockReviewRepoForHTTP{
			setReviewVoteFn: func(ctx context.Context, rID, uID string, v *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
				return &domain.HelpfulnessState{
					HelpfulCount:   12,
					UnhelpfulCount: 3,
					ViewerVote:     &unhelpful,
				}, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "unhelpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp struct {
			Success bool                    `json:"success"`
			Data    domain.HelpfulnessState `json:"data"`
		}
		err = json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, int64(12), resp.Data.HelpfulCount)
		assert.Equal(t, int64(3), resp.Data.UnhelpfulCount)
		require.NotNil(t, resp.Data.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteUnhelpful, *resp.Data.ViewerVote)
	})

	t.Run("200 OK - Remove vote with null", func(t *testing.T) {
		var capturedVote *domain.HelpfulnessVote
		repo := &mockReviewRepoForHTTP{
			setReviewVoteFn: func(ctx context.Context, rID, uID string, v *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
				capturedVote = v
				return &domain.HelpfulnessState{
					HelpfulCount:   12,
					UnhelpfulCount: 2,
					ViewerVote:     nil,
				}, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": null}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Nil(t, capturedVote)
		var resp struct {
			Success bool                    `json:"success"`
			Data    domain.HelpfulnessState `json:"data"`
		}
		err = json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Nil(t, resp.Data.ViewerVote)
	})

	t.Run("400 Bad Request - Missing vote field in body", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "vote")
	})

	t.Run("400 Bad Request - Invalid vote string value", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "HELPFUL"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "vote")
	})

	t.Run("400 Bad Request - Malformed JSON body", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `not-json`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
	})

	t.Run("401 Unauthorized - Missing Authorization header", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "unauthorized", resp.Error.Code)
	})

	t.Run("401 Unauthorized - Invalid or expired token", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer bad-token")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "invalid_token", resp.Error.Code)
	})

	t.Run("403 Forbidden - Admin token is rejected", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "forbidden", resp.Error.Code)
		assert.Equal(t, "Bạn không có quyền thực hiện thao tác này", resp.Message)
	})

	t.Run("404 Not Found - Non-existent review returns review_not_found with Vietnamese message", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{
			setReviewVoteFn: func(ctx context.Context, rID, uID string, v *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
				return nil, domain.ErrReviewNotFound
			},
		}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "review_not_found", resp.Error.Code)
		assert.Equal(t, "Không tìm thấy đánh giá", resp.Message)
	})

	t.Run("500 Internal Server Error - Unexpected repo error", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{
			setReviewVoteFn: func(ctx context.Context, rID, uID string, v *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
				return nil, assert.AnError
			},
		}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/reviews/%s/helpfulness", reviewID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "internal", resp.Error.Code)
	})
}

func TestSetReplyHelpfulness_HTTPHandler(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	customerID := uuid.NewString()
	adminID := uuid.NewString()
	replyID := uuid.NewString()

	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 2*time.Hour)
	require.NoError(t, err)

	adminToken, err := jwtMgr.GenerateAccessToken(adminID, domain.RoleAdmin, 2*time.Hour)
	require.NoError(t, err)

	store := reviewmedia.NewFakeStore()

	t.Run("200 OK - Vote helpful on reply returns direct HelpfulnessState in Full Status Envelope", func(t *testing.T) {
		helpful := domain.HelpfulnessVoteHelpful
		var capturedReplyID, capturedUserID string
		var capturedVote *domain.HelpfulnessVote

		repo := &mockReviewRepoForHTTP{
			setReviewReplyVoteFn: func(ctx context.Context, rpID, uID string, v *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
				capturedReplyID = rpID
				capturedUserID = uID
				capturedVote = v
				return &domain.HelpfulnessState{
					HelpfulCount:   5,
					UnhelpfulCount: 1,
					ViewerVote:     &helpful,
				}, nil
			},
		}

		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/review-replies/%s/helpfulness", replyID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, replyID, capturedReplyID)
		assert.Equal(t, customerID, capturedUserID)
		require.NotNil(t, capturedVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *capturedVote)

		var resp struct {
			Success bool                    `json:"success"`
			Message string                  `json:"message"`
			Data    domain.HelpfulnessState `json:"data"`
		}
		err = json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Cập nhật bình chọn thành công", resp.Message)
		assert.Equal(t, int64(5), resp.Data.HelpfulCount)
		assert.Equal(t, int64(1), resp.Data.UnhelpfulCount)
		require.NotNil(t, resp.Data.ViewerVote)
		assert.Equal(t, domain.HelpfulnessVoteHelpful, *resp.Data.ViewerVote)
	})

	t.Run("400 Bad Request - Missing vote field in body", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/review-replies/%s/helpfulness", replyID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "vote")
	})

	t.Run("401 Unauthorized - Missing Authorization header", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/review-replies/%s/helpfulness", replyID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("403 Forbidden - Admin token is rejected", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/review-replies/%s/helpfulness", replyID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "forbidden", resp.Error.Code)
		assert.Equal(t, "Bạn không có quyền thực hiện thao tác này", resp.Message)
	})

	t.Run("404 Not Found - Non-existent reply returns review_reply_not_found with Vietnamese message", func(t *testing.T) {
		repo := &mockReviewRepoForHTTP{
			setReviewReplyVoteFn: func(ctx context.Context, rpID, uID string, v *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
				return nil, domain.ErrReviewReplyNotFound
			},
		}
		r := setupReviewTestRouter(repo, store, jwtMgr)

		body := `{"vote": "helpful"}`
		req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/review-replies/%s/helpfulness", replyID), bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.Equal(t, "review_reply_not_found", resp.Error.Code)
		assert.Equal(t, "Không tìm thấy phản hồi đánh giá", resp.Message)
	})
}

