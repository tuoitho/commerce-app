package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

type mockAdminChatUseCase struct {
	listAdminConversationsFn func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error)
	listAdminMessagesFn      func(ctx context.Context, conversationID string, limit, offset int) ([]domain.ChatMessage, error)
	sendAdminReplyFn         func(ctx context.Context, adminID string, conversationID string, content string, attachmentIDs []string) (*domain.ChatMessage, error)
	markAdminConversationReadFn func(ctx context.Context, conversationID string) error
}

func (m *mockAdminChatUseCase) GetOrCreateCustomerConversation(ctx context.Context, customerID string) (*domain.Conversation, error) {
	return nil, nil
}
func (m *mockAdminChatUseCase) ListCustomerMessages(ctx context.Context, customerID string, limit, offset int) ([]domain.ChatMessage, error) {
	return nil, nil
}
func (m *mockAdminChatUseCase) SendCustomerMessage(ctx context.Context, customerID string, input domain.SendMessageInput) (*domain.ChatMessage, error) {
	return nil, nil
}
func (m *mockAdminChatUseCase) MarkCustomerConversationRead(ctx context.Context, customerID string) error {
	return nil
}
func (m *mockAdminChatUseCase) ListAdminConversations(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
	if m.listAdminConversationsFn != nil {
		return m.listAdminConversationsFn(ctx, filter)
	}
	return []domain.Conversation{}, 0, nil
}
func (m *mockAdminChatUseCase) ListAdminMessages(ctx context.Context, conversationID string, limit, offset int) ([]domain.ChatMessage, error) {
	if m.listAdminMessagesFn != nil {
		return m.listAdminMessagesFn(ctx, conversationID, limit, offset)
	}
	return []domain.ChatMessage{}, nil
}
func (m *mockAdminChatUseCase) SendAdminReply(ctx context.Context, adminID string, conversationID string, content string, attachmentIDs []string) (*domain.ChatMessage, error) {
	if m.sendAdminReplyFn != nil {
		return m.sendAdminReplyFn(ctx, adminID, conversationID, content, attachmentIDs)
	}
	return &domain.ChatMessage{
		ID:             "msg-reply-1",
		ConversationID: conversationID,
		SenderID:       adminID,
		SenderRole:     domain.ChatSenderAdmin,
		SenderName:     "Hỗ trợ viên",
		Content:        content,
		Attachments:    []domain.ChatAttachment{},
		CreatedAt:      time.Now(),
	}, nil
}
func (m *mockAdminChatUseCase) MarkAdminConversationRead(ctx context.Context, conversationID string) error {
	if m.markAdminConversationReadFn != nil {
		return m.markAdminConversationReadFn(ctx, conversationID)
	}
	return nil
}
func (m *mockAdminChatUseCase) UploadMedia(ctx context.Context, uploaderID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.ChatAttachment, error) {
	return nil, nil
}
func (m *mockAdminChatUseCase) GetMediaStream(ctx context.Context, requesterID string, requesterRole string, attachmentID string, start, length int64) (io.ReadCloser, *domain.ChatAttachment, error) {
	return nil, nil, nil
}
func (m *mockAdminChatUseCase) ListCustomerOrdersForPicker(ctx context.Context, customerID string, limit int) ([]domain.AttachedOrderCard, error) {
	return nil, nil
}
func (m *mockAdminChatUseCase) ListCustomerOrdersForChat(ctx context.Context, customerID string, limit int) ([]domain.AttachedOrderCard, error) {
	return nil, nil
}

func setupChatAdminTestRouter(uc domain.ChatUseCase) (*gin.Engine, *jwt.Manager) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	g := newGuard(manager)

	r := gin.New()
	admin := r.Group("/api/v1/admin")
	admin.Use(g.AuthRequired, g.RequireAdmin())

	h := newChatAdminHandler(uc)
	adminChat := admin.Group("/chat")
	{
		adminChat.GET("/conversations", h.listConversations)
		adminChat.GET("/conversations/:id/messages", h.listMessages)
		adminChat.POST("/conversations/:id/messages", h.sendMessage)
		adminChat.POST("/conversations/:id/read", h.markRead)
	}
	return r, manager
}

