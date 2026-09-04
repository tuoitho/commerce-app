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
	"commerce-backend/internal/storage/chatmedia"
	chatuc "commerce-backend/internal/usecase/chat"
)

type mockChatRepoForHTTP struct {
	createPendingAttachmentFn func(ctx context.Context, uploaderID, objectKey string, fileType domain.ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*domain.ChatAttachment, error)
	getAttachmentByIDFn       func(ctx context.Context, id string) (*domain.ChatAttachment, error)
	getMessageByIDFn          func(ctx context.Context, messageID string) (*domain.ChatMessage, error)
	getConversationByIDFn     func(ctx context.Context, conversationID string) (*domain.Conversation, error)
}

func (m *mockChatRepoForHTTP) GetOrCreateConversation(ctx context.Context, userID string) (*domain.Conversation, error) {
	return nil, nil
}
func (m *mockChatRepoForHTTP) GetConversationByID(ctx context.Context, conversationID string) (*domain.Conversation, error) {
	if m.getConversationByIDFn != nil {
		return m.getConversationByIDFn(ctx, conversationID)
	}
	return nil, domain.ErrNotFound
}
func (m *mockChatRepoForHTTP) ListConversationsForAdmin(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
	return nil, 0, nil
}
func (m *mockChatRepoForHTTP) ListMessages(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
	return nil, nil
}
func (m *mockChatRepoForHTTP) CreatePendingAttachment(ctx context.Context, uploaderID string, objectKey string, fileType domain.ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*domain.ChatAttachment, error) {
	if m.createPendingAttachmentFn != nil {
		return m.createPendingAttachmentFn(ctx, uploaderID, objectKey, fileType, fileName, fileSize, mimeType)
	}
	return &domain.ChatAttachment{
		ID:         uuid.NewString(),
		UploaderID: uploaderID,
		FileType:   fileType,
		FileURL:    "/api/v1/chat/media/test",
		FileName:   fileName,
		FileSize:   fileSize,
		MimeType:   mimeType,
		ObjectKey:  objectKey,
		CreatedAt:  time.Now(),
	}, nil
}
func (m *mockChatRepoForHTTP) GetAttachmentByID(ctx context.Context, attachmentID string) (*domain.ChatAttachment, error) {
	if m.getAttachmentByIDFn != nil {
		return m.getAttachmentByIDFn(ctx, attachmentID)
	}
	return nil, domain.ErrChatAttachmentNotFound
}
func (m *mockChatRepoForHTTP) GetMessageByID(ctx context.Context, messageID string) (*domain.ChatMessage, error) {
	if m.getMessageByIDFn != nil {
		return m.getMessageByIDFn(ctx, messageID)
	}
	return nil, domain.ErrNotFound
}
func (m *mockChatRepoForHTTP) CreateMessage(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
	return nil, nil
}
func (m *mockChatRepoForHTTP) MarkConversationRead(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error {
	return nil
}
func (m *mockChatRepoForHTTP) GetAttachedOrderCard(ctx context.Context, orderID string) (*domain.AttachedOrderCard, error) {
	return nil, nil
}
func (m *mockChatRepoForHTTP) GetConversationByUserID(ctx context.Context, userID string) (*domain.Conversation, error) {
	return nil, nil
}
func (m *mockChatRepoForHTTP) GetAttachmentsByIDs(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
	return nil, nil
}
func (m *mockChatRepoForHTTP) ListRecentOrdersForChat(ctx context.Context, userID string, limit int) ([]domain.AttachedOrderCard, error) {
	return nil, nil
}
func (m *mockChatRepoForHTTP) UpdateUserLastActive(ctx context.Context, userID string, t time.Time) error {
	return nil
}

func setupChatMediaTestRouter(uc domain.ChatUseCase, jwtMgr *jwt.Manager) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	guard := newGuard(jwtMgr)
	handler := newChatMediaHandler(uc)

	api := router.Group("/api/v1")
	api.POST("/chat/media", guard.AuthRequired, handler.uploadMedia)
	api.GET("/chat/media/:id", guard.MediaAuthRequired, handler.getMedia)
	api.HEAD("/chat/media/:id", guard.MediaAuthRequired, handler.getMedia)

	return router
}

