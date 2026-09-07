package http

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"commerce-backend/internal/domain"
	chatuc "commerce-backend/internal/usecase/chat"
)

type chatHandler struct {
	uc  *chatuc.UseCase
	hub *WSHub
}

func newChatHandler(uc *chatuc.UseCase, hub *WSHub) *chatHandler {
	return &chatHandler{uc: uc, hub: hub}
}

type createConversationReq struct {
	OrderID *string `json:"orderId"`
}

func (h *chatHandler) CreateOrGetConversation(c *gin.Context) {
	callerID := callerUserID(c)
	if callerID == "" {
		respondError(c, http.StatusUnauthorized, "unauthorized", "Vui lòng đăng nhập để sử dụng tính năng nhắn tin", nil)
		return
	}

	conv, err := h.uc.GetOrCreateConversation(c.Request.Context(), callerID)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "internal", "Không thể khởi tạo cuộc hội thoại", nil)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy thông tin cuộc hội thoại thành công", conv)
}

func (h *chatHandler) ListCustomerConversations(c *gin.Context) {
	callerID := callerUserID(c)
	if callerID == "" {
		respondError(c, http.StatusUnauthorized, "unauthorized", "Vui lòng đăng nhập", nil)
		return
	}

	convs, err := h.uc.ListCustomerConversations(c.Request.Context(), callerID)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "internal", "Không thể lấy danh sách hội thoại", nil)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy danh sách hội thoại thành công", convs)
}

