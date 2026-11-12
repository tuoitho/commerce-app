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

type mockPostUseCaseForMediaHTTP struct {
	uploadMediaFn    func(ctx context.Context, adminID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.PostMediaAttachment, error)
	getMediaStreamFn func(ctx context.Context, mediaID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error)
}

func (m *mockPostUseCaseForMediaHTTP) CreatePost(ctx context.Context, adminID string, req domain.CreatePostRequest) (*domain.PostDetail, error) {
	return nil, nil
}
func (m *mockPostUseCaseForMediaHTTP) UpdatePost(ctx context.Context, adminID string, postID string, req domain.UpdatePostRequest) (*domain.PostDetail, error) {
	return nil, nil
}
func (m *mockPostUseCaseForMediaHTTP) DeletePost(ctx context.Context, adminID string, postID string) error {
	return nil
}
func (m *mockPostUseCaseForMediaHTTP) UploadMedia(ctx context.Context, adminID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.PostMediaAttachment, error) {
	if m.uploadMediaFn != nil {
		return m.uploadMediaFn(ctx, adminID, fileName, reader, size, mimeType)
	}
	return &domain.PostMediaAttachment{
		ID:        uuid.NewString(),
		FileURL:   "/api/v1/posts/media/test",
		FileType:  domain.PostMediaTypeImage,
		FileName:  fileName,
		FileSize:  size,
		MimeType:  mimeType,
		Position:  0,
	}, nil
}
func (m *mockPostUseCaseForMediaHTTP) ListPosts(ctx context.Context, viewerUserID *string, page, limit int) ([]domain.PostItem, int, int, error) {
	return nil, 0, 0, nil
}
func (m *mockPostUseCaseForMediaHTTP) GetPostByID(ctx context.Context, viewerUserID *string, postID string) (*domain.PostDetail, error) {
	return nil, nil
}
func (m *mockPostUseCaseForMediaHTTP) GetMediaStream(ctx context.Context, mediaID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
	if m.getMediaStreamFn != nil {
		return m.getMediaStreamFn(ctx, mediaID, start, length)
	}
	return nil, nil, 0, domain.ErrPostMediaNotFound
}
func (m *mockPostUseCaseForMediaHTTP) ReactToPost(ctx context.Context, userID string, postID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
	return nil, nil
}
func (m *mockPostUseCaseForMediaHTTP) ReactToComment(ctx context.Context, userID string, commentID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
	return nil, nil
}
func (m *mockPostUseCaseForMediaHTTP) CreateComment(ctx context.Context, userID string, postID string, req domain.CreateCommentRequest) (*domain.PostComment, error) {
	return nil, nil
}
func (m *mockPostUseCaseForMediaHTTP) DeleteComment(ctx context.Context, userID string, userRole string, postID string, commentID string) (string, int, error) {
	return "", 0, nil
}
func (m *mockPostUseCaseForMediaHTTP) ListNotifications(ctx context.Context, recipientID string, limit, offset int) (*domain.NotificationsListResult, error) {
	return nil, nil
}
func (m *mockPostUseCaseForMediaHTTP) MarkNotificationRead(ctx context.Context, recipientID string, notificationID string) (*domain.NotificationItem, int, error) {
	return nil, 0, nil
}
func (m *mockPostUseCaseForMediaHTTP) MarkAllNotificationsRead(ctx context.Context, recipientID string) (int, error) {
	return 0, nil
}

func setupPostMediaTestRouter(uc domain.PostUseCase, jwtMgr *jwt.Manager) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	guard := newGuard(jwtMgr)
	handler := newPostMediaHandler(uc)

	api := router.Group("/api/v1")
	api.GET("/posts/media/:id", handler.getMedia)
	api.HEAD("/posts/media/:id", handler.getMedia)

	admin := api.Group("/admin")
	admin.Use(guard.AuthRequired, guard.RequireAdmin())
	{
		admin.POST("/posts/media", handler.uploadMedia)
	}

	return router
}

