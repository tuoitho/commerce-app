package repository

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

func TestToDomainChatAttachment(t *testing.T) {
	t.Run("converts sqlc row with null message_id", func(t *testing.T) {
		attID := uuid.NewString()
		now := time.Now()
		row := sqlc.ChatAttachment{
			ID:         attID,
			MessageID:  pgtype.UUID{Valid: false},
			UploaderID: "user-1",
			ObjectKey:  "chat/key.jpg",
			FileType:   "image",
			FileName:   "photo.jpg",
			FileSize:   1024,
			MimeType:   "image/jpeg",
			CreatedAt:  now,
		}

		domainAtt := toDomainChatAttachment(row)
		assert.Equal(t, attID, domainAtt.ID)
		assert.Nil(t, domainAtt.MessageID)
		assert.Equal(t, "user-1", domainAtt.UploaderID)
		assert.Equal(t, domain.ChatAttachmentImage, domainAtt.FileType)
		assert.Equal(t, "/api/v1/chat/media/"+attID, domainAtt.FileURL)
		assert.Equal(t, "photo.jpg", domainAtt.FileName)
		assert.Equal(t, int64(1024), domainAtt.FileSize)
		assert.Equal(t, "image/jpeg", domainAtt.MimeType)
		assert.Equal(t, "chat/key.jpg", domainAtt.ObjectKey)
		assert.Equal(t, now, domainAtt.CreatedAt)
	})

	t.Run("converts sqlc row with valid message_id", func(t *testing.T) {
		attID := uuid.NewString()
		msgID := uuid.New()
		row := sqlc.ChatAttachment{
			ID:         attID,
			MessageID:  pgtype.UUID{Bytes: msgID, Valid: true},
			UploaderID: "user-1",
			ObjectKey:  "chat/key.mp4",
			FileType:   "video",
			FileName:   "clip.mp4",
			FileSize:   5000,
			MimeType:   "video/mp4",
			CreatedAt:  time.Now(),
		}

		domainAtt := toDomainChatAttachment(row)
		assert.NotNil(t, domainAtt.MessageID)
		assert.Equal(t, msgID.String(), *domainAtt.MessageID)
		assert.Equal(t, domain.ChatAttachmentVideo, domainAtt.FileType)
	})
}

func TestChatRepository_GetAttachmentsByIDs_Empty(t *testing.T) {
	repo := NewChatRepository(nil)
	ctx := context.Background()

	atts, err := repo.GetAttachmentsByIDs(ctx, []string{})
	assert.NoError(t, err)
	assert.Empty(t, atts)
}
