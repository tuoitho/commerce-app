package http

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
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
)

type mockPostUseCaseForPublicHTTP struct {
	createPostFn             func(ctx context.Context, adminID string, req domain.CreatePostRequest) (*domain.PostDetail, error)
	updatePostFn             func(ctx context.Context, adminID string, postID string, req domain.UpdatePostRequest) (*domain.PostDetail, error)
	deletePostFn             func(ctx context.Context, adminID string, postID string) error
	uploadMediaFn            func(ctx context.Context, adminID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.PostMediaAttachment, error)
	listPostsFn              func(ctx context.Context, viewerUserID *string, page, limit int) ([]domain.PostItem, int, int, error)
	getPostByIDFn            func(ctx context.Context, viewerUserID *string, postID string) (*domain.PostDetail, error)
	getMediaStreamFn         func(ctx context.Context, mediaID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error)
	reactToPostFn            func(ctx context.Context, userID string, postID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error)
	reactToCommentFn         func(ctx context.Context, userID string, commentID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error)
	createCommentFn          func(ctx context.Context, userID string, postID string, req domain.CreateCommentRequest) (*domain.PostComment, error)
	deleteCommentFn          func(ctx context.Context, userID string, userRole string, postID string, commentID string) (string, int, error)
	listNotificationsFn      func(ctx context.Context, recipientID string, limit, offset int) (*domain.NotificationsListResult, error)
	markNotificationReadFn   func(ctx context.Context, recipientID string, notificationID string) (*domain.NotificationItem, int, error)
	markAllNotificationsReadFn func(ctx context.Context, recipientID string) (int, error)
}

func (m *mockPostUseCaseForPublicHTTP) CreatePost(ctx context.Context, adminID string, req domain.CreatePostRequest) (*domain.PostDetail, error) {
	if m.createPostFn != nil {
		return m.createPostFn(ctx, adminID, req)
	}
	return nil, nil
}
func (m *mockPostUseCaseForPublicHTTP) UpdatePost(ctx context.Context, adminID string, postID string, req domain.UpdatePostRequest) (*domain.PostDetail, error) {
	if m.updatePostFn != nil {
		return m.updatePostFn(ctx, adminID, postID, req)
	}
	return nil, nil
}
func (m *mockPostUseCaseForPublicHTTP) DeletePost(ctx context.Context, adminID string, postID string) error {
	if m.deletePostFn != nil {
		return m.deletePostFn(ctx, adminID, postID)
	}
	return nil
}
func (m *mockPostUseCaseForPublicHTTP) UploadMedia(ctx context.Context, adminID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.PostMediaAttachment, error) {
	if m.uploadMediaFn != nil {
		return m.uploadMediaFn(ctx, adminID, fileName, reader, size, mimeType)
	}
	return nil, nil
}
func (m *mockPostUseCaseForPublicHTTP) ListPosts(ctx context.Context, viewerUserID *string, page, limit int) ([]domain.PostItem, int, int, error) {
	if m.listPostsFn != nil {
		return m.listPostsFn(ctx, viewerUserID, page, limit)
	}
	return nil, 0, 0, nil
}
func (m *mockPostUseCaseForPublicHTTP) GetPostByID(ctx context.Context, viewerUserID *string, postID string) (*domain.PostDetail, error) {
	if m.getPostByIDFn != nil {
		return m.getPostByIDFn(ctx, viewerUserID, postID)
	}
	return nil, nil
}
func (m *mockPostUseCaseForPublicHTTP) GetMediaStream(ctx context.Context, mediaID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
	if m.getMediaStreamFn != nil {
		return m.getMediaStreamFn(ctx, mediaID, start, length)
	}
	return nil, nil, 0, nil
}
func (m *mockPostUseCaseForPublicHTTP) ReactToPost(ctx context.Context, userID string, postID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
	if m.reactToPostFn != nil {
		return m.reactToPostFn(ctx, userID, postID, reaction)
	}
	return nil, nil
}
func (m *mockPostUseCaseForPublicHTTP) ReactToComment(ctx context.Context, userID string, commentID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
	if m.reactToCommentFn != nil {
		return m.reactToCommentFn(ctx, userID, commentID, reaction)
	}
	return nil, nil
}
func (m *mockPostUseCaseForPublicHTTP) CreateComment(ctx context.Context, userID string, postID string, req domain.CreateCommentRequest) (*domain.PostComment, error) {
	if m.createCommentFn != nil {
		return m.createCommentFn(ctx, userID, postID, req)
	}
	return nil, nil
}
func (m *mockPostUseCaseForPublicHTTP) DeleteComment(ctx context.Context, userID string, userRole string, postID string, commentID string) (string, int, error) {
	if m.deleteCommentFn != nil {
		return m.deleteCommentFn(ctx, userID, userRole, postID, commentID)
	}
	return "", 0, nil
}
func (m *mockPostUseCaseForPublicHTTP) ListNotifications(ctx context.Context, recipientID string, limit, offset int) (*domain.NotificationsListResult, error) {
	if m.listNotificationsFn != nil {
		return m.listNotificationsFn(ctx, recipientID, limit, offset)
	}
	return nil, nil
}
func (m *mockPostUseCaseForPublicHTTP) MarkNotificationRead(ctx context.Context, recipientID string, notificationID string) (*domain.NotificationItem, int, error) {
	if m.markNotificationReadFn != nil {
		return m.markNotificationReadFn(ctx, recipientID, notificationID)
	}
	return nil, 0, nil
}
func (m *mockPostUseCaseForPublicHTTP) MarkAllNotificationsRead(ctx context.Context, recipientID string) (int, error) {
	if m.markAllNotificationsReadFn != nil {
		return m.markAllNotificationsReadFn(ctx, recipientID)
	}
	return 0, nil
}

