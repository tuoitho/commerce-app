package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"commerce-backend/internal/domain"
)

func (m *mockChatRepoForHandler) ListAdminConversations(ctx context.Context, unreadOnly bool, page, pageSize int) ([]domain.Conversation, int, error) {
	var list []domain.Conversation
	for _, c := range m.conversations {
		list = append(list, *c)
	}
	return list, len(list), nil
}

func (m *mockChatRepoForHandler) MarkAdminRead(ctx context.Context, conversationID string) error {
	if conv, ok := m.conversations[conversationID]; ok {
		conv.AdminUnreadCount = 0
		conv.AdminLastReadAt = time.Now()
	}
	return nil
}

func TestAdminChat_Endpoints(t *testing.T) {
	mockRepo := newMockChatRepo()
	convID := "c1111111-1111-1111-1111-111111111111"
	orderID := "6a1005b8-537a-4ec6-8960-e42718e81001"
	mockRepo.conversations[convID] = &domain.Conversation{
		ID:               convID,
		UserID:           "u1111111-1111-1111-1111-111111111111",
		OrderID:          &orderID,
		AdminUnreadCount: 1,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	mockOrders := &mockOrderRepoForChat{}
	router, jwtMgr := setupCustomerChatRouter(mockRepo, mockOrders)

	adminID := "a9999999-9999-9999-9999-999999999999"
	adminToken, _ := jwtMgr.GenerateAccessToken(adminID, domain.RoleAdmin, 15*time.Minute)

	customerID := "u1111111-1111-1111-1111-111111111111"
	customerToken, _ := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	t.Run("Customer accessing admin chat returns 403 Forbidden", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", w.Code)
		}
	})

	t.Run("Admin lists conversations with pagination", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations?page=1&pageSize=20", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool                  `json:"success"`
			Data    []domain.Conversation `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if !resp.Success || len(resp.Data) != 1 {
			t.Errorf("expected 1 conversation, got %d", len(resp.Data))
		}
	})

	t.Run("Admin gets conversation detail", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations/"+convID, nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	})

	t.Run("Admin sends reply message", func(t *testing.T) {
		body := `{"content": "Dạ shop đã nhận được yêu cầu của bạn."}`
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/chat/conversations/"+convID+"/messages", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d. Body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool           `json:"success"`
			Data    domain.Message `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp.Data.SenderRole != "admin" {
			t.Errorf("expected senderRole=admin, got %s", resp.Data.SenderRole)
		}
	})

	t.Run("Admin marks conversation as read", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/admin/chat/conversations/"+convID+"/read", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	})

	t.Run("Admin lists messages with reverse pagination metadata", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/chat/conversations/"+convID+"/messages?limit=20", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
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
}
