package domain

import (
	"context"
	"strings"
	"time"
)

const (
	NotificationCategoryOrder  NotificationCategory = "order"
	NotificationCategoryReturn NotificationCategory = "return"
	NotificationCategoryReview NotificationCategory = "review"
	NotificationCategoryLive   NotificationCategory = "live"
)

// IsValid reports whether c is one of the 5 system-wide notification categories.
func (c NotificationCategory) IsValid() bool {
	switch c {
	case NotificationCategoryPost,
		NotificationCategoryOrder,
		NotificationCategoryReturn,
		NotificationCategoryReview,
		NotificationCategoryLive:
		return true
	default:
		return false
	}
}

// NotificationType aliases PostNotificationType so all post and system-wide notification
// constants share the exact same underlying type across existing contracts.
type NotificationType = PostNotificationType

const (
	NotificationTypeOrderConfirmed      NotificationType = "order_confirmed"
	NotificationTypeOrderPaymentExpired NotificationType = "order_payment_expired"
	NotificationTypeOrderPreparing      NotificationType = "order_preparing"
	NotificationTypeOrderShipped        NotificationType = "order_shipped"
	NotificationTypeOrderDelivered      NotificationType = "order_delivered"
	NotificationTypeOrderCancelApproved NotificationType = "order_cancel_approved"
	NotificationTypeOrderCancelDeclined NotificationType = "order_cancel_declined"

	NotificationTypeReturnApproved NotificationType = "return_approved"
	NotificationTypeReturnRejected NotificationType = "return_rejected"
	NotificationTypeReturnReceived NotificationType = "return_received"
	NotificationTypeReturnRefunded NotificationType = "return_refunded"

	NotificationTypeReviewReplied NotificationType = "review_replied"

	NotificationTypeLivestreamStarted NotificationType = "livestream_started"

	NotificationTypeAdminOrderCreated         NotificationType = "admin_order_created"
	NotificationTypeAdminOrderCancelRequested NotificationType = "admin_order_cancel_requested"
	NotificationTypeAdminOrderCancelled       NotificationType = "admin_order_cancelled"
	NotificationTypeAdminReturnCreated        NotificationType = "admin_return_created"
)

// OrderShortCode formats an uppercase 8-character reference code for notification copy.
func OrderShortCode(orderID string) string {
	clean := strings.ReplaceAll(strings.TrimSpace(orderID), "-", "")
	if clean == "" {
		return "#ORDER"
	}
	if len(clean) > 8 {
		clean = clean[:8]
	}
	return "#" + strings.ToUpper(clean)
}

type ReviewNotificationContext struct {
	ReviewID    string
	CustomerID  string
	OrderID     string
	ProductID   string
	ProductName string
}

type AutoConfirmedOrder struct {
	ID       string
	UserID   string
	TotalVND MoneyVND
}

// AutoConfirmReturningRepository is implemented by repositories that return
// orders transitioned by AutoConfirmDue so callers can emit notifications.
type AutoConfirmReturningRepository interface {
	AutoConfirmDueReturning(ctx context.Context, cutoff time.Time) ([]AutoConfirmedOrder, error)
}

// OnlineChecker lets NotificationPublisher push bulk notifications only to online clients.
type OnlineChecker interface {
	IsUserOnline(userID string) bool
}

type NotificationRepository interface {
	ListNotificationsByCategory(ctx context.Context, recipientID, category string, limit, offset int) (*NotificationsListResult, error)
	MarkNotificationRead(ctx context.Context, notificationID, recipientID string) (*NotificationItem, error)
	MarkAllNotificationsRead(ctx context.Context, recipientID string) error
	GetUnreadNotificationCount(ctx context.Context, recipientID string) (int, error)
	CreateSystemNotification(ctx context.Context, input CreateNotificationInput) (*NotificationItem, error)
	CreateSystemNotificationsForActiveAdmins(ctx context.Context, input CreateNotificationInput) ([]NotificationItem, error)
	BatchCreateCustomerLiveNotifications(ctx context.Context, excerpt string, metadata map[string]interface{}) ([]NotificationItem, error)
	GetReviewNotificationContext(ctx context.Context, reviewID string) (*ReviewNotificationContext, error)
}

type NotificationUseCase interface {
	ListNotifications(ctx context.Context, recipientID, category string, limit, offset int) (*NotificationsListResult, error)
	MarkNotificationRead(ctx context.Context, recipientID, notificationID string) (*NotificationItem, int, error)
	MarkAllNotificationsRead(ctx context.Context, recipientID string) (int, error)
}

type NotificationPublisher interface {
	NotifyOrderCreated(ctx context.Context, order *Order)
	NotifyOrderCustomerCancelled(ctx context.Context, order *Order)
	NotifyOrderTransition(ctx context.Context, order *Order, action OrderAdminAction)
	NotifyOrderAutoConfirmed(ctx context.Context, orders []AutoConfirmedOrder)
	NotifyReturnCreated(ctx context.Context, ret *ReturnRequest)
	NotifyReturnStatusChanged(ctx context.Context, ret *ReturnRequest)
	NotifyReviewReplied(ctx context.Context, review *Review, replyText string)
	NotifyLivestreamStarted(ctx context.Context, session *AdminLiveSession)
}

// MomoNotificationPublisher extends NotificationPublisher with MoMo payment lifecycle notifications.
type MomoNotificationPublisher interface {
	NotifyOrderMomoPaid(ctx context.Context, order *Order)
	NotifyOrderPaymentExpired(ctx context.Context, orders []AutoConfirmedOrder)
}
