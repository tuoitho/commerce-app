package repository_test

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository"
)

func TestReviewRepository_InvalidUUIDHandling(t *testing.T) {
	repo := repository.NewReviewRepository(nil)
	ctx := context.Background()

	t.Run("GetReviewByID returns ErrReviewNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.GetReviewByID(ctx, "invalid-uuid")
		if !errors.Is(err, domain.ErrReviewNotFound) {
			t.Errorf("expected ErrReviewNotFound, got %v", err)
		}
	})

	t.Run("GetReferencedReviewMediaByID returns ErrReviewMediaNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.GetReferencedReviewMediaByID(ctx, "invalid-uuid")
		if !errors.Is(err, domain.ErrReviewMediaNotFound) {
			t.Errorf("expected ErrReviewMediaNotFound, got %v", err)
		}
	})

	t.Run("GetProductReviews returns ErrInvalidProductID for invalid UUID", func(t *testing.T) {
		_, _, err := repo.GetProductReviews(ctx, "invalid-uuid", 1, 10, "")
		if !errors.Is(err, domain.ErrInvalidProductID) {
			t.Errorf("expected ErrInvalidProductID, got %v", err)
		}
	})

	t.Run("GetProductReviewSummary returns ErrInvalidProductID for invalid UUID", func(t *testing.T) {
		_, err := repo.GetProductReviewSummary(ctx, "invalid-uuid")
		if !errors.Is(err, domain.ErrInvalidProductID) {
			t.Errorf("expected ErrInvalidProductID, got %v", err)
		}
	})

	t.Run("UpdateReview returns ErrReviewNotFound for invalid UUID", func(t *testing.T) {
		_, _, err := repo.UpdateReview(ctx, "invalid-uuid", "11111111-1111-1111-1111-111111111111", 5, "comment", nil)
		if !errors.Is(err, domain.ErrReviewNotFound) {
			t.Errorf("expected ErrReviewNotFound, got %v", err)
		}
	})

	t.Run("CheckEligibility returns ErrOrderNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.CheckEligibility(ctx, "invalid-order-id", "11111111-1111-1111-1111-111111111111", "user-id")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
		_, err = repo.CheckEligibility(ctx, "11111111-1111-1111-1111-111111111111", "invalid-item-id", "user-id")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
	})
}
