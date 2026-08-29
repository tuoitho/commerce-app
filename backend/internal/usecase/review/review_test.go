package review

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/storage/reviewmedia"
)

type mockReviewRepo struct {
	createReviewFn func(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error)
	updateReviewFn func(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error)
	getByIDFn      func(ctx context.Context, id string) (*domain.Review, error)
	getByItemFn    func(ctx context.Context, orderItemID string) (*domain.Review, error)
	listByItemsFn  func(ctx context.Context, orderItemIDs []string) (map[string]*domain.Review, error)
	getMediaByIDFn func(ctx context.Context, mediaID string) (*domain.ReviewMedia, error)
	getPublicFn    func(ctx context.Context, productID string, page, limit int) (*domain.ProductReviewsResult, error)
	getUserReviewsFn func(ctx context.Context, userID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error)
	getAdminReviewsFn func(ctx context.Context, ratingFilter int16, hasReplyFilter string, page, limit int) (*domain.AdminReviewsResult, error)
	updateAdminReplyFn func(ctx context.Context, reviewID string, reply *string) (*domain.Review, error)
}

func (m *mockReviewRepo) CreateReview(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error) {
	if m.createReviewFn != nil {
		return m.createReviewFn(ctx, input)
	}
	return nil, nil
}

func (m *mockReviewRepo) UpdateReview(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error) {
	if m.updateReviewFn != nil {
		return m.updateReviewFn(ctx, input)
	}
	return nil, nil, nil
}

func (m *mockReviewRepo) GetReviewByID(ctx context.Context, id string) (*domain.Review, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, nil
}

func (m *mockReviewRepo) GetReviewByOrderItemID(ctx context.Context, orderItemID string) (*domain.Review, error) {
	if m.getByItemFn != nil {
		return m.getByItemFn(ctx, orderItemID)
	}
	return nil, nil
}

func (m *mockReviewRepo) ListReviewsByOrderItemIDs(ctx context.Context, orderItemIDs []string) (map[string]*domain.Review, error) {
	if m.listByItemsFn != nil {
		return m.listByItemsFn(ctx, orderItemIDs)
	}
	return nil, nil
}

func (m *mockReviewRepo) GetReviewMediaByID(ctx context.Context, mediaID string) (*domain.ReviewMedia, error) {
	if m.getMediaByIDFn != nil {
		return m.getMediaByIDFn(ctx, mediaID)
	}
	return nil, nil
}

func (m *mockReviewRepo) GetPublicReviewsByProductID(ctx context.Context, productID string, page, limit int) (*domain.ProductReviewsResult, error) {
	if m.getPublicFn != nil {
		return m.getPublicFn(ctx, productID, page, limit)
	}
	return nil, nil
}

func (m *mockReviewRepo) GetUserReviews(ctx context.Context, userID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error) {
	if m.getUserReviewsFn != nil {
		return m.getUserReviewsFn(ctx, userID, ratingFilter, page, limit)
	}
	return nil, nil
}

func (m *mockReviewRepo) GetAdminReviews(ctx context.Context, ratingFilter int16, hasReplyFilter string, page, limit int) (*domain.AdminReviewsResult, error) {
	if m.getAdminReviewsFn != nil {
		return m.getAdminReviewsFn(ctx, ratingFilter, hasReplyFilter, page, limit)
	}
	return nil, nil
}

func (m *mockReviewRepo) UpdateAdminReply(ctx context.Context, reviewID string, reply *string) (*domain.Review, error) {
	if m.updateAdminReplyFn != nil {
		return m.updateAdminReplyFn(ctx, reviewID, reply)
	}
	return nil, nil
}