func TestPostMediaHandler_Upload(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-that-is-at-least-32-bytes-long", "test")
	adminID := uuid.NewString()
	customerID := uuid.NewString()

	adminToken, err := jwtMgr.GenerateAccessToken(adminID, "admin", 15*time.Minute)
	require.NoError(t, err)

	customerToken, err := jwtMgr.GenerateAccessToken(customerID, "customer", 15*time.Minute)
	require.NoError(t, err)

	t.Run("unauthenticated request returns 401", func(t *testing.T) {
		router := setupPostMediaTestRouter(&mockPostUseCaseForMediaHTTP{}, jwtMgr)
		req, err := createMultipartRequest("/api/v1/admin/posts/media", "file", "photo.jpg", []byte("data"), "image/jpeg")
		require.NoError(t, err)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("customer user returns 403", func(t *testing.T) {
		router := setupPostMediaTestRouter(&mockPostUseCaseForMediaHTTP{}, jwtMgr)
		req, err := createMultipartRequest("/api/v1/admin/posts/media", "file", "photo.jpg", []byte("data"), "image/jpeg")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+customerToken)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("missing file field returns 400", func(t *testing.T) {
		router := setupPostMediaTestRouter(&mockPostUseCaseForMediaHTTP{}, jwtMgr)
		req, err := createMultipartRequest("/api/v1/admin/posts/media", "other_field", "photo.jpg", []byte("data"), "image/jpeg")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+adminToken)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
	})

	t.Run("empty file content returns 400", func(t *testing.T) {
		router := setupPostMediaTestRouter(&mockPostUseCaseForMediaHTTP{}, jwtMgr)
		req, err := createMultipartRequest("/api/v1/admin/posts/media", "file", "photo.jpg", []byte(""), "image/jpeg")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+adminToken)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unsupported mime type returns 400", func(t *testing.T) {
		router := setupPostMediaTestRouter(&mockPostUseCaseForMediaHTTP{}, jwtMgr)
		req, err := createMultipartRequest("/api/v1/admin/posts/media", "file", "doc.pdf", []byte("data"), "application/pdf")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+adminToken)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "file_type")
	})

	t.Run("successful image upload returns 201 with Full Status Envelope", func(t *testing.T) {
		attID := uuid.NewString()
		mockUC := &mockPostUseCaseForMediaHTTP{
			uploadMediaFn: func(ctx context.Context, aID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.PostMediaAttachment, error) {
				assert.Equal(t, adminID, aID)
				assert.Equal(t, "banner.png", fileName)
				assert.Equal(t, "image/png", mimeType)
				return &domain.PostMediaAttachment{
					ID:       attID,
					FileURL:  "/api/v1/posts/media/" + attID,
					FileType: domain.PostMediaTypeImage,
					FileName: fileName,
					FileSize: size,
					MimeType: mimeType,
				}, nil
			},
		}

		router := setupPostMediaTestRouter(mockUC, jwtMgr)
		req, err := createMultipartRequest("/api/v1/admin/posts/media", "file", "banner.png", []byte("fake-png-content"), "image/png")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+adminToken)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		var resp struct {
			Success bool                       `json:"success"`
			Message string                     `json:"message"`
			Data    domain.PostMediaAttachment `json:"data"`
		}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.True(t, resp.Success)
		assert.Equal(t, attID, resp.Data.ID)
		assert.Equal(t, "/api/v1/posts/media/"+attID, resp.Data.FileURL)
		assert.Equal(t, domain.PostMediaTypeImage, resp.Data.FileType)
	})

	t.Run("successful video upload returns 201 with Full Status Envelope", func(t *testing.T) {
		attID := uuid.NewString()
		mockUC := &mockPostUseCaseForMediaHTTP{
			uploadMediaFn: func(ctx context.Context, aID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.PostMediaAttachment, error) {
				return &domain.PostMediaAttachment{
					ID:       attID,
					FileURL:  "/api/v1/posts/media/" + attID,
					FileType: domain.PostMediaTypeVideo,
					FileName: fileName,
					FileSize: size,
					MimeType: mimeType,
				}, nil
			},
		}

		router := setupPostMediaTestRouter(mockUC, jwtMgr)
		req, err := createMultipartRequest("/api/v1/admin/posts/media", "file", "demo.mp4", []byte("fake-mp4-video-content"), "video/mp4")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+adminToken)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
	})
}

