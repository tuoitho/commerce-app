package chat

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/storage"
)

type FileUpload struct {
	FileName string
	Reader   io.Reader
	Size     int64
}

type SendMessageInput struct {
	ConversationID string
	SenderID       string
	SenderRole     string
	OrderID        *string
	Content        string
	Files          []FileUpload
}

type OrderChecker interface {
	GetByID(ctx context.Context, userID, id string) (*domain.Order, error)
	GetAdminByID(ctx context.Context, id string) (*domain.Order, error)
}

type Dependencies struct {
	ChatRepo domain.ChatRepository
	Storage  storage.Storage
	Orders   domain.OrderRepository
	Logger   *slog.Logger
}

type UseCase struct {
	chatRepo domain.ChatRepository
	storage  storage.Storage
	orders   domain.OrderRepository
	log      *slog.Logger
}

func NewUseCase(deps Dependencies) *UseCase {
	return &UseCase{
		chatRepo: deps.ChatRepo,
		storage:  deps.Storage,
		orders:   deps.Orders,
		log:      deps.Logger,
	}
}

func (u *UseCase) GetOrCreateConversation(ctx context.Context, userID string) (*domain.Conversation, error) {
	conv, err := u.chatRepo.GetConversationByUserID(ctx, userID)
	if err == nil {
		return conv, nil
	}
	if !errors.Is(err, domain.ErrConversationNotFound) {
		return nil, err
	}

	return u.chatRepo.CreateConversationForUser(ctx, userID)
}

func (u *UseCase) ListCustomerConversations(ctx context.Context, userID string) ([]domain.Conversation, error) {
	conv, err := u.GetOrCreateConversation(ctx, userID)
	if err != nil {
		return nil, err
	}
	return []domain.Conversation{*conv}, nil
}

func (u *UseCase) ListAdminConversations(ctx context.Context, unreadOnly bool, page, pageSize int) ([]domain.Conversation, int, error) {
	return u.chatRepo.ListAdminConversations(ctx, unreadOnly, page, pageSize)
}

func (u *UseCase) GetConversation(ctx context.Context, id, callerID, callerRole string) (*domain.Conversation, error) {
	conv, err := u.chatRepo.GetConversationByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if callerRole != domain.RoleAdmin && conv.UserID != callerID {
		return nil, domain.ErrChatForbidden
	}

	return conv, nil
}

func (u *UseCase) ListMessages(ctx context.Context, convID, callerID, callerRole string, limit int, before *time.Time) ([]domain.Message, bool, error) {
	conv, err := u.chatRepo.GetConversationByID(ctx, convID)
	if err != nil {
		return nil, false, err
	}

	if callerRole != domain.RoleAdmin && conv.UserID != callerID {
		return nil, false, domain.ErrChatForbidden
	}

	return u.chatRepo.ListMessages(ctx, convID, limit, before)
}

