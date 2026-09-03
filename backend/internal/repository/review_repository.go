package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)


func pgTextToStrPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func pgTimestamptzToTimePtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}

func pgUUIDToStrPtr(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuid.UUID(u.Bytes).String()
	return &s
}

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
		ID:             row.ID,
		OrderItemID:    row.OrderItemID,
		Rating:         row.Rating,
		Comment:        row.Comment,
		EditCount:      row.EditCount,
		Media:          mediaList,
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
		Edited:         row.EditCount > 0,
		CanEdit:        row.EditCount == 0,
		AdminReply:     pgTextToStrPtr(row.AdminReply),
		AdminRepliedAt: pgTimestamptzToTimePtr(row.AdminRepliedAt),
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
		ID:             row.ID,
		OrderItemID:    row.OrderItemID,
		Rating:         row.Rating,
		Comment:        row.Comment,
		EditCount:      row.EditCount,
		Media:          mediaList,
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
		Edited:         row.EditCount > 0,
		CanEdit:        row.EditCount == 0,
		AdminReply:     pgTextToStrPtr(row.AdminReply),
		AdminRepliedAt: pgTimestamptzToTimePtr(row.AdminRepliedAt),
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
			ID:             row.ID,
			OrderItemID:    row.OrderItemID,
			Rating:         row.Rating,
			Comment:        row.Comment,
			EditCount:      row.EditCount,
			Media:          media,
			CreatedAt:      row.CreatedAt,
			UpdatedAt:      row.UpdatedAt,
			Edited:         row.EditCount > 0,
			CanEdit:        row.EditCount == 0,
			AdminReply:     pgTextToStrPtr(row.AdminReply),
			AdminRepliedAt: pgTimestamptzToTimePtr(row.AdminRepliedAt),
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

