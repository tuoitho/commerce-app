package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type ReviewRepository struct {
	db orderDB
}

func NewReviewRepository(db orderDB) *ReviewRepository {
	return &ReviewRepository{db: db}
}

var _ domain.ReviewRepository = (*ReviewRepository)(nil)

func (r *ReviewRepository) CreateReview(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error) {
	if _, err := uuid.Parse(input.OrderID); err != nil {
		return nil, domain.ErrOrderItemNotFound
	}
	if _, err := uuid.Parse(input.UserID); err != nil {
		return nil, domain.ErrOrderItemNotFound
	}
	if _, err := uuid.Parse(input.OrderItemID); err != nil {
		return nil, domain.ErrOrderItemNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// 1. Lock order (shared lock order with order-returns)
	orderRow, err := q.LockOrderForUpdate(ctx, sqlc.LockOrderForUpdateParams{
		ID:     input.OrderID,
		UserID: input.UserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderItemNotFound
		}
		return nil, err
	}

	// 2. Check order delivery status
	orderStatus := domain.OrderStatus(orderRow.Status)
	if orderStatus != domain.OrderStatusDelivered && orderStatus != domain.OrderStatusPartiallyReturned {
		return nil, domain.ErrReviewNotEligible
	}

	// 3. Check that order_item belongs to this order
	orderItems, err := q.ListOrderItemsByOrderID(ctx, input.OrderID)
	if err != nil {
		return nil, err
	}
	var foundItem bool
	for _, item := range orderItems {
		if item.ID == input.OrderItemID {
			foundItem = true
			break
		}
	}
	if !foundItem {
		return nil, domain.ErrOrderItemNotFound
	}

	// 4. Check if item has been refunded
	isRefunded, err := q.IsOrderItemRefunded(ctx, input.OrderItemID)
	if err != nil {
		return nil, err
	}
	if isRefunded {
		return nil, domain.ErrReviewNotEligible
	}

	// 5. Check if review already exists
	_, err = q.GetReviewByOrderItemID(ctx, input.OrderItemID)
	if err == nil {
		return nil, domain.ErrReviewAlreadyExists
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	// 6. Insert review
	reviewRow, err := q.InsertReview(ctx, sqlc.InsertReviewParams{
		OrderItemID: input.OrderItemID,
		Rating:      input.Rating,
		Comment:     input.Comment,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // Unique violation
			return nil, domain.ErrReviewAlreadyExists
		}
		return nil, err
	}

	// 7. Insert review media
	var mediaList []domain.ReviewMedia
	for _, m := range input.Media {
		mediaRow, err := q.InsertReviewMedia(ctx, sqlc.InsertReviewMediaParams{
			ReviewID:  reviewRow.ID,
			MediaType: string(m.MediaType),
			MimeType:  m.MimeType,
			ObjectKey: m.ObjectKey,
			SizeBytes: m.SizeBytes,
			Position:  m.Position,
		})
		if err != nil {
			return nil, err
		}
		mediaList = append(mediaList, domain.ReviewMedia{
			ID:        mediaRow.ID,
			ReviewID:  mediaRow.ReviewID,
			Type:      domain.ReviewMediaType(mediaRow.MediaType),
			URL:       fmt.Sprintf("/media/reviews/%s", mediaRow.ID),
			MimeType:  mediaRow.MimeType,
			ObjectKey: mediaRow.ObjectKey,
			SizeBytes: mediaRow.SizeBytes,
			Position:  mediaRow.Position,
			CreatedAt: mediaRow.CreatedAt,
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	if mediaList == nil {
		mediaList = []domain.ReviewMedia{}
	}

	return &domain.Review{
		ID:          reviewRow.ID,
		OrderItemID: reviewRow.OrderItemID,
		Rating:      reviewRow.Rating,
		Comment:     reviewRow.Comment,
		EditCount:   reviewRow.EditCount,
		Media:       mediaList,
		CreatedAt:   reviewRow.CreatedAt,
		UpdatedAt:   reviewRow.UpdatedAt,
		Edited:      reviewRow.EditCount > 0,
		CanEdit:     reviewRow.EditCount == 0,
	}, nil
}

func (r *ReviewRepository) UpdateReview(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error) {
	if _, err := uuid.Parse(input.OrderID); err != nil {
		return nil, nil, domain.ErrOrderItemNotFound
	}
	if _, err := uuid.Parse(input.UserID); err != nil {
		return nil, nil, domain.ErrOrderItemNotFound
	}
	if _, err := uuid.Parse(input.OrderItemID); err != nil {
		return nil, nil, domain.ErrOrderItemNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// 1. Lock order
	_, err = q.LockOrderForUpdate(ctx, sqlc.LockOrderForUpdateParams{
		ID:     input.OrderID,
		UserID: input.UserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, domain.ErrOrderItemNotFound
		}
		return nil, nil, err
	}

	// 2. Check item belongs to order
	orderItems, err := q.ListOrderItemsByOrderID(ctx, input.OrderID)
	if err != nil {
		return nil, nil, err
	}
	var foundItem bool
	for _, item := range orderItems {
		if item.ID == input.OrderItemID {
			foundItem = true
			break
		}
	}
	if !foundItem {
		return nil, nil, domain.ErrOrderItemNotFound
	}

	// 3. Lock review
	reviewRow, err := q.LockReviewByOrderItemID(ctx, input.OrderItemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, domain.ErrReviewNotFound
		}
		return nil, nil, err
	}

	if reviewRow.ID != input.ReviewID && input.ReviewID != "" {
		return nil, nil, domain.ErrReviewNotFound
	}

	if reviewRow.EditCount > 0 {
		return nil, nil, domain.ErrReviewEditLimitReached
	}

	// 4. Update review
	updatedReviewRow, err := q.UpdateReview(ctx, sqlc.UpdateReviewParams{
		ID:      reviewRow.ID,
		Rating:  input.Rating,
		Comment: input.Comment,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, domain.ErrReviewEditLimitReached
		}
		return nil, nil, err
	}

	// 5. Validate retained media ownership & count limits
	existingMedia, err := q.ListReviewMediaByReviewID(ctx, reviewRow.ID)
	if err != nil {
		return nil, nil, err
	}
	existingMediaMap := make(map[string]sqlc.ReviewMedium, len(existingMedia))
	for _, m := range existingMedia {
		existingMediaMap[m.ID] = m
	}

	var retainedImageCount, retainedVideoCount int
	for _, retainedID := range input.RetainedMediaIDs {
		m, ok := existingMediaMap[retainedID]
		if !ok {
			return nil, nil, domain.NewValidationError(map[string]string{
				"retainedMediaIds": "Tệp đính kèm giữ lại không thuộc đánh giá này",
			})
		}
		if m.MediaType == "image" {
			retainedImageCount++
		} else if m.MediaType == "video" {
			retainedVideoCount++
		}
	}

	var newImageCount, newVideoCount int
	for _, m := range input.NewMedia {
		if m.MediaType == domain.ReviewMediaTypeImage {
			newImageCount++
		} else if m.MediaType == domain.ReviewMediaTypeVideo {
			newVideoCount++
		}
	}

	if retainedImageCount+newImageCount > domain.MaxReviewImagesCount {
		return nil, nil, domain.NewValidationError(map[string]string{
			"images": "Tổng số ảnh sau chỉnh sửa không được vượt quá 5",
		})
	}
	if retainedVideoCount+newVideoCount > domain.MaxReviewVideosCount {
		return nil, nil, domain.NewValidationError(map[string]string{
			"video": "Tổng số video sau chỉnh sửa không được vượt quá 1",
		})
	}

	// 6. Delete media that are not retained and collect their object keys
	var deletedObjectKeys []string
	if len(input.RetainedMediaIDs) > 0 {
		deletedRows, err := q.DeleteReviewMediaNotInIDs(ctx, sqlc.DeleteReviewMediaNotInIDsParams{
			ReviewID:    reviewRow.ID,
			RetainedIds: input.RetainedMediaIDs,
		})
		if err != nil {
			return nil, nil, err
		}
		for _, d := range deletedRows {
			deletedObjectKeys = append(deletedObjectKeys, d.ObjectKey)
		}
	} else {
		for _, m := range existingMedia {
			deletedObjectKeys = append(deletedObjectKeys, m.ObjectKey)
		}
		if err := q.DeleteReviewMediaByReviewID(ctx, reviewRow.ID); err != nil {
			return nil, nil, err
		}
	}

	// 7. Insert new media with positions after retained media
	var pos int16 = int16(len(input.RetainedMediaIDs))
	for _, m := range input.NewMedia {
		_, err := q.InsertReviewMedia(ctx, sqlc.InsertReviewMediaParams{
			ReviewID:  reviewRow.ID,
			MediaType: string(m.MediaType),
			MimeType:  m.MimeType,
			ObjectKey: m.ObjectKey,
			SizeBytes: m.SizeBytes,
			Position:  pos,
		})
		if err != nil {
			return nil, nil, err
		}
		pos++
	}

	// 7. Load final media list
	mediaRows, err := q.ListReviewMediaByReviewID(ctx, reviewRow.ID)
	if err != nil {
		return nil, nil, err
	}
	mediaList := make([]domain.ReviewMedia, 0, len(mediaRows))
	for _, m := range mediaRows {
		mediaList = append(mediaList, domain.ReviewMedia{
			ID:        m.ID,
			ReviewID:  m.ReviewID,
			Type:      domain.ReviewMediaType(m.MediaType),
			URL:       fmt.Sprintf("/media/reviews/%s", m.ID),
			MimeType:  m.MimeType,
			ObjectKey: m.ObjectKey,
			SizeBytes: m.SizeBytes,
			Position:  m.Position,
			CreatedAt: m.CreatedAt,
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	return &domain.Review{
		ID:          updatedReviewRow.ID,
		OrderItemID: updatedReviewRow.OrderItemID,
		Rating:      updatedReviewRow.Rating,
		Comment:     updatedReviewRow.Comment,
		EditCount:   updatedReviewRow.EditCount,
		Media:       mediaList,
		CreatedAt:   updatedReviewRow.CreatedAt,
		UpdatedAt:   updatedReviewRow.UpdatedAt,
		Edited:      updatedReviewRow.EditCount > 0,
		CanEdit:     updatedReviewRow.EditCount == 0,
	}, deletedObjectKeys, nil
}

func (r *ReviewRepository) GetReviewByID(ctx context.Context, id string) (*domain.Review, error) {
	q := sqlc.New(r.db)
	row, err := q.GetReviewByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReviewNotFound
		}
		return nil, err
	}

	mediaRows, err := q.ListReviewMediaByReviewID(ctx, id)
	if err != nil {
		return nil, err
	}

	mediaList := make([]domain.ReviewMedia, 0, len(mediaRows))
	for _, m := range mediaRows {
		mediaList = append(mediaList, domain.ReviewMedia{
			ID:        m.ID,
			ReviewID:  m.ReviewID,
			Type:      domain.ReviewMediaType(m.MediaType),
			URL:       fmt.Sprintf("/media/reviews/%s", m.ID),
			MimeType:  m.MimeType,
			ObjectKey: m.ObjectKey,
			SizeBytes: m.SizeBytes,
			Position:  m.Position,
			CreatedAt: m.CreatedAt,
		})
	}

	return &domain.Review{
		ID:          row.ID,
		OrderItemID: row.OrderItemID,
		Rating:      row.Rating,
		Comment:     row.Comment,
		EditCount:   row.EditCount,
		Media:       mediaList,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
		Edited:      row.EditCount > 0,
		CanEdit:     row.EditCount == 0,
	}, nil
}

func (r *ReviewRepository) GetReviewByOrderItemID(ctx context.Context, orderItemID string) (*domain.Review, error) {
	q := sqlc.New(r.db)
	row, err := q.GetReviewByOrderItemID(ctx, orderItemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReviewNotFound
		}
		return nil, err
	}

	mediaRows, err := q.ListReviewMediaByReviewID(ctx, row.ID)
	if err != nil {
		return nil, err
	}

	mediaList := make([]domain.ReviewMedia, 0, len(mediaRows))
	for _, m := range mediaRows {
		mediaList = append(mediaList, domain.ReviewMedia{
			ID:        m.ID,
			ReviewID:  m.ReviewID,
			Type:      domain.ReviewMediaType(m.MediaType),
			URL:       fmt.Sprintf("/media/reviews/%s", m.ID),
			MimeType:  m.MimeType,
			ObjectKey: m.ObjectKey,
			SizeBytes: m.SizeBytes,
			Position:  m.Position,
			CreatedAt: m.CreatedAt,
		})
	}

	return &domain.Review{
		ID:          row.ID,
		OrderItemID: row.OrderItemID,
		Rating:      row.Rating,
		Comment:     row.Comment,
		EditCount:   row.EditCount,
		Media:       mediaList,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
		Edited:      row.EditCount > 0,
		CanEdit:     row.EditCount == 0,
	}, nil
}

func (r *ReviewRepository) ListReviewsByOrderItemIDs(ctx context.Context, orderItemIDs []string) (map[string]*domain.Review, error) {
	if len(orderItemIDs) == 0 {
		return make(map[string]*domain.Review), nil
	}

	q := sqlc.New(r.db)
	rows, err := q.ListReviewsByOrderItemIDs(ctx, orderItemIDs)
	if err != nil {
		return nil, err
	}

	if len(rows) == 0 {
		return make(map[string]*domain.Review), nil
	}

	reviewIDs := make([]string, len(rows))
	for i, row := range rows {
		reviewIDs[i] = row.ID
	}

	mediaRows, err := q.ListReviewMediaByReviewIDs(ctx, reviewIDs)
	if err != nil {
		return nil, err
	}

	mediaMap := make(map[string][]domain.ReviewMedia)
	for _, m := range mediaRows {
		mediaMap[m.ReviewID] = append(mediaMap[m.ReviewID], domain.ReviewMedia{
			ID:        m.ID,
			ReviewID:  m.ReviewID,
			Type:      domain.ReviewMediaType(m.MediaType),
			URL:       fmt.Sprintf("/media/reviews/%s", m.ID),
			MimeType:  m.MimeType,
			ObjectKey: m.ObjectKey,
			SizeBytes: m.SizeBytes,
			Position:  m.Position,
			CreatedAt: m.CreatedAt,
		})
	}

	result := make(map[string]*domain.Review, len(rows))
	for _, row := range rows {
		media := mediaMap[row.ID]
		if media == nil {
			media = []domain.ReviewMedia{}
		}
		result[row.OrderItemID] = &domain.Review{
			ID:          row.ID,
			OrderItemID: row.OrderItemID,
			Rating:      row.Rating,
			Comment:     row.Comment,
			EditCount:   row.EditCount,
			Media:       media,
			CreatedAt:   row.CreatedAt,
			UpdatedAt:   row.UpdatedAt,
			Edited:      row.EditCount > 0,
			CanEdit:     row.EditCount == 0,
		}
	}

	return result, nil
}

func (r *ReviewRepository) GetReviewMediaByID(ctx context.Context, mediaID string) (*domain.ReviewMedia, error) {
	q := sqlc.New(r.db)
	row, err := q.GetReviewMediaByID(ctx, mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReviewMediaNotFound
		}
		return nil, err
	}

	return &domain.ReviewMedia{
		ID:        row.ID,
		ReviewID:  row.ReviewID,
		Type:      domain.ReviewMediaType(row.MediaType),
		URL:       fmt.Sprintf("/media/reviews/%s", row.ID),
		MimeType:  row.MimeType,
		ObjectKey: row.ObjectKey,
		SizeBytes: row.SizeBytes,
		Position:  row.Position,
		CreatedAt: row.CreatedAt,
	}, nil
}

func (r *ReviewRepository) GetPublicReviewsByProductID(ctx context.Context, productID string, page, limit int) (*domain.ProductReviewsResult, error) {
	q := sqlc.New(r.db)

	summaryRow, err := q.GetReviewSummaryByProductID(ctx, productID)
	if err != nil {
		return nil, err
	}

	ratingCountsMap := map[string]int64{
		"1": 0,
		"2": 0,
		"3": 0,
		"4": 0,
		"5": 0,
	}
	countsRows, err := q.GetRatingCountsByProductID(ctx, productID)
	if err != nil {
		return nil, err
	}
	for _, cr := range countsRows {
		key := strconv.FormatInt(int64(cr.Rating), 10)
		ratingCountsMap[key] = cr.Count
	}

	avgRatingStr := "0.0"
	if summaryRow.TotalReviews > 0 && strings.TrimSpace(summaryRow.AverageRating) != "" {
		avgRatingStr = summaryRow.AverageRating
	}

	offset := (page - 1) * limit
	reviewRows, err := q.ListPublicReviewsByProductID(ctx, sqlc.ListPublicReviewsByProductIDParams{
		ProductID:   productID,
		OffsetCount: int32(offset),
		LimitCount:  int32(limit),
	})
	if err != nil {
		return nil, err
	}

	var reviewIDs []string
	for _, row := range reviewRows {
		reviewIDs = append(reviewIDs, row.ID)
	}

	mediaMap := make(map[string][]domain.ReviewMedia)
	if len(reviewIDs) > 0 {
		mediaRows, err := q.ListReviewMediaByReviewIDs(ctx, reviewIDs)
		if err != nil {
			return nil, err
		}
		for _, m := range mediaRows {
			mediaMap[m.ReviewID] = append(mediaMap[m.ReviewID], domain.ReviewMedia{
				ID:        m.ID,
				ReviewID:  m.ReviewID,
				Type:      domain.ReviewMediaType(m.MediaType),
				URL:       fmt.Sprintf("/media/reviews/%s", m.ID),
				MimeType:  m.MimeType,
				ObjectKey: m.ObjectKey,
				SizeBytes: m.SizeBytes,
				Position:  m.Position,
				CreatedAt: m.CreatedAt,
			})
		}
	}

	publicReviews := make([]domain.PublicReview, 0, len(reviewRows))
	for _, row := range reviewRows {
		var options []domain.CartOption
		if row.Options != "" {
			_ = json.Unmarshal([]byte(row.Options), &options)
		}
		if options == nil {
			options = []domain.CartOption{}
		}

		media := mediaMap[row.ID]
		if media == nil {
			media = []domain.ReviewMedia{}
		}

		publicReviews = append(publicReviews, domain.PublicReview{
			ID:      row.ID,
			Rating:  row.Rating,
			Comment: row.Comment,
			Reviewer: domain.PublicReviewer{
				MaskedEmail: domain.MaskReviewerEmail(row.ReviewerEmail),
			},
			Purchase: domain.PublicPurchase{
				Model:   row.Model,
				Options: options,
			},
			Media:     media,
			Edited:    row.EditCount > 0,
			CreatedAt: row.CreatedAt,
			UpdatedAt: row.UpdatedAt,
		})
	}

	return &domain.ProductReviewsResult{
		Summary: domain.ProductReviewSummary{
			TotalReviews:  summaryRow.TotalReviews,
			AverageRating: avgRatingStr,
			RatingCounts:  ratingCountsMap,
		},
		Reviews: publicReviews,
		Total:   summaryRow.TotalReviews,
	}, nil
}