func TestCreateReview_Validation(t *testing.T) {
	store := reviewmedia.NewFakeStore()
	repo := &mockReviewRepo{}
	uc := NewReviewUseCase(repo, store, nil)
	ctx := context.Background()

	userID := uuid.NewString()
	orderID := uuid.NewString()
	itemID := uuid.NewString()

	t.Run("Invalid rating", func(t *testing.T) {
		_, err := uc.CreateReview(ctx, userID, orderID, itemID, 0, "Test", nil, nil)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "rating")

		_, err = uc.CreateReview(ctx, userID, orderID, itemID, 6, "Test", nil, nil)
		require.Error(t, err)
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "rating")
	})

	t.Run("Comment too long", func(t *testing.T) {
		longComment := string(make([]rune, 1001))
		_, err := uc.CreateReview(ctx, userID, orderID, itemID, 5, longComment, nil, nil)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "comment")
	})

	t.Run("Too many images", func(t *testing.T) {
		images := make([]ReviewFileInput, 6)
		for i := 0; i < 6; i++ {
			images[i] = ReviewFileInput{
				Reader: bytes.NewReader([]byte("\xFF\xD8\xFF\xE0")),
				Size:   4,
			}
		}
		_, err := uc.CreateReview(ctx, userID, orderID, itemID, 5, "Test", images, nil)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "images")
	})

	t.Run("Invalid image MIME signature", func(t *testing.T) {
		images := []ReviewFileInput{
			{
				Reader: bytes.NewReader([]byte("not an image binary")),
				Size:   19,
			},
		}
		_, err := uc.CreateReview(ctx, userID, orderID, itemID, 5, "Test", images, nil)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "images")
	})

	t.Run("Image size exceeded", func(t *testing.T) {
		images := []ReviewFileInput{
			{
				Reader: bytes.NewReader([]byte("\xFF\xD8\xFF")),
				Size:   domain.MaxReviewImageSizeBytes + 1,
			},
		}
		_, err := uc.CreateReview(ctx, userID, orderID, itemID, 5, "Test", images, nil)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "images")
	})

	t.Run("Invalid video MIME signature", func(t *testing.T) {
		video := &ReviewFileInput{
			Reader: bytes.NewReader([]byte("plain text video")),
			Size:   16,
		}
		_, err := uc.CreateReview(ctx, userID, orderID, itemID, 5, "Test", nil, video)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "video")
	})
}

func TestCreateReview_SuccessAndCompensation(t *testing.T) {
	ctx := context.Background()
	userID := uuid.NewString()
	orderID := uuid.NewString()
	itemID := uuid.NewString()

	t.Run("Success upload and create", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepo{
			createReviewFn: func(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error) {
				assert.Equal(t, int16(5), input.Rating)
				assert.Equal(t, "Great product!", input.Comment)
				require.Len(t, input.Media, 2)
				assert.Equal(t, domain.ReviewMediaTypeImage, input.Media[0].MediaType)
				assert.Equal(t, domain.ReviewMediaTypeVideo, input.Media[1].MediaType)
				return &domain.Review{
					ID:          uuid.NewString(),
					OrderItemID: input.OrderItemID,
					Rating:      input.Rating,
					Comment:     input.Comment,
					CanEdit:     true,
				}, nil
			},
		}
		uc := NewReviewUseCase(repo, store, nil)

		images := []ReviewFileInput{
			{
				Reader: bytes.NewReader([]byte("\xFF\xD8\xFF\xDB")),
				Size:   4,
			},
		}
		// Valid MP4 signature with ftyp at offset 4
		mp4Data := make([]byte, 16)
		copy(mp4Data[4:8], []byte("ftyp"))
		video := &ReviewFileInput{
			Reader: bytes.NewReader(mp4Data),
			Size:   int64(len(mp4Data)),
		}

		rev, err := uc.CreateReview(ctx, userID, orderID, itemID, 5, "  Great product!  ", images, video)
		require.NoError(t, err)
		require.NotNil(t, rev)
		assert.True(t, rev.CanEdit)
		assert.Equal(t, 2, store.ObjectCount())
	})

	t.Run("Repo error compensates uploaded objects", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepo{
			createReviewFn: func(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error) {
				return nil, domain.ErrReviewAlreadyExists
			},
		}
		uc := NewReviewUseCase(repo, store, nil)

		images := []ReviewFileInput{
			{
				Reader: bytes.NewReader([]byte("\x89PNG\r\n\x1a\n")),
				Size:   8,
			},
		}

		rev, err := uc.CreateReview(ctx, userID, orderID, itemID, 5, "Nice", images, nil)
		require.Error(t, err)
		assert.Nil(t, rev)
		assert.Equal(t, domain.ErrReviewAlreadyExists, err)
		// Objects must have been deleted from store
		assert.Equal(t, 0, store.ObjectCount())
	})
}

