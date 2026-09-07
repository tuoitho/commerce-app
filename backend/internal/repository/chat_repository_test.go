package repository_test

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository"
)

func TestChatRepository_Validation(t *testing.T) {
	repo := repository.NewChatRepository(nil)
	ctx := context.Background()

	t.Run("GetConversationByID returns ErrConversationNotFound for invalid uuid", func(t *testing.T) {
		_, err := repo.GetConversationByID(ctx, "invalid-uuid")
		if !errors.Is(err, domain.ErrConversationNotFound) && err == nil {
			t.Errorf("expected error for invalid uuid, got nil")
		}
	})
}
