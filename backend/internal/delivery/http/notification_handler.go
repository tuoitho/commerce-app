package http

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type notificationHandler struct {
	uc domain.PostUseCase
}

func newNotificationHandler(uc domain.PostUseCase) *notificationHandler {
	return &notificationHandler{uc: uc}
}

func (h *notificationHandler) listNotifications(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	res, err := h.uc.ListNotifications(c.Request.Context(), userID, limit, offset)
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