func TestUpdateReview_ValidationAndLifecycle(t *testing.T) {
	ctx := context.Background()
	userID := uuid.NewString()
	orderID := uuid.NewString()
	itemID := uuid.NewString()
	reviewID := uuid.NewString()
	retainedMediaID := uuid.NewString()

	t.Run("UpdateReview_InvalidRetainedID", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepo{}
		uc := NewReviewUseCase(repo, store, nil)

		_, err := uc.UpdateReview(ctx, userID, orderID, itemID, 4, "Updated", []string{"invalid-uuid"}, nil, nil)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "retainedMediaIds")
	})

	t.Run("UpdateReview_Success_CleansOldObjects", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		// Seed an old object into the store
		oldKey := "reviews/old/img1.jpg"
		_ = store.PutObject(ctx, oldKey, bytes.NewReader([]byte("old")), 3, "image/jpeg")
		assert.Equal(t, 1, store.ObjectCount())

		repo := &mockReviewRepo{
			updateReviewFn: func(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error) {
				assert.Equal(t, int16(4), input.Rating)
				assert.Equal(t, "Updated comment", input.Comment)
				assert.Equal(t, []string{retainedMediaID}, input.RetainedMediaIDs)
				return &domain.Review{
					ID:        reviewID,
					Rating:    4,
					Comment:   "Updated comment",
					EditCount: 1,
					Edited:    true,
					CanEdit:   false,
				}, []string{oldKey}, nil
			},
		}
		uc := NewReviewUseCase(repo, store, nil)

		newImg := []ReviewFileInput{
			{
				Reader: bytes.NewReader([]byte("\xFF\xD8\xFF\xEE")),
				Size:   4,
			},
		}

		rev, err := uc.UpdateReview(ctx, userID, orderID, itemID, 4, "Updated comment", []string{retainedMediaID}, newImg, nil)
		require.NoError(t, err)
		require.NotNil(t, rev)
		assert.True(t, rev.Edited)
		assert.False(t, rev.CanEdit)

		// Old object was deleted, new object remains -> total count is 1
		assert.Equal(t, 1, store.ObjectCount())
		_, err = store.StatObject(ctx, oldKey)
		assert.Error(t, err, "Old object must be removed after successful update")
	})

	t.Run("UpdateReview_Failure_CompensatesNewObjects", func(t *testing.T) {
		store := reviewmedia.NewFakeStore()
		repo := &mockReviewRepo{
			updateReviewFn: func(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error) {
				return nil, nil, domain.ErrReviewEditLimitReached
			},
		}
		uc := NewReviewUseCase(repo, store, nil)

		newImg := []ReviewFileInput{
			{
				Reader: bytes.NewReader([]byte("\xFF\xD8\xFF\xEE")),
				Size:   4,
			},
		}

		rev, err := uc.UpdateReview(ctx, userID, orderID, itemID, 4, "Updated comment", nil, newImg, nil)
		require.Error(t, err)
		assert.Nil(t, rev)
		assert.Equal(t, domain.ErrReviewEditLimitReached, err)
		// Uploaded new objects must be compensated/deleted
		assert.Equal(t, 0, store.ObjectCount())
	})
}

