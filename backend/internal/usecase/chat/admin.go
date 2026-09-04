package chat

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

const (
	DefaultAdminConversationLimit = 20
	MaxAdminConversationLimit     = 100
)

func (uc *UseCase) ListAdminConversations(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
	status := strings.TrimSpace(filter.Status)
	if status == "" {
		status = "all"
	}
	filter.Status = status
	filter.Search = strings.TrimSpace(filter.Search)

	if filter.Limit <= 0 || filter.Limit > MaxAdminConversationLimit {
		filter.Limit = DefaultAdminConversationLimit
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}

	convs, total, err := uc.repo.ListConversationsForAdmin(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	if convs == nil {
		convs = []domain.Conversation{}
	}
	if uc.broadcaster != nil {
		for i := range convs {
			convs[i].IsOnline = uc.broadcaster.IsUserOnline(convs[i].UserID)
		}
	}
	return convs, total, nil
}

func (uc *UseCase) ListConversationsForAdmin(ctx context.Context, filter string, search string, limit, offset int) ([]domain.Conversation, error) {
	convs, _, err := uc.ListAdminConversations(ctx, domain.AdminConversationFilter{
		Status: filter,
		Search: search,
		Limit:  limit,
		Offset: offset,
	})
	return convs, err
}

func (uc *UseCase) ListAdminMessages(ctx context.Context, conversationID string, limit, offset int) ([]domain.ChatMessage, error) {
	cleanConvID := strings.TrimSpace(conversationID)
	if _, err := uuid.Parse(cleanConvID); err != nil {
		return nil, domain.ErrConversationNotFound
	}

	if _, err := uc.repo.GetConversationByID(ctx, cleanConvID); err != nil {
		return nil, domain.ErrConversationNotFound
	}

	if limit <= 0 || limit > MaxMessageLimit {
		limit = DefaultMessageLimit
	}
	if offset < 0 {
		offset = 0
	}

	messages, err := uc.repo.ListMessages(ctx, cleanConvID, limit, offset, domain.ChatSenderAdmin)
	if err != nil {
		return nil, err
	}
	if messages == nil {
		messages = []domain.ChatMessage{}
	}
	return messages, nil
}

func (uc *UseCase) ListAdminConversationMessages(ctx context.Context, conversationID string, limit, offset int) ([]domain.ChatMessage, error) {
	return uc.ListAdminMessages(ctx, conversationID, limit, offset)
}

func (uc *UseCase) SendAdminReply(ctx context.Context, adminID string, conversationID string, content string, attachmentIDs []string) (*domain.ChatMessage, error) {
	if strings.TrimSpace(adminID) == "" {
		return nil, domain.ErrInvalidToken
	}

	cleanConvID := strings.TrimSpace(conversationID)
	if _, err := uuid.Parse(cleanConvID); err != nil {
		return nil, domain.ErrConversationNotFound
	}

	if _, err := uc.repo.GetConversationByID(ctx, cleanConvID); err != nil {
		return nil, domain.ErrConversationNotFound
	}

	trimmedContent := strings.TrimSpace(content)
	runeCount := utf8.RuneCountInString(content)
	if runeCount > MaxChatMessageRuneLength {
		return nil, domain.NewValidationError(map[string]string{
			"content": "Nội dung tin nhắn không được vượt quá 2000 ký tự",
		})
	}

	hasAttachments := len(attachmentIDs) > 0
	if trimmedContent == "" && !hasAttachments {
		return nil, domain.NewValidationError(map[string]string{
			"content": "Nội dung tin nhắn không được để trống khi không có tệp đính kèm",
		})
	}

	if hasAttachments {
		cleanAttachmentIDs := make([]string, 0, len(attachmentIDs))
		for _, id := range attachmentIDs {
			trimmedID := strings.TrimSpace(id)
			if _, err := uuid.Parse(trimmedID); err != nil {
				return nil, domain.NewValidationError(map[string]string{
					"attachmentIds": "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất",
				})
			}
			cleanAttachmentIDs = append(cleanAttachmentIDs, trimmedID)
		}

		attachments, err := uc.repo.GetAttachmentsByIDs(ctx, cleanAttachmentIDs)
		if err != nil || len(attachments) != len(cleanAttachmentIDs) {
			return nil, domain.NewValidationError(map[string]string{
				"attachmentIds": "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất",
			})
		}

		for _, att := range attachments {
			if att.UploaderID != adminID || att.MessageID != nil {
				return nil, domain.NewValidationError(map[string]string{
					"attachmentIds": "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất",
				})
			}
		}
		attachmentIDs = cleanAttachmentIDs
	} else {
		attachmentIDs = []string{}
	}

	msg, err := uc.repo.CreateMessage(ctx, domain.CreateMessageInput{
		ConversationID:  cleanConvID,
		SenderID:        adminID,
		SenderRole:      domain.ChatSenderAdmin,
		Content:         content,
		AttachedOrderID: nil,
		AttachmentIDs:   attachmentIDs,
	})
	if err != nil {
		return nil, err
	}

	if uc.broadcaster != nil {
		_ = uc.broadcaster.BroadcastNewMessage(ctx, msg)
	}

	return msg, nil
}

func (uc *UseCase) SendAdminReplyWithInput(ctx context.Context, adminID string, conversationID string, input domain.SendAdminReplyInput) (*domain.ChatMessage, error) {
	return uc.SendAdminReply(ctx, adminID, conversationID, input.Content, input.AttachmentIDs)
}

func (uc *UseCase) MarkAdminConversationRead(ctx context.Context, conversationID string) error {
	cleanConvID := strings.TrimSpace(conversationID)
	if _, err := uuid.Parse(cleanConvID); err != nil {
		return domain.ErrConversationNotFound
	}

	if _, err := uc.repo.GetConversationByID(ctx, cleanConvID); err != nil {
		return domain.ErrConversationNotFound
	}

	if err := uc.repo.MarkConversationRead(ctx, cleanConvID, domain.ChatSenderAdmin); err != nil {
		return err
	}

	if uc.broadcaster != nil {
		_ = uc.broadcaster.BroadcastMessagesRead(ctx, cleanConvID, domain.ChatSenderAdmin, time.Now().UTC())
	}

	return nil
}
