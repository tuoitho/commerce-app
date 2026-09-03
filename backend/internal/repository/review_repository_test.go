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

	t.Run("ListOwnerReviews returns empty list for invalid UUID", func(t *testing.T) {
		items, total, err := repo.ListOwnerReviews(ctx, "invalid-user-id", 1, 10)
		if err != nil {
			t.Errorf("expected nil error, got %v", err)
		}
		if total != 0 || len(items) != 0 {
			t.Errorf("expected 0 total and empty items, got %d total and %d items", total, len(items))
		}
	})

	t.Run("VoteReview returns ErrReviewNotFound for invalid review UUID", func(t *testing.T) {
		_, err := repo.VoteReview(ctx, "invalid-review-id", "11111111-1111-1111-1111-111111111111", true)
		if !errors.Is(err, domain.ErrReviewNotFound) {
			t.Errorf("expected ErrReviewNotFound, got %v", err)
		}
	})

	t.Run("VoteReview returns ErrReviewNotFound for invalid user UUID", func(t *testing.T) {
		_, err := repo.VoteReview(ctx, "11111111-1111-1111-1111-111111111111", "invalid-user-id", true)
		if !errors.Is(err, domain.ErrReviewNotFound) {
			t.Errorf("expected ErrReviewNotFound, got %v", err)
		}
	})

	t.Run("UnvoteReview returns ErrReviewNotFound for invalid review UUID", func(t *testing.T) {
		_, err := repo.UnvoteReview(ctx, "invalid-review-id", "11111111-1111-1111-1111-111111111111")
		if !errors.Is(err, domain.ErrReviewNotFound) {
			t.Errorf("expected ErrReviewNotFound, got %v", err)
		}
	})

	t.Run("UnvoteReview returns ErrReviewNotFound for invalid user UUID", func(t *testing.T) {
		_, err := repo.UnvoteReview(ctx, "11111111-1111-1111-1111-111111111111", "invalid-user-id")
		if !errors.Is(err, domain.ErrReviewNotFound) {
			t.Errorf("expected ErrReviewNotFound, got %v", err)
		}
	})

	t.Run("ListAdminReviews returns empty for nil db", func(t *testing.T) {
		items, total, err := repo.ListAdminReviews(ctx, 1, 10, "latest", "", "")
		if err != nil {
			t.Errorf("expected nil error, got %v", err)
		}
		if total != 0 || len(items) != 0 {
			t.Errorf("expected empty items and total 0, got %d and %d", len(items), total)
		}
	})

	t.Run("GetAdminReviewStats returns empty stats for nil db", func(t *testing.T) {
		stats, err := repo.GetAdminReviewStats(ctx)
		if err != nil {
			t.Errorf("expected nil error, got %v", err)
		}
		if stats == nil || stats.TotalReviews != 0 {
			t.Errorf("expected empty stats, got %+v", stats)
		}
	})
}
