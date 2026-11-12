package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"commerce-backend/internal/domain"
)

// Event represents a WebSocket event pushed from server to clients.
type Event struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

// Hub manages active WebSocket client connections and realtime event distribution.
type Hub struct {
	mu           sync.RWMutex
	clients      map[*Client]bool
	userClients  map[string]map[*Client]bool
	adminClients map[*Client]bool
	repo         domain.ChatRepository
	logger       *slog.Logger
	closed       bool
	closeOnce    sync.Once
}

var _ domain.ChatEventBroadcaster = (*Hub)(nil)
var _ domain.NotificationBroadcaster = (*Hub)(nil)

// NewHub initializes and returns a new Hub.
func NewHub(repo domain.ChatRepository, logger *slog.Logger) *Hub {
	return &Hub{
		clients:      make(map[*Client]bool),
		userClients:  make(map[string]map[*Client]bool),
		adminClients: make(map[*Client]bool),
		repo:         repo,
		logger:       logger,
	}
}

// Register registers a new client connection with the hub.
func (h *Hub) Register(client *Client) {
	if client == nil {
		return
	}

	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return
	}

	h.clients[client] = true
	if h.userClients[client.userID] == nil {
		h.userClients[client.userID] = make(map[*Client]bool)
	}

	isFirstConnection := len(h.userClients[client.userID]) == 0
	h.userClients[client.userID][client] = true

	if client.role == domain.ChatSenderAdmin {
		h.adminClients[client] = true
	}
	h.mu.Unlock()

	now := time.Now().UTC()
	if isFirstConnection {
		_ = h.BroadcastPresence(context.Background(), client.userID, client.role, true, now)
	}
	h.touchUserActive(client.userID)
}

// Unregister removes a client connection and cleans up session state.
func (h *Hub) Unregister(client *Client) {
	if client == nil {
		return
	}

	h.mu.Lock()
	if !h.clients[client] {
		h.mu.Unlock()
		return
	}

	delete(h.clients, client)

	if clients, ok := h.userClients[client.userID]; ok {
		delete(clients, client)
	}

	if client.role == domain.ChatSenderAdmin {
		delete(h.adminClients, client)
	}

	isLastConnection := len(h.userClients[client.userID]) == 0
	if isLastConnection {
		delete(h.userClients, client.userID)
	}
	h.mu.Unlock()

	client.Close()

	if isLastConnection {
		now := time.Now().UTC()
		_ = h.BroadcastPresence(context.Background(), client.userID, client.role, false, now)
		h.touchUserActive(client.userID)
	}
}

// BroadcastNewMessage pushes a newly created chat message to relevant participants.
// Sends to the conversation's customer and all connected administrators.
func (h *Hub) BroadcastNewMessage(ctx context.Context, msg *domain.ChatMessage) error {
	if msg == nil {
		return nil
	}

	event := Event{
		Type:    "chat:new_message",
		Payload: msg,
	}
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal new message event: %w", err)
	}

	targetCustomerID := ""
	if msg.SenderRole == domain.ChatSenderCustomer {
		targetCustomerID = msg.SenderID
	} else if h.repo != nil && msg.ConversationID != "" {
		lookupCtx := ctx
		if lookupCtx == nil || lookupCtx.Err() != nil {
			var cancel context.CancelFunc
			lookupCtx, cancel = context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
		}
		conv, err := h.repo.GetConversationByID(lookupCtx, msg.ConversationID)
		if err == nil && conv != nil {
			targetCustomerID = conv.UserID
		}
	}

	h.mu.RLock()
	if h.closed {
		h.mu.RUnlock()
		return nil
	}

	targets := make(map[*Client]struct{})
	if targetCustomerID != "" {
		for c := range h.userClients[targetCustomerID] {
			targets[c] = struct{}{}
		}
	}
	for c := range h.adminClients {
		targets[c] = struct{}{}
	}
	h.mu.RUnlock()

	for c := range targets {
		c.SendMessage(data)
	}

	return nil
}

