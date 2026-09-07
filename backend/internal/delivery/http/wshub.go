package http

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"commerce-backend/internal/domain"
)

type WSClient struct {
	hub           *WSHub
	conn          *websocket.Conn
	send          chan []byte
	userID        string
	role          string
	currentConvID string
}

type WSEvent struct {
	Event string `json:"event"`
	Data  any    `json:"data,omitempty"`
	Code  string `json:"code,omitempty"`
	Msg   string `json:"message,omitempty"`
}

type WSHub struct {
	clients map[*WSClient]bool
	mu      sync.RWMutex
	log     *slog.Logger
}

func NewWSHub(log *slog.Logger) *WSHub {
	return &WSHub{
		clients: make(map[*WSClient]bool),
		log:     log,
	}
}

func (h *WSHub) Register(client *WSClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client] = true
}

func (h *WSHub) Unregister(client *WSClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.send)
	}
}

func (h *WSHub) BroadcastNewMessage(msg *domain.Message) {
	evt := WSEvent{
		Event: "new_message",
		Data:  msg,
	}
	raw, err := json.Marshal(evt)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		if client.role == domain.RoleAdmin || client.currentConvID == msg.ConversationID || client.userID == msg.SenderID {
			select {
			case client.send <- raw:
			default:
			}
		}
	}
}

func (h *WSHub) BroadcastReadReceipt(convID, readerRole string) {
	evt := WSEvent{
		Event: "read_receipt",
		Data: map[string]string{
			"conversationId": convID,
			"readerRole":     readerRole,
			"readAt":         time.Now().Format(time.RFC3339),
		},
	}
	raw, err := json.Marshal(evt)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		if client.currentConvID == convID || client.role == domain.RoleAdmin {
			select {
			case client.send <- raw:
			default:
			}
		}
	}
}

func (h *WSHub) BroadcastPresence(userID, role, status string, lastActive time.Time) {
	now := time.Now()
	presence := domain.CalculatePresence(&lastActive, now)
	if status != "" {
		presence.Status = status
		if status == "online" {
			presence.DisplayText = "Đang hoạt động"
		}
	}

	evt := WSEvent{
		Event: "presence_update",
		Data: map[string]any{
			"userId":       userID,
			"role":         role,
			"status":       presence.Status,
			"lastActiveAt": lastActive.Format(time.RFC3339),
			"displayText":  presence.DisplayText,
		},
	}
	raw, err := json.Marshal(evt)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		select {
		case client.send <- raw:
		default:
		}
	}
}
