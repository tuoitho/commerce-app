package notification_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	notifuc "commerce-backend/internal/usecase/notification"
)

type fakeNotificationRepo struct {
	listFn             func(ctx context.Context, recipientID, category string, limit, offset int) (*domain.NotificationsListResult, error)
	markReadFn         func(ctx context.Context, notificationID, recipientID string) (*domain.NotificationItem, error)
	markAllReadFn      func(ctx context.Context, recipientID string) error
	unreadCountFn      func(ctx context.Context, recipientID string) (int, error)
	createSingleFn     func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error)
	createForAdminsFn  func(ctx context.Context, input domain.CreateNotificationInput) ([]domain.NotificationItem, error)
	batchLiveFn        func(ctx context.Context, excerpt string, metadata map[string]interface{}) ([]domain.NotificationItem, error)
	reviewCtxFn        func(ctx context.Context, reviewID string) (*domain.ReviewNotificationContext, error)
	singleInputs       []domain.CreateNotificationInput
	adminFanoutInputs  []domain.CreateNotificationInput
}

func (f *fakeNotificationRepo) ListNotificationsByCategory(ctx context.Context, recipientID, category string, limit, offset int) (*domain.NotificationsListResult, error) {
	if f.listFn != nil {
		return f.listFn(ctx, recipientID, category, limit, offset)
	}
	return &domain.NotificationsListResult{Items: []domain.NotificationItem{}}, nil
}

func (f *fakeNotificationRepo) MarkNotificationRead(ctx context.Context, notificationID, recipientID string) (*domain.NotificationItem, error) {
	if f.markReadFn != nil {
		return f.markReadFn(ctx, notificationID, recipientID)
	}
	return &domain.NotificationItem{ID: notificationID, RecipientID: recipientID, IsRead: true}, nil
}

func (f *fakeNotificationRepo) MarkAllNotificationsRead(ctx context.Context, recipientID string) error {
	if f.markAllReadFn != nil {
		return f.markAllReadFn(ctx, recipientID)
	}
	return nil
}

func (f *fakeNotificationRepo) GetUnreadNotificationCount(ctx context.Context, recipientID string) (int, error) {
	if f.unreadCountFn != nil {
		return f.unreadCountFn(ctx, recipientID)
	}
	return 0, nil
}

func (f *fakeNotificationRepo) CreateSystemNotification(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
	f.singleInputs = append(f.singleInputs, input)
	if f.createSingleFn != nil {
		return f.createSingleFn(ctx, input)
	}
	return &domain.NotificationItem{
		ID:               uuid.NewString(),
		RecipientID:      input.RecipientID,
		ActorID:          input.ActorID,
		ActorCount:       1,
		Category:         input.Category,
		NotificationType: input.NotificationType,
		Excerpt:          input.Excerpt,
		Metadata:         input.Metadata,
		CreatedAt:        time.Now().UTC(),
		UpdatedAt:        time.Now().UTC(),
	}, nil
}

func (f *fakeNotificationRepo) CreateSystemNotificationsForActiveAdmins(ctx context.Context, input domain.CreateNotificationInput) ([]domain.NotificationItem, error) {
	f.adminFanoutInputs = append(f.adminFanoutInputs, input)
	if f.createForAdminsFn != nil {
		return f.createForAdminsFn(ctx, input)
	}
	return nil, nil
}

func (f *fakeNotificationRepo) BatchCreateCustomerLiveNotifications(ctx context.Context, excerpt string, metadata map[string]interface{}) ([]domain.NotificationItem, error) {
	if f.batchLiveFn != nil {
		return f.batchLiveFn(ctx, excerpt, metadata)
	}
	return nil, nil
}

func (f *fakeNotificationRepo) GetReviewNotificationContext(ctx context.Context, reviewID string) (*domain.ReviewNotificationContext, error) {
	if f.reviewCtxFn != nil {
		return f.reviewCtxFn(ctx, reviewID)
	}
	return nil, nil
}

type fakeBroadcaster struct {
	onlineUsers map[string]bool
	broadcasts  []struct {
		recipientID string
		item        *domain.NotificationItem
	}
	err error
}