func (u *UseCase) SendMessage(ctx context.Context, input SendMessageInput) (*domain.Message, error) {
	conv, err := u.chatRepo.GetConversationByID(ctx, input.ConversationID)
	if err != nil {
		return nil, err
	}

	if input.SenderRole != domain.RoleAdmin && conv.UserID != input.SenderID {
		return nil, domain.ErrChatForbidden
	}

	hasOrder := input.OrderID != nil && *input.OrderID != ""
	if err := domain.ValidateMessageContent(input.Content, len(input.Files), hasOrder); err != nil {
		return nil, err
	}

	if hasOrder {
		if input.SenderRole != domain.RoleAdmin {
			if err := u.chatRepo.CheckOrderOwnership(ctx, *input.OrderID, input.SenderID); err != nil {
				return nil, domain.ErrOrderNotEligibleForChat
			}
		}
	}

	// 1. Validate and upload files
	type uploadedFile struct {
		mediaType   string
		objectKey   string
		contentType string
		size        int64
		fileName    string
	}
	var uploads []uploadedFile

	for _, f := range input.Files {
		// Read header for MIME detection
		headerBuf := make([]byte, 512)
		n, err := io.ReadFull(f.Reader, headerBuf)
		if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
			return nil, fmt.Errorf("read file header: %w", err)
		}
		headerData := headerBuf[:n]

		mimeType := DetectMIME(headerData)
		if mimeType == "" {
			return nil, domain.ErrInvalidMedia
		}

		mediaType, ok := ClassifyMediaType(mimeType)
		if !ok {
			return nil, domain.ErrInvalidMedia
		}

		// Size checks
		if mediaType == "image" && f.Size > 10*1024*1024 {
			return nil, domain.ErrMediaTooLarge
		}
		if mediaType == "video" && f.Size > 50*1024*1024 {
			return nil, domain.ErrMediaTooLarge
		}

		// Reconstruct reader
		fullReader := io.MultiReader(bytes.NewReader(headerData), f.Reader)

		// Upload to MinIO
		objKey := fmt.Sprintf("chat/%s/%s", uuid.New().String(), f.FileName)
		if u.storage != nil {
			_, err = u.storage.PutObject(ctx, objKey, fullReader, f.Size, mimeType)
			if err != nil {
				return nil, fmt.Errorf("upload to storage: %w", err)
			}
		}

		uploads = append(uploads, uploadedFile{
			mediaType:   mediaType,
			objectKey:   objKey,
			contentType: mimeType,
			size:        f.Size,
			fileName:    f.FileName,
		})
	}

	// 2. Determine message type
	messageType := "text"
	if len(uploads) > 0 {
		messageType = "media"
	}
	if hasOrder {
		messageType = "order"
	}

	// 3. Insert message
	msg, err := u.chatRepo.InsertMessage(ctx, input.ConversationID, input.SenderID, input.SenderRole, messageType, input.OrderID, input.Content)
	if err != nil {
		return nil, err
	}

	// 4. Insert message media
	for _, up := range uploads {
		m, err := u.chatRepo.InsertMessageMedia(ctx, msg.ID, up.mediaType, up.objectKey, up.contentType, up.size, up.fileName)
		if err == nil {
			msg.Media = append(msg.Media, *m)
		}
	}

	return msg, nil
}

func (u *UseCase) MarkAsRead(ctx context.Context, convID, callerID, callerRole string) error {
	conv, err := u.chatRepo.GetConversationByID(ctx, convID)
	if err != nil {
		return err
	}

	if callerRole != domain.RoleAdmin && conv.UserID != callerID {
		return domain.ErrChatForbidden
	}

	if callerRole == domain.RoleAdmin {
		return u.chatRepo.MarkAdminRead(ctx, convID)
	}
	return u.chatRepo.MarkCustomerRead(ctx, convID)
}

func (u *UseCase) UpdateActive(ctx context.Context, convID, callerID, callerRole string) error {
	conv, err := u.chatRepo.GetConversationByID(ctx, convID)
	if err != nil {
		return err
	}

	if callerRole != domain.RoleAdmin && conv.UserID != callerID {
		return domain.ErrChatForbidden
	}

	if callerRole == domain.RoleAdmin {
		return u.chatRepo.UpdateAdminActive(ctx, convID)
	}
	return u.chatRepo.UpdateCustomerActive(ctx, convID)
}

func (u *UseCase) GetCustomerTotalUnread(ctx context.Context, userID string) (int, error) {
	return u.chatRepo.GetCustomerTotalUnread(ctx, userID)
}

func (u *UseCase) GetChatMedia(ctx context.Context, mediaID string, start, end int64) (*storage.MediaObject, error) {
	m, err := u.chatRepo.GetMediaByID(ctx, mediaID)
	if err != nil {
		return nil, domain.ErrChatMessageMediaNotFound
	}

	if u.storage == nil {
		return nil, errors.New("storage unavailable")
	}

	obj, err := u.storage.GetObject(ctx, m.ObjectKey, start, end)
	if err != nil {
		if errors.Is(err, storage.ErrObjectNotFound) {
			return nil, domain.ErrChatMessageMediaNotFound
		}
		return nil, err
	}
	return obj, nil
}
