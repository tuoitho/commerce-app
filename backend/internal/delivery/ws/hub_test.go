package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"commerce-backend/internal/domain"
)

type mockChatRepo struct {
	mu                  sync.Mutex
	conversations       map[string]*domain.Conversation
	userLastActiveCalls map[string]time.Time
}

func newMockChatRepo() *mockChatRepo {
	return &mockChatRepo{
		conversations:       make(map[string]*domain.Conversation),
		userLastActiveCalls: make(map[string]time.Time),
	}
}

func (m *mockChatRepo) GetOrCreateConversation(ctx context.Context, userID string) (*domain.Conversation, error) {
	return nil, nil
}

func (m *mockChatRepo) GetConversationByID(ctx context.Context, conversationID string) (*domain.Conversation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	conv, ok := m.conversations[conversationID]
	if !ok {
		return nil, domain.ErrConversationNotFound
	}
	return conv, nil
}

func (m *mockChatRepo) GetConversationByUserID(ctx context.Context, userID string) (*domain.Conversation, error) {
	return nil, nil
}

func (m *mockChatRepo) ListConversationsForAdmin(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
	return nil, 0, nil
}

func (m *mockChatRepo) ListMessages(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
	return nil, nil
}

func (m *mockChatRepo) CreatePendingAttachment(ctx context.Context, uploaderID string, objectKey string, fileType domain.ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*domain.ChatAttachment, error) {
	return nil, nil
}

func (m *mockChatRepo) GetAttachmentByID(ctx context.Context, attachmentID string) (*domain.ChatAttachment, error) {
	return nil, nil
}

func (m *mockChatRepo) GetAttachmentsByIDs(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
	return nil, nil
}

func (m *mockChatRepo) GetMessageByID(ctx context.Context, messageID string) (*domain.ChatMessage, error) {
	return nil, nil
}

func (m *mockChatRepo) CreateMessage(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
	return nil, nil
}

