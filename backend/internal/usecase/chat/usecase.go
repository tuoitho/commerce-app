package chat

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

const (
	MaxChatImageSizeBytes = 10 * 1024 * 1024 // 10MB
	MaxChatVideoSizeBytes = 50 * 1024 * 1024 // 50MB
)

type UseCase struct {
	repo        domain.ChatRepository
	mediaStore  domain.ChatMediaStore
	broadcaster domain.ChatEventBroadcaster
}

var _ domain.ChatUseCase = (*UseCase)(nil)

type Option func(*UseCase)

func WithBroadcaster(b domain.ChatEventBroadcaster) Option {
	return func(uc *UseCase) {
		uc.broadcaster = b
	}
}

func (uc *UseCase) SetBroadcaster(b domain.ChatEventBroadcaster) {
	uc.broadcaster = b
}

func New(repo domain.ChatRepository, mediaStore domain.ChatMediaStore, opts ...Option) *UseCase {
	uc := &UseCase{
		repo:       repo,
		mediaStore: mediaStore,
	}
	for _, opt := range opts {
		opt(uc)
	}
	return uc
}

func sanitizeFilename(name string) string {
	clean := filepath.Base(strings.TrimSpace(name))
	clean = strings.ReplaceAll(clean, "\\", "_")
	clean = strings.ReplaceAll(clean, "/", "_")
	if clean == "" || clean == "." {
		return "file"
	}
	return clean
}

func (uc *UseCase) UploadMedia(ctx context.Context, uploaderID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.ChatAttachment, error) {
	if strings.TrimSpace(uploaderID) == "" {
		return nil, domain.ErrInvalidToken
	}

	normMime := strings.ToLower(strings.TrimSpace(mimeType))
	if normMime == "image/jpg" {
		normMime = "image/jpeg"
	}

	var fileType domain.ChatAttachmentType
	switch normMime {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		fileType = domain.ChatAttachmentImage
	case "video/mp4", "video/webm":
		fileType = domain.ChatAttachmentVideo
	default:
		return nil, domain.NewValidationError(map[string]string{
			"file_type": "Định dạng tệp không được hỗ trợ (chỉ chấp nhận JPEG, PNG, WebP, GIF, MP4, WebM)",
		})
	}

	if size <= 0 {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		})
	}

	if fileType == domain.ChatAttachmentImage && size > MaxChatImageSizeBytes {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		})
	}

	if fileType == domain.ChatAttachmentVideo && size > MaxChatVideoSizeBytes {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		})
	}

	safeName := sanitizeFilename(fileName)
	objectKey := fmt.Sprintf("chat/%s/%s", uuid.NewString(), safeName)

	if err := uc.mediaStore.PutObject(ctx, objectKey, reader, size, normMime); err != nil {
		return nil, fmt.Errorf("upload to media store: %w", err)
	}

	attachment, err := uc.repo.CreatePendingAttachment(ctx, uploaderID, objectKey, fileType, safeName, size, normMime)
	if err != nil {
		_ = uc.mediaStore.RemoveObject(ctx, objectKey)
		return nil, fmt.Errorf("create pending attachment: %w", err)
	}

	return attachment, nil
}

func (uc *UseCase) GetMediaStream(ctx context.Context, requesterID string, requesterRole string, attachmentID string, start, length int64) (io.ReadCloser, *domain.ChatAttachment, error) {
	if _, err := uuid.Parse(attachmentID); err != nil {
		return nil, nil, domain.ErrChatAttachmentNotFound
	}

	attachment, err := uc.repo.GetAttachmentByID(ctx, attachmentID)
	if err != nil {
		return nil, nil, err
	}

	isAuthorized := false
	if requesterRole == domain.RoleAdmin || requesterRole == "admin" {
		isAuthorized = true
	} else if attachment.UploaderID == requesterID {
		isAuthorized = true
	} else if attachment.MessageID != nil {
		msg, err := uc.repo.GetMessageByID(ctx, *attachment.MessageID)
		if err == nil && msg != nil {
			conv, err := uc.repo.GetConversationByID(ctx, msg.ConversationID)
			if err == nil && conv != nil && conv.UserID == requesterID {
				isAuthorized = true
			}
		}
	}

	if !isAuthorized {
		return nil, nil, domain.ErrChatMediaForbidden
	}

	if start >= 0 && length > 0 {
		stream, err := uc.mediaStore.GetObjectRange(ctx, attachment.ObjectKey, start, length)
		if err != nil {
			return nil, nil, err
		}
		return stream, attachment, nil
	}

	stream, err := uc.mediaStore.GetObject(ctx, attachment.ObjectKey)
	if err != nil {
		return nil, nil, err
	}
	return stream, attachment, nil
}