func (b *fakeBroadcaster) BroadcastNotification(_ context.Context, recipientID string, notification *domain.NotificationItem) error {
	b.broadcasts = append(b.broadcasts, struct {
		recipientID string
		item        *domain.NotificationItem
	}{recipientID: recipientID, item: notification})
	return b.err
}

func (b *fakeBroadcaster) IsUserOnline(userID string) bool {
	return b.onlineUsers[userID]
}

func TestNotificationService_ListValidatesCategoryAndNormalizesPagination(t *testing.T) {
	ctx := context.Background()
	userID := uuid.NewString()
	repo := &fakeNotificationRepo{
		listFn: func(_ context.Context, rID, cat string, limit, offset int) (*domain.NotificationsListResult, error) {
			assert.Equal(t, userID, rID)
			assert.Equal(t, "order", cat)
			assert.Equal(t, 20, limit)
			assert.Equal(t, 0, offset)
			return &domain.NotificationsListResult{Items: []domain.NotificationItem{}, UnreadCount: 3}, nil
		},
	}
	svc := notifuc.NewService(repo, nil, nil)

	res, err := svc.ListNotifications(ctx, userID, "order", -1, -10)
	require.NoError(t, err)
	assert.Equal(t, 3, res.UnreadCount)

	_, err = svc.ListNotifications(ctx, userID, "invalid_cat", 20, 0)
	var filterErr *domain.FilterValidationError
	require.ErrorAs(t, err, &filterErr)
	assert.Equal(t, "Danh mục thông báo không hợp lệ", filterErr.Fields["category"])
}

func TestNotificationService_PublishersAndOnlineLiveBroadcast(t *testing.T) {
	ctx := context.Background()
	custID := uuid.NewString()
	offlineCustID := uuid.NewString()
	adminID := uuid.NewString()
	orderID := "a1b2c3d4-0000-0000-0000-000000000001"
	returnID := uuid.NewString()
	reviewID := uuid.NewString()
	productID := uuid.NewString()
	sessionID := uuid.NewString()

	broadcaster := &fakeBroadcaster{
		onlineUsers: map[string]bool{
			custID:  true,
			adminID: true,
		},
	}
	repo := &fakeNotificationRepo{
		createForAdminsFn: func(_ context.Context, input domain.CreateNotificationInput) ([]domain.NotificationItem, error) {
			return []domain.NotificationItem{{
				ID:               uuid.NewString(),
				RecipientID:      adminID,
				ActorID:          input.ActorID,
				Category:         input.Category,
				NotificationType: input.NotificationType,
				Excerpt:          input.Excerpt,
				Metadata:         input.Metadata,
			}}, nil
		},
		reviewCtxFn: func(_ context.Context, rID string) (*domain.ReviewNotificationContext, error) {
			require.Equal(t, reviewID, rID)
			return &domain.ReviewNotificationContext{
				ReviewID:    reviewID,
				CustomerID:  custID,
				OrderID:     orderID,
				ProductID:   productID,
				ProductName: "iPhone 16 Pro",
			}, nil
		},
		batchLiveFn: func(_ context.Context, excerpt string, metadata map[string]interface{}) ([]domain.NotificationItem, error) {
			return []domain.NotificationItem{
				{ID: uuid.NewString(), RecipientID: custID, Category: domain.NotificationCategoryLive, NotificationType: domain.NotificationTypeLivestreamStarted, Excerpt: excerpt, Metadata: metadata},
				{ID: uuid.NewString(), RecipientID: offlineCustID, Category: domain.NotificationCategoryLive, NotificationType: domain.NotificationTypeLivestreamStarted, Excerpt: excerpt, Metadata: metadata},
			}, nil
		},
	}

	svc := notifuc.NewService(repo, broadcaster, slog.Default())

	// Admin order created
	svc.NotifyOrderCreated(ctx, &domain.Order{ID: orderID, UserID: custID, Status: domain.OrderStatusPendingConfirmation, TotalVND: "25000000"})
	require.Len(t, repo.adminFanoutInputs, 1)
	assert.Equal(t, domain.NotificationTypeAdminOrderCreated, repo.adminFanoutInputs[0].NotificationType)
	assert.Equal(t, "/orders/"+orderID, repo.adminFanoutInputs[0].Metadata["targetPath"])

	// Customer transition
	svc.NotifyOrderTransition(ctx, &domain.Order{ID: orderID, UserID: custID, Status: domain.OrderStatusShipped}, domain.OrderAdminActionShip)
	// Return rejected with reason
	svc.NotifyReturnStatusChanged(ctx, &domain.ReturnRequest{
		ID:           returnID,
		OrderID:      orderID,
		UserID:       custID,
		Status:       domain.ReturnStatusRejected,
		RejectReason: "Hộp không còn nguyên seal",
	})
	// Review replied
	svc.NotifyReviewReplied(ctx, &domain.Review{ID: reviewID}, strings.Repeat("Cảm ơn bạn đã ủng hộ! ", 6))
	// Live started -> only online user receives WS push
	svc.NotifyLivestreamStarted(ctx, &domain.AdminLiveSession{LiveSessionView: domain.LiveSessionView{ID: sessionID, Title: "Deal 11.11"}})

	var pushedToOffline bool
	var pushedLiveToOnline bool
	for _, call := range broadcaster.broadcasts {
		if call.recipientID == offlineCustID {
			pushedToOffline = true
		}
		if call.recipientID == custID && call.item.NotificationType == domain.NotificationTypeLivestreamStarted {
			pushedLiveToOnline = true
		}
	}
	assert.False(t, pushedToOffline, "offline customer should not receive live WS push")
	assert.True(t, pushedLiveToOnline, "online customer should receive live WS push")
}

