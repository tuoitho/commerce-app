package chat

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/storage/chatmedia"
)

type mockChatRepo struct {
	createPendingAttachmentFn func(ctx context.Context, uploaderID string, objectKey string, fileType domain.ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*domain.ChatAttachment, error)
	getAttachmentByIDFn       func(ctx context.Context, attachmentID string) (*domain.ChatAttachment, error)
	getMessageByIDFn          func(ctx context.Context, messageID string) (*domain.ChatMessage, error)
	getConversationByIDFn     func(ctx context.Context, conversationID string) (*domain.Conversation, error)
}

func (m *mockChatRepo) GetOrCreateConversation(ctx context.Context, userID string) (*domain.Conversation, error) {
	return nil, nil
}
func (m *mockChatRepo) GetConversationByID(ctx context.Context, conversationID string) (*domain.Conversation, error) {
	if m.getConversationByIDFn != nil {
		return m.getConversationByIDFn(ctx, conversationID)
	}
	return nil, domain.ErrNotFound
}
func (m *mockChatRepo) ListConversationsForAdmin(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
	return nil, 0, nil
}
func (m *mockChatRepo) ListMessages(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
	return nil, nil
}
func (m *mockChatRepo) CreatePendingAttachment(ctx context.Context, uploaderID string, objectKey string, fileType domain.ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*domain.ChatAttachment, error) {
	if m.createPendingAttachmentFn != nil {
		return m.createPendingAttachmentFn(ctx, uploaderID, objectKey, fileType, fileName, fileSize, mimeType)
	}
	return &domain.ChatAttachment{
		ID:         uuid.NewString(),
		UploaderID: uploaderID,
		FileType:   fileType,
		FileURL:    "/api/v1/chat/media/test",
		FileName:   fileName,
		FileSize:   fileSize,
		MimeType:   mimeType,
		CreatedAt:  time.Now(),
	}, nil
}
func (m *mockChatRepo) GetAttachmentByID(ctx context.Context, attachmentID string) (*domain.ChatAttachment, error) {
	if m.getAttachmentByIDFn != nil {
		return m.getAttachmentByIDFn(ctx, attachmentID)
	}
	return nil, domain.ErrChatAttachmentNotFound
}
func (m *mockChatRepo) GetMessageByID(ctx context.Context, messageID string) (*domain.ChatMessage, error) {
	if m.getMessageByIDFn != nil {
		return m.getMessageByIDFn(ctx, messageID)
	}
	return nil, domain.ErrNotFound
}
func (m *mockChatRepo) CreateMessage(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
	return nil, nil
}
func (m *mockChatRepo) MarkConversationRead(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error {
	return nil
}
func (m *mockChatRepo) GetAttachedOrderCard(ctx context.Context, orderID string) (*domain.AttachedOrderCard, error) {
	return nil, nil
}
func (m *mockChatRepo) GetConversationByUserID(ctx context.Context, userID string) (*domain.Conversation, error) {
	return nil, nil
}
func (m *mockChatRepo) GetAttachmentsByIDs(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
	return nil, nil
}
func (m *mockChatRepo) ListRecentOrdersForChat(ctx context.Context, userID string, limit int) ([]domain.AttachedOrderCard, error) {
	return nil, nil
}
func (m *mockChatRepo) UpdateUserLastActive(ctx context.Context, userID string, t time.Time) error {
	return nil
}

func TestUseCase_UploadMedia(t *testing.T) {
	ctx := context.Background()
	uploaderID := uuid.NewString()

	t.Run("successful image upload (JPEG with jpg normalization)", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockChatRepo{}
		uc := New(repo, fakeStore)

		content := []byte("fake-jpeg-image-bytes")
		attachment, err := uc.UploadMedia(ctx, uploaderID, "photo.jpg", bytes.NewReader(content), int64(len(content)), "image/jpg")
		require.NoError(t, err)
		assert.NotEmpty(t, attachment.ID)
		assert.Equal(t, domain.ChatAttachmentImage, attachment.FileType)
		assert.Equal(t, "image/jpeg", attachment.MimeType)
		assert.Equal(t, "photo.jpg", attachment.FileName)
		assert.Equal(t, int64(len(content)), attachment.FileSize)
		assert.Equal(t, 1, fakeStore.ObjectCount())
	})

	t.Run("successful image upload for all valid image MIME types", func(t *testing.T) {
		validMimes := []struct {
			mime string
			name string
		}{
			{"image/jpeg", "test.jpeg"},
			{"image/png", "test.png"},
			{"image/webp", "test.webp"},
			{"image/gif", "test.gif"},
		}

		for _, tc := range validMimes {
			fakeStore := chatmedia.NewFakeStore()
			repo := &mockChatRepo{}
			uc := New(repo, fakeStore)

			data := []byte("image-data")
			att, err := uc.UploadMedia(ctx, uploaderID, tc.name, bytes.NewReader(data), int64(len(data)), tc.mime)
			require.NoError(t, err, "mime: %s", tc.mime)
			assert.Equal(t, domain.ChatAttachmentImage, att.FileType)
			assert.Equal(t, tc.mime, att.MimeType)
		}
	})

	t.Run("successful video upload for all valid video MIME types", func(t *testing.T) {
		validVideoMimes := []struct {
			mime string
			name string
		}{
			{"video/mp4", "clip.mp4"},
			{"video/webm", "clip.webm"},
		}

		for _, tc := range validVideoMimes {
			fakeStore := chatmedia.NewFakeStore()
			repo := &mockChatRepo{}
			uc := New(repo, fakeStore)

			data := []byte("video-data")
			att, err := uc.UploadMedia(ctx, uploaderID, tc.name, bytes.NewReader(data), int64(len(data)), tc.mime)
			require.NoError(t, err, "mime: %s", tc.mime)
			assert.Equal(t, domain.ChatAttachmentVideo, att.FileType)
			assert.Equal(t, tc.mime, att.MimeType)
		}
	})

	t.Run("unsupported MIME types rejected", func(t *testing.T) {
		invalidMimes := []string{
			"application/pdf",
			"text/plain",
			"image/bmp",
			"video/avi",
			"audio/mp3",
			"application/octet-stream",
			"",
		}

		fakeStore := chatmedia.NewFakeStore()
		repo := &mockChatRepo{}
		uc := New(repo, fakeStore)

		for _, mime := range invalidMimes {
			_, err := uc.UploadMedia(ctx, uploaderID, "file.bin", strings.NewReader("dummy"), 5, mime)
			require.Error(t, err)
			var valErr *domain.ValidationError
			require.True(t, errors.As(err, &valErr), "expected ValidationError for mime %q", mime)
			assert.Contains(t, valErr.Fields, "file_type")
		}
	})

	t.Run("image size exceeding 10MB rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockChatRepo{}
		uc := New(repo, fakeStore)

		tooBig := int64(10*1024*1024 + 1)
		_, err := uc.UploadMedia(ctx, uploaderID, "large.png", strings.NewReader(""), tooBig, "image/png")
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "file")
	})

	t.Run("video size exceeding 50MB rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockChatRepo{}
		uc := New(repo, fakeStore)

		tooBig := int64(50*1024*1024 + 1)
		_, err := uc.UploadMedia(ctx, uploaderID, "large.mp4", strings.NewReader(""), tooBig, "video/mp4")
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "file")
	})

	t.Run("zero or negative size rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockChatRepo{}
		uc := New(repo, fakeStore)

		_, err := uc.UploadMedia(ctx, uploaderID, "zero.png", strings.NewReader(""), 0, "image/png")
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "file")

		_, err = uc.UploadMedia(ctx, uploaderID, "neg.png", strings.NewReader(""), -5, "image/png")
		require.Error(t, err)
		require.True(t, errors.As(err, &valErr))
	})

	t.Run("empty uploaderID returns ErrInvalidToken", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockChatRepo{}
		uc := New(repo, fakeStore)

		_, err := uc.UploadMedia(ctx, "", "file.png", strings.NewReader("data"), 4, "image/png")
		require.ErrorIs(t, err, domain.ErrInvalidToken)
	})

	t.Run("storage failure rolls back cleanly", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		fakeStore.SetFailPutErr(errors.New("disk full"))
		repo := &mockChatRepo{}
		uc := New(repo, fakeStore)

		_, err := uc.UploadMedia(ctx, uploaderID, "file.png", strings.NewReader("data"), 4, "image/png")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "upload to media store")
	})

	t.Run("repository failure removes uploaded object", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockChatRepo{
			createPendingAttachmentFn: func(ctx context.Context, uploaderID, objectKey string, fileType domain.ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*domain.ChatAttachment, error) {
				return nil, errors.New("db insert failure")
			},
		}
		uc := New(repo, fakeStore)

		_, err := uc.UploadMedia(ctx, uploaderID, "file.png", strings.NewReader("data"), 4, "image/png")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "create pending attachment")
		assert.Equal(t, 0, fakeStore.ObjectCount(), "storage object should be rolled back")
	})
}

