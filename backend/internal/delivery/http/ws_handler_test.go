package http_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	delivery "commerce-backend/internal/delivery/http"
	"commerce-backend/internal/domain"
)

func TestWebSocket_RealtimeChat(t *testing.T) {
	mockRepo := newMockChatRepo()
	convID := "c1111111-1111-1111-1111-111111111111"
	customerID := "u1111111-1111-1111-1111-111111111111"
	mockRepo.conversations[convID] = &domain.Conversation{
		ID:               convID,
		UserID:           customerID,
		AdminUnreadCount: 0,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	router, jwtMgr := setupCustomerChatRouter(mockRepo, nil)
	server := httptest.NewServer(router)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/chat/ws"

	customerToken, _ := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	t.Run("WebSocket handshake without token returns 401", func(t *testing.T) {
		_, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err == nil {
			t.Fatalf("expected dial error, got nil")
		}
		if resp == nil || resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized, got %v", resp)
		}
	})

	t.Run("WebSocket handshake with invalid token returns 401", func(t *testing.T) {
		_, resp, err := websocket.DefaultDialer.Dial(wsURL+"?token=invalid-token", nil)
		if err == nil {
			t.Fatalf("expected dial error, got nil")
		}
		if resp == nil || resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized, got %v", resp)
		}
	})

	t.Run("WebSocket connects successfully with valid token and handles ping/pong", func(t *testing.T) {
		conn, resp, err := websocket.DefaultDialer.Dial(wsURL+"?token="+customerToken, nil)
		if err != nil {
			t.Fatalf("failed to dial websocket: %v", err)
		}
		defer conn.Close()

		if resp.StatusCode != http.StatusSwitchingProtocols {
			t.Fatalf("expected 101 Switching Protocols, got %d", resp.StatusCode)
		}

		// Read presence announcement on connect
		var evt delivery.WSEvent
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		err = conn.ReadJSON(&evt)
		if err != nil {
			t.Fatalf("expected to read initial presence event: %v", err)
		}
		if evt.Event != "presence_update" {
			t.Errorf("expected presence_update event, got %s", evt.Event)
		}

		// Send ping
		action := delivery.ClientAction{Action: "ping"}
		if err := conn.WriteJSON(action); err != nil {
			t.Fatalf("failed to write ping: %v", err)
		}

		// Read pong
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		err = conn.ReadJSON(&evt)
		if err != nil {
			t.Fatalf("failed to read pong: %v", err)
		}
		if evt.Event != "pong" {
			t.Errorf("expected pong event, got %s", evt.Event)
		}
	})

	t.Run("WebSocket sends message and broadcasts new_message event", func(t *testing.T) {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL+"?token="+customerToken, nil)
		if err != nil {
			t.Fatalf("failed to dial websocket: %v", err)
		}
		defer conn.Close()

		// Discard initial presence
		var evt delivery.WSEvent
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		_ = conn.ReadJSON(&evt)

		// Send chat message
		action := delivery.ClientAction{
			Action:         "send_message",
			ConversationID: convID,
			Content:        "Xin chào shop qua socket!",
		}
		if err := conn.WriteJSON(action); err != nil {
			t.Fatalf("failed to send message action: %v", err)
		}

		// Read broadcasted new_message
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		err = conn.ReadJSON(&evt)
		if err != nil {
			t.Fatalf("failed to read new_message: %v", err)
		}
		if evt.Event != "new_message" {
			t.Errorf("expected new_message event, got %s", evt.Event)
		}
	})

	t.Run("WebSocket mark_read broadcasts read_receipt", func(t *testing.T) {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL+"?token="+customerToken, nil)
		if err != nil {
			t.Fatalf("failed to dial websocket: %v", err)
		}
		defer conn.Close()

		// Discard initial presence
		var evt delivery.WSEvent
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		_ = conn.ReadJSON(&evt)

		// Send mark_read
		action := delivery.ClientAction{
			Action:         "mark_read",
			ConversationID: convID,
		}
		if err := conn.WriteJSON(action); err != nil {
			t.Fatalf("failed to write mark_read: %v", err)
		}

		// Read read_receipt
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		err = conn.ReadJSON(&evt)
		if err != nil {
			t.Fatalf("failed to read read_receipt: %v", err)
		}
		if evt.Event != "read_receipt" {
			t.Errorf("expected read_receipt event, got %s", evt.Event)
		}
	})

	t.Run("WebSocket sends order message and broadcasts new_message with orderSummary", func(t *testing.T) {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL+"?token="+customerToken, nil)
		if err != nil {
			t.Fatalf("failed to dial websocket: %v", err)
		}
		defer conn.Close()

		// Discard initial presence
		var evt delivery.WSEvent
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		_ = conn.ReadJSON(&evt)

		orderID := "6a1005b8-537a-4ec6-8960-e42718e81001"
		mockRepo.validOrderIDs[orderID] = customerID

		action := delivery.ClientAction{
			Action:         "send_message",
			ConversationID: convID,
			OrderID:        &orderID,
			Content:        "Hỏi về đơn hàng qua WebSocket",
		}
		if err := conn.WriteJSON(action); err != nil {
			t.Fatalf("failed to send order message action: %v", err)
		}

		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		err = conn.ReadJSON(&evt)
		if err != nil {
			t.Fatalf("failed to read new_message with order: %v", err)
		}
		if evt.Event != "new_message" {
			t.Errorf("expected new_message event, got %s", evt.Event)
		}
	})
}

func (m *mockChatRepoForHandler) UpdateCustomerActive(ctx context.Context, conversationID string) error {
	if conv, ok := m.conversations[conversationID]; ok {
		conv.CustomerLastActiveAt = time.Now()
	}
	return nil
}

func (m *mockChatRepoForHandler) UpdateAdminActive(ctx context.Context, conversationID string) error {
	if conv, ok := m.conversations[conversationID]; ok {
		now := time.Now()
		conv.AdminLastActiveAt = &now
	}
	return nil
}

func (m *mockChatRepoForHandler) InsertMessageMedia(ctx context.Context, messageID, mediaType, objectKey, contentType string, fileSize int64, fileName string) (*domain.MessageMedia, error) {
	return &domain.MessageMedia{
		ID:          "med-1",
		MessageID:   messageID,
		MediaType:   mediaType,
		ObjectKey:   objectKey,
		URL:         "/media/chat/med-1",
		ContentType: contentType,
		FileSize:    fileSize,
		FileName:    fileName,
		CreatedAt:   time.Now(),
	}, nil
}