// BroadcastMessagesRead notifies the other party when messages have been marked as read.
func (h *Hub) BroadcastMessagesRead(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole, readAt time.Time) error {
	event := Event{
		Type: "chat:messages_read",
		Payload: domain.MessagesReadPayload{
			ConversationID: conversationID,
			ReaderRole:     readerRole,
			ReadAt:         readAt.UTC().Format(time.RFC3339Nano),
		},
	}
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal messages read event: %w", err)
	}

	targetCustomerID := ""
	if readerRole == domain.ChatSenderAdmin && h.repo != nil && conversationID != "" {
		lookupCtx := ctx
		if lookupCtx == nil || lookupCtx.Err() != nil {
			var cancel context.CancelFunc
			lookupCtx, cancel = context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
		}
		conv, err := h.repo.GetConversationByID(lookupCtx, conversationID)
		if err == nil && conv != nil {
			targetCustomerID = conv.UserID
		}
	}

	h.mu.RLock()
	if h.closed {
		h.mu.RUnlock()
		return nil
	}

	targets := make(map[*Client]struct{})
	if readerRole == domain.ChatSenderCustomer {
		// Customer read -> notify all admins
		for c := range h.adminClients {
			targets[c] = struct{}{}
		}
	} else {
		// Admin read -> notify that specific customer AND notify all admins
		if targetCustomerID != "" {
			for c := range h.userClients[targetCustomerID] {
				targets[c] = struct{}{}
			}
		}
		for c := range h.adminClients {
			targets[c] = struct{}{}
		}
	}
	h.mu.RUnlock()

	for c := range targets {
		c.SendMessage(data)
	}

	return nil
}

// BroadcastPresence pushes an online/offline presence update to all connected clients.
func (h *Hub) BroadcastPresence(ctx context.Context, userID string, role domain.ChatSenderRole, isOnline bool, lastActiveAt time.Time) error {
	event := Event{
		Type: "chat:presence",
		Payload: domain.PresencePayload{
			UserID:       userID,
			Role:         role,
			IsOnline:     isOnline,
			LastActiveAt: lastActiveAt.UTC().Format(time.RFC3339Nano),
		},
	}
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal presence event: %w", err)
	}

	h.mu.RLock()
	if h.closed {
		h.mu.RUnlock()
		return nil
	}

	targets := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		targets = append(targets, c)
	}
	h.mu.RUnlock()

	for _, c := range targets {
		c.SendMessage(data)
	}

	return nil
}

// BroadcastNotification pushes a notification item to a specific recipient via WebSocket.
func (h *Hub) BroadcastNotification(ctx context.Context, recipientID string, notification *domain.NotificationItem) error {
	if notification == nil || strings.TrimSpace(recipientID) == "" {
		return nil
	}

	event := Event{
		Type:    "notification:new",
		Payload: notification,
	}
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal notification event: %w", err)
	}

	h.mu.RLock()
	if h.closed {
		h.mu.RUnlock()
		return nil
	}

	var targets []*Client
	if clients, ok := h.userClients[recipientID]; ok {
		targets = make([]*Client, 0, len(clients))
		for c := range clients {
			targets = append(targets, c)
		}
	}
	h.mu.RUnlock()

	for _, c := range targets {
		c.SendMessage(data)
	}

	return nil
}

// IsUserOnline returns whether the given user has at least one active connection.
func (h *Hub) IsUserOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.userClients[userID]) > 0
}

// IsAnyAdminOnline returns whether at least one administrator is currently online.
func (h *Hub) IsAnyAdminOnline() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.adminClients) > 0
}

// Close shuts down the hub and disconnects all connected clients.
func (h *Hub) Close() {
	h.closeOnce.Do(func() {
		h.mu.Lock()
		h.closed = true
		for c := range h.clients {
			c.Close()
		}
		h.clients = make(map[*Client]bool)
		h.userClients = make(map[string]map[*Client]bool)
		h.adminClients = make(map[*Client]bool)
		h.mu.Unlock()
	})
}

// touchUserActive updates the user's last_active_at timestamp in the database asynchronously.
func (h *Hub) touchUserActive(userID string) {
	if h.repo == nil || strings.TrimSpace(userID) == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = h.repo.UpdateUserLastActive(ctx, userID, time.Now().UTC())
	}()
}