func TestUseCase_GetMediaStream(t *testing.T) {
	ctx := context.Background()
	adminID := uuid.NewString()
	uploaderID := uuid.NewString()
	otherUserID := uuid.NewString()
	convCustomerID := uuid.NewString()
	attachmentID := uuid.NewString()
	objectKey := "chat/" + attachmentID + "/video.mp4"
	videoContent := []byte("0123456789abcdefghijklmnopqrstuvwxyz")

	setupUsecaseWithMedia := func(attachment *domain.ChatAttachment) (*UseCase, *chatmedia.FakeStore, *mockChatRepo) {
		store := chatmedia.NewFakeStore()
		_ = store.PutObject(ctx, objectKey, bytes.NewReader(videoContent), int64(len(videoContent)), "video/mp4")

		messageID := uuid.NewString()
		conversationID := uuid.NewString()

		repo := &mockChatRepo{
			getAttachmentByIDFn: func(ctx context.Context, id string) (*domain.ChatAttachment, error) {
				if id == attachmentID {
					return attachment, nil
				}
				return nil, domain.ErrChatAttachmentNotFound
			},
			getMessageByIDFn: func(ctx context.Context, msgID string) (*domain.ChatMessage, error) {
				if attachment.MessageID != nil && msgID == *attachment.MessageID {
					return &domain.ChatMessage{
						ID:             messageID,
						ConversationID: conversationID,
						SenderID:       uploaderID,
					}, nil
				}
				return nil, domain.ErrNotFound
			},
			getConversationByIDFn: func(ctx context.Context, convID string) (*domain.Conversation, error) {
				if convID == conversationID {
					return &domain.Conversation{
						ID:     conversationID,
						UserID: convCustomerID,
					}, nil
				}
				return nil, domain.ErrNotFound
			},
		}

		return New(repo, store), store, repo
	}

	t.Run("invalid attachment ID format returns ErrChatAttachmentNotFound", func(t *testing.T) {
		uc, _, _ := setupUsecaseWithMedia(nil)
		_, _, err := uc.GetMediaStream(ctx, uploaderID, "customer", "invalid-uuid", 0, 0)
		require.ErrorIs(t, err, domain.ErrChatAttachmentNotFound)
	})

	t.Run("non-existent attachment returns ErrChatAttachmentNotFound", func(t *testing.T) {
		uc, _, _ := setupUsecaseWithMedia(nil)
		_, _, err := uc.GetMediaStream(ctx, uploaderID, "customer", uuid.NewString(), 0, 0)
		require.ErrorIs(t, err, domain.ErrChatAttachmentNotFound)
	})

	t.Run("uploader can access pending attachment", func(t *testing.T) {
		pendingAtt := &domain.ChatAttachment{
			ID:         attachmentID,
			MessageID:  nil,
			UploaderID: uploaderID,
			FileType:   domain.ChatAttachmentVideo,
			ObjectKey:  objectKey,
			FileSize:   int64(len(videoContent)),
			MimeType:   "video/mp4",
		}
		uc, _, _ := setupUsecaseWithMedia(pendingAtt)

		stream, att, err := uc.GetMediaStream(ctx, uploaderID, "customer", attachmentID, 0, 0)
		require.NoError(t, err)
		require.NotNil(t, stream)
		assert.Equal(t, attachmentID, att.ID)
		readBytes, _ := io.ReadAll(stream)
		_ = stream.Close()
		assert.Equal(t, videoContent, readBytes)
	})

	t.Run("other user cannot access pending attachment", func(t *testing.T) {
		pendingAtt := &domain.ChatAttachment{
			ID:         attachmentID,
			MessageID:  nil,
			UploaderID: uploaderID,
			FileType:   domain.ChatAttachmentVideo,
			ObjectKey:  objectKey,
			FileSize:   int64(len(videoContent)),
			MimeType:   "video/mp4",
		}
		uc, _, _ := setupUsecaseWithMedia(pendingAtt)

		_, _, err := uc.GetMediaStream(ctx, otherUserID, "customer", attachmentID, 0, 0)
		require.ErrorIs(t, err, domain.ErrChatMediaForbidden)
	})

	t.Run("admin can access any attachment (pending or attached)", func(t *testing.T) {
		pendingAtt := &domain.ChatAttachment{
			ID:         attachmentID,
			MessageID:  nil,
			UploaderID: uploaderID,
			FileType:   domain.ChatAttachmentVideo,
			ObjectKey:  objectKey,
			FileSize:   int64(len(videoContent)),
			MimeType:   "video/mp4",
		}
		uc, _, _ := setupUsecaseWithMedia(pendingAtt)

		stream, _, err := uc.GetMediaStream(ctx, adminID, "admin", attachmentID, 0, 0)
		require.NoError(t, err)
		require.NotNil(t, stream)
		_ = stream.Close()
	})

	t.Run("conversation customer can access attached media", func(t *testing.T) {
		msgID := uuid.NewString()
		attachedMedia := &domain.ChatAttachment{
			ID:         attachmentID,
			MessageID:  &msgID,
			UploaderID: uploaderID,
			FileType:   domain.ChatAttachmentVideo,
			ObjectKey:  objectKey,
			FileSize:   int64(len(videoContent)),
			MimeType:   "video/mp4",
		}
		uc, _, _ := setupUsecaseWithMedia(attachedMedia)

		stream, _, err := uc.GetMediaStream(ctx, convCustomerID, "customer", attachmentID, 0, 0)
		require.NoError(t, err)
		require.NotNil(t, stream)
		_ = stream.Close()
	})

	t.Run("unrelated customer cannot access attached media", func(t *testing.T) {
		msgID := uuid.NewString()
		attachedMedia := &domain.ChatAttachment{
			ID:         attachmentID,
			MessageID:  &msgID,
			UploaderID: uploaderID,
			FileType:   domain.ChatAttachmentVideo,
			ObjectKey:  objectKey,
			FileSize:   int64(len(videoContent)),
			MimeType:   "video/mp4",
		}
		uc, _, _ := setupUsecaseWithMedia(attachedMedia)

		_, _, err := uc.GetMediaStream(ctx, otherUserID, "customer", attachmentID, 0, 0)
		require.ErrorIs(t, err, domain.ErrChatMediaForbidden)
	})

	t.Run("byte range streaming succeeds", func(t *testing.T) {
		pendingAtt := &domain.ChatAttachment{
			ID:         attachmentID,
			MessageID:  nil,
			UploaderID: uploaderID,
			FileType:   domain.ChatAttachmentVideo,
			ObjectKey:  objectKey,
			FileSize:   int64(len(videoContent)),
			MimeType:   "video/mp4",
		}
		uc, _, _ := setupUsecaseWithMedia(pendingAtt)

		// Request range [0, 10] -> 10 bytes: "0123456789"
		stream, _, err := uc.GetMediaStream(ctx, uploaderID, "customer", attachmentID, 0, 10)
		require.NoError(t, err)
		require.NotNil(t, stream)
		data, err := io.ReadAll(stream)
		_ = stream.Close()
		require.NoError(t, err)
		assert.Equal(t, "0123456789", string(data))
	})
}
