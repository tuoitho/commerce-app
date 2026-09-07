package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	delivery "commerce-backend/internal/delivery/http"
	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	chatuc "commerce-backend/internal/usecase/chat"
)

type mockChatRepoForHandler struct {
	domain.ChatRepository
	conversations map[string]*domain.Conversation
	messages      map[string][]domain.Message
	validOrderIDs map[string]string // orderID -> userID
	totalUnread   int
}

func newMockChatRepo() *mockChatRepoForHandler {
	return &mockChatRepoForHandler{
		conversations: make(map[string]*domain.Conversation),
		messages:      make(map[string][]domain.Message),
		validOrderIDs: make(map[string]string),
	}
}

func (m *mockChatRepoForHandler) GetConversationByID(ctx context.Context, id string) (*domain.Conversation, error) {
	conv, ok := m.conversations[id]
	if !ok {
		return nil, domain.ErrConversationNotFound
	}
	return conv, nil
}

func (m *mockChatRepoForHandler) GetConversationByUserID(ctx context.Context, userID string) (*domain.Conversation, error) {
	for _, c := range m.conversations {
		if c.UserID == userID {
			return c, nil
		}
	}
	return nil, domain.ErrConversationNotFound
}

func (m *mockChatRepoForHandler) CreateConversationForUser(ctx context.Context, userID string) (*domain.Conversation, error) {
	id := "c1111111-1111-1111-1111-111111111111"
	conv := &domain.Conversation{
		ID:                   id,
		UserID:               userID,
		CustomerLastReadAt:   time.Now(),
		AdminLastReadAt:      time.Now(),
		CustomerLastActiveAt: time.Now(),
		LastMessageAt:        time.Now(),
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}
	m.conversations[id] = conv
	return conv, nil
}

func (m *mockChatRepoForHandler) ListMessages(ctx context.Context, conversationID string, limit int, before *time.Time) ([]domain.Message, bool, error) {
	msgs := m.messages[conversationID]
	if msgs == nil {
		msgs = []domain.Message{}
	}
	return msgs, false, nil
}

func (m *mockChatRepoForHandler) InsertMessage(ctx context.Context, conversationID, senderID, senderRole, messageType string, orderID *string, content string) (*domain.Message, error) {
	msg := domain.Message{
		ID:             "m1111111-1111-1111-1111-111111111111",
		ConversationID: conversationID,
		SenderID:       senderID,
		SenderRole:     senderRole,
		MessageType:    messageType,
		OrderID:        orderID,
		Content:        content,
		Media:          []domain.MessageMedia{},
		CreatedAt:      time.Now(),
	}
	if orderID != nil {
		msg.OrderSummary = &domain.OrderSummary{
			ID:            *orderID,
			Status:        "confirmed",
			TotalVND:      150000,
			RecipientName: "Nguyen Van A",
			CreatedAt:     time.Now(),
		}
	}
	m.messages[conversationID] = append(m.messages[conversationID], msg)
	return &msg, nil
}

func (m *mockChatRepoForHandler) CheckOrderOwnership(ctx context.Context, orderID, userID string) error {
	owner, ok := m.validOrderIDs[orderID]
	if !ok || owner != userID {
		return domain.ErrOrderNotEligibleForChat
	}
	return nil
}

func (m *mockChatRepoForHandler) GetOrderSummaryByID(ctx context.Context, orderID string) (*domain.OrderSummary, error) {
	return &domain.OrderSummary{
		ID:            orderID,
		Status:        "confirmed",
		TotalVND:      150000,
		RecipientName: "Nguyen Van A",
		CreatedAt:     time.Now(),
	}, nil
}

func (m *mockChatRepoForHandler) MarkCustomerRead(ctx context.Context, conversationID string) error {
	if conv, ok := m.conversations[conversationID]; ok {
		conv.CustomerUnreadCount = 0
		conv.CustomerLastReadAt = time.Now()
	}
	return nil
}

func (m *mockChatRepoForHandler) GetCustomerTotalUnread(ctx context.Context, userID string) (int, error) {
	return m.totalUnread, nil
}



type mockOrderRepoForChat struct {
	domain.OrderRepository
	validOrderIDs map[string]string
}

func (m *mockOrderRepoForChat) GetByID(ctx context.Context, userID, orderID string) (*domain.Order, error) {
	if m == nil {
		return nil, domain.ErrOrderNotFound
	}
	owner, ok := m.validOrderIDs[orderID]
	if !ok || owner != userID {
		return nil, domain.ErrOrderNotFound
	}
	return &domain.Order{
		ID:     orderID,
		UserID: userID,
		Status: domain.OrderStatusConfirmed,
	}, nil
}