func (m *mockChatRepo) MarkConversationRead(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error {
	return nil
}

func (m *mockChatRepo) GetAttachedOrderCard(ctx context.Context, orderID string) (*domain.AttachedOrderCard, error) {
	return nil, nil
}

func (m *mockChatRepo) ListRecentOrdersForChat(ctx context.Context, userID string, limit int) ([]domain.AttachedOrderCard, error) {
	return nil, nil
}

func (m *mockChatRepo) UpdateUserLastActive(ctx context.Context, userID string, t time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.userLastActiveCalls[userID] = t
	return nil
}

var _ domain.ChatRepository = (*mockChatRepo)(nil)

func createTestClient(hub *Hub, userID string, role domain.ChatSenderRole) *Client {
	return &Client{
		hub:    hub,
		userID: userID,
		role:   role,
		send:   make(chan []byte, 64),
	}
}

func readEvent(t *testing.T, c *Client, timeout time.Duration) *Event {
	t.Helper()
	select {
	case data, ok := <-c.send:
		if !ok {
			return nil
		}
		var ev Event
		if err := json.Unmarshal(data, &ev); err != nil {
			t.Fatalf("failed to unmarshal event: %v", err)
		}
		return &ev
	case <-time.After(timeout):
		return nil
	}
}

func drainEvents(c *Client) {
	for {
		select {
		case <-c.send:
		default:
			return
		}
	}
}

func TestHub_RegisterAndUnregister(t *testing.T) {
	repo := newMockChatRepo()
	hub := NewHub(repo, nil)

	c1 := createTestClient(hub, "user-1", domain.ChatSenderCustomer)

	if hub.IsUserOnline("user-1") {
		t.Errorf("expected user-1 to be offline initially")
	}

	hub.Register(c1)

	if !hub.IsUserOnline("user-1") {
		t.Errorf("expected user-1 to be online after register")
	}

	// Should have received presence event (online: true)
	ev := readEvent(t, c1, 500*time.Millisecond)
	if ev == nil || ev.Type != "chat:presence" {
		t.Fatalf("expected presence event, got %v", ev)
	}

	// Unregister
	hub.Unregister(c1)

	if hub.IsUserOnline("user-1") {
		t.Errorf("expected user-1 to be offline after unregister")
	}

	// Give async presence a brief moment to process
	time.Sleep(50 * time.Millisecond)
	repo.mu.Lock()
	if _, ok := repo.userLastActiveCalls["user-1"]; !ok {
		t.Errorf("expected UpdateUserLastActive to be called for user-1")
	}
	repo.mu.Unlock()
}

func TestHub_MultipleConnectionsSameUser(t *testing.T) {
	hub := NewHub(nil, nil)

	tab1 := createTestClient(hub, "user-multi", domain.ChatSenderCustomer)
	tab2 := createTestClient(hub, "user-multi", domain.ChatSenderCustomer)

	hub.Register(tab1)
	ev1 := readEvent(t, tab1, 500*time.Millisecond)
	if ev1 == nil || ev1.Type != "chat:presence" {
		t.Fatalf("tab1 expected presence event, got %v", ev1)
	}

	hub.Register(tab2)
	// tab2 is a second connection for user-multi, so user is already online
	// tab1 should NOT get a duplicate isOnline=true event
	evDup := readEvent(t, tab1, 100*time.Millisecond)
	if evDup != nil {
		t.Fatalf("unexpected event on tab1 when tab2 joined: %v", evDup)
	}

	if !hub.IsUserOnline("user-multi") {
		t.Errorf("expected user-multi to be online")
	}

	// Unregister tab1 (tab2 remains connected)
	hub.Unregister(tab1)
	if !hub.IsUserOnline("user-multi") {
		t.Errorf("expected user-multi to remain online while tab2 is connected")
	}

	// Unregister tab2 (last connection)
	hub.Unregister(tab2)
	if hub.IsUserOnline("user-multi") {
		t.Errorf("expected user-multi to be offline after all connections closed")
	}
}

func TestHub_BroadcastNewMessage(t *testing.T) {
	repo := newMockChatRepo()
	repo.conversations["conv-1"] = &domain.Conversation{
		ID:     "conv-1",
		UserID: "customer-1",
	}

	hub := NewHub(repo, nil)

	custClient := createTestClient(hub, "customer-1", domain.ChatSenderCustomer)
	adminClient := createTestClient(hub, "admin-1", domain.ChatSenderAdmin)
	otherCustClient := createTestClient(hub, "customer-2", domain.ChatSenderCustomer)

	hub.Register(custClient)
	hub.Register(adminClient)
	hub.Register(otherCustClient)

	// Flush presence events
	time.Sleep(20 * time.Millisecond)
	drainEvents(custClient)
	drainEvents(adminClient)
	drainEvents(otherCustClient)

	// Case 1: Customer sends message
	custMsg := &domain.ChatMessage{
		ID:             "msg-1",
		ConversationID: "conv-1",
		SenderID:       "customer-1",
		SenderRole:     domain.ChatSenderCustomer,
		Content:        "Xin chào hỗ trợ",
	}

	err := hub.BroadcastNewMessage(context.Background(), custMsg)
	if err != nil {
		t.Fatalf("broadcast new message failed: %v", err)
	}

	// Customer should receive
	evCust := readEvent(t, custClient, 500*time.Millisecond)
	if evCust == nil || evCust.Type != "chat:new_message" {
		t.Fatalf("customer expected chat:new_message, got %v", evCust)
	}

	// Admin should receive
	evAdmin := readEvent(t, adminClient, 500*time.Millisecond)
	if evAdmin == nil || evAdmin.Type != "chat:new_message" {
		t.Fatalf("admin expected chat:new_message, got %v", evAdmin)
	}

	// Other customer should NOT receive
	evOther := readEvent(t, otherCustClient, 100*time.Millisecond)
	if evOther != nil {
		t.Fatalf("other customer should not receive message, got %v", evOther)
	}

	// Case 2: Admin replies
	adminReply := &domain.ChatMessage{
		ID:             "msg-2",
		ConversationID: "conv-1",
		SenderID:       "admin-1",
		SenderRole:     domain.ChatSenderAdmin,
		Content:        "Chào bạn, tôi có thể giúp gì cho bạn?",
	}

	err = hub.BroadcastNewMessage(context.Background(), adminReply)
	if err != nil {
		t.Fatalf("broadcast admin reply failed: %v", err)
	}

	// Customer should receive admin reply
	evCust2 := readEvent(t, custClient, 500*time.Millisecond)
	if evCust2 == nil || evCust2.Type != "chat:new_message" {
		t.Fatalf("customer expected admin reply, got %v", evCust2)
	}

	// Admin should receive admin reply
	evAdmin2 := readEvent(t, adminClient, 500*time.Millisecond)
	if evAdmin2 == nil || evAdmin2.Type != "chat:new_message" {
		t.Fatalf("admin expected admin reply, got %v", evAdmin2)
	}

	// Other customer still should NOT receive
	evOther2 := readEvent(t, otherCustClient, 100*time.Millisecond)
	if evOther2 != nil {
		t.Fatalf("other customer should not receive admin reply, got %v", evOther2)
	}
}

func TestHub_BroadcastMessagesRead(t *testing.T) {
	repo := newMockChatRepo()
	repo.conversations["conv-read-1"] = &domain.Conversation{
		ID:     "conv-read-1",
		UserID: "customer-reader",
	}

	hub := NewHub(repo, nil)

	custClient := createTestClient(hub, "customer-reader", domain.ChatSenderCustomer)
	adminClient := createTestClient(hub, "admin-reader", domain.ChatSenderAdmin)
	otherCustClient := createTestClient(hub, "customer-other", domain.ChatSenderCustomer)

	hub.Register(custClient)
	hub.Register(adminClient)
	hub.Register(otherCustClient)

	// Flush presence
	time.Sleep(20 * time.Millisecond)
	drainEvents(custClient)
	drainEvents(adminClient)
	drainEvents(otherCustClient)

	// Case 1: Customer reads messages -> Broadcasts to admin
	now := time.Now().UTC()
	err := hub.BroadcastMessagesRead(context.Background(), "conv-read-1", domain.ChatSenderCustomer, now)
	if err != nil {
		t.Fatalf("broadcast messages read failed: %v", err)
	}

	evAdmin := readEvent(t, adminClient, 500*time.Millisecond)
	if evAdmin == nil || evAdmin.Type != "chat:messages_read" {
		t.Fatalf("admin expected chat:messages_read, got %v", evAdmin)
	}

	evOther := readEvent(t, otherCustClient, 100*time.Millisecond)
	if evOther != nil {
		t.Fatalf("other customer should not receive read receipt, got %v", evOther)
	}

	// Case 2: Admin reads messages -> Broadcasts to customer
	err = hub.BroadcastMessagesRead(context.Background(), "conv-read-1", domain.ChatSenderAdmin, now)
	if err != nil {
		t.Fatalf("broadcast admin read failed: %v", err)
	}

	evCust := readEvent(t, custClient, 500*time.Millisecond)
	if evCust == nil || evCust.Type != "chat:messages_read" {
		t.Fatalf("customer expected chat:messages_read, got %v", evCust)
	}

	evAdmin2 := readEvent(t, adminClient, 500*time.Millisecond)
	if evAdmin2 == nil || evAdmin2.Type != "chat:messages_read" {
		t.Fatalf("admin expected chat:messages_read, got %v", evAdmin2)
	}

	evOther2 := readEvent(t, otherCustClient, 100*time.Millisecond)
	if evOther2 != nil {
		t.Fatalf("other customer should not receive read receipt, got %v", evOther2)
	}
}

func TestHub_IsAnyAdminOnline(t *testing.T) {
	hub := NewHub(nil, nil)

	if hub.IsAnyAdminOnline() {
		t.Errorf("expected no admins online initially")
	}

	admin1 := createTestClient(hub, "admin-1", domain.ChatSenderAdmin)
	hub.Register(admin1)

	if !hub.IsAnyAdminOnline() {
		t.Errorf("expected admin to be online")
	}

	hub.Unregister(admin1)
	if hub.IsAnyAdminOnline() {
		t.Errorf("expected no admins online after unregister")
	}
}

func TestHub_ConcurrentSafety(t *testing.T) {
	repo := newMockChatRepo()
	for i := 0; i < 10; i++ {
		cID := fmt.Sprintf("conv-%d", i)
		uID := fmt.Sprintf("user-%d", i)
		repo.conversations[cID] = &domain.Conversation{ID: cID, UserID: uID}
	}

	hub := NewHub(repo, nil)

	var wg sync.WaitGroup
	workers := 20
	iterations := 50

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			uID := fmt.Sprintf("user-%d", workerID%10)
			role := domain.ChatSenderCustomer
			if workerID%3 == 0 {
				role = domain.ChatSenderAdmin
			}

			client := createTestClient(hub, uID, role)

			for i := 0; i < iterations; i++ {
				hub.Register(client)
				_ = hub.IsUserOnline(uID)
				_ = hub.IsAnyAdminOnline()

				_ = hub.BroadcastNewMessage(context.Background(), &domain.ChatMessage{
					ID:             fmt.Sprintf("msg-%d-%d", workerID, i),
					ConversationID: fmt.Sprintf("conv-%d", workerID%10),
					SenderID:       uID,
					SenderRole:     role,
					Content:        "Test concurrency",
				})

				_ = hub.BroadcastMessagesRead(context.Background(), fmt.Sprintf("conv-%d", workerID%10), role, time.Now().UTC())

				_ = hub.BroadcastPresence(context.Background(), uID, role, true, time.Now().UTC())

				// Drain channel to prevent buffer full
				select {
				case <-client.send:
				default:
				}

				hub.Unregister(client)
			}
		}(w)
	}

	wg.Wait()
}

func TestHub_CloseCleanShutdown(t *testing.T) {
	hub := NewHub(nil, nil)
	c1 := createTestClient(hub, "u1", domain.ChatSenderCustomer)
	c2 := createTestClient(hub, "a1", domain.ChatSenderAdmin)

	hub.Register(c1)
	hub.Register(c2)

	hub.Close()

	if hub.IsUserOnline("u1") {
		t.Errorf("expected u1 to be offline after hub close")
	}
	if hub.IsAnyAdminOnline() {
		t.Errorf("expected no admin online after hub close")
	}

	// Sending after close should not panic
	err := hub.BroadcastNewMessage(context.Background(), &domain.ChatMessage{ID: "msg-after-close"})
	if err != nil {
		t.Fatalf("broadcast after close returned error: %v", err)
	}
}
