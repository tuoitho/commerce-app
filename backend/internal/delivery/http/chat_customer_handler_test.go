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

type mockCustomerChatUseCase struct {
	getOrCreateCustomerConversationFn func(ctx context.Context, customerID string) (*domain.Conversation, error)
	listCustomerMessagesFn            func(ctx context.Context, customerID string, limit, offset int) ([]domain.ChatMessage, error)
	sendCustomerMessageFn             func(ctx context.Context, customerID string, input domain.SendMessageInput) (*domain.ChatMessage, error)
	markCustomerConversationReadFn    func(ctx context.Context, customerID string) error
	listCustomerOrdersForChatFn       func(ctx context.Context, customerID string, limit int) ([]domain.AttachedOrderCard, error)
}

func (m *mockCustomerChatUseCase) GetOrCreateCustomerConversation(ctx context.Context, customerID string) (*domain.Conversation, error) {
	if m.getOrCreateCustomerConversationFn != nil {
		return m.getOrCreateCustomerConversationFn(ctx, customerID)
	}
	return &domain.Conversation{
		ID:            "conv-1",
		UserID:        customerID,
		CustomerEmail: "cust@example.com",
		CustomerName:  "Khách hàng",
		UnreadCount:   0,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}, nil
}

func (m *mockCustomerChatUseCase) ListCustomerMessages(ctx context.Context, customerID string, limit, offset int) ([]domain.ChatMessage, error) {
	if m.listCustomerMessagesFn != nil {
		return m.listCustomerMessagesFn(ctx, customerID, limit, offset)
	}
	return []domain.ChatMessage{}, nil
}

func (m *mockCustomerChatUseCase) SendCustomerMessage(ctx context.Context, customerID string, input domain.SendMessageInput) (*domain.ChatMessage, error) {
	if m.sendCustomerMessageFn != nil {
		return m.sendCustomerMessageFn(ctx, customerID, input)
	}
	return &domain.ChatMessage{
		ID:              "msg-1",
		ConversationID:  "conv-1",
		SenderID:        customerID,
		SenderRole:      domain.ChatSenderCustomer,
		SenderName:      "Khách hàng",
		Content:         input.Content,
		AttachedOrderID: input.AttachedOrderID,
		Attachments:     []domain.ChatAttachment{},
		CreatedAt:       time.Now(),
		IsRead:          false,
	}, nil
}

func (m *mockCustomerChatUseCase) MarkCustomerConversationRead(ctx context.Context, customerID string) error {
	if m.markCustomerConversationReadFn != nil {
		return m.markCustomerConversationReadFn(ctx, customerID)
	}
	return nil
}

func (m *mockCustomerChatUseCase) ListCustomerOrdersForChat(ctx context.Context, customerID string, limit int) ([]domain.AttachedOrderCard, error) {
	if m.listCustomerOrdersForChatFn != nil {
		return m.listCustomerOrdersForChatFn(ctx, customerID, limit)
	}
	return []domain.AttachedOrderCard{}, nil
}

func (m *mockCustomerChatUseCase) ListAdminConversations(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
	return nil, 0, nil
}
func (m *mockCustomerChatUseCase) ListAdminMessages(ctx context.Context, conversationID string, limit, offset int) ([]domain.ChatMessage, error) {
	return nil, nil
}
func (m *mockCustomerChatUseCase) SendAdminReply(ctx context.Context, adminID string, conversationID string, content string, attachmentIDs []string) (*domain.ChatMessage, error) {
	return nil, nil
}
func (m *mockCustomerChatUseCase) MarkAdminConversationRead(ctx context.Context, conversationID string) error {
	return nil
}
func (m *mockCustomerChatUseCase) UploadMedia(ctx context.Context, uploaderID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.ChatAttachment, error) {
	return nil, nil
}
func (m *mockCustomerChatUseCase) GetMediaStream(ctx context.Context, requesterID string, requesterRole string, attachmentID string, start, length int64) (io.ReadCloser, *domain.ChatAttachment, error) {
	return nil, nil, nil
}
func (m *mockCustomerChatUseCase) ListCustomerOrdersForPicker(ctx context.Context, customerID string, limit int) ([]domain.AttachedOrderCard, error) {
	return m.ListCustomerOrdersForChat(ctx, customerID, limit)
}

func setupChatCustomerTestRouter(uc domain.ChatUseCase, jwtMgr *jwt.Manager) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	guard := newGuard(jwtMgr)
	handler := newChatCustomerHandler(uc)

	chatGroup := router.Group("/api/v1/chat")
	chatGroup.Use(guard.AuthRequired)
	{
		chatGroup.GET("/conversation", handler.getConversation)
		chatGroup.GET("/messages", handler.listMessages)
		chatGroup.POST("/messages", handler.sendMessage)
		chatGroup.POST("/read", handler.markRead)
		chatGroup.GET("/orders", handler.listOrders)
	}

	return router
}

