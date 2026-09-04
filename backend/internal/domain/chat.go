package domain

import (
	"context"
	"io"
	"time"
)

type ChatSenderRole string

const (
	ChatSenderCustomer ChatSenderRole = "customer"
	ChatSenderAdmin    ChatSenderRole = "admin"
)

type ChatAttachmentType string

const (
	ChatAttachmentImage ChatAttachmentType = "image"
	ChatAttachmentVideo ChatAttachmentType = "video"
)

type ChatAttachment struct {
	ID         string             `json:"id"`
	MessageID  *string            `json:"messageId,omitempty"`
	UploaderID string             `json:"uploaderId"`
	FileType   ChatAttachmentType `json:"fileType"`
	FileURL    string             `json:"fileUrl"`
	FileName   string             `json:"fileName"`
	FileSize   int64              `json:"fileSize"`
	MimeType   string             `json:"mimeType"`
	ObjectKey  string             `json:"-"`
	CreatedAt  time.Time          `json:"createdAt"`
}

type AttachedOrderItemSummary struct {
	ProductName  string   `json:"productName"`
	Quantity     int64    `json:"quantity"`
	UnitPriceVND MoneyVND `json:"unitPriceVnd"`
	ImageURL     string   `json:"imageUrl"`
}

type AttachedOrderCard struct {
	ID              string                     `json:"id"`
	UserID          string                     `json:"userId,omitempty"`
	Status          OrderStatus                `json:"status"`
	TotalVND        MoneyVND                   `json:"totalVnd"`
	CreatedAt       time.Time                  `json:"createdAt"`
	ItemsSummary    []AttachedOrderItemSummary `json:"itemsSummary"`
	TotalItemsCount int                        `json:"totalItemsCount"`
}

type ChatMessage struct {
	ID              string             `json:"id"`
	ConversationID  string             `json:"conversationId"`
	SenderID        string             `json:"senderId"`
	SenderRole      ChatSenderRole     `json:"senderRole"`
	SenderName      string             `json:"senderName"`
	Content         string             `json:"content"`
	AttachedOrderID *string            `json:"attachedOrderId,omitempty"`
	AttachedOrder   *AttachedOrderCard `json:"attachedOrder,omitempty"`
	Attachments     []ChatAttachment   `json:"attachments"`
	CreatedAt       time.Time          `json:"createdAt"`
	IsRead          bool               `json:"isRead"`
}

type Conversation struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"userId"`
	CustomerEmail      string     `json:"customerEmail"`
	CustomerName       string     `json:"customerName"`
	CustomerLastActive *time.Time `json:"customerLastActive"`
	IsOnline           bool       `json:"isOnline"`
	LastMessageAt      time.Time  `json:"lastMessageAt"`
	LastMessageSnippet string     `json:"lastMessageSnippet"`
	UnreadCount        int        `json:"unreadCount"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}

type AdminConversationFilter struct {
	Status string // "all", "unread"
	Search string // email hoặc order id
	Limit  int
	Offset int
}

type CreateMessageInput struct {
	ConversationID  string
	SenderID        string
	SenderRole      ChatSenderRole
	Content         string
	AttachedOrderID *string
	AttachmentIDs   []string
}

type SendMessageInput struct {
	Content         string   `json:"content"`
	AttachedOrderID *string  `json:"attachedOrderId,omitempty"`
	AttachmentIDs   []string `json:"attachmentIds,omitempty"`
}

type SendAdminReplyInput struct {
	Content       string   `json:"content"`
	AttachmentIDs []string `json:"attachmentIds,omitempty"`
}

type UploadAttachmentResult struct {
	ID        string
	ObjectKey string
	FileType  ChatAttachmentType
	FileName  string
	FileSize  int64
	MimeType  string
	FileURL   string
}