func (r *ReviewRepository) GetPublicReviewsByProductID(ctx context.Context, productID string, viewerUserID *string, page, limit int) (*domain.ProductReviewsResult, error) {
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
	var replyIDs []string
	for _, row := range reviewRows {
		reviewIDs = append(reviewIDs, row.ID)
		if row.AdminReply.Valid && row.AdminReplyID.Valid {
			replyIDs = append(replyIDs, uuid.UUID(row.AdminReplyID.Bytes).String())
		}
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

	type voteCounts struct {
		helpful   int64
		unhelpful int64
	}

	reviewCountsMap := make(map[string]voteCounts, len(reviewIDs))
	if len(reviewIDs) > 0 {
		counts, err := q.GetReviewHelpfulnessCountsByReviewIDs(ctx, reviewIDs)
		if err != nil {
			return nil, err
		}
		for _, c := range counts {
			if c.ReviewID.Valid {
				rid := uuid.UUID(c.ReviewID.Bytes).String()
				reviewCountsMap[rid] = voteCounts{
					helpful:   c.HelpfulCount,
					unhelpful: c.UnhelpfulCount,
				}
			}
		}
	}

	replyCountsMap := make(map[string]voteCounts, len(replyIDs))
	if len(replyIDs) > 0 {
		counts, err := q.GetReviewReplyHelpfulnessCountsByReplyIDs(ctx, replyIDs)
		if err != nil {
			return nil, err
		}
		for _, c := range counts {
			if c.ReplyID.Valid {
				rpid := uuid.UUID(c.ReplyID.Bytes).String()
				replyCountsMap[rpid] = voteCounts{
					helpful:   c.HelpfulCount,
					unhelpful: c.UnhelpfulCount,
				}
			}
		}
	}

	reviewViewerVoteMap := make(map[string]domain.HelpfulnessVote)
	replyViewerVoteMap := make(map[string]domain.HelpfulnessVote)

	if viewerUserID != nil && *viewerUserID != "" {
		if len(reviewIDs) > 0 {
			userReviewVotes, err := q.GetUserReviewVotesByReviewIDs(ctx, sqlc.GetUserReviewVotesByReviewIDsParams{
				UserID:    *viewerUserID,
				ReviewIds: reviewIDs,
			})
			if err != nil {
				return nil, err
			}
			for _, uv := range userReviewVotes {
				if uv.ReviewID.Valid {
					rid := uuid.UUID(uv.ReviewID.Bytes).String()
					reviewViewerVoteMap[rid] = domain.HelpfulnessVote(uv.Vote)
				}
			}
		}

		if len(replyIDs) > 0 {
			userReplyVotes, err := q.GetUserReplyVotesByReplyIDs(ctx, sqlc.GetUserReplyVotesByReplyIDsParams{
				UserID:   *viewerUserID,
				ReplyIds: replyIDs,
			})
			if err != nil {
				return nil, err
			}
			for _, uv := range userReplyVotes {
				if uv.ReplyID.Valid {
					rpid := uuid.UUID(uv.ReplyID.Bytes).String()
					replyViewerVoteMap[rpid] = domain.HelpfulnessVote(uv.Vote)
				}
			}
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

		rCounts := reviewCountsMap[row.ID]
		var rViewerVote *domain.HelpfulnessVote
		if v, ok := reviewViewerVoteMap[row.ID]; ok {
			vCopy := v
			rViewerVote = &vCopy
		}
		helpfulness := domain.HelpfulnessState{
			HelpfulCount:   rCounts.helpful,
			UnhelpfulCount: rCounts.unhelpful,
			ViewerVote:     rViewerVote,
		}

		var adminReply *string
		var adminRepliedAt *time.Time
		var adminReplyID *string
		var adminReplyHelpfulness *domain.HelpfulnessState

		if row.AdminReply.Valid && row.AdminReplyID.Valid {
			replyIDStr := uuid.UUID(row.AdminReplyID.Bytes).String()
			adminReplyID = &replyIDStr
			adminReply = &row.AdminReply.String
			if row.AdminRepliedAt.Valid {
				adminRepliedAt = &row.AdminRepliedAt.Time
			}

			rpCounts := replyCountsMap[replyIDStr]
			var rpViewerVote *domain.HelpfulnessVote
			if v, ok := replyViewerVoteMap[replyIDStr]; ok {
				vCopy := v
				rpViewerVote = &vCopy
			}
			adminReplyHelpfulness = &domain.HelpfulnessState{
				HelpfulCount:   rpCounts.helpful,
				UnhelpfulCount: rpCounts.unhelpful,
				ViewerVote:     rpViewerVote,
			}
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
			Media:                 media,
			Helpfulness:           helpfulness,
			AdminReply:            adminReply,
			AdminRepliedAt:        adminRepliedAt,
			AdminReplyID:          adminReplyID,
			AdminReplyHelpfulness: adminReplyHelpfulness,
			Edited:                row.EditCount > 0,
			CreatedAt:             row.CreatedAt,
			UpdatedAt:             row.UpdatedAt,
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

func (r *ReviewRepository) GetUserReviews(ctx context.Context, userID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrInvalidToken
	}

	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	if limit > 10 {
		limit = 10
	}

	offset := (page - 1) * limit

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	total, err := q.CountUserReviews(ctx, sqlc.CountUserReviewsParams{
		UserID:  userID,
		Column2: ratingFilter,
	})
	if err != nil {
		return nil, err
	}

	reviewRows, err := q.ListUserReviews(ctx, sqlc.ListUserReviewsParams{
		UserID:       userID,
		RatingFilter: ratingFilter,
		OffsetCount:  int32(offset),
		LimitCount:   int32(limit),
	})
	if err != nil {
		return nil, err
	}

	reviewIDs := make([]string, 0, len(reviewRows))
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

	userReviews := make([]domain.UserReview, 0, len(reviewRows))
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

		userReviews = append(userReviews, domain.UserReview{
			ID:          row.ID,
			OrderItemID: row.OrderItemID,
			Order: domain.UserReviewOrder{
				ID:        row.OrderID,
				CreatedAt: row.OrderCreatedAt,
			},
			Product: domain.UserReviewProduct{
				ID:        row.ProductID,
				Name:      row.ProductName,
				BrandName: row.BrandName,
				Model:     row.Model,
				ImageURL:  row.ImageUrl,
				Options:   options,
			},
			Rating:    row.Rating,
			Comment:   row.Comment,
			EditCount: row.EditCount,
			CanEdit:   row.EditCount == 0,
			Edited:    row.EditCount > 0,
			AdminReply:     pgTextToStrPtr(row.AdminReply),
			AdminRepliedAt: pgTimestamptzToTimePtr(row.AdminRepliedAt),
			Media:     media,
			CreatedAt: row.CreatedAt,
			UpdatedAt: row.UpdatedAt,
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &domain.UserReviewsResult{
		Reviews: userReviews,
		Total:   total,
	}, nil
}

func (r *ReviewRepository) GetAdminReviews(ctx context.Context, ratingFilter int16, hasReplyFilter string, page, limit int) (*domain.AdminReviewsResult, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	offset := (page - 1) * limit

	q := sqlc.New(r.db)

	total, err := q.CountAdminReviews(ctx, sqlc.CountAdminReviewsParams{
		RatingFilter:   ratingFilter,
		HasReplyFilter: hasReplyFilter,
	})
	if err != nil {
		return nil, err
	}

	reviewRows, err := q.ListAdminReviews(ctx, sqlc.ListAdminReviewsParams{
		RatingFilter:   ratingFilter,
		HasReplyFilter: hasReplyFilter,
		LimitCount:     int32(limit),
		OffsetCount:    int32(offset),
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
		if err == nil {
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
	}

	adminReviews := make([]domain.AdminReview, 0, len(reviewRows))
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

		adminReviews = append(adminReviews, domain.AdminReview{
			ID:          row.ID,
			OrderItemID: row.OrderItemID,
			Rating:      row.Rating,
			Comment:     row.Comment,
			EditCount:   row.EditCount,
			Media:       media,
			CreatedAt:   row.CreatedAt,
			UpdatedAt:   row.UpdatedAt,
			AdminReply:     pgTextToStrPtr(row.AdminReply),
			AdminRepliedAt: pgTimestamptzToTimePtr(row.AdminRepliedAt),
			ReviewerEmail:  &row.ReviewerEmail,
			Product: domain.UserReviewProduct{
				ID:        row.ProductID,
				Name:      row.ProductName,
				BrandName: row.BrandName,
				Model:     row.Model,
				ImageURL:  row.ImageUrl,
				Options:   options,
			},
		})
	}

	return &domain.AdminReviewsResult{
		Reviews: adminReviews,
		Total:   total,
	}, nil
}

func (r *ReviewRepository) UpdateAdminReply(ctx context.Context, reviewID string, reply *string) (*domain.Review, error) {
	if _, err := uuid.Parse(reviewID); err != nil {
		return nil, domain.ErrReviewNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// Lock parent review to verify existence and serialize reply lifecycle
	reviewRow, err := q.LockReviewByID(ctx, reviewID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReviewNotFound
		}
		return nil, err
	}

	// Check if a reply exists and lock it FOR UPDATE
	replyRow, err := q.LockReviewReplyByReviewID(ctx, reviewID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	var updatedReply *string
	var updatedRepliedAt *time.Time

	if reply != nil {
		content := *reply
		if errors.Is(err, pgx.ErrNoRows) {
			// Create new reply
			inserted, err := q.InsertReviewReply(ctx, sqlc.InsertReviewReplyParams{
				ReviewID: reviewID,
				Content:  content,
			})
			if err != nil {
				return nil, err
			}
			updatedReply = &inserted.Content
			updatedRepliedAt = &inserted.UpdatedAt
		} else {
			// Update existing reply (keeps UUID and existing votes)
			updated, err := q.UpdateReviewReply(ctx, sqlc.UpdateReviewReplyParams{
				ID:      replyRow.ID,
				Content: content,
			})
			if err != nil {
				return nil, err
			}
			updatedReply = &updated.Content
			updatedRepliedAt = &updated.UpdatedAt
		}
	} else {
		// reply == nil -> Delete existing reply if any
		if err == nil {
			if err := q.DeleteReviewReply(ctx, replyRow.ID); err != nil {
				return nil, err
			}
		}
		updatedReply = nil
		updatedRepliedAt = nil
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &domain.Review{
		ID:             reviewRow.ID,
		OrderItemID:    reviewRow.OrderItemID,
		Rating:         reviewRow.Rating,
		Comment:        reviewRow.Comment,
		EditCount:      reviewRow.EditCount,
		CreatedAt:      reviewRow.CreatedAt,
		UpdatedAt:      reviewRow.UpdatedAt,
		Edited:         reviewRow.EditCount > 0,
		CanEdit:        reviewRow.EditCount == 0,
		AdminReply:     updatedReply,
		AdminRepliedAt: updatedRepliedAt,
	}, nil
}

func (r *ReviewRepository) SetReviewVote(ctx context.Context, reviewID, userID string, vote *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
	parsedReviewID, err := uuid.Parse(reviewID)
	if err != nil {
		return nil, domain.ErrReviewNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrInvalidToken
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// Lock target review row FOR UPDATE
	_, err = q.LockReviewByID(ctx, reviewID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReviewNotFound
		}
		return nil, err
	}

	reviewPgUUID := pgtype.UUID{Bytes: parsedReviewID, Valid: true}

	if vote == nil {
		if err := q.DeleteReviewVote(ctx, sqlc.DeleteReviewVoteParams{
			UserID:   userID,
			ReviewID: reviewPgUUID,
		}); err != nil {
			return nil, err
		}
	} else {
		if err := q.UpsertReviewVote(ctx, sqlc.UpsertReviewVoteParams{
			UserID:   userID,
			ReviewID: reviewPgUUID,
			Vote:     string(*vote),
		}); err != nil {
			return nil, err
		}
	}

	counts, err := q.GetReviewHelpfulnessCountsByID(ctx, reviewPgUUID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	var viewerVote *domain.HelpfulnessVote
	if vote != nil {
		vCopy := *vote
		viewerVote = &vCopy
	}

	return &domain.HelpfulnessState{
		HelpfulCount:   counts.HelpfulCount,
		UnhelpfulCount: counts.UnhelpfulCount,
		ViewerVote:     viewerVote,
	}, nil
}

func (r *ReviewRepository) SetReviewReplyVote(ctx context.Context, replyID, userID string, vote *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
	parsedReplyID, err := uuid.Parse(replyID)
	if err != nil {
		return nil, domain.ErrReviewReplyNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrInvalidToken
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// Lock target review_replies row FOR UPDATE
	_, err = q.LockReviewReplyByID(ctx, replyID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReviewReplyNotFound
		}
		return nil, err
	}

	replyPgUUID := pgtype.UUID{Bytes: parsedReplyID, Valid: true}

	if vote == nil {
		if err := q.DeleteReviewReplyVote(ctx, sqlc.DeleteReviewReplyVoteParams{
			UserID:  userID,
			ReplyID: replyPgUUID,
		}); err != nil {
			return nil, err
		}
	} else {
		if err := q.UpsertReviewReplyVote(ctx, sqlc.UpsertReviewReplyVoteParams{
			UserID:  userID,
			ReplyID: replyPgUUID,
			Vote:    string(*vote),
		}); err != nil {
			return nil, err
		}
	}

	counts, err := q.GetReviewReplyHelpfulnessCountsByID(ctx, replyPgUUID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	var viewerVote *domain.HelpfulnessVote
	if vote != nil {
		vCopy := *vote
		viewerVote = &vCopy
	}

	return &domain.HelpfulnessState{
		HelpfulCount:   counts.HelpfulCount,
		UnhelpfulCount: counts.UnhelpfulCount,
		ViewerVote:     viewerVote,
	}, nil
}



