package http

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
)

type chatAdminHandler struct {
	uc domain.ChatUseCase
}

func newChatAdminHandler(uc domain.ChatUseCase) *chatAdminHandler {
	return &chatAdminHandler{uc: uc}
}

func (h *chatAdminHandler) listConversations(c *gin.Context) {
	status := strings.TrimSpace(c.Query("status"))
	if status == "" {
		status = strings.TrimSpace(c.Query("filter"))
	}
	if status == "" {
		status = "all"
	}

	fields := map[string]string{}
	if status != "all" && status != "unread" {
		fields["status"] = "Trạng thái lọc không hợp lệ (chỉ chấp nhận 'all' hoặc 'unread')"
	}

	page := 1
	limit := 20

	if pageStr, ok := c.GetQuery("page"); ok {
		if pageStr == "" {
			fields["page"] = "must not be empty"
		} else {
			p, err := strconv.Atoi(pageStr)
			if err != nil || p < 1 {
				fields["page"] = "must be a positive integer"
			} else {
				page = p
			}
		}
	}

	if limitStr, ok := c.GetQuery("limit"); ok {
		if limitStr == "" {
			fields["limit"] = "must not be empty"
		} else {
			l, err := strconv.Atoi(limitStr)
			if err != nil || l < 1 || l > 100 {
				fields["limit"] = "must be a positive integer between 1 and 100"
			} else {
				limit = l
			}
		}
	}

	offset := (page - 1) * limit
	if offsetStr, ok := c.GetQuery("offset"); ok {
		if offsetStr == "" {
			fields["offset"] = "must not be empty"
		} else {
			o, err := strconv.Atoi(offsetStr)
			if err != nil || o < 0 {
				fields["offset"] = "must be a non-negative integer"
			} else {
				offset = o
			}
		}
	}

	if len(fields) > 0 {
		writeError(c, domain.NewValidationError(fields))
		return
	}

	search := strings.TrimSpace(c.Query("search"))

	convs, total, err := h.uc.ListAdminConversations(c.Request.Context(), domain.AdminConversationFilter{
		Status: status,
		Search: search,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		writeError(c, err)
		return
	}

	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}
	curPage := (offset / limit) + 1
	pagination := PaginationMeta{
		Page:       curPage,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    curPage < totalPages,
		HasPrev:    curPage > 1,
	}

	writePaginatedSuccess(c, http.StatusOK, "Lấy danh sách cuộc hội thoại thành công", convs, pagination)
}

func (h *chatAdminHandler) listMessages(c *gin.Context) {
	conversationID := c.Param("id")

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	messages, err := h.uc.ListAdminMessages(c.Request.Context(), conversationID, limit, offset)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy danh sách tin nhắn thành công", messages)
}

type sendAdminReplyRequest struct {
	Content       string   `json:"content"`
	AttachmentIDs []string `json:"attachmentIds"`
}

func (h *chatAdminHandler) sendMessage(c *gin.Context) {
	conversationID := c.Param("id")
	adminID := callerUserID(c)
	if adminID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	var req sendAdminReplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"body": "Dữ liệu yêu cầu không hợp lệ",
		}))
		return
	}

	attachmentIDs := req.AttachmentIDs
	if attachmentIDs == nil {
		attachmentIDs = []string{}
	}

	msg, err := h.uc.SendAdminReply(c.Request.Context(), adminID, conversationID, req.Content, attachmentIDs)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Gửi tin nhắn phản hồi thành công", msg)
}

func (h *chatAdminHandler) markRead(c *gin.Context) {
	conversationID := c.Param("id")

	if err := h.uc.MarkAdminConversationRead(c.Request.Context(), conversationID); err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Đánh dấu đã đọc thành công", gin.H{"read": true})
}
