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
	MaxChatMessageRuneLength = 2000
	DefaultMessageLimit      = 50
	MaxMessageLimit          = 100
	DefaultOrderPickerLimit  = 10
	MaxOrderPickerLimit      = 50
)

func (uc *UseCase) GetOrCreateCustomerConversation(ctx context.Context, customerID string) (*domain.Conversation, error) {
	if strings.TrimSpace(customerID) == "" {
		return nil, domain.ErrInvalidToken
	}

	conv, err := uc.repo.GetOrCreateConversation(ctx, customerID)
	if err != nil {
		return nil, err
	}

	_ = uc.repo.UpdateUserLastActive(ctx, customerID, time.Now().UTC())
	if uc.broadcaster != nil {
		conv.IsOnline = uc.broadcaster.IsAnyAdminOnline()
	}
	return conv, nil
}

func (uc *UseCase) ListCustomerMessages(ctx context.Context, customerID string, limit, offset int) ([]domain.ChatMessage, error) {
	if strings.TrimSpace(customerID) == "" {
		return nil, domain.ErrInvalidToken
	}

	if limit <= 0 || limit > MaxMessageLimit {
		limit = DefaultMessageLimit
	}
	if offset < 0 {
		offset = 0
	}

	conv, err := uc.repo.GetOrCreateConversation(ctx, customerID)
	if err != nil {
		return nil, err
	}

	messages, err := uc.repo.ListMessages(ctx, conv.ID, limit, offset, domain.ChatSenderCustomer)
	if err != nil {
		return nil, err
	}
	if messages == nil {
		messages = []domain.ChatMessage{}
	}
	return messages, nil
}

func (uc *UseCase) SendCustomerMessage(ctx context.Context, customerID string, input domain.SendMessageInput) (*domain.ChatMessage, error) {
	if strings.TrimSpace(customerID) == "" {
		return nil, domain.ErrInvalidToken
	}

	trimmedContent := strings.TrimSpace(input.Content)
	runeCount := utf8.RuneCountInString(input.Content)
	if runeCount > MaxChatMessageRuneLength {
		return nil, domain.NewValidationError(map[string]string{
			"content": "Nội dung tin nhắn không được vượt quá 2000 ký tự",
		})
	}

	hasAttachments := len(input.AttachmentIDs) > 0
	var cleanOrderID *string
	if input.AttachedOrderID != nil && strings.TrimSpace(*input.AttachedOrderID) != "" {
		trimmedOrder := strings.TrimSpace(*input.AttachedOrderID)
		cleanOrderID = &trimmedOrder
	}

	if trimmedContent == "" && !hasAttachments && cleanOrderID == nil {
		return nil, domain.NewValidationError(map[string]string{
			"content": "Nội dung tin nhắn không được để trống khi không có tệp hoặc đơn hàng đính kèm",
		})
	}

	// If attached order is provided, verify order exists and belongs to customerID
	if cleanOrderID != nil {
		if _, err := uuid.Parse(*cleanOrderID); err != nil {
			return nil, domain.NewValidationError(map[string]string{
				"attachedOrderId": "Đơn hàng không hợp lệ hoặc không thuộc tài khoản của bạn",
			})
		}

		card, err := uc.repo.GetAttachedOrderCard(ctx, *cleanOrderID)
		if err != nil || card == nil || card.UserID != customerID {
			return nil, domain.NewValidationError(map[string]string{
				"attachedOrderId": "Đơn hàng không hợp lệ hoặc không thuộc tài khoản của bạn",
			})
		}
	}

	// If attachments provided, verify all attachments belong to customerID and have message_id == nil
	if hasAttachments {
		cleanAttachmentIDs := make([]string, 0, len(input.AttachmentIDs))
		for _, id := range input.AttachmentIDs {
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
			if att.UploaderID != customerID || att.MessageID != nil {
				return nil, domain.NewValidationError(map[string]string{
					"attachmentIds": "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất",
				})
			}
		}
		input.AttachmentIDs = cleanAttachmentIDs
	}

	conv, err := uc.repo.GetOrCreateConversation(ctx, customerID)
	if err != nil {
		return nil, err
	}

	msg, err := uc.repo.CreateMessage(ctx, domain.CreateMessageInput{
		ConversationID:  conv.ID,
		SenderID:        customerID,
		SenderRole:      domain.ChatSenderCustomer,
		Content:         input.Content,
		AttachedOrderID: cleanOrderID,
		AttachmentIDs:   input.AttachmentIDs,
	})
	if err != nil {
		return nil, err
	}

	_ = uc.repo.UpdateUserLastActive(ctx, customerID, time.Now().UTC())

	if uc.broadcaster != nil {
		_ = uc.broadcaster.BroadcastNewMessage(ctx, msg)
	}

	return msg, nil
}

func (uc *UseCase) MarkCustomerConversationRead(ctx context.Context, customerID string) error {
	if strings.TrimSpace(customerID) == "" {
		return domain.ErrInvalidToken
	}

	conv, err := uc.repo.GetOrCreateConversation(ctx, customerID)
	if err != nil {
		return err
	}

	if err := uc.repo.MarkConversationRead(ctx, conv.ID, domain.ChatSenderCustomer); err != nil {
		return err
	}

	if uc.broadcaster != nil {
		_ = uc.broadcaster.BroadcastMessagesRead(ctx, conv.ID, domain.ChatSenderCustomer, time.Now().UTC())
	}

	return nil
}

func (uc *UseCase) ListCustomerOrdersForChat(ctx context.Context, customerID string, limit int) ([]domain.AttachedOrderCard, error) {
	if strings.TrimSpace(customerID) == "" {
		return nil, domain.ErrInvalidToken
	}

	if limit <= 0 || limit > MaxOrderPickerLimit {
		limit = DefaultOrderPickerLimit
	}

	orders, err := uc.repo.ListRecentOrdersForChat(ctx, customerID, limit)
	if err != nil {
		return nil, err
	}
	if orders == nil {
		orders = []domain.AttachedOrderCard{}
	}
	return orders, nil
}

func (uc *UseCase) ListCustomerOrdersForPicker(ctx context.Context, customerID string, limit int) ([]domain.AttachedOrderCard, error) {
	return uc.ListCustomerOrdersForChat(ctx, customerID, limit)
}