func TestNotificationService_SwallowsErrorsAndLogsWarning(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn}))

	repo := &fakeNotificationRepo{
		createSingleFn: func(_ context.Context, _ domain.CreateNotificationInput) (*domain.NotificationItem, error) {
			return nil, errors.New("db unavailable")
		},
	}
	broadcaster := &fakeBroadcaster{err: errors.New("ws broken")}
	svc := notifuc.NewService(repo, broadcaster, log)

	assert.NotPanics(t, func() {
		svc.NotifyOrderTransition(context.Background(), &domain.Order{
			ID:     uuid.NewString(),
			UserID: uuid.NewString(),
			Status: domain.OrderStatusDelivered,
		}, domain.OrderAdminActionDeliver)
	})
	assert.Contains(t, buf.String(), "notification")
}

func TestNotificationService_MomoNotifications(t *testing.T) {
	ctx := context.Background()
	custID := uuid.NewString()
	orderID := "a1b2c3d4-0000-0000-0000-000000000099"

	repo := &fakeNotificationRepo{}
	broadcaster := &fakeBroadcaster{
		onlineUsers: map[string]bool{custID: true},
	}
	svc := notifuc.NewService(repo, broadcaster, slog.Default())

	svc.NotifyOrderMomoPaid(ctx, &domain.Order{
		ID:       orderID,
		UserID:   custID,
		Status:   domain.OrderStatusConfirmed,
		TotalVND: "3190000",
	})
	svc.NotifyOrderPaymentExpired(ctx, []domain.AutoConfirmedOrder{
		{ID: orderID, UserID: custID, TotalVND: "3190000"},
	})

	require.Len(t, repo.singleInputs, 2)
	paidNotif := repo.singleInputs[0]
	assert.Equal(t, domain.NotificationCategoryOrder, paidNotif.Category)
	assert.Equal(t, domain.NotificationTypeOrderConfirmed, paidNotif.NotificationType)
	assert.Nil(t, paidNotif.ActorID)
	assert.Equal(t, "Thanh toán MoMo thành công. Đơn hàng #A1B2C3D4 đã được xác nhận.", paidNotif.Excerpt)
	assert.Equal(t, "/orders/"+orderID, paidNotif.Metadata["targetPath"])

	expiredNotif := repo.singleInputs[1]
	assert.Equal(t, domain.NotificationCategoryOrder, expiredNotif.Category)
	assert.Equal(t, domain.NotificationTypeOrderPaymentExpired, expiredNotif.NotificationType)
	assert.Nil(t, expiredNotif.ActorID)
	assert.Equal(t, "cancelled", expiredNotif.Metadata["status"])
	assert.Equal(t, "Đơn hàng #A1B2C3D4 đã tự động hủy do quá thời hạn thanh toán MoMo.", expiredNotif.Excerpt)
	assert.Equal(t, "/orders/"+orderID, expiredNotif.Metadata["targetPath"])

	require.Len(t, broadcaster.broadcasts, 2)
}