func createMultipartRequest(url string, fieldName, fileName string, content []byte, contentType string) (*http.Request, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	partHeader := make(map[string][]string)
	partHeader["Content-Disposition"] = []string{fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, fileName)}
	if contentType != "" {
		partHeader["Content-Type"] = []string{contentType}
	}

	part, err := writer.CreatePart(partHeader)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(content); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, url, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req, nil
}

func TestChatMediaHandler_Upload(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	customerID := uuid.NewString()
	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	t.Run("401 Unauthorized without token", func(t *testing.T) {
		repo := &mockChatRepoForHTTP{}
		store := chatmedia.NewFakeStore()
		uc := chatuc.New(repo, store)
		r := setupChatMediaTestRouter(uc, jwtMgr)

		req, err := createMultipartRequest("/api/v1/chat/media", "file", "test.jpg", []byte("data"), "image/jpeg")
		require.NoError(t, err)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("400 Bad Request if missing file field", func(t *testing.T) {
		repo := &mockChatRepoForHTTP{}
		store := chatmedia.NewFakeStore()
		uc := chatuc.New(repo, store)
		r := setupChatMediaTestRouter(uc, jwtMgr)

		req, err := createMultipartRequest("/api/v1/chat/media", "other_field", "test.jpg", []byte("data"), "image/jpeg")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "file")
	})

	t.Run("400 Bad Request if file is empty", func(t *testing.T) {
		repo := &mockChatRepoForHTTP{}
		store := chatmedia.NewFakeStore()
		uc := chatuc.New(repo, store)
		r := setupChatMediaTestRouter(uc, jwtMgr)

		req, err := createMultipartRequest("/api/v1/chat/media", "file", "test.jpg", []byte(""), "image/jpeg")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		assert.False(t, resp.Success)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "file")
	})

	t.Run("400 Bad Request for unsupported MIME type (PDF, BMP, text)", func(t *testing.T) {
		invalidMimes := []struct {
			mime string
			name string
		}{
			{"application/pdf", "doc.pdf"},
			{"image/bmp", "photo.bmp"},
			{"text/plain", "readme.txt"},
			{"video/avi", "clip.avi"},
		}

		for _, tc := range invalidMimes {
			repo := &mockChatRepoForHTTP{}
			store := chatmedia.NewFakeStore()
			uc := chatuc.New(repo, store)
			r := setupChatMediaTestRouter(uc, jwtMgr)

			req, err := createMultipartRequest("/api/v1/chat/media", "file", tc.name, []byte("some-content"), tc.mime)
			require.NoError(t, err)
			req.Header.Set("Authorization", "Bearer "+customerToken)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, http.StatusBadRequest, w.Code, "mime: %s", tc.mime)
			var resp ResponseEnvelope
			_ = json.Unmarshal(w.Body.Bytes(), &resp)
			assert.Equal(t, "validation_error", resp.Error.Code)
			assert.Contains(t, resp.Error.Fields, "file_type")
		}
	})

	t.Run("400 Bad Request if image exceeds 10MB", func(t *testing.T) {
		repo := &mockChatRepoForHTTP{}
		store := chatmedia.NewFakeStore()
		uc := chatuc.New(repo, store)
		r := setupChatMediaTestRouter(uc, jwtMgr)

		// Create 10MB + 1 byte
		oversizeContent := make([]byte, 10*1024*1024+1)
		req, err := createMultipartRequest("/api/v1/chat/media", "file", "big.png", oversizeContent, "image/png")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "file")
	})

	t.Run("201 Created on valid image upload", func(t *testing.T) {
		imageContent := []byte("valid-jpeg-image-bytes")
		attachmentID := uuid.NewString()

		repo := &mockChatRepoForHTTP{
			createPendingAttachmentFn: func(ctx context.Context, uploaderID, objectKey string, fileType domain.ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*domain.ChatAttachment, error) {
				return &domain.ChatAttachment{
					ID:         attachmentID,
					UploaderID: uploaderID,
					FileType:   fileType,
					FileURL:    "/api/v1/chat/media/" + attachmentID,
					FileName:   fileName,
					FileSize:   fileSize,
					MimeType:   mimeType,
					ObjectKey:  objectKey,
					CreatedAt:  time.Now(),
				}, nil
			},
		}
		store := chatmedia.NewFakeStore()
		uc := chatuc.New(repo, store)
		r := setupChatMediaTestRouter(uc, jwtMgr)

		req, err := createMultipartRequest("/api/v1/chat/media", "file", "photo.jpg", imageContent, "image/jpeg")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var resp struct {
			Success bool                    `json:"success"`
			Message string                  `json:"message"`
			Data    chatMediaUploadResponse `json:"data"`
			Error   *errorBodyDetail        `json:"error"`
		}
		err = json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, attachmentID, resp.Data.ID)
		assert.Equal(t, "/api/v1/chat/media/"+attachmentID, resp.Data.FileURL)
		assert.Equal(t, "image", resp.Data.FileType)
		assert.Equal(t, "photo.jpg", resp.Data.FileName)
		assert.Equal(t, int64(len(imageContent)), resp.Data.FileSize)
		assert.Equal(t, "image/jpeg", resp.Data.MimeType)
	})

	t.Run("201 Created on valid video upload", func(t *testing.T) {
		videoContent := []byte("valid-mp4-video-bytes")
		attachmentID := uuid.NewString()

		repo := &mockChatRepoForHTTP{
			createPendingAttachmentFn: func(ctx context.Context, uploaderID, objectKey string, fileType domain.ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*domain.ChatAttachment, error) {
				return &domain.ChatAttachment{
					ID:         attachmentID,
					UploaderID: uploaderID,
					FileType:   fileType,
					FileURL:    "/api/v1/chat/media/" + attachmentID,
					FileName:   fileName,
					FileSize:   fileSize,
					MimeType:   mimeType,
					ObjectKey:  objectKey,
					CreatedAt:  time.Now(),
				}, nil
			},
		}
		store := chatmedia.NewFakeStore()
		uc := chatuc.New(repo, store)
		r := setupChatMediaTestRouter(uc, jwtMgr)

		req, err := createMultipartRequest("/api/v1/chat/media", "file", "clip.mp4", videoContent, "video/mp4")
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var resp struct {
			Success bool                    `json:"success"`
			Message string                  `json:"message"`
			Data    chatMediaUploadResponse `json:"data"`
			Error   *errorBodyDetail        `json:"error"`
		}
		err = json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, attachmentID, resp.Data.ID)
		assert.Equal(t, "video", resp.Data.FileType)
		assert.Equal(t, "video/mp4", resp.Data.MimeType)
	})
}