func TestChatCustomerHandler_GetConversation(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	customerID := uuid.NewString()
	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	t.Run("401 Unauthorized without token", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/conversation", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("200 OK returns conversation envelope", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{
			getOrCreateCustomerConversationFn: func(ctx context.Context, cID string) (*domain.Conversation, error) {
				assert.Equal(t, customerID, cID)
				return &domain.Conversation{
					ID:            "conv-123",
					UserID:        customerID,
					CustomerEmail: "cust@example.com",
					CustomerName:  "Nguyễn Văn A",
					UnreadCount:   2,
					CreatedAt:     time.Now().UTC(),
					UpdatedAt:     time.Now().UTC(),
				}, nil
			},
		}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/conversation", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp struct {
			Success bool                `json:"success"`
			Message string              `json:"message"`
			Data    domain.Conversation `json:"data"`
			Error   *errorBodyDetail    `json:"error"`
			Meta    ResponseMeta        `json:"meta"`
		}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Lấy thông tin cuộc hội thoại thành công", resp.Message)
		assert.Equal(t, "conv-123", resp.Data.ID)
		assert.Equal(t, "Nguyễn Văn A", resp.Data.CustomerName)
		assert.Equal(t, 2, resp.Data.UnreadCount)
		assert.False(t, resp.Meta.Timestamp.IsZero())
	})

	t.Run("500 Internal Error when usecase fails", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{
			getOrCreateCustomerConversationFn: func(ctx context.Context, cID string) (*domain.Conversation, error) {
				return nil, errors.New("db failure")
			},
		}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/conversation", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
		var resp ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		assert.False(t, resp.Success)
		assert.Equal(t, "internal", resp.Error.Code)
	})
}

func TestChatCustomerHandler_ListMessages(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	customerID := uuid.NewString()
	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	t.Run("401 Unauthorized without token", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/messages", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("200 OK passes pagination and returns messages", func(t *testing.T) {
		var capturedLimit, capturedOffset int
		uc := &mockCustomerChatUseCase{
			listCustomerMessagesFn: func(ctx context.Context, cID string, limit, offset int) ([]domain.ChatMessage, error) {
				assert.Equal(t, customerID, cID)
				capturedLimit = limit
				capturedOffset = offset
				return []domain.ChatMessage{
					{
						ID:             "msg-1",
						ConversationID: "conv-1",
						SenderID:       cID,
						SenderRole:     domain.ChatSenderCustomer,
						SenderName:     "Khách hàng",
						Content:        "Xin chào shop",
						CreatedAt:      time.Now().UTC(),
						IsRead:         true,
					},
				}, nil
			},
		}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/messages?limit=25&offset=10", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, 25, capturedLimit)
		assert.Equal(t, 10, capturedOffset)

		var resp struct {
			Success bool                 `json:"success"`
			Message string               `json:"message"`
			Data    []domain.ChatMessage `json:"data"`
		}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Lấy danh sách tin nhắn thành công", resp.Message)
		assert.Len(t, resp.Data, 1)
		assert.Equal(t, "msg-1", resp.Data[0].ID)
	})
}