func TestPostMediaHandler_GetMediaStreaming(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-that-is-at-least-32-bytes-long", "test")
	mediaID := uuid.NewString()
	imageContent := []byte("image-data-bytes")
	videoContent := []byte("0123456789abcdefghijklmnopqrstuvwxyz")

	t.Run("invalid UUID returns 404", func(t *testing.T) {
		router := setupPostMediaTestRouter(&mockPostUseCaseForMediaHTTP{}, jwtMgr)
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/posts/media/not-uuid", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var resp ResponseEnvelope
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		assert.Equal(t, "post_media_not_found", resp.Error.Code)
	})

	t.Run("media not found returns 404", func(t *testing.T) {
		mockUC := &mockPostUseCaseForMediaHTTP{
			getMediaStreamFn: func(ctx context.Context, mID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
				return nil, nil, 0, domain.ErrPostMediaNotFound
			},
		}
		router := setupPostMediaTestRouter(mockUC, jwtMgr)
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/posts/media/"+uuid.NewString(), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var resp ResponseEnvelope
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp.Success)
		assert.Equal(t, "post_media_not_found", resp.Error.Code)
	})

	t.Run("public guest GET image returns 200 with cache header", func(t *testing.T) {
		mockUC := &mockPostUseCaseForMediaHTTP{
			getMediaStreamFn: func(ctx context.Context, mID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
				return io.NopCloser(bytes.NewReader(imageContent)), &domain.PostMediaAttachment{
					ID:       mediaID,
					FileType: domain.PostMediaTypeImage,
					MimeType: "image/jpeg",
					FileSize: int64(len(imageContent)),
				}, int64(len(imageContent)), nil
			},
		}
		router := setupPostMediaTestRouter(mockUC, jwtMgr)
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/posts/media/"+mediaID, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "image/jpeg", w.Header().Get("Content-Type"))
		assert.Equal(t, "public, max-age=86400", w.Header().Get("Cache-Control"))
		assert.Equal(t, "inline", w.Header().Get("Content-Disposition"))
		assert.Equal(t, imageContent, w.Body.Bytes())
	})

	t.Run("HEAD image returns 200 without body and without calling GetObject", func(t *testing.T) {
		var fullObjectStreamRequested bool
		var headLookupCount int
		mockUC := &mockPostUseCaseForMediaHTTP{
			getMediaStreamFn: func(ctx context.Context, mID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
				if length < 0 {
					headLookupCount++
					return nil, &domain.PostMediaAttachment{
						ID:       mediaID,
						FileType: domain.PostMediaTypeImage,
						MimeType: "image/jpeg",
						FileSize: int64(len(imageContent)),
					}, int64(len(imageContent)), nil
				}
				fullObjectStreamRequested = true
				return io.NopCloser(bytes.NewReader(imageContent)), &domain.PostMediaAttachment{
					ID:       mediaID,
					FileType: domain.PostMediaTypeImage,
					MimeType: "image/jpeg",
					FileSize: int64(len(imageContent)),
				}, int64(len(imageContent)), nil
			},
		}
		router := setupPostMediaTestRouter(mockUC, jwtMgr)
		req, _ := http.NewRequest(http.MethodHead, "/api/v1/posts/media/"+mediaID, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "image/jpeg", w.Header().Get("Content-Type"))
		assert.Equal(t, 0, w.Body.Len())
		assert.Equal(t, 1, headLookupCount)
		assert.False(t, fullObjectStreamRequested, "GetObject stream should not be opened on HEAD requests")
	})

	t.Run("GET video with Range returns 206 Partial Content and calls GetObjectRange once without GetObject", func(t *testing.T) {
		totalSize := int64(len(videoContent))
		var fullObjectStreamRequested bool
		var rangeCalls int
		var metadataCalls int
		mockUC := &mockPostUseCaseForMediaHTTP{
			getMediaStreamFn: func(ctx context.Context, mID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
				if length < 0 {
					metadataCalls++
					return nil, &domain.PostMediaAttachment{
						ID:       mediaID,
						FileType: domain.PostMediaTypeVideo,
						MimeType: "video/mp4",
						FileSize: totalSize,
					}, totalSize, nil
				}
				if start == 0 && length == 0 {
					fullObjectStreamRequested = true
					return io.NopCloser(bytes.NewReader(videoContent)), &domain.PostMediaAttachment{
						ID:       mediaID,
						FileType: domain.PostMediaTypeVideo,
						MimeType: "video/mp4",
						FileSize: totalSize,
					}, totalSize, nil
				}
				rangeCalls++
				sub := videoContent[start : start+length]
				return io.NopCloser(bytes.NewReader(sub)), &domain.PostMediaAttachment{
					ID:       mediaID,
					FileType: domain.PostMediaTypeVideo,
					MimeType: "video/mp4",
					FileSize: totalSize,
				}, length, nil
			},
		}
		router := setupPostMediaTestRouter(mockUC, jwtMgr)
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/posts/media/"+mediaID, nil)
		req.Header.Set("Range", "bytes=0-9")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusPartialContent, w.Code)
		assert.Equal(t, "bytes", w.Header().Get("Accept-Ranges"))
		assert.Equal(t, "bytes 0-9/36", w.Header().Get("Content-Range"))
		assert.Equal(t, "10", w.Header().Get("Content-Length"))
		assert.Equal(t, videoContent[0:10], w.Body.Bytes())
		assert.Equal(t, 1, metadataCalls)
		assert.Equal(t, 1, rangeCalls, "GetObjectRange should be called exactly once")
		assert.False(t, fullObjectStreamRequested, "full GetObject stream should not be opened on Range requests")
	})

	t.Run("GET video with unsatisfiable Range returns 416 without opening GetObject", func(t *testing.T) {
		totalSize := int64(len(videoContent))
		var fullObjectStreamRequested bool
		var rangeCalls int
		mockUC := &mockPostUseCaseForMediaHTTP{
			getMediaStreamFn: func(ctx context.Context, mID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
				if length < 0 {
					return nil, &domain.PostMediaAttachment{
						ID:       mediaID,
						FileType: domain.PostMediaTypeVideo,
						MimeType: "video/mp4",
						FileSize: totalSize,
					}, totalSize, nil
				}
				if start == 0 && length == 0 {
					fullObjectStreamRequested = true
				} else {
					rangeCalls++
				}
				return io.NopCloser(bytes.NewReader(videoContent)), &domain.PostMediaAttachment{
					ID:       mediaID,
					FileType: domain.PostMediaTypeVideo,
					MimeType: "video/mp4",
					FileSize: totalSize,
				}, totalSize, nil
			},
		}
		router := setupPostMediaTestRouter(mockUC, jwtMgr)
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/posts/media/"+mediaID, nil)
		req.Header.Set("Range", "bytes=100-200")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusRequestedRangeNotSatisfiable, w.Code)
		assert.Equal(t, "bytes */36", w.Header().Get("Content-Range"))
		assert.False(t, fullObjectStreamRequested, "full GetObject stream should not be opened on unsatisfiable Range requests")
		assert.Equal(t, 0, rangeCalls)
	})
}
