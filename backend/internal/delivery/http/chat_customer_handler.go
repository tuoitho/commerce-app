package http

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
)

type chatCustomerHandler struct {
	uc domain.ChatUseCase
}

func newChatCustomerHandler(uc domain.ChatUseCase) *chatCustomerHandler {
	return &chatCustomerHandler{uc: uc}
}

func (h *chatCustomerHandler) getConversation(c *gin.Context) {
	customerID := callerUserID(c)
	if customerID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	conv, err := h.uc.GetOrCreateCustomerConversation(c.Request.Context(), customerID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy thông tin cuộc hội thoại thành công", conv)
}

func (h *chatCustomerHandler) listMessages(c *gin.Context) {
	customerID := callerUserID(c)
	if customerID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	messages, err := h.uc.ListCustomerMessages(c.Request.Context(), customerID, limit, offset)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy danh sách tin nhắn thành công", messages)
}

type sendCustomerMessageRequest struct {
	Content         string   `json:"content"`
	AttachedOrderID *string  `json:"attachedOrderId"`
	AttachmentIDs   []string `json:"attachmentIds"`
}

func (h *chatCustomerHandler) sendMessage(c *gin.Context) {
	customerID := callerUserID(c)
	if customerID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	var req sendCustomerMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"body": "Dữ liệu yêu cầu không hợp lệ",
		}))
		return
	}

	var attachedOrderID *string
	if req.AttachedOrderID != nil && strings.TrimSpace(*req.AttachedOrderID) != "" {
		trimmed := strings.TrimSpace(*req.AttachedOrderID)
		attachedOrderID = &trimmed
	}

	attachmentIDs := req.AttachmentIDs
	if attachmentIDs == nil {
		attachmentIDs = []string{}
	}

	msg, err := h.uc.SendCustomerMessage(c.Request.Context(), customerID, domain.SendMessageInput{
		Content:         req.Content,
		AttachedOrderID: attachedOrderID,
		AttachmentIDs:   attachmentIDs,
	})
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Gửi tin nhắn thành công", msg)
}

func (h *chatCustomerHandler) markRead(c *gin.Context) {
	customerID := callerUserID(c)
	if customerID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	if err := h.uc.MarkCustomerConversationRead(c.Request.Context(), customerID); err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Đánh dấu đã đọc thành công", gin.H{"read": true})
}

func (h *chatCustomerHandler) listOrders(c *gin.Context) {
	customerID := callerUserID(c)
	if customerID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	orders, err := h.uc.ListCustomerOrdersForChat(c.Request.Context(), customerID, limit)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy danh sách đơn hàng thành công", orders)
}
