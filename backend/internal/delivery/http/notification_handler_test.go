package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
)

type mockNotificationUseCaseHTTP struct {
	listFn        func(ctx context.Context, recipientID, category string, limit, offset int) (*domain.NotificationsListResult, error)
	markReadFn    func(ctx context.Context, recipientID, notificationID string) (*domain.NotificationItem, int, error)
	markAllReadFn func(ctx context.Context, recipientID string) (int, error)
}

func (m *mockNotificationUseCaseHTTP) ListNotifications(ctx context.Context, recipientID, category string, limit, offset int) (*domain.NotificationsListResult, error) {
	if m.listFn != nil {
		return m.listFn(ctx, recipientID, category, limit, offset)
	}
	return &domain.NotificationsListResult{Items: []domain.NotificationItem{}}, nil
}

func (m *mockNotificationUseCaseHTTP) MarkNotificationRead(ctx context.Context, recipientID, notificationID string) (*domain.NotificationItem, int, error) {
	if m.markReadFn != nil {
		return m.markReadFn(ctx, recipientID, notificationID)
	}
	return nil, 0, nil
}

func (m *mockNotificationUseCaseHTTP) MarkAllNotificationsRead(ctx context.Context, recipientID string) (int, error) {
	if m.markAllReadFn != nil {
		return m.markAllReadFn(ctx, recipientID)
	}
	return 0, nil
}

var _ domain.NotificationUseCase = (*mockNotificationUseCaseHTTP)(nil)

func setupNotificationRouter(uc domain.NotificationUseCase, jwtMgr *jwt.Manager) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewRouter(router, Dependencies{
		Notification: uc,
		JWT:          jwtMgr,
	})
	return router
}