func TestChatAdminHandler_AuthAndPermissions(t *testing.T) {
	uc := &mockAdminChatUseCase{}
	router, manager := setupChatAdminTestRouter(uc)
	convID := uuid.NewString()

	endpoints := []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodGet, "/api/v1/admin/chat/conversations", ""},
		{http.MethodGet, "/api/v1/admin/chat/conversations/" + convID + "/messages", ""},
		{http.MethodPost, "/api/v1/admin/chat/conversations/" + convID + "/messages", `{"content":"hi"}`},
		{http.MethodPost, "/api/v1/admin/chat/conversations/" + convID + "/read", ""},
	}

	for _, ep := range endpoints {
		t.Run("NoToken_"+ep.method+"_"+ep.path, func(t *testing.T) {
			var bodyReader io.Reader
			if ep.body != "" {
				bodyReader = bytes.NewBufferString(ep.body)
			}
			req := httptest.NewRequest(ep.method, ep.path, bodyReader)
			if ep.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusUnauthorized, w.Code)
			var env ResponseEnvelope
			err := json.Unmarshal(w.Body.Bytes(), &env)
			require.NoError(t, err)
			assert.False(t, env.Success)
			assert.Equal(t, "unauthorized", env.Error.Code)
		})

		t.Run("CustomerTokenForbidden_"+ep.method+"_"+ep.path, func(t *testing.T) {
			token, err := manager.GenerateAccessToken("cust-1", domain.RoleCustomer, 15*time.Minute)
			require.NoError(t, err)

			var bodyReader io.Reader
			if ep.body != "" {
				bodyReader = bytes.NewBufferString(ep.body)
			}
			req := httptest.NewRequest(ep.method, ep.path, bodyReader)
			req.Header.Set("Authorization", "Bearer "+token)
			if ep.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusForbidden, w.Code)
			var env ResponseEnvelope
			err = json.Unmarshal(w.Body.Bytes(), &env)
			require.NoError(t, err)
			assert.False(t, env.Success)
			assert.Equal(t, "forbidden", env.Error.Code)
			assert.Equal(t, "Bạn không có quyền thực hiện thao tác này", env.Error.Message)
		})
	}
}