func (h *chatHandler) GetConversation(c *gin.Context) {
	callerID := callerUserID(c)
	callerRole := callerRole(c)
	convID := c.Param("id")

	if _, err := uuid.Parse(convID); err != nil {
		respondError(c, http.StatusNotFound, "not_found", "Cuộc hội thoại không tồn tại", nil)
		return
	}

	conv, err := h.uc.GetConversation(c.Request.Context(), convID, callerID, callerRole)
	if err != nil {
		if errors.Is(err, domain.ErrConversationNotFound) {
			respondError(c, http.StatusNotFound, "not_found", "Cuộc hội thoại không tồn tại", nil)
			return
		}
		if errors.Is(err, domain.ErrChatForbidden) {
			respondError(c, http.StatusForbidden, "forbidden", "Bạn không có quyền truy cập cuộc hội thoại này", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "internal", "Lỗi máy chủ nội bộ", nil)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy chi tiết hội thoại thành công", conv)
}

func (h *chatHandler) ListMessages(c *gin.Context) {
	callerID := callerUserID(c)
	callerRole := callerRole(c)
	convID := c.Param("id")

	if _, err := uuid.Parse(convID); err != nil {
		respondError(c, http.StatusNotFound, "not_found", "Cuộc hội thoại không tồn tại", nil)
		return
	}

	limit := 20
	if l := c.Query("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 && val <= 100 {
			limit = val
		}
	}

	var beforeTime *time.Time
	if b := c.Query("before"); b != "" {
		if t, err := time.Parse(time.RFC3339, b); err == nil {
			beforeTime = &t
		}
	}

	msgs, hasMore, err := h.uc.ListMessages(c.Request.Context(), convID, callerID, callerRole, limit, beforeTime)
	if err != nil {
		if errors.Is(err, domain.ErrConversationNotFound) {
			respondError(c, http.StatusNotFound, "not_found", "Cuộc hội thoại không tồn tại", nil)
			return
		}
		if errors.Is(err, domain.ErrChatForbidden) {
			respondError(c, http.StatusForbidden, "forbidden", "Bạn không có quyền xem tin nhắn của cuộc hội thoại này", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "internal", "Không thể lấy danh sách tin nhắn", nil)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Lấy danh sách tin nhắn thành công",
		"data":    msgs,
		"error":   nil,
		"meta": gin.H{
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"hasMore":   hasMore,
			"count":     len(msgs),
		},
	})
}

type sendMessageJSONReq struct {
	Content string  `json:"content"`
	OrderID *string `json:"orderId"`
}

func (h *chatHandler) SendMessage(c *gin.Context) {
	callerID := callerUserID(c)
	callerRole := callerRole(c)
	convID := c.Param("id")

	if _, err := uuid.Parse(convID); err != nil {
		respondError(c, http.StatusNotFound, "not_found", "Cuộc hội thoại không tồn tại", nil)
		return
	}

	var content string
	var orderIDPtr *string
	var uploadFiles []chatuc.FileUpload

	contentType := c.GetHeader("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		form, err := c.MultipartForm()
		if err != nil {
			respondError(c, http.StatusBadRequest, "validation_error", "Không thể đọc dữ liệu form multipart", nil)
			return
		}

		if val, exists := form.Value["content"]; exists && len(val) > 0 {
			content = val[0]
		}
		if val, exists := form.Value["orderId"]; exists && len(val) > 0 && val[0] != "" {
			orderIDPtr = &val[0]
		}

		if files, exists := form.File["files"]; exists {
			for _, fh := range files {
				file, err := fh.Open()
				if err != nil {
					respondError(c, http.StatusBadRequest, "validation_error", "Không thể mở tệp tải lên", nil)
					return
				}
				defer file.Close()
				uploadFiles = append(uploadFiles, chatuc.FileUpload{
					FileName: fh.Filename,
					Reader:   file,
					Size:     fh.Size,
				})
			}
		}
	} else {
		var req sendMessageJSONReq
		if err := c.ShouldBindJSON(&req); err != nil {
			respondError(c, http.StatusBadRequest, "validation_error", "Dữ liệu yêu cầu không hợp lệ", nil)
			return
		}
		content = req.Content
		if req.OrderID != nil && *req.OrderID != "" {
			orderIDPtr = req.OrderID
		}
	}

	if orderIDPtr != nil {
		if _, err := uuid.Parse(*orderIDPtr); err != nil {
			respondError(c, http.StatusBadRequest, "validation_error", "Mã đơn hàng không hợp lệ", nil)
			return
		}
	}

	msg, err := h.uc.SendMessage(c.Request.Context(), chatuc.SendMessageInput{
		ConversationID: convID,
		SenderID:       callerID,
		SenderRole:     callerRole,
		OrderID:        orderIDPtr,
		Content:        content,
		Files:          uploadFiles,
	})
	if err != nil {
		if errors.Is(err, domain.ErrConversationNotFound) {
			respondError(c, http.StatusNotFound, "not_found", "Cuộc hội thoại không tồn tại", nil)
			return
		}
		if errors.Is(err, domain.ErrChatForbidden) {
			respondError(c, http.StatusForbidden, "forbidden", "Bạn không có quyền gửi tin nhắn vào cuộc hội thoại này", nil)
			return
		}
		if errors.Is(err, domain.ErrOrderNotEligibleForChat) {
			respondError(c, http.StatusForbidden, "forbidden", "Đơn hàng không tồn tại hoặc bạn không có quyền truy cập", nil)
			return
		}
		if errors.Is(err, domain.ErrMessageEmpty) {
			respondError(c, http.StatusBadRequest, "validation_error", "Vui lòng nhập nội dung tin nhắn hoặc đính kèm tệp tin", nil)
			return
		}
		if errors.Is(err, domain.ErrInvalidMedia) {
			respondError(c, http.StatusBadRequest, "invalid_media_type", "Định dạng tệp không được hỗ trợ", nil)
			return
		}
		if errors.Is(err, domain.ErrMediaTooLarge) {
			respondError(c, http.StatusBadRequest, "file_too_large", "Kích thước tệp vượt quá giới hạn cho phép", nil)
			return
		}
		respondError(c, http.StatusBadRequest, "validation_error", err.Error(), nil)
		return
	}

	if h.hub != nil {
		h.hub.BroadcastNewMessage(msg)
	}

	writeSuccess(c, http.StatusCreated, "Gửi tin nhắn thành công", msg)
}

func (h *chatHandler) MarkAsRead(c *gin.Context) {
	callerID := callerUserID(c)
	callerRole := callerRole(c)
	convID := c.Param("id")

	if _, err := uuid.Parse(convID); err != nil {
		respondError(c, http.StatusNotFound, "not_found", "Cuộc hội thoại không tồn tại", nil)
		return
	}

	err := h.uc.MarkAsRead(c.Request.Context(), convID, callerID, callerRole)
	if err != nil {
		if errors.Is(err, domain.ErrConversationNotFound) {
			respondError(c, http.StatusNotFound, "not_found", "Cuộc hội thoại không tồn tại", nil)
			return
		}
		if errors.Is(err, domain.ErrChatForbidden) {
			respondError(c, http.StatusForbidden, "forbidden", "Bạn không có quyền thao tác trên cuộc hội thoại này", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "internal", "Không thể đánh dấu đã đọc", nil)
		return
	}

	if h.hub != nil {
		h.hub.BroadcastReadReceipt(convID, callerRole)
	}

	writeSuccess(c, http.StatusOK, "Đã đánh dấu đã đọc", gin.H{
		"conversationId":      convID,
		"customerUnreadCount": 0,
	})
}

func (h *chatHandler) GetCustomerTotalUnread(c *gin.Context) {
	callerID := callerUserID(c)
	if callerID == "" {
		respondError(c, http.StatusUnauthorized, "unauthorized", "Vui lòng đăng nhập", nil)
		return
	}

	total, err := h.uc.GetCustomerTotalUnread(c.Request.Context(), callerID)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "internal", "Không thể lấy số tin nhắn chưa đọc", nil)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy số tin nhắn chưa đọc thành công", gin.H{
		"totalUnread": total,
	})
}
