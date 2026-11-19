package notification

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type Service struct {
	repo          domain.NotificationRepository
	broadcaster   domain.NotificationBroadcaster
	onlineChecker domain.OnlineChecker
	logger        *slog.Logger
}

var _ domain.NotificationUseCase = (*Service)(nil)
var _ domain.NotificationPublisher = (*Service)(nil)
var _ domain.MomoNotificationPublisher = (*Service)(nil)

func NewService(
	repo domain.NotificationRepository,
	broadcaster domain.NotificationBroadcaster,
	logger *slog.Logger,
) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	var onlineChecker domain.OnlineChecker
	if checker, ok := broadcaster.(domain.OnlineChecker); ok && checker != nil {
		onlineChecker = checker
	}
	return &Service{
		repo:          repo,
		broadcaster:   broadcaster,
		onlineChecker: onlineChecker,
		logger:        logger,
	}
}

func (s *Service) ListNotifications(
	ctx context.Context,
	recipientID, category string,
	limit, offset int,
) (*domain.NotificationsListResult, error) {
	if strings.TrimSpace(recipientID) == "" {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(recipientID); err != nil {
		return nil, domain.ErrInvalidToken
	}

	trimmedCategory := strings.TrimSpace(category)
	if trimmedCategory != "" && !domain.NotificationCategory(trimmedCategory).IsValid() {
		return nil, domain.NewFilterValidationError(map[string]string{
			"category": "Danh mục thông báo không hợp lệ",
		})
	}

	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	return s.repo.ListNotificationsByCategory(ctx, recipientID, trimmedCategory, limit, offset)
}

func (s *Service) MarkNotificationRead(ctx context.Context, recipientID, notificationID string) (*domain.NotificationItem, int, error) {
	if strings.TrimSpace(recipientID) == "" {
		return nil, 0, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(recipientID); err != nil {
		return nil, 0, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(notificationID); err != nil {
		return nil, 0, domain.ErrNotificationNotFound
	}

	item, err := s.repo.MarkNotificationRead(ctx, notificationID, recipientID)
	if err != nil {
		return nil, 0, err
	}

	count, err := s.repo.GetUnreadNotificationCount(ctx, recipientID)
	if err != nil {
		return nil, 0, err
	}

	return item, count, nil
}

func (s *Service) MarkAllNotificationsRead(ctx context.Context, recipientID string) (int, error) {
	if strings.TrimSpace(recipientID) == "" {
		return 0, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(recipientID); err != nil {
		return 0, domain.ErrInvalidToken
	}

	if err := s.repo.MarkAllNotificationsRead(ctx, recipientID); err != nil {
		return 0, err
	}

	return 0, nil
}

func (s *Service) pushNotification(ctx context.Context, item *domain.NotificationItem) {
	if item == nil || s.broadcaster == nil {
		return
	}
	if err := s.broadcaster.BroadcastNotification(ctx, item.RecipientID, item); err != nil {
		s.logger.Warn("notification websocket broadcast failed",
			"notification_type", string(item.NotificationType),
			"recipient_id", item.RecipientID,
			"error", err,
		)
	}
}

func (s *Service) emitSingle(ctx context.Context, input domain.CreateNotificationInput) {
	if s.repo == nil || strings.TrimSpace(input.RecipientID) == "" {
		return
	}
	item, err := s.repo.CreateSystemNotification(ctx, input)
	if err != nil {
		s.logger.Warn("notification persistence failed",
			"notification_type", string(input.NotificationType),
			"recipient_id", input.RecipientID,
			"error", err,
		)
		return
	}
	s.pushNotification(ctx, item)
}

func (s *Service) emitAdmins(ctx context.Context, input domain.CreateNotificationInput) {
	if s.repo == nil {
		return
	}
	items, err := s.repo.CreateSystemNotificationsForActiveAdmins(ctx, input)
	if err != nil {
		s.logger.Warn("notification admin fanout failed",
			"notification_type", string(input.NotificationType),
			"error", err,
		)
		return
	}
	for i := range items {
		s.pushNotification(ctx, &items[i])
	}
}

func truncateNotificationExcerpt(text string, maxRunes int) string {
	trimmed := strings.TrimSpace(text)
	runes := []rune(trimmed)
	if len(runes) <= maxRunes {
		return trimmed
	}
	return string(runes[:maxRunes]) + "..."
}

func (s *Service) NotifyOrderCreated(ctx context.Context, order *domain.Order) {
	if order == nil || order.ID == "" || order.UserID == "" {
		return
	}
	code := domain.OrderShortCode(order.ID)
	actorID := order.UserID
	s.emitAdmins(ctx, domain.CreateNotificationInput{
		ActorID:          &actorID,
		Category:         domain.NotificationCategoryOrder,
		NotificationType: domain.NotificationTypeAdminOrderCreated,
		Excerpt:          fmt.Sprintf("Đơn hàng mới %s", code),
		Metadata: map[string]interface{}{
			"orderId":        order.ID,
			"orderShortCode": code,
			"status":         string(order.Status),
			"totalVnd":       string(order.TotalVND),
			"targetPath":     "/orders/" + order.ID,
		},
	})
}

func (s *Service) NotifyOrderCustomerCancelled(ctx context.Context, order *domain.Order) {
	if order == nil || order.ID == "" || order.UserID == "" {
		return
	}
	var notifType domain.NotificationType
	var excerpt string
	code := domain.OrderShortCode(order.ID)

	switch order.Status {
	case domain.OrderStatusCancelRequested:
		notifType = domain.NotificationTypeAdminOrderCancelRequested
		excerpt = fmt.Sprintf("Yêu cầu hủy đơn hàng %s", code)
	case domain.OrderStatusCancelled:
		notifType = domain.NotificationTypeAdminOrderCancelled
		excerpt = fmt.Sprintf("Đã hủy đơn hàng %s", code)
	default:
		return
	}

	actorID := order.UserID
	s.emitAdmins(ctx, domain.CreateNotificationInput{
		ActorID:          &actorID,
		Category:         domain.NotificationCategoryOrder,
		NotificationType: notifType,
		Excerpt:          excerpt,
		Metadata: map[string]interface{}{
			"orderId":        order.ID,
			"orderShortCode": code,
			"status":         string(order.Status),
			"totalVnd":       string(order.TotalVND),
			"targetPath":     "/orders/" + order.ID,
		},
	})
}

func (s *Service) NotifyOrderTransition(ctx context.Context, order *domain.Order, action domain.OrderAdminAction) {
	if order == nil || order.ID == "" || order.UserID == "" {
		return
	}
	code := domain.OrderShortCode(order.ID)
	var notifType domain.NotificationType
	var excerpt string

	var carrier string
	if order.Carrier != nil {
		carrier = strings.TrimSpace(*order.Carrier)
	}
	var trackingCode string
	if order.TrackingCode != nil {
		trackingCode = strings.TrimSpace(*order.TrackingCode)
	}

	switch action {
	case domain.OrderAdminActionConfirmPreparing:
		notifType = domain.NotificationTypeOrderPreparing
		excerpt = fmt.Sprintf("Đơn hàng %s đang được cửa hàng chuẩn bị.", code)
	case domain.OrderAdminActionShip:
		notifType = domain.NotificationTypeOrderShipped
		switch {
		case carrier != "" && trackingCode != "":
			excerpt = fmt.Sprintf("Đơn hàng %s đã được bàn giao cho %s (mã vận đơn: %s).", code, carrier, trackingCode)
		case carrier != "":
			excerpt = fmt.Sprintf("Đơn hàng %s đã được bàn giao cho %s.", code, carrier)
		default:
			excerpt = fmt.Sprintf("Đơn hàng %s đã được bàn giao cho đơn vị vận chuyển.", code)
		}
	case domain.OrderAdminActionDeliver:
		notifType = domain.NotificationTypeOrderDelivered
		excerpt = fmt.Sprintf("Đơn hàng %s đã giao thành công.", code)
	case domain.OrderAdminActionApproveCancel:
		notifType = domain.NotificationTypeOrderCancelApproved
		excerpt = fmt.Sprintf("Yêu cầu hủy đơn hàng %s đã được chấp nhận.", code)
	case domain.OrderAdminActionDeclineCancel:
		notifType = domain.NotificationTypeOrderCancelDeclined
		excerpt = fmt.Sprintf("Yêu cầu hủy đơn %s chưa được duyệt, đơn tiếp tục được xử lý.", code)
	default:
		return
	}

	meta := map[string]interface{}{
		"orderId":        order.ID,
		"orderShortCode": code,
		"status":         string(order.Status),
		"targetPath":     "/orders/" + order.ID,
	}
	if order.TotalVND != "" {
		meta["totalVnd"] = string(order.TotalVND)
	}
	if action == domain.OrderAdminActionShip {
		if carrier != "" {
			meta["carrier"] = carrier
		}
		if trackingCode != "" {
			meta["trackingCode"] = trackingCode
		}
	}

	s.emitSingle(ctx, domain.CreateNotificationInput{
		RecipientID:      order.UserID,
		ActorID:          nil,
		Category:         domain.NotificationCategoryOrder,
		NotificationType: notifType,
		Excerpt:          excerpt,
		Metadata:         meta,
	})
}

func (s *Service) emitOrderBatchNotifications(
	ctx context.Context,
	orders []domain.AutoConfirmedOrder,
	status domain.OrderStatus,
	notifType domain.NotificationType,
	buildExcerpt func(code string) string,
) {
	for _, o := range orders {
		if o.ID == "" || o.UserID == "" {
			continue
		}
		code := domain.OrderShortCode(o.ID)
		meta := map[string]interface{}{
			"orderId":        o.ID,
			"orderShortCode": code,
			"status":         string(status),
			"targetPath":     "/orders/" + o.ID,
		}
		if o.TotalVND != "" {
			meta["totalVnd"] = string(o.TotalVND)
		}
		s.emitSingle(ctx, domain.CreateNotificationInput{
			RecipientID:      o.UserID,
			ActorID:          nil,
			Category:         domain.NotificationCategoryOrder,
			NotificationType: notifType,
			Excerpt:          buildExcerpt(code),
			Metadata:         meta,
		})
	}
}

func (s *Service) NotifyOrderAutoConfirmed(ctx context.Context, orders []domain.AutoConfirmedOrder) {
	s.emitOrderBatchNotifications(ctx, orders, domain.OrderStatusConfirmed, domain.NotificationTypeOrderConfirmed, func(code string) string {
		return fmt.Sprintf("Đơn hàng %s đã được xác nhận tự động.", code)
	})
}

func (s *Service) NotifyOrderMomoPaid(ctx context.Context, order *domain.Order) {
	if order == nil || order.ID == "" || order.UserID == "" {
		return
	}
	code := domain.OrderShortCode(order.ID)
	meta := map[string]interface{}{
		"orderId":        order.ID,
		"orderShortCode": code,
		"status":         string(order.Status),
		"targetPath":     "/orders/" + order.ID,
	}
	if order.TotalVND != "" {
		meta["totalVnd"] = string(order.TotalVND)
	}
	s.emitSingle(ctx, domain.CreateNotificationInput{
		RecipientID:      order.UserID,
		ActorID:          nil,
		Category:         domain.NotificationCategoryOrder,
		NotificationType: domain.NotificationTypeOrderConfirmed,
		Excerpt:          fmt.Sprintf("Thanh toán MoMo thành công. Đơn hàng %s đã được xác nhận.", code),
		Metadata:         meta,
	})
}

func (s *Service) NotifyOrderPaymentExpired(ctx context.Context, orders []domain.AutoConfirmedOrder) {
	s.emitOrderBatchNotifications(ctx, orders, domain.OrderStatusCancelled, domain.NotificationTypeOrderPaymentExpired, func(code string) string {
		return fmt.Sprintf("Đơn hàng %s đã tự động hủy do quá thời hạn thanh toán MoMo.", code)
	})
}

func (s *Service) NotifyReturnCreated(ctx context.Context, ret *domain.ReturnRequest) {
	if ret == nil || ret.ID == "" || ret.OrderID == "" || ret.UserID == "" {
		return
	}
	code := domain.OrderShortCode(ret.OrderID)
	actorID := ret.UserID
	s.emitAdmins(ctx, domain.CreateNotificationInput{
		ActorID:          &actorID,
		Category:         domain.NotificationCategoryReturn,
		NotificationType: domain.NotificationTypeAdminReturnCreated,
		Excerpt:          fmt.Sprintf("Yêu cầu trả hàng mới cho đơn %s", code),
		Metadata: map[string]interface{}{
			"returnId":       ret.ID,
			"orderId":        ret.OrderID,
			"orderShortCode": code,
			"status":         string(ret.Status),
			"targetPath":     "/returns/" + ret.ID,
		},
	})
}

func (s *Service) NotifyReturnStatusChanged(ctx context.Context, ret *domain.ReturnRequest) {
	if ret == nil || ret.ID == "" || ret.OrderID == "" || ret.UserID == "" {
		return
	}
	code := domain.OrderShortCode(ret.OrderID)
	meta := map[string]interface{}{
		"returnId":       ret.ID,
		"orderId":        ret.OrderID,
		"orderShortCode": code,
		"status":         string(ret.Status),
		"targetPath":     "/orders/" + ret.OrderID,
	}

	var notifType domain.NotificationType
	var excerpt string
	switch ret.Status {
	case domain.ReturnStatusApproved:
		notifType = domain.NotificationTypeReturnApproved
		excerpt = fmt.Sprintf("Yêu cầu trả hàng cho đơn %s đã được duyệt.", code)
	case domain.ReturnStatusRejected:
		notifType = domain.NotificationTypeReturnRejected
		reason := truncateNotificationExcerpt(ret.RejectReason, 80)
		excerpt = fmt.Sprintf("Yêu cầu trả hàng cho đơn %s bị từ chối: %s", code, reason)
		meta["rejectReason"] = ret.RejectReason
	case domain.ReturnStatusReceived:
		notifType = domain.NotificationTypeReturnReceived
		excerpt = fmt.Sprintf("Cửa hàng đã nhận được hàng hoàn cho đơn %s.", code)
	case domain.ReturnStatusRefunded:
		notifType = domain.NotificationTypeReturnRefunded
		excerpt = fmt.Sprintf("Yêu cầu trả hàng đơn %s đã được hoàn tiền.", code)
		if ret.RefundAmountVND != nil {
			meta["refundAmountVnd"] = string(*ret.RefundAmountVND)
		} else if ret.ExpectedRefundVND != "" {
			meta["refundAmountVnd"] = string(ret.ExpectedRefundVND)
		}
	default:
		return
	}

	s.emitSingle(ctx, domain.CreateNotificationInput{
		RecipientID:      ret.UserID,
		ActorID:          nil,
		Category:         domain.NotificationCategoryReturn,
		NotificationType: notifType,
		Excerpt:          excerpt,
		Metadata:         meta,
	})
}

func (s *Service) NotifyReviewReplied(ctx context.Context, review *domain.Review, replyText string) {
	if s.repo == nil || review == nil || review.ID == "" {
		return
	}
	trimmedReply := strings.TrimSpace(replyText)
	if trimmedReply == "" {
		return
	}

	revCtx, err := s.repo.GetReviewNotificationContext(ctx, review.ID)
	if err != nil {
		s.logger.Warn("notification review context lookup failed",
			"notification_type", string(domain.NotificationTypeReviewReplied),
			"review_id", review.ID,
			"error", err,
		)
		return
	}
	if revCtx == nil || revCtx.CustomerID == "" {
		return
	}

	s.emitSingle(ctx, domain.CreateNotificationInput{
		RecipientID:      revCtx.CustomerID,
		ActorID:          nil,
		Category:         domain.NotificationCategoryReview,
		NotificationType: domain.NotificationTypeReviewReplied,
		Excerpt:          truncateNotificationExcerpt(trimmedReply, 100),
		Metadata: map[string]interface{}{
			"reviewId":    revCtx.ReviewID,
			"orderId":     revCtx.OrderID,
			"productId":   revCtx.ProductID,
			"productName": revCtx.ProductName,
			"targetPath":  "/reviews",
		},
	})
}

func (s *Service) NotifyLivestreamStarted(ctx context.Context, session *domain.AdminLiveSession) {
	if s.repo == nil || session == nil || session.ID == "" {
		return
	}
	excerpt := fmt.Sprintf("Phiên livestream %q đang phát trực tiếp.", session.Title)
	meta := map[string]interface{}{
		"sessionId":    session.ID,
		"sessionTitle": session.Title,
		"status":       string(domain.LiveStatusLive),
		"targetPath":   "/live/" + session.ID,
	}

	items, err := s.repo.BatchCreateCustomerLiveNotifications(ctx, excerpt, meta)
	if err != nil {
		s.logger.Warn("notification livestream batch persist failed",
			"notification_type", string(domain.NotificationTypeLivestreamStarted),
			"session_id", session.ID,
			"error", err,
		)
		return
	}

	for i := range items {
		if s.onlineChecker != nil && !s.onlineChecker.IsUserOnline(items[i].RecipientID) {
			continue
		}
		s.pushNotification(ctx, &items[i])
	}
}