var _ domain.PostUseCase = (*mockPostUseCaseForPublicHTTP)(nil)

func setupPostFullTestRouter(uc domain.PostUseCase, jwtMgr *jwt.Manager) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewRouter(router, Dependencies{
		Post: uc,
		JWT:  jwtMgr,
	})
	return router
}

func TestPostHandler_AllContractsAndSnapshots(t *testing.T) {
	snapshotPath := filepath.Join("..", "..", "..", "..", ".dream", "specs", "product-referral-posts", "contract-snapshots.json")
	jwtMgr := jwt.NewManager("test-secret-key-that-is-at-least-32-bytes-long", "test")

	adminID := "11111111-1111-1111-1111-111111111111"
	customerID := "22222222-2222-2222-2222-222222222222"
	customerName := "Nguyễn Văn A"
	customerRole := "customer"

	adminToken, err := jwtMgr.GenerateAccessToken(adminID, "admin", 15*time.Minute)
	require.NoError(t, err)

	customerToken, err := jwtMgr.GenerateAccessToken(customerID, "customer", 15*time.Minute)
	require.NoError(t, err)

	postID := "33333333-3333-3333-3333-333333333333"
	commentID := "44444444-4444-4444-4444-444444444444"
	mediaID := "55555555-5555-5555-5555-555555555555"
	notifID := "66666666-6666-6666-6666-666666666666"

	rxLove := domain.ReactionTypeLove
	fixedTime := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)

	sampleMedia := domain.PostMediaAttachment{
		ID:        mediaID,
		FileURL:   "/api/v1/posts/media/" + mediaID,
		FileType:  domain.PostMediaTypeImage,
		FileName:  "iphone15-banner.jpg",
		FileSize:  102400,
		MimeType:  "image/jpeg",
		Position:  0,
	}

	sampleReferredProduct := domain.ReferredProductCard{
		ID:       "77777777-7777-7777-7777-777777777777",
		Name:     "iPhone 15 Pro Max 256GB Titan Tự Nhiên",
		Brand:    "Apple",
		Price:    "29990000",
		Currency: "VND",
		ImageURL: "https://example.com/products/iphone15.jpg",
		InStock:  true,
		Active:   true,
	}

	sampleReactionSummary := domain.ReactionSummary{
		TotalCount: 1,
		Counts: domain.ReactionCounts{
			Like:  0,
			Love:  1,
			Haha:  0,
			Wow:   0,
			Sad:   0,
			Angry: 0,
		},
		ViewerReaction: &rxLove,
	}

	sampleComment := domain.PostComment{
		ID:              commentID,
		PostID:          postID,
		AuthorID:        customerID,
		AuthorName:      customerName,
		AuthorRole:      customerRole,
		ParentID:        nil,
		ReplyToUserID:   nil,
		ReplyToUserName: nil,
		Content:         "Sản phẩm rất đẹp và sang trọng!",
		Reactions: domain.ReactionSummary{
			TotalCount: 0,
			Counts:     domain.ReactionCounts{},
		},
		CreatedAt: fixedTime,
		UpdatedAt: fixedTime,
	}

	samplePostDetail := domain.PostDetail{
		PostItem: domain.PostItem{
			ID:               postID,
			AuthorID:         adminID,
			AuthorName:       "Quản trị viên",
			AuthorRole:       "admin",
			Content:          "Đánh giá chi tiết siêu phẩm iPhone 15 Pro Max mới về hàng tại shop...",
			Media:            []domain.PostMediaAttachment{sampleMedia},
			ReferredProducts: []domain.ReferredProductCard{sampleReferredProduct},
			Reactions:        sampleReactionSummary,
			CommentCount:     1,
			CreatedAt:        fixedTime,
			UpdatedAt:        fixedTime,
		},
		Comments: []domain.PostCommentThread{
			{
				PostComment: sampleComment,
				Replies:     []domain.PostComment{},
			},
		},
	}

	// ========================================================================
	// 1. Contract API-POST-MEDIA@1
	// ========================================================================
	t.Run("API-POST-MEDIA@1 upload_media_201", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			uploadMediaFn: func(ctx context.Context, aID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.PostMediaAttachment, error) {
				return &sampleMedia, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, err := createMultipartRequest("/api/v1/admin/posts/media", "file", "iphone15-banner.jpg", []byte("fake-image-bytes"), "image/jpeg")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "upload_media_201",
			"API-POST-MEDIA@1", "POST /api/v1/admin/posts/media", nil, w,
		)
	})

	t.Run("API-POST-MEDIA@1 post_media_not_found_404", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			getMediaStreamFn: func(ctx context.Context, mediaID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
				return nil, nil, 0, domain.ErrPostMediaNotFound
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/posts/media/"+uuid.NewString(), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "post_media_not_found_404",
			"API-POST-MEDIA@1", "GET /api/v1/posts/media/:id", nil, w,
		)
	})

	// ========================================================================
	// 2. Contract API-POSTS-ADMIN@1
	// ========================================================================
	t.Run("API-POSTS-ADMIN@1 create_post_201", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			createPostFn: func(ctx context.Context, aID string, req domain.CreatePostRequest) (*domain.PostDetail, error) {
				return &samplePostDetail, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		payload := domain.CreatePostRequest{
			Content:            "Đánh giá chi tiết siêu phẩm iPhone 15 Pro Max mới về hàng tại shop...",
			MediaIDs:           []string{mediaID},
			ReferredProductIDs: []string{sampleReferredProduct.ID},
		}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/posts", bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "create_post_201",
			"API-POSTS-ADMIN@1", "POST /api/v1/admin/posts", payload, w,
		)
	})

	t.Run("API-POSTS-ADMIN@1 update_post_200", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			updatePostFn: func(ctx context.Context, aID string, pID string, req domain.UpdatePostRequest) (*domain.PostDetail, error) {
				return &samplePostDetail, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		payload := domain.UpdatePostRequest{
			Content:            "Cập nhật nội dung bài viết...",
			MediaIDs:           []string{mediaID},
			ReferredProductIDs: []string{sampleReferredProduct.ID},
		}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/admin/posts/"+postID, bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "update_post_200",
			"API-POSTS-ADMIN@1", "PUT /api/v1/admin/posts/:id", payload, w,
		)
	})

	t.Run("API-POSTS-ADMIN@1 delete_post_200", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			deletePostFn: func(ctx context.Context, aID string, pID string) error {
				return nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodDelete, "/api/v1/admin/posts/"+postID, nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "delete_post_200",
			"API-POSTS-ADMIN@1", "DELETE /api/v1/admin/posts/:id", nil, w,
		)
	})

	t.Run("API-POSTS-ADMIN@1 admin_post_validation_400", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			createPostFn: func(ctx context.Context, aID string, req domain.CreatePostRequest) (*domain.PostDetail, error) {
				return nil, domain.NewValidationError(map[string]string{
					"content": "Nội dung bài viết phải từ 1 đến 5.000 ký tự",
				})
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		payload := map[string]any{"content": ""}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/posts", bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "admin_post_validation_400",
			"API-POSTS-ADMIN@1", "POST /api/v1/admin/posts", payload, w,
		)
	})

	t.Run("API-POSTS-ADMIN@1 admin_post_not_found_404", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			updatePostFn: func(ctx context.Context, aID string, pID string, req domain.UpdatePostRequest) (*domain.PostDetail, error) {
				return nil, domain.ErrPostNotFound
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		payload := domain.UpdatePostRequest{
			Content:            "Nội dung...",
			ReferredProductIDs: []string{sampleReferredProduct.ID},
		}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/admin/posts/"+uuid.NewString(), bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "admin_post_not_found_404",
			"API-POSTS-ADMIN@1", "PUT /api/v1/admin/posts/:id", payload, w,
		)
	})

	// ========================================================================
	// 3. Contract API-POSTS-PUBLIC@2
	// ========================================================================
	t.Run("API-POSTS-PUBLIC@2 list_posts_200", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			listPostsFn: func(ctx context.Context, viewerUserID *string, page, limit int) ([]domain.PostItem, int, int, error) {
				return []domain.PostItem{samplePostDetail.PostItem}, 1, 1, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/posts?page=1&limit=10", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "list_posts_200",
			"API-POSTS-PUBLIC@2", "GET /api/v1/posts?page=1&limit=10", nil, w,
		)
	})

	t.Run("API-POSTS-PUBLIC@2 get_post_detail_200", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			getPostByIDFn: func(ctx context.Context, viewerUserID *string, pID string) (*domain.PostDetail, error) {
				return &samplePostDetail, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/posts/"+postID, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "get_post_detail_200",
			"API-POSTS-PUBLIC@2", "GET /api/v1/posts/:id", nil, w,
		)
	})

	t.Run("API-POSTS-PUBLIC@2 post_not_found_404", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			getPostByIDFn: func(ctx context.Context, viewerUserID *string, pID string) (*domain.PostDetail, error) {
				return nil, domain.ErrPostNotFound
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/posts/"+uuid.NewString(), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "post_not_found_404",
			"API-POSTS-PUBLIC@2", "GET /api/v1/posts/:id", nil, w,
		)
	})

	t.Run("API-POSTS-PUBLIC@2 set_post_reaction_200", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			reactToPostFn: func(ctx context.Context, uID string, pID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
				return &sampleReactionSummary, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		payload := map[string]any{"reaction": "love"}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/posts/"+postID+"/reactions", bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "set_post_reaction_200",
			"API-POSTS-PUBLIC@2", "PUT /api/v1/posts/:id/reactions", payload, w,
		)
	})

	t.Run("API-POSTS-PUBLIC@2 post_reaction_validation_400", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			reactToPostFn: func(ctx context.Context, uID string, pID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
				return nil, domain.NewValidationError(map[string]string{
					"reaction": "Loại cảm xúc không hợp lệ",
				})
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		payload := map[string]any{"reaction": "invalid_reaction"}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/posts/"+postID+"/reactions", bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "post_reaction_validation_400",
			"API-POSTS-PUBLIC@2", "PUT /api/v1/posts/:id/reactions", payload, w,
		)
	})

	t.Run("API-POSTS-PUBLIC@2 create_comment_201", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			createCommentFn: func(ctx context.Context, uID string, pID string, req domain.CreateCommentRequest) (*domain.PostComment, error) {
				return &sampleComment, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		payload := domain.CreateCommentRequest{
			Content: "Sản phẩm rất đẹp và sang trọng!",
		}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/"+postID+"/comments", bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "create_comment_201",
			"API-POSTS-PUBLIC@2", "POST /api/v1/posts/:id/comments", payload, w,
		)
	})

	t.Run("API-POSTS-PUBLIC@2 comment_validation_400", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			createCommentFn: func(ctx context.Context, uID string, pID string, req domain.CreateCommentRequest) (*domain.PostComment, error) {
				return nil, domain.NewValidationError(map[string]string{
					"content": "Nội dung bình luận phải từ 1 đến 1.000 ký tự",
				})
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		payload := domain.CreateCommentRequest{Content: ""}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/"+postID+"/comments", bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "comment_validation_400",
			"API-POSTS-PUBLIC@2", "POST /api/v1/posts/:id/comments", payload, w,
		)
	})

	t.Run("API-POSTS-PUBLIC@2 comment_not_found_404", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			createCommentFn: func(ctx context.Context, uID string, pID string, req domain.CreateCommentRequest) (*domain.PostComment, error) {
				return nil, domain.ErrPostCommentNotFound
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		badParentID := uuid.NewString()
		payload := domain.CreateCommentRequest{
			Content:         "Phản hồi bình luận...",
			ParentCommentID: &badParentID,
		}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/"+postID+"/comments", bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "comment_not_found_404",
			"API-POSTS-PUBLIC@2", "POST /api/v1/posts/:id/comments", payload, w,
		)
	})

	t.Run("API-POSTS-PUBLIC@2 delete_comment_200", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			deleteCommentFn: func(ctx context.Context, uID string, userRole string, pID string, cID string) (string, int, error) {
				return commentID, 0, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodDelete, "/api/v1/posts/"+postID+"/comments/"+commentID, nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "delete_comment_200",
			"API-POSTS-PUBLIC@2", "DELETE /api/v1/posts/:id/comments/:commentId", nil, w,
		)
	})

	t.Run("API-POSTS-PUBLIC@2 set_comment_reaction_200", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			reactToCommentFn: func(ctx context.Context, uID string, cID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
				return &sampleReactionSummary, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		payload := map[string]any{"reaction": "love"}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/post-comments/"+commentID+"/reactions", bytes.NewBuffer(b))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "set_comment_reaction_200",
			"API-POSTS-PUBLIC@2", "PUT /api/v1/post-comments/:commentId/reactions", payload, w,
		)
	})

	// ========================================================================
	// 4. Contract API-NOTIFICATIONS@2
	// ========================================================================
	sampleNotification := domain.NotificationItem{
		ID:               notifID,
		RecipientID:      adminID,
		ActorID:          &customerID,
		ActorName:        &customerName,
		ActorRole:        &customerRole,
		GroupKey:         domain.NotificationGroupKeyPostReaction(postID),
		ActorCount:       1,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &postID,
		CommentID:        nil,
		ReactionType:     &rxLove,
		Excerpt:          "Đánh giá chi tiết siêu phẩm iPhone 15 Pro Max...",
		Metadata: map[string]interface{}{
			"recentActors": []domain.NotificationActorSummary{
				{
					ID:   customerID,
					Name: customerName,
					Role: customerRole,
				},
			},
		},
		IsRead:    false,
		CreatedAt: fixedTime,
		UpdatedAt: fixedTime,
	}

	t.Run("API-NOTIFICATIONS@2 list_notifications_200", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			listNotificationsFn: func(ctx context.Context, rID string, limit, offset int) (*domain.NotificationsListResult, error) {
				return &domain.NotificationsListResult{
					Items:       []domain.NotificationItem{sampleNotification},
					UnreadCount: 1,
				}, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/notifications?limit=20&offset=0", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "list_notifications_200",
			"API-NOTIFICATIONS@2", "GET /api/v1/notifications?limit=20&offset=0", nil, w,
		)
	})

	t.Run("API-NOTIFICATIONS@2 mark_notification_read_200", func(t *testing.T) {
		readNotif := sampleNotification
		readNotif.IsRead = true
		uc := &mockPostUseCaseForPublicHTTP{
			markNotificationReadFn: func(ctx context.Context, rID string, nID string) (*domain.NotificationItem, int, error) {
				return &readNotif, 0, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/notifications/"+notifID+"/read", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "mark_notification_read_200",
			"API-NOTIFICATIONS@2", "POST /api/v1/notifications/:id/read", nil, w,
		)
	})

	t.Run("API-NOTIFICATIONS@2 notification_not_found_404", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			markNotificationReadFn: func(ctx context.Context, rID string, nID string) (*domain.NotificationItem, int, error) {
				return nil, 0, domain.ErrNotificationNotFound
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/notifications/"+uuid.NewString()+"/read", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "notification_not_found_404",
			"API-NOTIFICATIONS@2", "POST /api/v1/notifications/:id/read", nil, w,
		)
	})

	t.Run("API-NOTIFICATIONS@2 mark_all_notifications_read_200", func(t *testing.T) {
		uc := &mockPostUseCaseForPublicHTTP{
			markAllNotificationsReadFn: func(ctx context.Context, rID string) (int, error) {
				return 0, nil
			},
		}
		router := setupPostFullTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/notifications/read-all", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "mark_all_notifications_read_200",
			"API-NOTIFICATIONS@2", "POST /api/v1/notifications/read-all", nil, w,
		)
	})

	// ========================================================================
	// 5. Contract WS-NOTIFICATIONS@2
	// ========================================================================
	t.Run("WS-NOTIFICATIONS@2 ws_notification_new", func(t *testing.T) {
		w := httptest.NewRecorder()
		w.Code = http.StatusOK
		wsPayload := map[string]any{
			"type":    "notification:new",
			"payload": sampleNotification,
		}
		bodyBytes, err := json.Marshal(wsPayload)
		require.NoError(t, err)
		w.Body = bytes.NewBuffer(bodyBytes)

		assertOrRecordContractSnapshot(
			t, snapshotPath, "product-referral-posts", "ws_notification_new",
			"WS-NOTIFICATIONS@2", "WS /api/v1/chat/ws", nil, w,
		)
	})
}