func TestGetUserReviews_UseCase(t *testing.T) {
	ctx := context.Background()
	userID := uuid.NewString()

	t.Run("Invalid User ID", func(t *testing.T) {
		uc := NewReviewUseCase(&mockReviewRepo{}, nil, nil)
		_, err := uc.GetUserReviews(ctx, "invalid-uuid", 0, 1, 10)
		require.Error(t, err)
		assert.Equal(t, domain.ErrInvalidToken, err)
	})

	t.Run("Invalid Rating Filter", func(t *testing.T) {
		uc := NewReviewUseCase(&mockReviewRepo{}, nil, nil)
		_, err := uc.GetUserReviews(ctx, userID, -1, 1, 10)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "rating")

		_, err = uc.GetUserReviews(ctx, userID, 6, 1, 10)
		require.Error(t, err)
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "rating")
	})

	t.Run("Normalizes page and limit", func(t *testing.T) {
		var capturedPage, capturedLimit int
		var capturedRating int16
		repo := &mockReviewRepo{
			getUserReviewsFn: func(ctx context.Context, uID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error) {
				capturedPage = page
				capturedLimit = limit
				capturedRating = ratingFilter
				return &domain.UserReviewsResult{
					Reviews: []domain.UserReview{},
					Total:   0,
				}, nil
			},
		}
		uc := NewReviewUseCase(repo, nil, nil)

		res, err := uc.GetUserReviews(ctx, userID, 5, 0, 99)
		require.NoError(t, err)
		assert.NotNil(t, res)
		assert.Equal(t, 1, capturedPage)
		assert.Equal(t, 10, capturedLimit)
		assert.Equal(t, int16(5), capturedRating)
	})
}

func TestAdminReviews_UseCase(t *testing.T) {
	ctx := context.Background()

	t.Run("UpdateAdminReply - empty string returns validation error", func(t *testing.T) {
		repo := &mockReviewRepo{}
		uc := NewReviewUseCase(repo, nil, nil)
		emptyReply := "   "
		_, err := uc.UpdateAdminReply(ctx, "rev-1", &emptyReply)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "reply")
	})

	t.Run("UpdateAdminReply - exceeds max comment length", func(t *testing.T) {
		repo := &mockReviewRepo{}
		uc := NewReviewUseCase(repo, nil, nil)
		longReply := string(make([]rune, domain.MaxReviewCommentLength+1))
		_, err := uc.UpdateAdminReply(ctx, "rev-1", &longReply)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "reply")
	})

	t.Run("UpdateAdminReply - success with trimmed reply", func(t *testing.T) {
		var capturedReply *string
		var capturedID string
		repo := &mockReviewRepo{
			updateAdminReplyFn: func(ctx context.Context, reviewID string, reply *string) (*domain.Review, error) {
				capturedID = reviewID
				capturedReply = reply
				return &domain.Review{ID: reviewID, AdminReply: reply}, nil
			},
		}
		uc := NewReviewUseCase(repo, nil, nil)
		reply := "  Cảm ơn bạn đã phản hồi!  "
		res, err := uc.UpdateAdminReply(ctx, "rev-1", &reply)
		require.NoError(t, err)
		assert.Equal(t, "rev-1", capturedID)
		require.NotNil(t, capturedReply)
		assert.Equal(t, "Cảm ơn bạn đã phản hồi!", *capturedReply)
		assert.Equal(t, "Cảm ơn bạn đã phản hồi!", *res.AdminReply)
	})

	t.Run("UpdateAdminReply - delete reply by passing nil", func(t *testing.T) {
		var capturedReply *string
		repo := &mockReviewRepo{
			updateAdminReplyFn: func(ctx context.Context, reviewID string, reply *string) (*domain.Review, error) {
				capturedReply = reply
				return &domain.Review{ID: reviewID, AdminReply: nil}, nil
			},
		}
		uc := NewReviewUseCase(repo, nil, nil)
		res, err := uc.UpdateAdminReply(ctx, "rev-1", nil)
		require.NoError(t, err)
		assert.Nil(t, capturedReply)
		assert.Nil(t, res.AdminReply)
	})

	t.Run("GetAdminReviews - delegates to repo", func(t *testing.T) {
		repo := &mockReviewRepo{
			getAdminReviewsFn: func(ctx context.Context, ratingFilter int16, hasReplyFilter string, page, limit int) (*domain.AdminReviewsResult, error) {
				return &domain.AdminReviewsResult{
					Reviews: []domain.AdminReview{
						{ID: "rev-1", Rating: 5, Comment: "Great!"},
					},
					Total: 1,
				}, nil
			},
		}
		uc := NewReviewUseCase(repo, nil, nil)
		res, err := uc.GetAdminReviews(ctx, 5, "yes", 1, 10)
		require.NoError(t, err)
		require.Len(t, res.Reviews, 1)
		assert.Equal(t, "rev-1", res.Reviews[0].ID)
		assert.Equal(t, int64(1), res.Total)
	})
}

