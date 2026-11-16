package http

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type notificationHandler struct {
	uc domain.NotificationUseCase
}

func newNotificationHandler(uc domain.NotificationUseCase) *notificationHandler {
	return &notificationHandler{uc: uc}
}

// postNotificationAdapter preserves backward compatibility when tests wire only Dependencies.Post.
type postNotificationAdapter struct {
	postUC domain.PostUseCase
}

func (a *postNotificationAdapter) ListNotifications(ctx context.Context, recipientID, category string, limit, offset int) (*domain.NotificationsListResult, error) {
	trimmed := strings.TrimSpace(category)
	if trimmed != "" && !domain.NotificationCategory(trimmed).IsValid() {
		return nil, domain.NewFilterValidationError(map[string]string{
			"category": "Danh mục thông báo không hợp lệ",
		})
	}
	res, err := a.postUC.ListNotifications(ctx, recipientID, limit, offset)
	if err != nil || res == nil || trimmed == "" {
		return res, err
	}
	filtered := make([]domain.NotificationItem, 0, len(res.Items))
	for _, item := range res.Items {
		if string(item.Category) == trimmed {
			filtered = append(filtered, item)
		}
	}
	return &domain.NotificationsListResult{
		Items:       filtered,
		UnreadCount: res.UnreadCount,
	}, nil
}

func (a *postNotificationAdapter) MarkNotificationRead(ctx context.Context, recipientID, notificationID string) (*domain.NotificationItem, int, error) {
	return a.postUC.MarkNotificationRead(ctx, recipientID, notificationID)
}

func (a *postNotificationAdapter) MarkAllNotificationsRead(ctx context.Context, recipientID string) (int, error) {
	return a.postUC.MarkAllNotificationsRead(ctx, recipientID)
}

func (h *notificationHandler) listNotifications(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	category := strings.TrimSpace(c.Query("category"))

	res, err := h.uc.ListNotifications(c.Request.Context(), userID, category, limit, offset)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy danh sách thông báo thành công", res)
}

func (h *notificationHandler) markRead(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	notifID := c.Param("id")
	if _, err := uuid.Parse(notifID); err != nil {
		writeError(c, domain.ErrNotificationNotFound)
		return
	}

	item, unreadCount, err := h.uc.MarkNotificationRead(c.Request.Context(), userID, notifID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Đánh dấu đã đọc thành công", gin.H{
		"id":          item.ID,
		"isRead":      item.IsRead,
		"unreadCount": unreadCount,
	})
}

func (h *notificationHandler) markAllRead(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	unreadCount, err := h.uc.MarkAllNotificationsRead(c.Request.Context(), userID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Đánh dấu tất cả đã đọc thành công", gin.H{
		"unreadCount": unreadCount,
	})
}