func TestChatCustomerHandler_SendMessage(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	customerID := uuid.NewString()
	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	t.Run("401 Unauthorized without token", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/messages", bytes.NewReader([]byte(`{"content":"Hello"}`)))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("400 Bad Request on invalid JSON", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/messages", bytes.NewReader([]byte(`{not valid json`)))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		assert.Equal(t, "validation_error", resp.Error.Code)
	})

	t.Run("400 Bad Request when usecase returns validation error", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{
			sendCustomerMessageFn: func(ctx context.Context, cID string, input domain.SendMessageInput) (*domain.ChatMessage, error) {
				return nil, domain.NewValidationError(map[string]string{
					"content": "Nội dung tin nhắn không được để trống khi không có tệp hoặc đơn hàng đính kèm",
				})
			},
		}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/messages", bytes.NewReader([]byte(`{"content":""}`)))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "content")
	})

	t.Run("400 Bad Request when usecase returns validation error for attachedOrderId", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{
			sendCustomerMessageFn: func(ctx context.Context, cID string, input domain.SendMessageInput) (*domain.ChatMessage, error) {
				return nil, domain.NewValidationError(map[string]string{
					"attachedOrderId": "Đơn hàng không hợp lệ hoặc không thuộc tài khoản của bạn",
				})
			},
		}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/messages", bytes.NewReader([]byte(`{"content":"Hỏi đơn","attachedOrderId":"invalid"}`)))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "attachedOrderId")
	})

	t.Run("400 Bad Request when usecase returns validation error for attachmentIds", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{
			sendCustomerMessageFn: func(ctx context.Context, cID string, input domain.SendMessageInput) (*domain.ChatMessage, error) {
				return nil, domain.NewValidationError(map[string]string{
					"attachmentIds": "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất",
				})
			},
		}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/messages", bytes.NewReader([]byte(`{"content":"Hỏi tệp","attachmentIds":["invalid"]}`)))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		var resp ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Contains(t, resp.Error.Fields, "attachmentIds")
	})

	t.Run("201 Created on valid message send", func(t *testing.T) {
		orderID := uuid.NewString()
		attID := uuid.NewString()

		uc := &mockCustomerChatUseCase{
			sendCustomerMessageFn: func(ctx context.Context, cID string, input domain.SendMessageInput) (*domain.ChatMessage, error) {
				assert.Equal(t, customerID, cID)
				assert.Equal(t, "Em hỏi về đơn này", input.Content)
				assert.Equal(t, &orderID, input.AttachedOrderID)
				assert.Equal(t, []string{attID}, input.AttachmentIDs)

				return &domain.ChatMessage{
					ID:              "msg-created-1",
					ConversationID:  "conv-1",
					SenderID:        cID,
					SenderRole:      domain.ChatSenderCustomer,
					SenderName:      "Khách hàng",
					Content:         input.Content,
					AttachedOrderID: input.AttachedOrderID,
					CreatedAt:       time.Now().UTC(),
				}, nil
			},
		}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		bodyJSON, _ := json.Marshal(map[string]any{
			"content":         "Em hỏi về đơn này",
			"attachedOrderId": orderID,
			"attachmentIds":   []string{attID},
		})
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/messages", bytes.NewReader(bodyJSON))
		req.Header.Set("Authorization", "Bearer "+customerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var resp struct {
			Success bool               `json:"success"`
			Message string             `json:"message"`
			Data    domain.ChatMessage `json:"data"`
		}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Gửi tin nhắn thành công", resp.Message)
		assert.Equal(t, "msg-created-1", resp.Data.ID)
		assert.Equal(t, &orderID, resp.Data.AttachedOrderID)
	})
}

func TestChatCustomerHandler_MarkRead(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	customerID := uuid.NewString()
	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	t.Run("401 Unauthorized without token", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/read", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("200 OK marks read", func(t *testing.T) {
		marked := false
		uc := &mockCustomerChatUseCase{
			markCustomerConversationReadFn: func(ctx context.Context, cID string) error {
				assert.Equal(t, customerID, cID)
				marked = true
				return nil
			},
		}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/read", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.True(t, marked)

		var resp ResponseEnvelope
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Đánh dấu đã đọc thành công", resp.Message)
	})
}

func TestChatCustomerHandler_ListOrders(t *testing.T) {
	jwtMgr := jwt.NewManager("test-secret-key-32bytes-long-min!!", "test-issuer")
	customerID := uuid.NewString()
	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	t.Run("401 Unauthorized without token", func(t *testing.T) {
		uc := &mockCustomerChatUseCase{}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/orders", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("200 OK returns orders for picker", func(t *testing.T) {
		var capturedLimit int
		uc := &mockCustomerChatUseCase{
			listCustomerOrdersForChatFn: func(ctx context.Context, cID string, limit int) ([]domain.AttachedOrderCard, error) {
				assert.Equal(t, customerID, cID)
				capturedLimit = limit
				return []domain.AttachedOrderCard{
					{
						ID:              "order-1",
						Status:          domain.OrderStatusDelivered,
						TotalVND:        "250000",
						TotalItemsCount: 2,
						CreatedAt:       time.Now().UTC(),
					},
				}, nil
			},
		}
		r := setupChatCustomerTestRouter(uc, jwtMgr)

		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/orders?limit=5", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, 5, capturedLimit)

		var resp struct {
			Success bool                       `json:"success"`
			Message string                     `json:"message"`
			Data    []domain.AttachedOrderCard `json:"data"`
		}
		err := json.Unmarshal(w.Body.Bytes(), &resp)
		require.NoError(t, err)
		assert.True(t, resp.Success)
		assert.Equal(t, "Lấy danh sách đơn hàng thành công", resp.Message)
		assert.Len(t, resp.Data, 1)
		assert.Equal(t, "order-1", resp.Data[0].ID)
		assert.Equal(t, domain.MoneyVND("250000"), resp.Data[0].TotalVND)
	})
}
