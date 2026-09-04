package ws

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"commerce-backend/internal/security/jwt"
)

func setupTestWSServer(t *testing.T, repo *mockChatRepo) (*httptest.Server, *jwt.Manager, *Hub) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	jwtMgr := jwt.NewManager("test-jwt-secret-key-for-ws-testing-32bytes", "commerce-backend")
	hub := NewHub(repo, nil)
	handler := NewHandler(hub, jwtMgr)

	router := gin.New()
	router.GET("/api/v1/chat/ws", handler.ServeWS)

	server := httptest.NewServer(router)
	t.Cleanup(func() {
		server.Close()
		hub.Close()
	})

	return server, jwtMgr, hub
}

func TestWSHandler_ValidToken(t *testing.T) {
	repo := newMockChatRepo()
	server, jwtMgr, _ := setupTestWSServer(t, repo)

	token, err := jwtMgr.GenerateAccessToken("user-123", "customer", time.Hour)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/chat/ws?token=" + token

	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial websocket: %v", err)
	}
	defer conn.Close()

	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("expected 101 Switching Protocols, got %d", resp.StatusCode)
	}

	// Should receive initial presence broadcast
	_, message, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("failed to read initial message: %v", err)
	}

	var ev Event
	if err := json.Unmarshal(message, &ev); err != nil {
		t.Fatalf("failed to unmarshal event: %v", err)
	}

	if ev.Type != "chat:presence" {
		t.Errorf("expected event type chat:presence, got %s", ev.Type)
	}
}

func TestWSHandler_InvalidToken_4001CloseCode(t *testing.T) {
	repo := newMockChatRepo()
	server, _, _ := setupTestWSServer(t, repo)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/chat/ws?token=invalid.jwt.token"

	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		if resp != nil && resp.StatusCode == http.StatusUnauthorized {
			return
		}
		t.Fatalf("dial unexpected error: %v", err)
	}
	defer conn.Close()

	_, _, err = conn.ReadMessage()
	if err == nil {
		t.Fatalf("expected error on read for invalid token, got nil")
	}

	closeErr, ok := err.(*websocket.CloseError)
	if !ok {
		t.Fatalf("expected websocket.CloseError, got %T: %v", err, err)
	}

	if closeErr.Code != 4001 {
		t.Errorf("expected close code 4001, got %d", closeErr.Code)
	}
}

func TestWSHandler_MissingToken_4001CloseCode(t *testing.T) {
	repo := newMockChatRepo()
	server, _, _ := setupTestWSServer(t, repo)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/chat/ws"

	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		if resp != nil && resp.StatusCode == http.StatusUnauthorized {
			return
		}
		t.Fatalf("dial unexpected error: %v", err)
	}
	defer conn.Close()

	_, _, err = conn.ReadMessage()
	if err == nil {
		t.Fatalf("expected error on read for missing token, got nil")
	}

	closeErr, ok := err.(*websocket.CloseError)
	if !ok {
		t.Fatalf("expected websocket.CloseError, got %T: %v", err, err)
	}

	if closeErr.Code != 4001 {
		t.Errorf("expected close code 4001, got %d", closeErr.Code)
	}
}

func TestWSHandler_TextPingPong(t *testing.T) {
	repo := newMockChatRepo()
	server, jwtMgr, _ := setupTestWSServer(t, repo)

	token, err := jwtMgr.GenerateAccessToken("user-ping", "customer", time.Hour)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/chat/ws?token=" + token

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	// Drain initial presence
	_, _, _ = conn.ReadMessage()

	// Send text ping
	pingMsg := map[string]string{"type": "ping"}
	data, _ := json.Marshal(pingMsg)
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("failed to write ping message: %v", err)
	}

	// Should receive pong
	_, reply, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("failed to read pong reply: %v", err)
	}

	var pongResp map[string]string
	if err := json.Unmarshal(reply, &pongResp); err != nil {
		t.Fatalf("failed to unmarshal reply: %v", err)
	}

	if pongResp["type"] != "pong" {
		t.Errorf("expected type: pong, got %s", pongResp["type"])
	}
}

func TestWSHandler_NonWebSocketRequest(t *testing.T) {
	repo := newMockChatRepo()
	server, _, _ := setupTestWSServer(t, repo)

	resp, err := http.Get(server.URL + "/api/v1/chat/ws")
	if err != nil {
		t.Fatalf("http get failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected status 400 Bad Request, got %d", resp.StatusCode)
	}
}