func TestNotificationHandler_AllContractsAndSnapshots(t *testing.T) {
	snapshotPath := filepath.Join("..", "..", "..", "..", ".dream", "specs", "system-notifications", "contract-snapshots.json")
	jwtMgr := jwt.NewManager("test-secret-key-that-is-at-least-32-bytes-long", "test")

	adminID := "11111111-1111-1111-1111-111111111111"
	customerID := "22222222-2222-2222-2222-222222222222"
	customerName := "Nguyễn Minh Anh"
	customerRole := "customer"
	orderID := "aaaa1111-2222-3333-4444-555566667777"
	returnID := "bbbb1111-2222-3333-4444-555566667777"
	reviewID := "cccc1111-2222-3333-4444-555566667777"
	productID := "77777777-7777-7777-7777-777777777777"
	sessionID := "dddd1111-2222-3333-4444-555566667777"
	postID := "33333333-3333-3333-3333-333333333333"
	notifOrderID := "66666666-6666-6666-6666-666666666601"
	fixedTime := time.Date(2026, 11, 15, 10, 0, 0, 0, time.UTC)
	rxLove := domain.ReactionTypeLove

	customerToken, err := jwtMgr.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)

	sampleItems := []domain.NotificationItem{
		{
			ID:               notifOrderID,
			RecipientID:      customerID,
			ActorID:          nil,
			ActorName:        nil,
			ActorRole:        nil,
			GroupKey:         "",
			ActorCount:       1,
			Category:         domain.NotificationCategoryOrder,
			NotificationType: domain.NotificationTypeOrderShipped,
			Excerpt:          "Đơn hàng #AAAA1111 đã được bàn giao cho đơn vị vận chuyển.",
			Metadata: map[string]interface{}{
				"orderId":        orderID,
				"orderShortCode": "#AAAA1111",
				"status":         "shipped",
				"totalVnd":       "29990000",
				"targetPath":     "/orders/" + orderID,
			},
			IsRead:    false,
			CreatedAt: fixedTime,
			UpdatedAt: fixedTime,
		},
		{
			ID:               "66666666-6666-6666-6666-666666666602",
			RecipientID:      customerID,
			ActorID:          nil,
			ActorName:        nil,
			ActorRole:        nil,
			GroupKey:         "",
			ActorCount:       1,
			Category:         domain.NotificationCategoryReturn,
			NotificationType: domain.NotificationTypeReturnRefunded,
			Excerpt:          "Yêu cầu trả hàng đơn #AAAA1111 đã được hoàn tiền.",
			Metadata: map[string]interface{}{
				"returnId":        returnID,
				"orderId":         orderID,
				"orderShortCode":  "#AAAA1111",
				"status":          "refunded",
				"refundAmountVnd": "29990000",
				"targetPath":      "/orders/" + orderID,
			},
			IsRead:    false,
			CreatedAt: fixedTime,
			UpdatedAt: fixedTime,
		},
		{
			ID:               "66666666-6666-6666-6666-666666666603",
			RecipientID:      customerID,
			ActorID:          nil,
			ActorName:        nil,
			ActorRole:        nil,
			GroupKey:         "",
			ActorCount:       1,
			Category:         domain.NotificationCategoryReview,
			NotificationType: domain.NotificationTypeReviewReplied,
			Excerpt:          "Cảm ơn bạn đã tin tưởng sản phẩm chính hãng của AuraPhone!",
			Metadata: map[string]interface{}{
				"reviewId":    reviewID,
				"orderId":     orderID,
				"productId":   productID,
				"productName": "iPhone 15 Pro Max",
				"targetPath":  "/reviews",
			},
			IsRead:    true,
			CreatedAt: fixedTime,
			UpdatedAt: fixedTime,
		},
		{
			ID:               "66666666-6666-6666-6666-666666666604",
			RecipientID:      customerID,
			ActorID:          nil,
			ActorName:        nil,
			ActorRole:        nil,
			GroupKey:         "",
			ActorCount:       1,
			Category:         domain.NotificationCategoryLive,
			NotificationType: domain.NotificationTypeLivestreamStarted,
			Excerpt:          `Phiên livestream "Flash Sale Cuối Tuần" đang phát trực tiếp.`,
			Metadata: map[string]interface{}{
				"sessionId":    sessionID,
				"sessionTitle": "Flash Sale Cuối Tuần",
				"status":       "live",
				"targetPath":   "/live/" + sessionID,
			},
			IsRead:    false,
			CreatedAt: fixedTime,
			UpdatedAt: fixedTime,
		},
		{
			ID:               "66666666-6666-6666-6666-666666666605",
			RecipientID:      customerID,
			ActorID:          &adminID,
			ActorName:        &customerName,
			ActorRole:        &customerRole,
			GroupKey:         domain.NotificationGroupKeyPostReaction(postID),
			ActorCount:       1,
			Category:         domain.NotificationCategoryPost,
			NotificationType: domain.NotificationTypePostReaction,
			PostID:           &postID,
			ReactionType:     &rxLove,
			Excerpt:          "Ưu đãi tháng 11...",
			Metadata: map[string]interface{}{
				"recentActors": []domain.NotificationActorSummary{
					{ID: customerID, Name: customerName, Role: customerRole},
				},
			},
			IsRead:    true,
			CreatedAt: fixedTime,
			UpdatedAt: fixedTime,
		},
		{
			ID:               "66666666-6666-6666-6666-666666666606",
			RecipientID:      adminID,
			ActorID:          &customerID,
			ActorName:        &customerName,
			ActorRole:        &customerRole,
			GroupKey:         "",
			ActorCount:       1,
			Category:         domain.NotificationCategoryOrder,
			NotificationType: domain.NotificationTypeAdminOrderCreated,
			Excerpt:          "Đơn hàng mới #AAAA1111",
			Metadata: map[string]interface{}{
				"orderId":        orderID,
				"orderShortCode": "#AAAA1111",
				"status":         "pending_confirmation",
				"totalVnd":       "29990000",
				"targetPath":     "/orders/" + orderID,
				"recentActors": []domain.NotificationActorSummary{
					{ID: customerID, Name: customerName, Role: customerRole},
				},
			},
			IsRead:    false,
			CreatedAt: fixedTime,
			UpdatedAt: fixedTime,
		},
		{
			ID:               "66666666-6666-6666-6666-666666666607",
			RecipientID:      adminID,
			ActorID:          &customerID,
			ActorName:        &customerName,
			ActorRole:        &customerRole,
			GroupKey:         "",
			ActorCount:       1,
			Category:         domain.NotificationCategoryReturn,
			NotificationType: domain.NotificationTypeAdminReturnCreated,
			Excerpt:          "Yêu cầu trả hàng mới cho đơn #AAAA1111",
			Metadata: map[string]interface{}{
				"returnId":       returnID,
				"orderId":        orderID,
				"orderShortCode": "#AAAA1111",
				"status":         "pending_approval",
				"targetPath":     "/returns/" + returnID,
				"recentActors": []domain.NotificationActorSummary{
					{ID: customerID, Name: customerName, Role: customerRole},
				},
			},
			IsRead:    false,
			CreatedAt: fixedTime,
			UpdatedAt: fixedTime,
		},
	}

	t.Run("API-NOTIFICATIONS@3 unauthenticated_401", func(t *testing.T) {
		router := setupNotificationRouter(&mockNotificationUseCaseHTTP{}, jwtMgr)
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/notifications", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "system-notifications", "unauthenticated_401",
			"API-NOTIFICATIONS@3", "GET /api/v1/notifications", nil, w,
		)
	})

	t.Run("API-NOTIFICATIONS@3 list_notifications_200", func(t *testing.T) {
		uc := &mockNotificationUseCaseHTTP{
			listFn: func(_ context.Context, recipientID, category string, limit, offset int) (*domain.NotificationsListResult, error) {
				assert.Equal(t, customerID, recipientID)
				assert.Equal(t, "", category)
				assert.Equal(t, 20, limit)
				assert.Equal(t, 0, offset)
				return &domain.NotificationsListResult{
					Items:       sampleItems,
					UnreadCount: 3,
				}, nil
			},
		}
		router := setupNotificationRouter(uc, jwtMgr)
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/notifications?limit=20&offset=0", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "system-notifications", "list_notifications_200",
			"API-NOTIFICATIONS@3", "GET /api/v1/notifications?limit=20&offset=0", nil, w,
		)
	})

	t.Run("API-NOTIFICATIONS@3 list_notifications_by_category_200", func(t *testing.T) {
		uc := &mockNotificationUseCaseHTTP{
			listFn: func(_ context.Context, recipientID, category string, _, _ int) (*domain.NotificationsListResult, error) {
				assert.Equal(t, "order", category)
				return &domain.NotificationsListResult{
					Items:       []domain.NotificationItem{sampleItems[0]},
					UnreadCount: 3,
				}, nil
			},
		}
		router := setupNotificationRouter(uc, jwtMgr)
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/notifications?category=order&limit=30", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("API-NOTIFICATIONS@3 list_notifications_invalid_filter_400", func(t *testing.T) {
		uc := &mockNotificationUseCaseHTTP{
			listFn: func(_ context.Context, _, _ string, _, _ int) (*domain.NotificationsListResult, error) {
				return nil, domain.NewFilterValidationError(map[string]string{
					"category": "Danh mục thông báo không hợp lệ",
				})
			},
		}
		router := setupNotificationRouter(uc, jwtMgr)
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/notifications?category=unknown", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "system-notifications", "list_notifications_invalid_filter_400",
			"API-NOTIFICATIONS@3", "GET /api/v1/notifications?category=unknown", nil, w,
		)
	})

	t.Run("API-NOTIFICATIONS@3 mark_notification_read_200", func(t *testing.T) {
		readItem := sampleItems[0]
		readItem.IsRead = true
		uc := &mockNotificationUseCaseHTTP{
			markReadFn: func(_ context.Context, _, nID string) (*domain.NotificationItem, int, error) {
				return &readItem, 2, nil
			},
		}
		router := setupNotificationRouter(uc, jwtMgr)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/notifications/"+notifOrderID+"/read", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "system-notifications", "mark_notification_read_200",
			"API-NOTIFICATIONS@3", "POST /api/v1/notifications/:id/read", nil, w,
		)
	})

	t.Run("API-NOTIFICATIONS@3 mark_all_notifications_read_200", func(t *testing.T) {
		uc := &mockNotificationUseCaseHTTP{
			markAllReadFn: func(_ context.Context, _ string) (int, error) {
				return 0, nil
			},
		}
		router := setupNotificationRouter(uc, jwtMgr)
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/notifications/read-all", nil)
		req.Header.Set("Authorization", "Bearer "+customerToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assertOrRecordContractSnapshot(
			t, snapshotPath, "system-notifications", "mark_all_notifications_read_200",
			"API-NOTIFICATIONS@3", "POST /api/v1/notifications/read-all", nil, w,
		)
	})

	t.Run("WS-NOTIFICATIONS@3 ws_notification_new", func(t *testing.T) {
		adminOrderItem := domain.NotificationItem{
			ID:               "66666666-6666-6666-6666-666666666699",
			RecipientID:      adminID,
			ActorID:          &customerID,
			ActorName:        &customerName,
			ActorRole:        &customerRole,
			GroupKey:         "",
			ActorCount:       1,
			Category:         domain.NotificationCategoryOrder,
			NotificationType: domain.NotificationTypeAdminOrderCreated,
			Excerpt:          "Đơn hàng mới #AAAA1111",
			Metadata: map[string]interface{}{
				"orderId":        orderID,
				"orderShortCode": "#AAAA1111",
				"status":         "pending_confirmation",
				"totalVnd":       "29990000",
				"targetPath":     "/orders/" + orderID,
				"recentActors": []domain.NotificationActorSummary{
					{ID: customerID, Name: customerName, Role: customerRole},
				},
			},
			IsRead:    false,
			CreatedAt: fixedTime,
			UpdatedAt: fixedTime,
		}
		w := httptest.NewRecorder()
		w.Code = http.StatusOK
		wsPayload := map[string]any{
			"type":    "notification:new",
			"payload": adminOrderItem,
		}
		bodyBytes, err := json.Marshal(wsPayload)
		require.NoError(t, err)
		w.Body = bytes.NewBuffer(bodyBytes)

		assertOrRecordContractSnapshot(
			t, snapshotPath, "system-notifications", "ws_notification_new",
			"WS-NOTIFICATIONS@3", "WS /api/v1/chat/ws", nil, w,
		)
	})
}
