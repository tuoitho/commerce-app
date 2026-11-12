package http

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
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
)

type mockPostUseCaseForAdminHTTP struct {
	createPostFn func(ctx context.Context, adminID string, req domain.CreatePostRequest) (*domain.PostDetail, error)
	updatePostFn func(ctx context.Context, adminID string, postID string, req domain.UpdatePostRequest) (*domain.PostDetail, error)
	deletePostFn func(ctx context.Context, adminID string, postID string) error
}

func (m *mockPostUseCaseForAdminHTTP) CreatePost(ctx context.Context, adminID string, req domain.CreatePostRequest) (*domain.PostDetail, error) {
	if m.createPostFn != nil {
		return m.createPostFn(ctx, adminID, req)
	}
	return nil, nil
}
func (m *mockPostUseCaseForAdminHTTP) UpdatePost(ctx context.Context, adminID string, postID string, req domain.UpdatePostRequest) (*domain.PostDetail, error) {
	if m.updatePostFn != nil {
		return m.updatePostFn(ctx, adminID, postID, req)
	}
	return nil, nil
}
func (m *mockPostUseCaseForAdminHTTP) DeletePost(ctx context.Context, adminID string, postID string) error {
	if m.deletePostFn != nil {
		return m.deletePostFn(ctx, adminID, postID)
	}
	return nil
}
func (m *mockPostUseCaseForAdminHTTP) UploadMedia(ctx context.Context, adminID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.PostMediaAttachment, error) {
	return nil, nil
}
func (m *mockPostUseCaseForAdminHTTP) ListPosts(ctx context.Context, viewerUserID *string, page, limit int) ([]domain.PostItem, int, int, error) {
	return nil, 0, 0, nil
}
func (m *mockPostUseCaseForAdminHTTP) GetPostByID(ctx context.Context, viewerUserID *string, postID string) (*domain.PostDetail, error) {
	return nil, nil
}
func (m *mockPostUseCaseForAdminHTTP) GetMediaStream(ctx context.Context, mediaID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
	return nil, nil, 0, nil
}
func (m *mockPostUseCaseForAdminHTTP) ReactToPost(ctx context.Context, userID string, postID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
	return nil, nil
}
func (m *mockPostUseCaseForAdminHTTP) ReactToComment(ctx context.Context, userID string, commentID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
	return nil, nil
}
func (m *mockPostUseCaseForAdminHTTP) CreateComment(ctx context.Context, userID string, postID string, req domain.CreateCommentRequest) (*domain.PostComment, error) {
	return nil, nil
}
func (m *mockPostUseCaseForAdminHTTP) DeleteComment(ctx context.Context, userID string, userRole string, postID string, commentID string) (string, int, error) {
	return "", 0, nil
}
func (m *mockPostUseCaseForAdminHTTP) ListNotifications(ctx context.Context, recipientID string, limit, offset int) (*domain.NotificationsListResult, error) {
	return nil, nil
}
func (m *mockPostUseCaseForAdminHTTP) MarkNotificationRead(ctx context.Context, recipientID string, notificationID string) (*domain.NotificationItem, int, error) {
	return nil, 0, nil
}
func (m *mockPostUseCaseForAdminHTTP) MarkAllNotificationsRead(ctx context.Context, recipientID string) (int, error) {
	return 0, nil
}

func setupPostAdminTestRouter(uc domain.PostUseCase, jwtMgr *jwt.Manager) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	guard := newGuard(jwtMgr)
	handler := newPostAdminHandler(uc)

	admin := router.Group("/api/v1/admin")
	admin.Use(guard.AuthRequired, guard.RequireAdmin())
	{
		posts := admin.Group("/posts")
		{
			posts.POST("", handler.createPost)
			posts.PUT("/:id", handler.updatePost)
			posts.DELETE("/:id", handler.deletePost)
		}
	}

	return router
}

func TestPostAdminHandler_CreatePost(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-that-is-at-least-32-bytes-long", "test")
	adminID := uuid.NewString()
	customerID := uuid.NewString()

	adminToken, err := jwtMgr.GenerateAccessToken(adminID, "admin", 15*time.Minute)
	require.NoError(t, err)

	customerToken, err := jwtMgr.GenerateAccessToken(customerID, "customer", 15*time.Minute)
	require.NoError(t, err)

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		router := setupPostAdminTestRouter(&mockPostUseCaseForAdminHTTP{}, jwtMgr)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/posts", bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("customer role returns 403", func(t *testing.T) {
		router := setupPostAdminTestRouter(&mockPostUseCaseForAdminHTTP{}, jwtMgr)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/posts", bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("invalid JSON body returns 400", func(t *testing.T) {
		router := setupPostAdminTestRouter(&mockPostUseCaseForAdminHTTP{}, jwtMgr)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/posts", bytes.NewBufferString(`invalid json`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
	})

	t.Run("usecase validation error returns 400 with fields", func(t *testing.T) {
		mockUC := &mockPostUseCaseForAdminHTTP{
			createPostFn: func(ctx context.Context, aID string, r domain.CreatePostRequest) (*domain.PostDetail, error) {
				return nil, domain.NewValidationError(map[string]string{
					"content": "Nội dung bài viết phải từ 1 đến 5.000 ký tự",
				})
			},
		}
		router := setupPostAdminTestRouter(mockUC, jwtMgr)
		body, _ := json.Marshal(domain.CreatePostRequest{
			Content: "",
		})
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/posts", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "content")
	})

	t.Run("referred product not found returns 404", func(t *testing.T) {
		mockUC := &mockPostUseCaseForAdminHTTP{
			createPostFn: func(ctx context.Context, aID string, r domain.CreatePostRequest) (*domain.PostDetail, error) {
				return nil, domain.ErrProductNotFound
			},
		}
		router := setupPostAdminTestRouter(mockUC, jwtMgr)
		body, _ := json.Marshal(domain.CreatePostRequest{
			Content:            "Post about phone",
			ReferredProductIDs: []string{uuid.NewString()},
		})
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/posts", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var resp ResponseEnvelope
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		assert.Equal(t, "product_not_found", resp.Error.Code)
		assert.Equal(t, "Không tìm thấy sản phẩm", resp.Error.Message)
	})

	t.Run("successful creation returns 201 with Full Status Envelope", func(t *testing.T) {
		postID := uuid.NewString()
		mockUC := &mockPostUseCaseForAdminHTTP{
			createPostFn: func(ctx context.Context, aID string, r domain.CreatePostRequest) (*domain.PostDetail, error) {
				return &domain.PostDetail{
					PostItem: domain.PostItem{
						ID:         postID,
						AuthorID:   aID,
						AuthorName: "Quản trị viên",
						AuthorRole: "admin",
						Content:    r.Content,
						CreatedAt:  time.Now(),
						UpdatedAt:  time.Now(),
					},
				}, nil
			},
		}
		router := setupPostAdminTestRouter(mockUC, jwtMgr)
		body, _ := json.Marshal(domain.CreatePostRequest{
			Content:            "Post about flagship",
			ReferredProductIDs: []string{uuid.NewString()},
		})
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/posts", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		var resp struct {
			Success bool              `json:"success"`
			Message string            `json:"message"`
			Data    domain.PostDetail `json:"data"`
		}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.True(t, resp.Success)
		assert.Equal(t, postID, resp.Data.ID)
		assert.Equal(t, "Post about flagship", resp.Data.Content)
	})
}