func TestChatMediaHandler_GetMedia(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	uploaderID := uuid.NewString()
	otherUserID := uuid.NewString()
	adminID := uuid.NewString()

	uploaderToken, err := jwtMgr.GenerateAccessToken(uploaderID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)
	otherUserToken, err := jwtMgr.GenerateAccessToken(otherUserID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)
	adminToken, err := jwtMgr.GenerateAccessToken(adminID, domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)

	imageID := uuid.NewString()
	imageKey := "chat/" + imageID + "/photo.jpg"
	imageContent := []byte("raw-image-bytes-abcdef")

	videoID := uuid.NewString()
	videoKey := "chat/" + videoID + "/sample.mp4"
	videoContent := []byte("0123456789abcdefghijklmnopqrstuvwxyz") // 36 bytes

	setup := func() (*gin.Engine, *chatmedia.FakeStore, *mockChatRepoForHTTP) {
		store := chatmedia.NewFakeStore()
		_ = store.PutObject(context.Background(), imageKey, bytes.NewReader(imageContent), int64(len(imageContent)), "image/jpeg")
		_ = store.PutObject(context.Background(), videoKey, bytes.NewReader(videoContent), int64(len(videoContent)), "video/mp4")

		repo := &mockChatRepoForHTTP{
			getAttachmentByIDFn: func(ctx context.Context, id string) (*domain.ChatAttachment, error) {
				if id == imageID {
					return &domain.ChatAttachment{
						ID:         imageID,
						UploaderID: uploaderID,
						FileType:   domain.ChatAttachmentImage,
						ObjectKey:  imageKey,
						FileSize:   int64(len(imageContent)),
						MimeType:   "image/jpeg",
					}, nil
				}
				if id == videoID {
					return &domain.ChatAttachment{
						ID:         videoID,
						UploaderID: uploaderID,
						FileType:   domain.ChatAttachmentVideo,
						ObjectKey:  videoKey,
						FileSize:   int64(len(videoContent)),
						MimeType:   "video/mp4",
					}, nil
				}
				return nil, domain.ErrChatAttachmentNotFound
			},
		}

		uc := chatuc.New(repo, store)
		r := setupChatMediaTestRouter(uc, jwtMgr)
		return r, store, repo
	}

	t.Run("401 Unauthorized without token", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+imageID, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("Auth via query parameter ?token=<token> succeeds", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+imageID+"?token="+uploaderToken, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, imageContent, w.Body.Bytes())
	})

	t.Run("404 Not Found for non-existent attachment", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+uuid.NewString(), nil)
		req.Header.Set("Authorization", "Bearer "+uploaderToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("403 Forbidden for unauthorized user", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+imageID, nil)
		req.Header.Set("Authorization", "Bearer "+otherUserToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("Image GET: returns 200 with Cache-Control and Content-Type", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+imageID, nil)
		req.Header.Set("Authorization", "Bearer "+uploaderToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "image/jpeg", w.Header().Get("Content-Type"))
		assert.Equal(t, "public, max-age=86400", w.Header().Get("Cache-Control"))
		assert.Equal(t, fmt.Sprintf("%d", len(imageContent)), w.Header().Get("Content-Length"))
		assert.Equal(t, "nosniff", w.Header().Get("X-Content-Type-Options"))
		assert.Equal(t, "inline", w.Header().Get("Content-Disposition"))
		assert.Equal(t, imageContent, w.Body.Bytes())
	})

	t.Run("Image HEAD: returns 200 with headers and empty body", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodHead, "/api/v1/chat/media/"+imageID, nil)
		req.Header.Set("Authorization", "Bearer "+uploaderToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "image/jpeg", w.Header().Get("Content-Type"))
		assert.Equal(t, "public, max-age=86400", w.Header().Get("Cache-Control"))
		assert.Empty(t, w.Body.Bytes())
	})

	t.Run("Video GET without Range: returns 200 with Accept-Ranges and full content", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+videoID, nil)
		req.Header.Set("Authorization", "Bearer "+uploaderToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "video/mp4", w.Header().Get("Content-Type"))
		assert.Equal(t, "bytes", w.Header().Get("Accept-Ranges"))
		assert.Equal(t, fmt.Sprintf("%d", len(videoContent)), w.Header().Get("Content-Length"))
		assert.Equal(t, videoContent, w.Body.Bytes())
	})

	t.Run("Video HEAD: returns 200 with Accept-Ranges and empty body", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodHead, "/api/v1/chat/media/"+videoID, nil)
		req.Header.Set("Authorization", "Bearer "+uploaderToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "video/mp4", w.Header().Get("Content-Type"))
		assert.Equal(t, "bytes", w.Header().Get("Accept-Ranges"))
		assert.Empty(t, w.Body.Bytes())
	})

	t.Run("Video Range GET 206 Partial Content (start-end)", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+videoID, nil)
		req.Header.Set("Authorization", "Bearer "+uploaderToken)
		req.Header.Set("Range", "bytes=0-9")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusPartialContent, w.Code)
		assert.Equal(t, "bytes 0-9/36", w.Header().Get("Content-Range"))
		assert.Equal(t, "10", w.Header().Get("Content-Length"))
		assert.Equal(t, "bytes", w.Header().Get("Accept-Ranges"))
		assert.Equal(t, "video/mp4", w.Header().Get("Content-Type"))
		assert.Equal(t, "0123456789", w.Body.String())
	})

	t.Run("Video Range GET 206 Partial Content (open-ended start-)", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+videoID, nil)
		req.Header.Set("Authorization", "Bearer "+uploaderToken)
		req.Header.Set("Range", "bytes=26-")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusPartialContent, w.Code)
		assert.Equal(t, "bytes 26-35/36", w.Header().Get("Content-Range"))
		assert.Equal(t, "10", w.Header().Get("Content-Length"))
		assert.Equal(t, "qrstuvwxyz", w.Body.String())
	})

	t.Run("Video Range GET 416 Requested Range Not Satisfiable", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+videoID, nil)
		req.Header.Set("Authorization", "Bearer "+uploaderToken)
		req.Header.Set("Range", "bytes=999-1000")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusRequestedRangeNotSatisfiable, w.Code)
		assert.Equal(t, "bytes */36", w.Header().Get("Content-Range"))
	})

	t.Run("Admin can access media stream", func(t *testing.T) {
		r, _, _ := setup()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/media/"+videoID, nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, videoContent, w.Body.Bytes())
	})
}
