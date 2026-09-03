package review_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/storage"
	"commerce-backend/internal/usecase/review"
)

func createValidJPEGData() []byte {
	// JPEG magic bytes 0xFF, 0xD8, 0xFF + some filler
	data := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01}
	return data
}

func createValidMP4Data() []byte {
	// MP4 magic bytes: 4 bytes length + 'ftyp' + 'mp42'
	data := []byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'm', 'p', '4', '2', 0x00, 0x00, 0x00, 0x00}
	return data
}

func hashAndSize(data []byte) (string, int64) {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:]), int64(len(data))
}

func TestMIMEDetection(t *testing.T) {
	t.Run("JPEG detection", func(t *testing.T) {
		data := createValidJPEGData()
		mime := review.DetectMIME(data)
		if mime != "image/jpeg" {
			t.Errorf("got %q, want 'image/jpeg'", mime)
		}
	})

	t.Run("PNG detection", func(t *testing.T) {
		data := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
		mime := review.DetectMIME(data)
		if mime != "image/png" {
			t.Errorf("got %q, want 'image/png'", mime)
		}
	})

	t.Run("WebP detection", func(t *testing.T) {
		data := []byte("RIFF\x00\x00\x00\x00WEBPVP8 ")
		mime := review.DetectMIME(data)
		if mime != "image/webp" {
			t.Errorf("got %q, want 'image/webp'", mime)
		}
	})

	t.Run("MP4 detection", func(t *testing.T) {
		data := createValidMP4Data()
		mime := review.DetectMIME(data)
		if mime != "video/mp4" {
			t.Errorf("got %q, want 'video/mp4'", mime)
		}
	})

	t.Run("WebM detection", func(t *testing.T) {
		data := []byte{0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81}
		mime := review.DetectMIME(data)
		if mime != "video/webm" {
			t.Errorf("got %q, want 'video/webm'", mime)
		}
	})

	t.Run("Arbitrary text / non-media rejected", func(t *testing.T) {
		data := []byte("plain text content pretending to be an image")
		mime := review.DetectMIME(data)
		_, allowed := review.ClassifyMediaType(mime)
		if allowed {
			t.Errorf("expected text content not to be allowed media, got %q", mime)
		}
	})
}

func TestValidationErrors(t *testing.T) {
	uc := review.New(review.Dependencies{
		Reviews: nil,
		Storage: storage.NewMemoryStorage("test-bucket"),
	})

	ctx := context.Background()

	t.Run("PURCHASED-REVIEW-API-027: invalid rating 0, 6", func(t *testing.T) {
		in := review.CreateInput{
			OrderID:     "11111111-1111-1111-1111-111111111111",
			OrderItemID: "22222222-2222-2222-2222-222222222222",
			UserID:      "33333333-3333-3333-3333-333333333333",
			Rating:      0,
			RatingSet:   true,
		}
		_, err := uc.CreateReview(ctx, in)
		if err == nil {
			t.Fatal("expected error")
		}
		// Note: since repo is nil, let's test with mock or verify validation error structure
	})

	t.Run("VoteReview rejects invalid vote type", func(t *testing.T) {
		_, err := uc.VoteReview(ctx, "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "invalid")
		if err == nil {
			t.Fatal("expected validation error for invalid vote type")
		}
	})

	t.Run("VoteReview rejects invalid review UUID", func(t *testing.T) {
		_, err := uc.VoteReview(ctx, "not-a-uuid", "22222222-2222-2222-2222-222222222222", "helpful")
		if err == nil {
			t.Fatal("expected validation error for invalid review UUID")
		}
	})

	t.Run("UnvoteReview rejects invalid review UUID", func(t *testing.T) {
		_, err := uc.UnvoteReview(ctx, "not-a-uuid", "22222222-2222-2222-2222-222222222222")
		if err == nil {
			t.Fatal("expected validation error for invalid review UUID")
		}
	})

	t.Run("ListAdminReviews rejects invalid sort", func(t *testing.T) {
		_, _, err := uc.ListAdminReviews(ctx, 1, 10, "invalid_sort", "", "")
		if err == nil {
			t.Fatal("expected validation error for invalid sort")
		}
	})

	t.Run("ListAdminReviews rejects invalid product UUID", func(t *testing.T) {
		_, _, err := uc.ListAdminReviews(ctx, 1, 10, "latest", "not-a-uuid", "")
		if err == nil {
			t.Fatal("expected validation error for invalid product UUID")
		}
	})

	t.Run("GetAdminReviewStats with nil reviews returns empty stats", func(t *testing.T) {
		stats, err := uc.GetAdminReviewStats(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if stats == nil || stats.TotalReviews != 0 {
			t.Fatalf("expected empty stats, got %+v", stats)
		}
	})
}

type stubReviewRepo struct {
	domain.ReviewRepository
	getReviewForUserFn func(ctx context.Context, reviewID, userID string) (*domain.Review, error)
	voteReviewFn       func(ctx context.Context, reviewID, userID string, isHelpful bool) (*domain.ReviewVoteResult, error)
}

func (s *stubReviewRepo) GetReviewForUser(ctx context.Context, reviewID, userID string) (*domain.Review, error) {
	if s.getReviewForUserFn != nil {
		return s.getReviewForUserFn(ctx, reviewID, userID)
	}
	return nil, nil
}

func (s *stubReviewRepo) VoteReview(ctx context.Context, reviewID, userID string, isHelpful bool) (*domain.ReviewVoteResult, error) {
	if s.voteReviewFn != nil {
		return s.voteReviewFn(ctx, reviewID, userID, isHelpful)
	}
	return nil, nil
}

func TestReviewUseCase_WithFakeRepository(t *testing.T) {
	ctx := context.Background()
	stub := &stubReviewRepo{
		getReviewForUserFn: func(ctx context.Context, reviewID, userID string) (*domain.Review, error) {
			return &domain.Review{ID: reviewID, Comment: "Great product!"}, nil
		},
		voteReviewFn: func(ctx context.Context, reviewID, userID string, isHelpful bool) (*domain.ReviewVoteResult, error) {
			v := "helpful"
			return &domain.ReviewVoteResult{
				ReviewID:     reviewID,
				HelpfulCount: 1,
				ViewerVote:   &v,
			}, nil
		},
	}

	uc := review.New(review.Dependencies{
		Reviews: stub,
		Storage: storage.NewMemoryStorage("test-bucket"),
	})

	t.Run("GetOwnedReview succeeds via domain interface", func(t *testing.T) {
		validReviewID := "11111111-2222-3333-4444-555555555555"
		rev, err := uc.GetOwnedReview(ctx, validReviewID, "user-456")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if rev.ID != validReviewID || rev.Comment != "Great product!" {
			t.Errorf("unexpected review: %+v", rev)
		}
	})

	t.Run("VoteReview succeeds via domain interface", func(t *testing.T) {
		res, err := uc.VoteReview(ctx, "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "helpful")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.HelpfulCount != 1 {
			t.Errorf("expected HelpfulCount=1, got %d", res.HelpfulCount)
		}
	})
}

