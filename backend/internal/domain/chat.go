package domain

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrConversationNotFound     = errors.New("cuộc hội thoại không tồn tại")
	ErrOrderNotEligibleForChat  = errors.New("đơn hàng không tồn tại hoặc bạn không có quyền truy cập")
	ErrMessageEmpty             = errors.New("vui lòng nhập nội dung tin nhắn hoặc đính kèm tệp tin")
	ErrInvalidMedia             = errors.New("định dạng tệp không được hỗ trợ")
	ErrMediaTooLarge            = errors.New("kích thước tệp vượt quá giới hạn cho phép")
	ErrChatForbidden            = errors.New("bạn không có quyền truy cập cuộc hội thoại này")
	ErrChatMessageNotFound      = errors.New("tin nhắn không tồn tại")
	ErrChatMessageMediaNotFound = errors.New("tệp đính kèm không tồn tại")
)

type PresenceInfo struct {
	Status       string    `json:"status"`
	LastActiveAt time.Time `json:"lastActiveAt"`
	DisplayText  string    `json:"displayText"`
}

func CalculatePresence(lastActiveAt *time.Time, now time.Time) PresenceInfo {
	if lastActiveAt == nil || lastActiveAt.IsZero() {
		return PresenceInfo{
			Status:       "offline",
			LastActiveAt: time.Time{},
			DisplayText:  "Chưa hoạt động",
		}
	}

	diff := now.Sub(*lastActiveAt)
	if diff < 0 {
		diff = 0
	}

	if diff <= 2*time.Minute {
		return PresenceInfo{
			Status:       "online",
			LastActiveAt: *lastActiveAt,
			DisplayText:  "Đang hoạt động",
		}
	}

	if diff <= 10*time.Minute {
		return PresenceInfo{
			Status:       "active",
			LastActiveAt: *lastActiveAt,
			DisplayText:  "Vừa xong",
		}
	}

	if diff < 60*time.Minute {
		mins := int(diff.Minutes())
		return PresenceInfo{
			Status:       "active",
			LastActiveAt: *lastActiveAt,
			DisplayText:  fmt.Sprintf("Hoạt động %d phút trước", mins),
		}
	}

	if diff < 24*time.Hour {
		hours := int(diff.Hours())
		return PresenceInfo{
			Status:       "active",
			LastActiveAt: *lastActiveAt,
			DisplayText:  fmt.Sprintf("Hoạt động %d giờ trước", hours),
		}
	}

	return PresenceInfo{
		Status:       "offline",
		LastActiveAt: *lastActiveAt,
		DisplayText:  fmt.Sprintf("Hoạt động ngày %s", lastActiveAt.Format("02/01")),
	}
}

type OrderSummary struct {
	ID            string    `json:"id"`
	Status        string    `json:"status"`
	TotalVND      int64     `json:"totalVnd"`
	RecipientName string    `json:"recipientName"`
	CreatedAt     time.Time `json:"createdAt"`
	ItemCount     int       `json:"itemCount,omitempty"`
	FirstItemName string    `json:"firstItemName,omitempty"`
}

type MessageMedia struct {
	ID          string    `json:"id"`
	MessageID   string    `json:"messageId"`
	MediaType   string    `json:"mediaType"`
	ObjectKey   string    `json:"objectKey"`
	URL         string    `json:"url"`
	ContentType string    `json:"contentType"`
	FileSize    int64     `json:"fileSize"`
	FileName    string    `json:"fileName"`
	CreatedAt   time.Time `json:"createdAt"`
}

type MessageSummary struct {
	ID         string    `json:"id"`
	SenderRole string    `json:"senderRole"`
	Content    string    `json:"content"`
	HasMedia   bool      `json:"hasMedia"`
	CreatedAt  time.Time `json:"createdAt"`
}

type Conversation struct {
	ID                  string          `json:"id"`
	UserID              string          `json:"userId"`
	OrderID             *string         `json:"orderId,omitempty"`
	OrderSummary        *OrderSummary   `json:"orderSummary,omitempty"`
	OrderDetail         *Order          `json:"orderDetail,omitempty"`
	CustomerLastReadAt  time.Time       `json:"customerLastReadAt"`
	AdminLastReadAt     time.Time       `json:"adminLastReadAt"`
	CustomerLastActiveAt time.Time      `json:"customerLastActiveAt"`
	AdminLastActiveAt   *time.Time      `json:"adminLastActiveAt,omitempty"`
	LastMessageAt       time.Time       `json:"lastMessageAt"`
	CustomerUnreadCount int             `json:"customerUnreadCount"`
	AdminUnreadCount    int             `json:"adminUnreadCount"`
	CustomerEmail       string          `json:"customerEmail,omitempty"`
	LastMessage         *MessageSummary `json:"lastMessage,omitempty"`
	CustomerPresence    PresenceInfo    `json:"customerPresence"`
	AdminPresence       PresenceInfo    `json:"adminPresence"`
	CreatedAt           time.Time       `json:"createdAt"`
	UpdatedAt           time.Time       `json:"updatedAt"`
}

type Message struct {
	ID             string          `json:"id"`
	ConversationID string          `json:"conversationId"`
	SenderID       string          `json:"senderId"`
	SenderRole     string          `json:"senderRole"`
	MessageType    string          `json:"messageType"`
	OrderID        *string         `json:"orderId,omitempty"`
	OrderSummary   *OrderSummary   `json:"orderSummary,omitempty"`
	Content        string          `json:"content"`
	Media          []MessageMedia  `json:"media"`
	CreatedAt      time.Time       `json:"createdAt"`
}

func ValidateMessageContent(content string, mediaCount int, hasOrder bool) error {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" && mediaCount == 0 && !hasOrder {
		return ErrMessageEmpty
	}
	if len(trimmed) > 2000 {
		return errors.New("nội dung tin nhắn không được vượt quá 2000 ký tự")
	}
	if mediaCount > 5 {
		return errors.New("mỗi tin nhắn chỉ được đính kèm tối đa 5 tệp tin")
	}
	return nil
}

type ChatRepository interface {
	GetConversationByID(ctx context.Context, id string) (*Conversation, error)
	GetConversationByUserID(ctx context.Context, userID string) (*Conversation, error)
	CreateConversationForUser(ctx context.Context, userID string) (*Conversation, error)
	ListAdminConversations(ctx context.Context, unreadOnly bool, page, pageSize int) ([]Conversation, int, error)
	InsertMessage(ctx context.Context, conversationID, senderID, senderRole, messageType string, orderID *string, content string) (*Message, error)
	InsertMessageMedia(ctx context.Context, messageID, mediaType, objectKey, contentType string, fileSize int64, fileName string) (*MessageMedia, error)
	ListMessages(ctx context.Context, conversationID string, limit int, before *time.Time) ([]Message, bool, error)
	GetMediaByID(ctx context.Context, mediaID string) (*MessageMedia, error)
	MarkCustomerRead(ctx context.Context, conversationID string) error
	MarkAdminRead(ctx context.Context, conversationID string) error
	UpdateCustomerActive(ctx context.Context, conversationID string) error
	UpdateAdminActive(ctx context.Context, conversationID string) error
	GetCustomerTotalUnread(ctx context.Context, userID string) (int, error)
	GetOrderSummaryByID(ctx context.Context, orderID string) (*OrderSummary, error)
	CheckOrderOwnership(ctx context.Context, orderID, userID string) error
}