func (m *mockOrderRepoForChat) GetByAdminID(ctx context.Context, orderID string) (*domain.Order, error) {
	return &domain.Order{
		ID:     orderID,
		Status: domain.OrderStatusConfirmed,
	}, nil
}

func setupCustomerChatRouter(mockRepo *mockChatRepoForHandler, mockOrders *mockOrderRepoForChat) (*gin.Engine, *jwt.Manager) {
	gin.SetMode(gin.TestMode)
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")

	uc := chatuc.NewUseCase(chatuc.Dependencies{
		ChatRepo: mockRepo,
		Orders:   mockOrders,
	})

	router := gin.New()
	delivery.NewRouter(router, delivery.Dependencies{
		Chat:       uc,
		JWT:        jwtMgr,
		RefreshTTL: 720 * time.Hour,
	})
	return router, jwtMgr
}

func TestCustomerChat_Endpoints(t *testing.T) {
	mockRepo := newMockChatRepo()
	customerID := "u1111111-1111-1111-1111-111111111111"
	mockRepo.validOrderIDs["6a1005b8-537a-4ec6-8960-e42718e81001"] = customerID

	router, jwtMgr := setupCustomerChatRouter(mockRepo, nil)
	token, _ := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	t.Run("Unauthorized access returns 401", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/conversation", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})

	t.Run("GetOrCreate single conversation for customer (GET /api/v1/chat/conversation)", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/conversation", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool `json:"success"`
			Data    struct {
				ID     string `json:"id"`
				UserID string `json:"userId"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if !resp.Success {
			t.Errorf("expected success=true")
		}
		if resp.Data.UserID != customerID {
			t.Errorf("expected userID %s, got %s", customerID, resp.Data.UserID)
		}
	})

	t.Run("Send order attachment message with valid ownership", func(t *testing.T) {
		convID := "c1111111-1111-1111-1111-111111111111"
		body := `{"content": "Shop kiểm tra đơn này giúp mình", "orderId": "6a1005b8-537a-4ec6-8960-e42718e81001"}`
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/conversations/"+convID+"/messages", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d. Body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool `json:"success"`
			Data    struct {
				MessageType  string `json:"messageType"`
				OrderID      string `json:"orderId"`
				OrderSummary struct {
					ID string `json:"id"`
				} `json:"orderSummary"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp.Data.MessageType != "order" {
			t.Errorf("expected messageType=order, got %s", resp.Data.MessageType)
		}
		if resp.Data.OrderID != "6a1005b8-537a-4ec6-8960-e42718e81001" {
			t.Errorf("expected orderId to match")
		}
	})

	t.Run("Send order message with unowned order returns 403", func(t *testing.T) {
		convID := "c1111111-1111-1111-1111-111111111111"
		body := `{"content": "Hỏi đơn người khác", "orderId": "00000000-0000-0000-0000-000000000000"}`
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/conversations/"+convID+"/messages", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", w.Code)
		}
	})

	t.Run("Send empty message without order returns 400 validation error", func(t *testing.T) {
		convID := "c1111111-1111-1111-1111-111111111111"
		body := `{"content": "   "}`
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/conversations/"+convID+"/messages", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", w.Code)
		}
	})

	t.Run("List messages of conversation with reverse pagination metadata", func(t *testing.T) {
		convID := "c1111111-1111-1111-1111-111111111111"
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/conversations/"+convID+"/messages?limit=20", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}

		var resp struct {
			Success bool `json:"success"`
			Meta    struct {
				HasMore bool `json:"hasMore"`
				Count   int  `json:"count"`
			} `json:"meta"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if !resp.Success {
			t.Errorf("expected success=true")
		}
	})

	t.Run("Mark conversation as read", func(t *testing.T) {
		convID := "c1111111-1111-1111-1111-111111111111"
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/chat/conversations/"+convID+"/read", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	})

	t.Run("Get total unread count", func(t *testing.T) {
		mockRepo.totalUnread = 3
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/chat/unread-count", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp struct {
			Data struct {
				TotalUnread int `json:"totalUnread"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp.Data.TotalUnread != 3 {
			t.Errorf("expected totalUnread=3, got %d", resp.Data.TotalUnread)
		}
	})
}
