//go:build integration

package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

func openSysNotifTx(t *testing.T) (context.Context, pgx.Tx) {
	t.Helper()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, integrationDatabaseURL())
	require.NoError(t, err, "connect pgx")
	tx, err := conn.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = tx.Rollback(ctx)
		_ = conn.Close(ctx)
	})
	return ctx, tx
}

func TestNotificationSystem_CategoryConstraintAndFiltering(t *testing.T) {
	ctx, tx := openSysNotifTx(t)
	q := sqlc.New(tx)
	users := NewUserRepository(tx)
	repo := NewNotificationRepository(tx)
	orderRepo := NewOrderRepository(tx)

	tok := fmt.Sprintf("sn%d", time.Now().UnixNano())
	cust, err := users.Create(ctx, tok+"-cust@example.com", "hash", domain.RoleCustomer)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `UPDATE users SET display_name = $2 WHERE id = $1`, cust.ID, "Lê Hoàng Nam")
	require.NoError(t, err)

	adminActive1, err := users.Create(ctx, tok+"-adm1@example.com", "hash", domain.RoleAdmin)
	require.NoError(t, err)
	adminActive2, err := users.Create(ctx, tok+"-adm2@example.com", "hash", domain.RoleAdmin)
	require.NoError(t, err)
	adminLocked, err := users.Create(ctx, tok+"-admlock@example.com", "hash", domain.RoleAdmin)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `UPDATE users SET status = 'locked', locked_at = now(), lock_reason = 'test' WHERE id = $1`, adminLocked.ID)
	require.NoError(t, err)

	custLocked, err := users.Create(ctx, tok+"-custlock@example.com", "hash", domain.RoleCustomer)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `UPDATE users SET status = 'locked', locked_at = now(), lock_reason = 'test' WHERE id = $1`, custLocked.ID)
	require.NoError(t, err)

	// 1. Check constraint rejects invalid category and permits order/return/review/live
	_, err = tx.Exec(ctx, `SAVEPOINT bad_cat`)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `
		INSERT INTO notifications (recipient_id, category, notification_type, excerpt, metadata)
		VALUES ($1, 'invalid_cat', 'test_type', 'x', '{}'::jsonb)
	`, cust.ID)
	assert.Error(t, err)
	_, err = tx.Exec(ctx, `ROLLBACK TO SAVEPOINT bad_cat`)
	require.NoError(t, err)

	// 2. Active admin fan-out ignores locked admin and resolves customer display_name
	orderID := uuid.NewString()
	fanout, err := repo.CreateSystemNotificationsForActiveAdmins(ctx, domain.CreateNotificationInput{
		ActorID:          &cust.ID,
		Category:         domain.NotificationCategoryOrder,
		NotificationType: domain.NotificationTypeAdminOrderCreated,
		Excerpt:          "Đơn hàng mới #AABBCCDD",
		Metadata: map[string]interface{}{
			"orderId":        orderID,
			"orderShortCode": "#AABBCCDD",
			"targetPath":     "/orders/" + orderID,
		},
	})
	require.NoError(t, err)

	var fanoutIDs []string
	var matchedAdmin1 bool
	for _, n := range fanout {
		fanoutIDs = append(fanoutIDs, n.RecipientID)
		if n.RecipientID == adminActive1.ID {
			matchedAdmin1 = true
			require.NotNil(t, n.ActorName)
			assert.Equal(t, "Lê Hoàng Nam", *n.ActorName)
		}
	}
	assert.True(t, matchedAdmin1)
	assert.Contains(t, fanoutIDs, adminActive1.ID)
	assert.Contains(t, fanoutIDs, adminActive2.ID)
	assert.NotContains(t, fanoutIDs, adminLocked.ID)

	// 3. Single customer notifications across categories + global unreadCount when filtered
	_, err = repo.CreateSystemNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      cust.ID,
		Category:         domain.NotificationCategoryOrder,
		NotificationType: domain.NotificationTypeOrderShipped,
		Excerpt:          "Đơn hàng đang giao",
		Metadata:         map[string]interface{}{"orderId": orderID, "targetPath": "/orders/" + orderID},
	})
	require.NoError(t, err)

	retID := uuid.NewString()
	_, err = repo.CreateSystemNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      cust.ID,
		Category:         domain.NotificationCategoryReturn,
		NotificationType: domain.NotificationTypeReturnApproved,
		Excerpt:          "Yêu cầu trả hàng đã được duyệt",
		Metadata:         map[string]interface{}{"returnId": retID, "orderId": orderID, "targetPath": "/orders/" + orderID},
	})
	require.NoError(t, err)

	orderOnly, err := repo.ListNotificationsByCategory(ctx, cust.ID, string(domain.NotificationCategoryOrder), 20, 0)
	require.NoError(t, err)
	assert.Len(t, orderOnly.Items, 1)
	assert.Equal(t, domain.NotificationCategoryOrder, orderOnly.Items[0].Category)
	assert.Nil(t, orderOnly.Items[0].ActorID)
	// Global unread count includes both order and return notifications
	assert.Equal(t, 2, orderOnly.UnreadCount)

	// 4. Batch live notifications notify active customers only
	sessionID := uuid.NewString()
	liveItems, err := repo.BatchCreateCustomerLiveNotifications(ctx, `Phiên livestream "Flash Sale" đang phát trực tiếp.`, map[string]interface{}{
		"sessionId":    sessionID,
		"sessionTitle": "Flash Sale",
		"status":       "live",
		"targetPath":   "/live/" + sessionID,
	})
	require.NoError(t, err)
	var liveRecipients []string
	for _, item := range liveItems {
		liveRecipients = append(liveRecipients, item.RecipientID)
	}
	assert.Contains(t, liveRecipients, cust.ID)
	assert.NotContains(t, liveRecipients, custLocked.ID)
	assert.NotContains(t, liveRecipients, adminActive1.ID)

	// 5. AutoConfirmDueReturning + GetReviewNotificationContext against seeded tables
	var prodID, catID, varID string
	err = tx.QueryRow(ctx, `INSERT INTO categories (name) VALUES ($1) RETURNING id`, "Cat-"+tok).Scan(&catID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `
		INSERT INTO products (category_id, name, model, brand, description, price, currency, stock_quantity, active)
		VALUES ($1, $2, $3, 'Aura', 'Desc', 15000000, 'VND', 10, true) RETURNING id
	`, catID, "Aura Phone Pro "+tok, "Model-"+tok).Scan(&prodID)
	require.NoError(t, err)
	err = tx.QueryRow(ctx, `
		INSERT INTO product_variants (product_id, price_vnd, stock_quantity, active)
		VALUES ($1, 15000000, 10, true) RETURNING id
	`, prodID).Scan(&varID)
	require.NoError(t, err)

	pastTime := time.Now().UTC().Add(-2 * time.Hour)
	var dueOrderID string
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (user_id, status, payment_method, subtotal_vnd, shipping_fee_vnd, total_vnd,
			recipient_name, phone, province_name, ward_name, detail_address, created_at, updated_at)
		VALUES ($1, 'pending_confirmation', 'cod', 15000000, 0, 15000000, 'Nam', '0912345678', 'HN', 'HB', '1 Pho Hue', $2, $2)
		RETURNING id
	`, cust.ID, pastTime).Scan(&dueOrderID)
	require.NoError(t, err)

	var orderItemID string
	err = tx.QueryRow(ctx, `
		INSERT INTO order_items (order_id, variant_id, product_id, brand_name, product_name, model, image_url, options, unit_price_vnd, quantity, line_total_vnd)
		VALUES ($1, $2, $3, 'Aura', $4, 'M1', 'https://example.com/p.jpg', '[]'::jsonb, 15000000, 1, 15000000)
		RETURNING id
	`, dueOrderID, varID, prodID, "Aura Phone Pro "+tok).Scan(&orderItemID)
	require.NoError(t, err)

	var reviewID string
	err = tx.QueryRow(ctx, `
		INSERT INTO product_reviews (order_item_id, rating, comment)
		VALUES ($1, 5, 'Rất tốt') RETURNING id
	`, orderItemID).Scan(&reviewID)
	require.NoError(t, err)

	revCtx, err := repo.GetReviewNotificationContext(ctx, reviewID)
	require.NoError(t, err)
	require.NotNil(t, revCtx)
	assert.Equal(t, cust.ID, revCtx.CustomerID)
	assert.Equal(t, dueOrderID, revCtx.OrderID)
	assert.Equal(t, prodID, revCtx.ProductID)
	assert.Equal(t, "Aura Phone Pro "+tok, revCtx.ProductName)

	confirmed, err := orderRepo.AutoConfirmDueReturning(ctx, time.Now().UTC().Add(-30*time.Minute))
	require.NoError(t, err)
	var foundDue bool
	for _, c := range confirmed {
		if c.ID == dueOrderID {
			foundDue = true
			assert.Equal(t, cust.ID, c.UserID)
			assert.Equal(t, domain.MoneyVND("15000000"), c.TotalVND)
		}
	}
	assert.True(t, foundDue)

	// Mark read & verify global count drops
	allNotifs, err := repo.ListNotificationsByCategory(ctx, cust.ID, "", 50, 0)
	require.NoError(t, err)
	require.Equal(t, 3, allNotifs.UnreadCount) // order + return + live
	readItem, err := repo.MarkNotificationRead(ctx, allNotifs.Items[0].ID, cust.ID)
	require.NoError(t, err)
	assert.True(t, readItem.IsRead)
	remainingUnread, err := repo.GetUnreadNotificationCount(ctx, cust.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, remainingUnread)
	_ = q
}
