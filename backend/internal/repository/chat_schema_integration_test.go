//go:build integration

package repository

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/repository/sqlc"
)

func TestChatSchemaIntegration(t *testing.T) {
	ctx := context.Background()
	dbURL := integrationDatabaseURL()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect integration database %s: %v", dbURL, err)
	}
	defer conn.Close(ctx)

	const (
		cust1ID  = "22222222-1111-1111-1111-111111111111"
		cust2ID  = "22222222-1111-1111-1111-222222222222"
		adminUID = "22222222-1111-1111-1111-333333333333"
	)

	// Clean up chat data for these test users first
	_, _ = conn.Exec(ctx, "DELETE FROM conversations WHERE user_id IN ($1, $2)", cust1ID, cust2ID)
	_, _ = conn.Exec(ctx, "DELETE FROM chat_attachments WHERE uploader_id IN ($1, $2, $3)", cust1ID, cust2ID, adminUID)

	// Seed test users
	_, _ = conn.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, role)
		VALUES ($1, 'cust1@example.com', 'hash', 'customer'),
		       ($2, 'cust2@example.com', 'hash', 'customer'),
		       ($3, 'admin_chat@example.com', 'hash', 'admin')
		ON CONFLICT (id) DO NOTHING
	`, cust1ID, cust2ID, adminUID)

	t.Run("Conversations_Constraints", func(t *testing.T) {
		q := sqlc.New(conn)

		// Create conversation for cust1
		conv, err := q.CreateConversation(ctx, cust1ID)
		if err != nil {
			t.Fatalf("create conversation failed: %v", err)
		}
		if conv.UserID != cust1ID {
			t.Fatalf("expected user_id %s, got %s", cust1ID, conv.UserID)
		}

		// Idempotent creation (ON CONFLICT DO UPDATE)
		conv2, err := q.CreateConversation(ctx, cust1ID)
		if err != nil {
			t.Fatalf("re-create conversation should succeed: %v", err)
		}
		if conv2.ID != conv.ID {
			t.Fatalf("expected same conversation ID %s, got %s", conv.ID, conv2.ID)
		}

		// Direct insert duplicate user_id must fail unique constraint
		_, err = conn.Exec(ctx, `
			INSERT INTO conversations (user_id) VALUES ($1)
		`, cust1ID)
		if err == nil {
			t.Fatal("expected error on duplicate conversation user_id, got nil")
		}
		if !strings.Contains(err.Error(), "unique") && !strings.Contains(err.Error(), "duplicate key") {
			t.Fatalf("expected unique constraint violation, got %v", err)
		}
	})

	t.Run("ChatMessages_Constraints", func(t *testing.T) {
		var convID string
		err := conn.QueryRow(ctx, `SELECT id FROM conversations WHERE user_id = $1`, cust1ID).Scan(&convID)
		if err != nil {
			t.Fatalf("get convID failed: %v", err)
		}

		// 1. Valid sender roles: 'customer', 'admin'
		for _, role := range []string{"customer", "admin"} {
			var msgID string
			err := conn.QueryRow(ctx, `
				INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content)
				VALUES ($1, $2, $3, 'Hello')
				RETURNING id
			`, convID, cust1ID, role).Scan(&msgID)
			if err != nil {
				t.Fatalf("valid sender_role %s failed: %v", role, err)
			}
			_, _ = conn.Exec(ctx, "DELETE FROM chat_messages WHERE id = $1", msgID)
		}

		// Invalid sender_role
		_, err = conn.Exec(ctx, `
			INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content)
			VALUES ($1, $2, 'moderator', 'Hello')
		`, convID, cust1ID)
		if err == nil {
			t.Fatal("expected error for invalid sender_role 'moderator', got nil")
		}

		// 2. Content length: <= 2000 chars
		validContent := strings.Repeat("x", 2000)
		var msgID string
		err = conn.QueryRow(ctx, `
			INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content)
			VALUES ($1, $2, 'customer', $3)
			RETURNING id
		`, convID, cust1ID, validContent).Scan(&msgID)
		if err != nil {
			t.Fatalf("2000 char content failed: %v", err)
		}
		_, _ = conn.Exec(ctx, "DELETE FROM chat_messages WHERE id = $1", msgID)

		// 2001 chars must fail
		tooLongContent := strings.Repeat("x", 2001)
		_, err = conn.Exec(ctx, `
			INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content)
			VALUES ($1, $2, 'customer', $3)
		`, convID, cust1ID, tooLongContent)
		if err == nil {
			t.Fatal("expected error for 2001 char content, got nil")
		}
	})

	t.Run("ChatAttachments_Constraints", func(t *testing.T) {
		// Valid file types: 'image', 'video'
		for _, ft := range []string{"image", "video"} {
			var attID string
			err := conn.QueryRow(ctx, `
				INSERT INTO chat_attachments (uploader_id, object_key, file_type, file_name, file_size, mime_type)
				VALUES ($1, $2, $3, 'testfile', 1024, 'application/octet-stream')
				RETURNING id
			`, cust1ID, "obj-key-"+ft, ft).Scan(&attID)
			if err != nil {
				t.Fatalf("valid file_type %s failed: %v", ft, err)
			}
			_, _ = conn.Exec(ctx, "DELETE FROM chat_attachments WHERE id = $1", attID)
		}

		// Invalid file_type: 'audio', 'document'
		_, err := conn.Exec(ctx, `
			INSERT INTO chat_attachments (uploader_id, object_key, file_type, file_name, file_size, mime_type)
			VALUES ($1, 'key-invalid-ft', 'audio', 'testfile', 1024, 'audio/mp3')
		`, cust1ID)
		if err == nil {
			t.Fatal("expected error for file_type='audio', got nil")
		}

		// file_size <= 0 must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO chat_attachments (uploader_id, object_key, file_type, file_name, file_size, mime_type)
			VALUES ($1, 'key-zero-size', 'image', 'testfile', 0, 'image/jpeg')
		`, cust1ID)
		if err == nil {
			t.Fatal("expected error for file_size=0, got nil")
		}

		// Duplicate object_key must fail
		_, err = conn.Exec(ctx, `
			INSERT INTO chat_attachments (uploader_id, object_key, file_type, file_name, file_size, mime_type)
			VALUES ($1, 'dup-key', 'image', 'test1', 100, 'image/png')
		`, cust1ID)
		if err != nil {
			t.Fatalf("first insert of dup-key failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM chat_attachments WHERE object_key = 'dup-key'")
		}()

		_, err = conn.Exec(ctx, `
			INSERT INTO chat_attachments (uploader_id, object_key, file_type, file_name, file_size, mime_type)
			VALUES ($1, 'dup-key', 'image', 'test2', 200, 'image/png')
		`, cust1ID)
		if err == nil {
			t.Fatal("expected error on duplicate object_key, got nil")
		}
	})

	t.Run("ForeignKeys_CascadeAndSetNull", func(t *testing.T) {
		tempCustID := "22222222-9999-9999-9999-000000000001"
		_, _ = conn.Exec(ctx, `
			INSERT INTO users (id, email, password_hash, role)
			VALUES ($1, 'tempcust@example.com', 'hash', 'customer')
			ON CONFLICT (id) DO NOTHING
		`, tempCustID)

		var tempConvID string
		err := conn.QueryRow(ctx, `
			INSERT INTO conversations (user_id) VALUES ($1) RETURNING id
		`, tempCustID).Scan(&tempConvID)
		if err != nil {
			t.Fatalf("create temp conv failed: %v", err)
		}

		var tempMsgID string
		err = conn.QueryRow(ctx, `
			INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content)
			VALUES ($1, $2, 'customer', 'To be cascaded')
			RETURNING id
		`, tempConvID, tempCustID).Scan(&tempMsgID)
		if err != nil {
			t.Fatalf("create temp msg failed: %v", err)
		}

		var tempAttID string
		err = conn.QueryRow(ctx, `
			INSERT INTO chat_attachments (message_id, uploader_id, object_key, file_type, file_name, file_size, mime_type)
			VALUES ($1, $2, 'temp-att-key', 'image', 'f.png', 500, 'image/png')
			RETURNING id
		`, tempMsgID, tempCustID).Scan(&tempAttID)
		if err != nil {
			t.Fatalf("create temp attachment failed: %v", err)
		}

		// Delete user -> conversations CASCADE -> chat_messages CASCADE -> chat_attachments CASCADE
		// But wait: chat_attachments.uploader_id has ON DELETE RESTRICT!
		// So deleting user while chat_attachments.uploader_id references it will be RESTRICTed.
		// Let's verify deleting message cascades attachment:
		_, err = conn.Exec(ctx, "DELETE FROM chat_messages WHERE id = $1", tempMsgID)
		if err != nil {
			t.Fatalf("delete message failed: %v", err)
		}

		var attCount int
		_ = conn.QueryRow(ctx, "SELECT COUNT(*) FROM chat_attachments WHERE id = $1", tempAttID).Scan(&attCount)
		if attCount != 0 {
			t.Fatalf("expected attachment to be cascaded when message is deleted, got %d", attCount)
		}

		// Clean up temp conversation and temp user
		_, _ = conn.Exec(ctx, "DELETE FROM conversations WHERE id = $1", tempConvID)
		_, _ = conn.Exec(ctx, "DELETE FROM users WHERE id = $1", tempCustID)
	})

	t.Run("CustomerName_FallbackHierarchy", func(t *testing.T) {
		q := sqlc.New(conn)

		// Case 1: cust2 has NO orders and NO address -> fallback to email prefix ('cust2')
		conv, err := q.CreateConversation(ctx, cust2ID)
		if err != nil {
			t.Fatalf("create conv cust2 failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM conversations WHERE id = $1", conv.ID)
		}()

		row, err := q.GetConversationByID(ctx, conv.ID)
		if err != nil {
			t.Fatalf("get conv cust2 failed: %v", err)
		}
		if row.CustomerName != "cust2" {
			t.Fatalf("expected fallback to email prefix 'cust2', got %q", row.CustomerName)
		}

		// Case 2: Add non-default address -> customer name should become address recipient_name
		var addrID string
		err = conn.QueryRow(ctx, `
			INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
			VALUES ($1, 'Nguyễn Văn Địa Chỉ', '0901111111', 1, 'HN', 1, 'Phuong 1', 'So 1', false)
			RETURNING id
		`, cust2ID).Scan(&addrID)
		if err != nil {
			t.Fatalf("insert address failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM addresses WHERE id = $1", addrID)
		}()

		row, err = q.GetConversationByID(ctx, conv.ID)
		if err != nil {
			t.Fatalf("get conv cust2 failed: %v", err)
		}
		if row.CustomerName != "Nguyễn Văn Địa Chỉ" {
			t.Fatalf("expected address recipient_name 'Nguyễn Văn Địa Chỉ', got %q", row.CustomerName)
		}

		// Case 3: Add default address -> customer name should prioritize default address
		var defAddrID string
		err = conn.QueryRow(ctx, `
			INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
			VALUES ($1, 'Trần Mặc Định', '0902222222', 1, 'HN', 1, 'Phuong 1', 'So 2', true)
			RETURNING id
		`, cust2ID).Scan(&defAddrID)
		if err != nil {
			t.Fatalf("insert default address failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM addresses WHERE id = $1", defAddrID)
		}()

		row, err = q.GetConversationByID(ctx, conv.ID)
		if err != nil {
			t.Fatalf("get conv cust2 failed: %v", err)
		}
		if row.CustomerName != "Trần Mặc Định" {
			t.Fatalf("expected default address recipient_name 'Trần Mặc Định', got %q", row.CustomerName)
		}

		// Case 4: Add order -> customer name should prioritize order recipient_name
		var orderID string
		err = conn.QueryRow(ctx, `
			INSERT INTO orders (user_id, status, payment_method, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address)
			VALUES ($1, 'delivered', 'cod', 100000, 0, 100000, 'Lê Đơn Hàng', '0903333333', 'HN', 'Phuong 1', 'So 3')
			RETURNING id
		`, cust2ID).Scan(&orderID)
		if err != nil {
			t.Fatalf("insert order failed: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM orders WHERE id = $1", orderID)
		}()

		row, err = q.GetConversationByID(ctx, conv.ID)
		if err != nil {
			t.Fatalf("get conv cust2 failed: %v", err)
		}
		if row.CustomerName != "Lê Đơn Hàng" {
			t.Fatalf("expected order recipient_name 'Lê Đơn Hàng', got %q", row.CustomerName)
		}
	})

	t.Run("SenderName_IsRead_UnreadCount_Calculations", func(t *testing.T) {
		q := sqlc.New(conn)

		// Cust1 conversation
		conv, err := q.GetConversationByUserID(ctx, cust1ID)
		if err != nil {
			t.Fatalf("get conv cust1: %v", err)
		}

		// Clean messages in conv
		_, _ = conn.Exec(ctx, "DELETE FROM chat_messages WHERE conversation_id = $1", conv.ID)

		// Customer read at t0, Admin read at t0
		t0 := time.Now().Add(-10 * time.Minute)
		t1 := time.Now().Add(-5 * time.Minute)
		t2 := time.Now()

		err = q.MarkCustomerConversationRead(ctx, sqlc.MarkCustomerConversationReadParams{
			ID:                 conv.ID,
			CustomerLastReadAt: t0,
		})
		if err != nil {
			t.Fatalf("mark customer read: %v", err)
		}

		err = q.MarkAdminConversationRead(ctx, sqlc.MarkAdminConversationReadParams{
			ID:              conv.ID,
			AdminLastReadAt: t0,
		})
		if err != nil {
			t.Fatalf("mark admin read: %v", err)
		}

		// Insert 1 customer message created at t1 (so created_at > admin_last_read_at)
		var custMsgID string
		err = conn.QueryRow(ctx, `
			INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content, created_at)
			VALUES ($1, $2, 'customer', 'Chào shop!', $3)
			RETURNING id
		`, conv.ID, cust1ID, t1).Scan(&custMsgID)
		if err != nil {
			t.Fatalf("insert cust msg: %v", err)
		}

		// Insert 1 admin message created at t1 (so created_at > customer_last_read_at)
		var adminMsgID string
		err = conn.QueryRow(ctx, `
			INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content, created_at)
			VALUES ($1, $2, 'admin', 'Shop chào bạn!', $3)
			RETURNING id
		`, conv.ID, adminUID, t1).Scan(&adminMsgID)
		if err != nil {
			t.Fatalf("insert admin msg: %v", err)
		}

		// Check conversation unread counts:
		// Admin unread = 1 (customer message at t1 > admin_last_read_at t0)
		// Customer unread = 1 (admin message at t1 > customer_last_read_at t0)
		convRow, err := q.GetConversationByID(ctx, conv.ID)
		if err != nil {
			t.Fatalf("get conv: %v", err)
		}
		if convRow.UnreadCountAdmin != 1 {
			t.Fatalf("expected UnreadCountAdmin=1, got %d", convRow.UnreadCountAdmin)
		}
		if convRow.UnreadCountCustomer != 1 {
			t.Fatalf("expected UnreadCountCustomer=1, got %d", convRow.UnreadCountCustomer)
		}

		// Check GetMessageByID:
		// Cust message: SenderName should be CustomerName, IsRead should be false (t1 > admin_last_read_at t0)
		cm, err := q.GetMessageByID(ctx, custMsgID)
		if err != nil {
			t.Fatalf("get cust msg: %v", err)
		}
		if cm.SenderName == "Hỗ trợ viên" {
			t.Fatalf("customer sender_name should not be 'Hỗ trợ viên'")
		}
		if cm.IsRead {
			t.Fatalf("customer message at t1 should have is_read=false when admin read at t0")
		}

		// Admin message: SenderName should be "Hỗ trợ viên", IsRead should be false (t1 > customer_last_read_at t0)
		am, err := q.GetMessageByID(ctx, adminMsgID)
		if err != nil {
			t.Fatalf("get admin msg: %v", err)
		}
		if am.SenderName != "Hỗ trợ viên" {
			t.Fatalf("admin sender_name expected 'Hỗ trợ viên', got %q", am.SenderName)
		}
		if am.IsRead {
			t.Fatalf("admin message at t1 should have is_read=false when customer read at t0")
		}

		// Now customer reads up to t2 -> admin message IsRead becomes true! Customer unread count becomes 0!
		err = q.MarkCustomerConversationRead(ctx, sqlc.MarkCustomerConversationReadParams{
			ID:                 conv.ID,
			CustomerLastReadAt: t2,
		})
		if err != nil {
			t.Fatalf("mark customer read t2: %v", err)
		}

		am, err = q.GetMessageByID(ctx, adminMsgID)
		if err != nil {
			t.Fatalf("get admin msg: %v", err)
		}
		if !am.IsRead {
			t.Fatalf("admin message should now be is_read=true")
		}

		convRow, err = q.GetConversationByID(ctx, conv.ID)
		if err != nil {
			t.Fatalf("get conv: %v", err)
		}
		if convRow.UnreadCountCustomer != 0 {
			t.Fatalf("expected UnreadCountCustomer=0 after read, got %d", convRow.UnreadCountCustomer)
		}
		// Admin unread should still be 1 because admin hasn't read yet
		if convRow.UnreadCountAdmin != 1 {
			t.Fatalf("expected UnreadCountAdmin=1, got %d", convRow.UnreadCountAdmin)
		}
	})

	t.Run("LastMessageSnippet_Fallbacks", func(t *testing.T) {
		q := sqlc.New(conn)
		conv, err := q.GetConversationByUserID(ctx, cust1ID)
		if err != nil {
			t.Fatalf("get conv: %v", err)
		}

		_, _ = conn.Exec(ctx, "DELETE FROM chat_messages WHERE conversation_id = $1", conv.ID)

		// 1. Text message
		_, err = conn.Exec(ctx, `
			INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content, created_at)
			VALUES ($1, $2, 'customer', 'Tin nhắn thử nghiệm', now() - interval '3 minutes')
		`, conv.ID, cust1ID)
		if err != nil {
			t.Fatalf("insert msg: %v", err)
		}

		cRow, _ := q.GetConversationByID(ctx, conv.ID)
		if cRow.LastMessageSnippet != "Tin nhắn thử nghiệm" {
			t.Fatalf("expected snippet 'Tin nhắn thử nghiệm', got %q", cRow.LastMessageSnippet)
		}

		// 2. Order message with empty content -> '[Đơn hàng]'
		var orderID string
		err = conn.QueryRow(ctx, `
			INSERT INTO orders (user_id, status, payment_method, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address)
			VALUES ($1, 'delivered', 'cod', 100000, 0, 100000, 'Snippet User', '0901', 'HN', 'W1', 'D1')
			RETURNING id
		`, cust1ID).Scan(&orderID)
		if err != nil {
			t.Fatalf("insert order: %v", err)
		}
		defer func() {
			_, _ = conn.Exec(ctx, "DELETE FROM orders WHERE id = $1", orderID)
		}()

		_, err = conn.Exec(ctx, `
			INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content, attached_order_id, created_at)
			VALUES ($1, $2, 'customer', '', $3, now() - interval '2 minutes')
		`, conv.ID, cust1ID, orderID)
		if err != nil {
			t.Fatalf("insert order msg: %v", err)
		}

		cRow, _ = q.GetConversationByID(ctx, conv.ID)
		if cRow.LastMessageSnippet != "[Đơn hàng]" {
			t.Fatalf("expected snippet '[Đơn hàng]', got %q", cRow.LastMessageSnippet)
		}

		// 3. Image attachment with empty content -> '[Hình ảnh]'
		var imgMsgID string
		err = conn.QueryRow(ctx, `
			INSERT INTO chat_messages (conversation_id, sender_id, sender_role, content, created_at)
			VALUES ($1, $2, 'customer', '', now() - interval '1 minute')
			RETURNING id
		`, conv.ID, cust1ID).Scan(&imgMsgID)
		if err != nil {
			t.Fatalf("insert img msg: %v", err)
		}

		_, err = conn.Exec(ctx, `
			INSERT INTO chat_attachments (message_id, uploader_id, object_key, file_type, file_name, file_size, mime_type)
			VALUES ($1, $2, 'snippet-img-key', 'image', 'photo.jpg', 1024, 'image/jpeg')
		`, imgMsgID, cust1ID)
		if err != nil {
			t.Fatalf("insert img att: %v", err)
		}

		cRow, _ = q.GetConversationByID(ctx, conv.ID)
		if cRow.LastMessageSnippet != "[Hình ảnh]" {
			t.Fatalf("expected snippet '[Hình ảnh]', got %q", cRow.LastMessageSnippet)
		}
	})

	t.Run("Users_LastActiveAt_Presence", func(t *testing.T) {
		q := sqlc.New(conn)
		now := time.Now().Truncate(time.Microsecond)

		err := q.UpdateUserLastActive(ctx, sqlc.UpdateUserLastActiveParams{
			ID:           cust1ID,
			LastActiveAt: pgtype.Timestamptz{Time: now, Valid: true},
		})
		if err != nil {
			t.Fatalf("update last active: %v", err)
		}

		u, err := q.GetUserLastActive(ctx, cust1ID)
		if err != nil {
			t.Fatalf("get last active: %v", err)
		}
		if !u.LastActiveAt.Valid {
			t.Fatalf("expected valid last_active_at")
		}
		if !u.LastActiveAt.Time.Equal(now) {
			t.Fatalf("expected %v, got %v", now, u.LastActiveAt.Time)
		}
	})

	t.Run("Migration000016_UpDownExecution", func(t *testing.T) {
		root, err := filepath.Abs(filepath.Join("..", ".."))
		if err != nil {
			t.Fatal(err)
		}

		downSQL, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000016_create_chat_messaging.down.sql"))
		if err != nil {
			t.Fatalf("read migration 16 down: %v", err)
		}

		upSQL, err := os.ReadFile(filepath.Join(root, "db", "migrations", "000016_create_chat_messaging.up.sql"))
		if err != nil {
			t.Fatalf("read migration 16 up: %v", err)
		}

		// Execute down migration 16
		if _, err := conn.Exec(ctx, string(downSQL)); err != nil {
			t.Fatalf("execute migration 16 down: %v", err)
		}

		// Check tables do not exist
		for _, tbl := range []string{"chat_attachments", "chat_messages", "conversations"} {
			var exists bool
			_ = conn.QueryRow(ctx, `
				SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)
			`, tbl).Scan(&exists)
			if exists {
				t.Fatalf("expected table %s to be dropped", tbl)
			}
		}

		// Check users.last_active_at column does not exist
		var colExists bool
		_ = conn.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'users' AND column_name = 'last_active_at'
			)
		`).Scan(&colExists)
		if colExists {
			t.Fatal("expected users.last_active_at column to be dropped")
		}

		// Execute up migration 16
		if _, err := conn.Exec(ctx, string(upSQL)); err != nil {
			t.Fatalf("execute migration 16 up: %v", err)
		}

		// Check tables exist again
		for _, tbl := range []string{"conversations", "chat_messages", "chat_attachments"} {
			var exists bool
			_ = conn.QueryRow(ctx, `
				SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)
			`, tbl).Scan(&exists)
			if !exists {
				t.Fatalf("expected table %s to exist after up migration", tbl)
			}
		}

		// Check column exists
		_ = conn.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'users' AND column_name = 'last_active_at'
			)
		`).Scan(&colExists)
		if !colExists {
			t.Fatal("expected users.last_active_at column to exist after up migration")
		}
	})
}