type ChatRepository interface {
	GetOrCreateConversation(ctx context.Context, userID string) (*Conversation, error)
	GetConversationByID(ctx context.Context, conversationID string) (*Conversation, error)
	GetConversationByUserID(ctx context.Context, userID string) (*Conversation, error)
	ListConversationsForAdmin(ctx context.Context, filter AdminConversationFilter) ([]Conversation, int, error)
	ListMessages(ctx context.Context, conversationID string, limit, offset int, currentRole ChatSenderRole) ([]ChatMessage, error)
	CreatePendingAttachment(ctx context.Context, uploaderID string, objectKey string, fileType ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*ChatAttachment, error)
	GetAttachmentByID(ctx context.Context, attachmentID string) (*ChatAttachment, error)
	GetAttachmentsByIDs(ctx context.Context, attachmentIDs []string) ([]ChatAttachment, error)
	GetMessageByID(ctx context.Context, messageID string) (*ChatMessage, error)
	CreateMessage(ctx context.Context, input CreateMessageInput) (*ChatMessage, error)
	MarkConversationRead(ctx context.Context, conversationID string, readerRole ChatSenderRole) error
	GetAttachedOrderCard(ctx context.Context, orderID string) (*AttachedOrderCard, error)
	ListRecentOrdersForChat(ctx context.Context, userID string, limit int) ([]AttachedOrderCard, error)
	UpdateUserLastActive(ctx context.Context, userID string, t time.Time) error
}

type ChatUseCase interface {
	GetOrCreateCustomerConversation(ctx context.Context, customerID string) (*Conversation, error)
	ListCustomerMessages(ctx context.Context, customerID string, limit, offset int) ([]ChatMessage, error)
	SendCustomerMessage(ctx context.Context, customerID string, input SendMessageInput) (*ChatMessage, error)
	MarkCustomerConversationRead(ctx context.Context, customerID string) error

	ListAdminConversations(ctx context.Context, filter AdminConversationFilter) ([]Conversation, int, error)
	ListAdminMessages(ctx context.Context, conversationID string, limit, offset int) ([]ChatMessage, error)
	SendAdminReply(ctx context.Context, adminID string, conversationID string, content string, attachmentIDs []string) (*ChatMessage, error)
	MarkAdminConversationRead(ctx context.Context, conversationID string) error

	UploadMedia(ctx context.Context, uploaderID string, fileName string, reader io.Reader, size int64, mimeType string) (*ChatAttachment, error)
	GetMediaStream(ctx context.Context, requesterID string, requesterRole string, attachmentID string, start, length int64) (io.ReadCloser, *ChatAttachment, error)
	ListCustomerOrdersForPicker(ctx context.Context, customerID string, limit int) ([]AttachedOrderCard, error)
	ListCustomerOrdersForChat(ctx context.Context, customerID string, limit int) ([]AttachedOrderCard, error)
}

type ChatObjectInfo struct {
	Key         string
	Size        int64
	ContentType string
	ETag        string
}

type ChatMediaStore interface {
	PutObject(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) error
	StatObject(ctx context.Context, objectKey string) (*ChatObjectInfo, error)
	GetObject(ctx context.Context, objectKey string) (io.ReadCloser, error)
	GetObjectRange(ctx context.Context, objectKey string, start, length int64) (io.ReadCloser, error)
	RemoveObject(ctx context.Context, objectKey string) error
	RemoveObjects(ctx context.Context, objectKeys []string) error
	CheckHealth(ctx context.Context) error
	ValidateBucketPrivate(ctx context.Context) error
}

type MessagesReadPayload struct {
	ConversationID string         `json:"conversationId"`
	ReaderRole     ChatSenderRole `json:"readerRole"`
	ReadAt         string         `json:"readAt"`
}

type PresencePayload struct {
	UserID       string         `json:"userId"`
	Role         ChatSenderRole `json:"role"`
	IsOnline     bool           `json:"isOnline"`
	LastActiveAt string         `json:"lastActiveAt"`
}

type ChatEventBroadcaster interface {
	BroadcastNewMessage(ctx context.Context, msg *ChatMessage) error
	BroadcastMessagesRead(ctx context.Context, conversationID string, readerRole ChatSenderRole, readAt time.Time) error
	BroadcastPresence(ctx context.Context, userID string, role ChatSenderRole, isOnline bool, lastActiveAt time.Time) error
	IsUserOnline(userID string) bool
	IsAnyAdminOnline() bool
}
