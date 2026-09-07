package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"commerce-backend/internal/repository"
)

func TestChatRepository_PostgresIntegration(t *testing.T) {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, "postgres://ecommerce:change-me-local-only@localhost:5432/commerce?sslmode=disable")
	if err != nil {
		t.Skipf("skipping postgres integration test: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping postgres integration test: database unreachable: %v", err)
	}
	defer pool.Close()

	repo := repository.NewChatRepository(pool)

	// Create test user and order
	userID := uuid.New().String()
	_, err = pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, role)
		VALUES ($1, $2, 'hash', 'customer')
	`, userID, "test_chat_"+userID[:8]+"@example.com")
	if err != nil {
		t.Fatalf("failed to insert test user: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM chat_message_media WHERE message_id IN (SELECT id FROM chat_messages WHERE sender_id = $1)`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM chat_messages WHERE sender_id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM chat_conversations WHERE user_id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM orders WHERE user_id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	}()

	orderID := uuid.New().String()
	_, err = pool.Exec(ctx, `
		INSERT INTO orders (id, user_id, status, payment_method, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address)
		VALUES ($1, $2, 'confirmed', 'cod', 100000, 10000, 110000, 'Test User', '0123456789', 'Hà Nội', 'Phường A', 'Số 1')
	`, orderID, userID)
	if err != nil {
		t.Fatalf("failed to insert test order: %v", err)
	}

	// 1. Create conversation for user (single conversation per customer)
	conv, err := repo.CreateConversationForUser(ctx, userID)
	if err != nil {
		t.Fatalf("failed to create conversation: %v", err)
	}
	if conv.UserID != userID {
		t.Errorf("unexpected conversation user: %+v", conv)
	}

	// Re-creating or get-or-create should return the same conversation
	conv2, err := repo.CreateConversationForUser(ctx, userID)
	if err != nil {
		t.Fatalf("failed to get or create conversation: %v", err)
	}
	if conv2.ID != conv.ID {
		t.Errorf("expected same conversation ID %s, got %s", conv.ID, conv2.ID)
	}

	// 2. Fetch by user ID
	convFetched, err := repo.GetConversationByUserID(ctx, userID)
	if err != nil {
		t.Fatalf("failed to fetch conversation by user ID: %v", err)
	}
	if convFetched.ID != conv.ID {
		t.Errorf("expected id %s, got %s", conv.ID, convFetched.ID)
	}

	// 3. Check order ownership
	if err := repo.CheckOrderOwnership(ctx, orderID, userID); err != nil {
		t.Errorf("expected order ownership valid, got err: %v", err)
	}
	otherUserID := uuid.New().String()
	if err := repo.CheckOrderOwnership(ctx, orderID, otherUserID); err == nil {
		t.Errorf("expected error for non-owner user, got nil")
	}

	// 4. Customer sends text message
	msg1, err := repo.InsertMessage(ctx, conv.ID, userID, "customer", "text", nil, "Xin chào shop")
	if err != nil {
		t.Fatalf("failed to insert customer text message: %v", err)
	}
	if msg1.Content != "Xin chào shop" || msg1.SenderRole != "customer" || msg1.MessageType != "text" {
		t.Errorf("unexpected text message: %+v", msg1)
	}

	// 5. Customer sends order attachment message
	msg2, err := repo.InsertMessage(ctx, conv.ID, userID, "customer", "order", &orderID, "Đơn hàng này bao giờ giao?")
	if err != nil {
		t.Fatalf("failed to insert order message: %v", err)
	}
	if msg2.MessageType != "order" || msg2.OrderID == nil || *msg2.OrderID != orderID {
		t.Errorf("unexpected order message: %+v", msg2)
	}
	if msg2.OrderSummary == nil || msg2.OrderSummary.ID != orderID {
		t.Errorf("expected order summary enriched, got nil or mismatch: %+v", msg2.OrderSummary)
	}

	// 6. Attach media to message 1
	media, err := repo.InsertMessageMedia(ctx, msg1.ID, "image", "test/obj.jpg", "image/jpeg", 1024, "test.jpg")
	if err != nil {
		t.Fatalf("failed to insert message media: %v", err)
	}
	if media.ID == "" || media.URL != "/media/chat/"+media.ID {
		t.Errorf("unexpected media created: %+v", media)
	}

	// 7. List messages (limit 20, initial load)
	messages, hasMore, err := repo.ListMessages(ctx, conv.ID, 20, nil)
	if err != nil {
		t.Fatalf("failed to list messages: %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(messages))
	}
	if hasMore {
		t.Errorf("expected hasMore false, got true")
	}
	// Verify sorting is ASC (msg1 then msg2)
	if messages[0].ID != msg1.ID || messages[1].ID != msg2.ID {
		t.Errorf("messages not in chronological order: [0]=%s, [1]=%s", messages[0].ID, messages[1].ID)
	}
	// Verify media on msg1
	if len(messages[0].Media) != 1 || messages[0].Media[0].ID != media.ID {
		t.Errorf("expected media attached to msg1: %+v", messages[0])
	}
	// Verify order summary on msg2
	if messages[1].OrderSummary == nil || messages[1].OrderSummary.ID != orderID {
		t.Errorf("expected order summary on msg2: %+v", messages[1])
	}

	// 8. Test reverse pagination: query before msg2
	beforeTime := msg2.CreatedAt
	olderMessages, hasMoreOlder, err := repo.ListMessages(ctx, conv.ID, 1, &beforeTime)
	if err != nil {
		t.Fatalf("failed to list older messages before msg2: %v", err)
	}
	if len(olderMessages) != 1 || olderMessages[0].ID != msg1.ID {
		t.Fatalf("expected msg1 as older message, got %+v", olderMessages)
	}
	if hasMoreOlder {
		t.Errorf("expected hasMoreOlder false, got true")
	}

	// 9. Admin conversation list
	adminConvs, total, err := repo.ListAdminConversations(ctx, false, 1, 10)
	if err != nil {
		t.Fatalf("failed to list admin conversations: %v", err)
	}
	if total < 1 || len(adminConvs) < 1 {
		t.Fatalf("expected at least 1 admin conversation, total=%d, len=%d", total, len(adminConvs))
	}
	found := false
	for _, c := range adminConvs {
		if c.ID == conv.ID {
			found = true
			if c.AdminUnreadCount < 2 {
				t.Errorf("expected at least 2 unread for admin, got %d", c.AdminUnreadCount)
			}
			if c.LastMessage == nil || c.LastMessage.Content != "Đơn hàng này bao giờ giao?" {
				t.Errorf("expected last message snippet, got %+v", c.LastMessage)
			}
		}
	}
	if !found {
		t.Errorf("conversation %s not found in admin conversation list", conv.ID)
	}

	// 10. Mark admin read
	if err := repo.MarkAdminRead(ctx, conv.ID); err != nil {
		t.Fatalf("failed to mark admin read: %v", err)
	}
	cAfterRead, err := repo.GetConversationByID(ctx, conv.ID)
	if err != nil {
		t.Fatalf("failed to get conversation after read: %v", err)
	}
	if cAfterRead.AdminLastReadAt.Before(msg2.CreatedAt) {
		t.Errorf("admin last read at not updated: %v vs %v", cAfterRead.AdminLastReadAt, msg2.CreatedAt)
	}
}