func TestChatAdminHandler_ListConversations(t *testing.T) {
	t.Run("success with default pagination and filter", func(t *testing.T) {
		uc := &mockAdminChatUseCase{
			listAdminConversationsFn: func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
				assert.Equal(t, "all", filter.Status)
				assert.Equal(t, 20, filter.Limit)
				assert.Equal(t, 0, filter.Offset)
				assert.Equal(t, "", filter.Search)
				return []domain.Conversation{
					{
						ID:                 "conv-1",
						UserID:             "user-1",
						CustomerEmail:      "user1@example.com",
						CustomerName:       "Nguyễn Văn A",
						LastMessageSnippet: "Xin chào",
						UnreadCount:        2,
						CreatedAt:          time.Now(),
					},
				}, 1, nil
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.True(t, env.Success)
		assert.NotNil(t, env.Meta.Pagination)
		assert.Equal(t, 1, env.Meta.Pagination.Page)
		assert.Equal(t, 20, env.Meta.Pagination.Limit)
		assert.Equal(t, 1, env.Meta.Pagination.Total)
		assert.Equal(t, 1, env.Meta.Pagination.TotalPages)
		assert.False(t, env.Meta.Pagination.HasNext)
		assert.False(t, env.Meta.Pagination.HasPrev)
	})

	t.Run("query params with status, search, page and limit", func(t *testing.T) {
		uc := &mockAdminChatUseCase{
			listAdminConversationsFn: func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
				assert.Equal(t, "unread", filter.Status)
				assert.Equal(t, "user@test.com", filter.Search)
				assert.Equal(t, 10, filter.Limit)
				assert.Equal(t, 10, filter.Offset) // page 2, limit 10 => offset 10
				return []domain.Conversation{}, 15, nil
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations?status=unread&search=user@test.com&page=2&limit=10", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.True(t, env.Success)
		assert.Equal(t, 2, env.Meta.Pagination.Page)
		assert.Equal(t, 10, env.Meta.Pagination.Limit)
		assert.Equal(t, 15, env.Meta.Pagination.Total)
		assert.Equal(t, 2, env.Meta.Pagination.TotalPages)
		assert.False(t, env.Meta.Pagination.HasNext)
		assert.True(t, env.Meta.Pagination.HasPrev)
	})

	t.Run("filter query param works as alias for status", func(t *testing.T) {
		uc := &mockAdminChatUseCase{
			listAdminConversationsFn: func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
				assert.Equal(t, "unread", filter.Status)
				return []domain.Conversation{}, 0, nil
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations?filter=unread", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("validation error on invalid status", func(t *testing.T) {
		router, manager := setupChatAdminTestRouter(&mockAdminChatUseCase{})
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations?status=invalid_status", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.False(t, env.Success)
		assert.Equal(t, "validation_error", env.Error.Code)
		assert.Contains(t, env.Error.Fields["status"], "Trạng thái lọc không hợp lệ")
	})

	t.Run("validation error on invalid page and limit", func(t *testing.T) {
		router, manager := setupChatAdminTestRouter(&mockAdminChatUseCase{})
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations?page=0&limit=200", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.False(t, env.Success)
		assert.Equal(t, "validation_error", env.Error.Code)
		assert.NotEmpty(t, env.Error.Fields["page"])
		assert.NotEmpty(t, env.Error.Fields["limit"])
	})

	t.Run("usecase error returns 500", func(t *testing.T) {
		uc := &mockAdminChatUseCase{
			listAdminConversationsFn: func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
				return nil, 0, errors.New("database connection failed")
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})
}

func TestChatAdminHandler_ListMessages(t *testing.T) {
	convUUID := uuid.NewString()

	t.Run("success returns messages", func(t *testing.T) {
		uc := &mockAdminChatUseCase{
			listAdminMessagesFn: func(ctx context.Context, conversationID string, limit, offset int) ([]domain.ChatMessage, error) {
				assert.Equal(t, convUUID, conversationID)
				assert.Equal(t, 20, limit)
				assert.Equal(t, 5, offset)
				return []domain.ChatMessage{
					{
						ID:             "msg-1",
						ConversationID: conversationID,
						SenderID:       "admin-1",
						SenderRole:     domain.ChatSenderAdmin,
						SenderName:     "Hỗ trợ viên",
						Content:        "Xin chào quý khách",
						CreatedAt:      time.Now(),
					},
				}, nil
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations/"+convUUID+"/messages?limit=20&offset=5", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.True(t, env.Success)
	})

	t.Run("conversation not found returns 404", func(t *testing.T) {
		uc := &mockAdminChatUseCase{
			listAdminMessagesFn: func(ctx context.Context, conversationID string, limit, offset int) ([]domain.ChatMessage, error) {
				return nil, domain.ErrConversationNotFound
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations/"+convUUID+"/messages", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.Equal(t, "conversation_not_found", env.Error.Code)
		assert.Equal(t, "Không tìm thấy cuộc hội thoại", env.Error.Message)
	})
}

func TestChatAdminHandler_SendMessage(t *testing.T) {
	convUUID := uuid.NewString()

	t.Run("success sends reply message", func(t *testing.T) {
		attID := uuid.NewString()
		uc := &mockAdminChatUseCase{
			sendAdminReplyFn: func(ctx context.Context, adminID string, conversationID string, content string, attachmentIDs []string) (*domain.ChatMessage, error) {
				assert.Equal(t, "admin-1", adminID)
				assert.Equal(t, convUUID, conversationID)
				assert.Equal(t, "Cảm ơn bạn đã liên hệ!", content)
				assert.Equal(t, []string{attID}, attachmentIDs)
				return &domain.ChatMessage{
					ID:             "msg-created",
					ConversationID: conversationID,
					SenderID:       adminID,
					SenderRole:     domain.ChatSenderAdmin,
					Content:        content,
					CreatedAt:      time.Now(),
				}, nil
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		bodyJSON := `{"content":"Cảm ơn bạn đã liên hệ!", "attachmentIds":["` + attID + `"]}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/chat/conversations/"+convUUID+"/messages", bytes.NewBufferString(bodyJSON))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.True(t, env.Success)
		assert.Equal(t, "Gửi tin nhắn phản hồi thành công", env.Message)
	})

	t.Run("invalid json body returns 400", func(t *testing.T) {
		router, manager := setupChatAdminTestRouter(&mockAdminChatUseCase{})
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/chat/conversations/"+convUUID+"/messages", bytes.NewBufferString("invalid json"))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("validation error from usecase returns 400", func(t *testing.T) {
		uc := &mockAdminChatUseCase{
			sendAdminReplyFn: func(ctx context.Context, adminID string, conversationID string, content string, attachmentIDs []string) (*domain.ChatMessage, error) {
				return nil, domain.NewValidationError(map[string]string{
					"content": "Nội dung tin nhắn không được để trống khi không có tệp đính kèm",
				})
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		bodyJSON := `{"content":""}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/chat/conversations/"+convUUID+"/messages", bytes.NewBufferString(bodyJSON))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.False(t, env.Success)
		assert.Equal(t, "validation_error", env.Error.Code)
		assert.Equal(t, "Nội dung tin nhắn không được để trống khi không có tệp đính kèm", env.Error.Fields["content"])
	})

	t.Run("conversation not found returns 404", func(t *testing.T) {
		uc := &mockAdminChatUseCase{
			sendAdminReplyFn: func(ctx context.Context, adminID string, conversationID string, content string, attachmentIDs []string) (*domain.ChatMessage, error) {
				return nil, domain.ErrConversationNotFound
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		bodyJSON := `{"content":"Hello"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/chat/conversations/"+convUUID+"/messages", bytes.NewBufferString(bodyJSON))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.Equal(t, "conversation_not_found", env.Error.Code)
	})
}

func TestChatAdminHandler_MarkRead(t *testing.T) {
	convUUID := uuid.NewString()

	t.Run("success marks conversation read", func(t *testing.T) {
		called := false
		uc := &mockAdminChatUseCase{
			markAdminConversationReadFn: func(ctx context.Context, conversationID string) error {
				called = true
				assert.Equal(t, convUUID, conversationID)
				return nil
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/chat/conversations/"+convUUID+"/read", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.True(t, called)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.True(t, env.Success)
		assert.Equal(t, "Đánh dấu đã đọc thành công", env.Message)
	})

	t.Run("conversation not found returns 404", func(t *testing.T) {
		uc := &mockAdminChatUseCase{
			markAdminConversationReadFn: func(ctx context.Context, conversationID string) error {
				return domain.ErrConversationNotFound
			},
		}
		router, manager := setupChatAdminTestRouter(uc)
		token, _ := manager.GenerateAccessToken("admin-1", domain.RoleAdmin, 15*time.Minute)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/chat/conversations/"+convUUID+"/read", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		var env ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &env)
		require.NoError(t, err)
		assert.Equal(t, "conversation_not_found", env.Error.Code)
	})
}