func TestPostAdminHandler_UpdatePost(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-that-is-at-least-32-bytes-long", "test")
	adminID := uuid.NewString()
	postID := uuid.NewString()

	adminToken, err := jwtMgr.GenerateAccessToken(adminID, "admin", 15*time.Minute)
	require.NoError(t, err)

	t.Run("post not found returns 404", func(t *testing.T) {
		mockUC := &mockPostUseCaseForAdminHTTP{
			updatePostFn: func(ctx context.Context, aID string, pID string, r domain.UpdatePostRequest) (*domain.PostDetail, error) {
				return nil, domain.ErrPostNotFound
			},
		}
		router := setupPostAdminTestRouter(mockUC, jwtMgr)
		body, _ := json.Marshal(domain.UpdatePostRequest{
			Content:            "Updated content",
			ReferredProductIDs: []string{uuid.NewString()},
		})
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/admin/posts/"+postID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var resp ResponseEnvelope
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		assert.Equal(t, "post_not_found", resp.Error.Code)
		assert.Equal(t, "Bài viết không tồn tại hoặc đã bị xóa", resp.Error.Message)
	})

	t.Run("successful update returns 200 with Full Status Envelope", func(t *testing.T) {
		mockUC := &mockPostUseCaseForAdminHTTP{
			updatePostFn: func(ctx context.Context, aID string, pID string, r domain.UpdatePostRequest) (*domain.PostDetail, error) {
				return &domain.PostDetail{
					PostItem: domain.PostItem{
						ID:         pID,
						AuthorID:   aID,
						AuthorName: "Quản trị viên",
						AuthorRole: "admin",
						Content:    r.Content,
						CreatedAt:  time.Now(),
						UpdatedAt:  time.Now(),
					},
				}, nil
			},
		}
		router := setupPostAdminTestRouter(mockUC, jwtMgr)
		body, _ := json.Marshal(domain.UpdatePostRequest{
			Content:            "Updated content",
			ReferredProductIDs: []string{uuid.NewString()},
		})
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/admin/posts/"+postID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp struct {
			Success bool              `json:"success"`
			Message string            `json:"message"`
			Data    domain.PostDetail `json:"data"`
		}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.True(t, resp.Success)
		assert.Equal(t, postID, resp.Data.ID)
		assert.Equal(t, "Updated content", resp.Data.Content)
	})
}

func TestPostAdminHandler_DeletePost(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-that-is-at-least-32-bytes-long", "test")
	adminID := uuid.NewString()
	postID := uuid.NewString()

	adminToken, err := jwtMgr.GenerateAccessToken(adminID, "admin", 15*time.Minute)
	require.NoError(t, err)

	t.Run("post not found returns 404", func(t *testing.T) {
		mockUC := &mockPostUseCaseForAdminHTTP{
			deletePostFn: func(ctx context.Context, aID string, pID string) error {
				return domain.ErrPostNotFound
			},
		}
		router := setupPostAdminTestRouter(mockUC, jwtMgr)
		req, _ := http.NewRequest(http.MethodDelete, "/api/v1/admin/posts/"+postID, nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var resp ResponseEnvelope
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		assert.Equal(t, "post_not_found", resp.Error.Code)
	})

	t.Run("successful deletion returns 200 with deleted ID", func(t *testing.T) {
		mockUC := &mockPostUseCaseForAdminHTTP{
			deletePostFn: func(ctx context.Context, aID string, pID string) error {
				return nil
			},
		}
		router := setupPostAdminTestRouter(mockUC, jwtMgr)
		req, _ := http.NewRequest(http.MethodDelete, "/api/v1/admin/posts/"+postID, nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp struct {
			Success bool              `json:"success"`
			Message string            `json:"message"`
			Data    map[string]string `json:"data"`
		}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.True(t, resp.Success)
		assert.Equal(t, postID, resp.Data["id"])
	})
}
