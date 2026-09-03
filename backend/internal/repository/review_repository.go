package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type reviewDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type ReviewRepository struct {
	db reviewDB
}

func NewReviewRepository(db reviewDB) *ReviewRepository {
	return &ReviewRepository{db: db}
}

type OrderItemEligibility struct {
	OrderItemID string
	OrderID     string
	VariantID   string
	ProductID   string
	UserID      string
	OrderStatus string
	Options     []domain.PurchasedOption
}

func (r *ReviewRepository) CheckEligibility(ctx context.Context, orderID, orderItemID, userID string) (*OrderItemEligibility, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(orderItemID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	q := sqlc.New(r.db)
	orderRow, err := q.GetOrderByID(ctx, sqlc.GetOrderByIDParams{
		ID:     orderID,
		UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	var targetItem *sqlc.ListOrderItemsByOrderIDRow
	for i := range itemRows {
		if itemRows[i].ID == orderItemID {
			targetItem = &itemRows[i]
			break
		}
	}
	if targetItem == nil {
		return nil, domain.ErrOrderNotFound
	}

	if orderRow.Status != string(domain.OrderStatusDelivered) {
		return nil, domain.ErrReviewNotEligible
	}

	// Check if already reviewed
	existing, err := q.GetReviewByOrderItemID(ctx, orderItemID)
	if err == nil && existing.ID != "" {
		return nil, domain.ErrReviewAlreadyExists
	}

	var options []domain.PurchasedOption
	if targetItem.Options != "" {
		_ = json.Unmarshal([]byte(targetItem.Options), &options)
	}

	return &OrderItemEligibility{
		OrderItemID: targetItem.ID,
		OrderID:     orderRow.ID,
		VariantID:   targetItem.VariantID,
		ProductID:   targetItem.ProductID,
		UserID:      orderRow.UserID,
		OrderStatus: orderRow.Status,
		Options:     options,
	}, nil
}

func (r *ReviewRepository) CreateReview(ctx context.Context, orderID, orderItemID, userID string, rating int, comment string, mediaList []domain.ReviewMedia) (*domain.Review, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// Lock order for update to ensure atomicity and verify ownership
	orderRow, err := q.LockOrderForUpdate(ctx, sqlc.LockOrderForUpdateParams{
		ID:     orderID,
		UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	if orderRow.Status != string(domain.OrderStatusDelivered) {
		return nil, domain.ErrReviewNotEligible
	}

	// Find order item
	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	var targetItem *sqlc.ListOrderItemsByOrderIDRow
	for i := range itemRows {
		if itemRows[i].ID == orderItemID {
			targetItem = &itemRows[i]
			break
		}
	}
	if targetItem == nil {
		return nil, domain.ErrOrderNotFound
	}

	// Check duplicate
	existing, err := q.GetReviewByOrderItemID(ctx, orderItemID)
	if err == nil && existing.ID != "" {
		return nil, domain.ErrReviewAlreadyExists
	}

	// Insert review
	normComment := domain.NormalizeComment(comment)
	reviewRow, err := q.InsertReview(ctx, sqlc.InsertReviewParams{
		OrderItemID: orderItemID,
		UserID:      userID,
		ProductID:   targetItem.ProductID,
		VariantID:   targetItem.VariantID,
		Rating:      int32(rating),
		Comment:     normComment,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			return nil, domain.ErrReviewAlreadyExists
		}
		return nil, err
	}

	// Insert media
	savedMedia := make([]domain.ReviewMedia, len(mediaList))
	for i, m := range mediaList {
		mediaRow, err := q.InsertReviewMedia(ctx, sqlc.InsertReviewMediaParams{
			ReviewID:  reviewRow.ID,
			ObjectKey: m.ObjectKey,
			Type:      string(m.Type),
			MimeType:  m.MimeType,
			SizeBytes: m.SizeBytes,
			Position:  int32(i),
		})
		if err != nil {
			return nil, err
		}
		savedMedia[i] = domain.ReviewMedia{
			ID:        mediaRow.ID,
			ReviewID:  mediaRow.ReviewID,
			ObjectKey: mediaRow.ObjectKey,
			Type:      domain.MediaType(mediaRow.Type),
			MimeType:  mediaRow.MimeType,
			SizeBytes: mediaRow.SizeBytes,
			Position:  int(mediaRow.Position),
			URL:       domain.FormatMediaURL(mediaRow.ID),
			CreatedAt: mediaRow.CreatedAt,
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	var purchasedOptions []domain.PurchasedOption
	if targetItem.Options != "" {
		_ = json.Unmarshal([]byte(targetItem.Options), &purchasedOptions)
	}
	if purchasedOptions == nil {
		purchasedOptions = []domain.PurchasedOption{}
	}

	return &domain.Review{
		ID:               reviewRow.ID,
		OrderItemID:      reviewRow.OrderItemID,
		UserID:           reviewRow.UserID,
		ProductID:        reviewRow.ProductID,
		VariantID:        reviewRow.VariantID,
		PurchasedOptions: purchasedOptions,
		Rating:           int(reviewRow.Rating),
		Comment:          reviewRow.Comment,
		Media:            savedMedia,
		VerifiedPurchase: true,
		AuthorLabel:      domain.DefaultAuthorLabel,
		CreatedAt:        reviewRow.CreatedAt,
		UpdatedAt:        reviewRow.UpdatedAt,
		EditedAt:         nil,
		Viewer: &domain.ReviewViewerState{
			IsOwner:        true,
			CanEdit:        true,
			RemainingEdits: 1,
		},
	}, nil
}

func (r *ReviewRepository) GetReviewByID(ctx context.Context, reviewID string) (*domain.Review, error) {
	if _, err := uuid.Parse(reviewID); err != nil {
		return nil, domain.ErrReviewNotFound
	}

	q := sqlc.New(r.db)
	reviewRow, err := q.GetReviewByID(ctx, reviewID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReviewNotFound
		}
		return nil, err
	}

	mediaRows, err := q.ListReviewMediaByReviewID(ctx, reviewRow.ID)
	if err != nil {
		return nil, err
	}

	mediaList := make([]domain.ReviewMedia, len(mediaRows))
	for i, m := range mediaRows {
		mediaList[i] = domain.ReviewMedia{
			ID:        m.ID,
			ReviewID:  m.ReviewID,
			ObjectKey: m.ObjectKey,
			Type:      domain.MediaType(m.Type),
			MimeType:  m.MimeType,
			SizeBytes: m.SizeBytes,
			Position:  int(m.Position),
			URL:       domain.FormatMediaURL(m.ID),
			CreatedAt: m.CreatedAt,
		}
	}

	var purchasedOptions []domain.PurchasedOption
	// Fetch purchased options from order_items
	itemRows, err := q.ListOrderItemsWithReviewStateByOrderID(ctx, reviewRow.OrderItemID) // not orderID, let's query item
	if err == nil && len(itemRows) > 0 {
		_ = json.Unmarshal([]byte(itemRows[0].Options), &purchasedOptions)
	}
	if purchasedOptions == nil {
		purchasedOptions = []domain.PurchasedOption{}
	}

	var editedAt *time.Time
	if reviewRow.EditedAt.Valid {
		t := reviewRow.EditedAt.Time
		editedAt = &t
	}

	canEdit := editedAt == nil
	remainingEdits := 0
	if canEdit {
		remainingEdits = 1
	}

	review := &domain.Review{
		ID:               reviewRow.ID,
		OrderItemID:      reviewRow.OrderItemID,
		UserID:           reviewRow.UserID,
		ProductID:        reviewRow.ProductID,
		VariantID:        reviewRow.VariantID,
		PurchasedOptions: purchasedOptions,
		Rating:           int(reviewRow.Rating),
		Comment:          reviewRow.Comment,
		Media:            mediaList,
		VerifiedPurchase: true,
		AuthorLabel:      domain.DefaultAuthorLabel,
		CreatedAt:        reviewRow.CreatedAt,
		UpdatedAt:        reviewRow.UpdatedAt,
		EditedAt:         editedAt,
		Viewer: &domain.ReviewViewerState{
			IsOwner:        true,
			CanEdit:        canEdit,
			RemainingEdits: remainingEdits,
		},
	}
	responseRow, responseErr := q.GetReviewResponse(ctx, reviewID)
	if responseErr == nil {
		review.Response = &domain.StoreReviewResponse{Content: responseRow.Content, AuthorLabel: domain.StoreResponseAuthorLabel, CreatedAt: responseRow.CreatedAt, UpdatedAt: responseRow.UpdatedAt}
	} else if !errors.Is(responseErr, pgx.ErrNoRows) {
		return nil, responseErr
	}
	return review, nil
}

func (r *ReviewRepository) GetReviewForUser(ctx context.Context, reviewID, userID string) (*domain.Review, error) {
	rev, err := r.GetReviewByID(ctx, reviewID)
	if err != nil {
		return nil, err
	}
	if rev.UserID != userID {
		return nil, domain.ErrReviewNotFound
	}
	return rev, nil
}

func (r *ReviewRepository) UpdateReview(ctx context.Context, reviewID, userID string, rating int, comment string, newMediaList []domain.ReviewMedia) (*domain.Review, []string, error) {
	if _, err := uuid.Parse(reviewID); err != nil {
		return nil, nil, domain.ErrReviewNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// Fetch existing media to know which ones might be deleted
	existingMedia, err := q.ListReviewMediaByReviewID(ctx, reviewID)
	if err != nil {
		return nil, nil, err
	}

	normComment := domain.NormalizeComment(comment)
	reviewRow, err := q.UpdateReviewConditional(ctx, sqlc.UpdateReviewConditionalParams{
		ID:      reviewID,
		UserID:  userID,
		Rating:  int32(rating),
		Comment: normComment,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Check why: already edited or not found or not owner
			chk, chkErr := q.GetReviewByID(ctx, reviewID)
			if chkErr != nil || chk.UserID != userID {
				return nil, nil, domain.ErrReviewNotFound
			}
			if chk.EditedAt.Valid {
				return nil, nil, domain.ErrReviewEditLimitReached
			}
			return nil, nil, domain.ErrReviewNotFound
		}
		return nil, nil, err
	}

	// Figure out which old object keys are removed
	retainedKeys := make(map[string]bool)
	for _, nm := range newMediaList {
		if nm.ObjectKey != "" {
			retainedKeys[nm.ObjectKey] = true
		}
	}

	var removedObjectKeys []string
	for _, em := range existingMedia {
		if !retainedKeys[em.ObjectKey] {
			removedObjectKeys = append(removedObjectKeys, em.ObjectKey)
		}
	}

	// Delete existing media rows
	if err := q.DeleteReviewMediaByReviewID(ctx, reviewID); err != nil {
		return nil, nil, err
	}

	// Insert new media rows
	savedMedia := make([]domain.ReviewMedia, len(newMediaList))
	for i, m := range newMediaList {
		mediaRow, err := q.InsertReviewMedia(ctx, sqlc.InsertReviewMediaParams{
			ReviewID:  reviewRow.ID,
			ObjectKey: m.ObjectKey,
			Type:      string(m.Type),
			MimeType:  m.MimeType,
			SizeBytes: m.SizeBytes,
			Position:  int32(i),
		})
		if err != nil {
			return nil, nil, err
		}
		savedMedia[i] = domain.ReviewMedia{
			ID:        mediaRow.ID,
			ReviewID:  mediaRow.ReviewID,
			ObjectKey: mediaRow.ObjectKey,
			Type:      domain.MediaType(mediaRow.Type),
			MimeType:  mediaRow.MimeType,
			SizeBytes: mediaRow.SizeBytes,
			Position:  int(mediaRow.Position),
			URL:       domain.FormatMediaURL(mediaRow.ID),
			CreatedAt: mediaRow.CreatedAt,
		}
	}

	var response *domain.StoreReviewResponse
	responseRow, responseErr := q.GetReviewResponse(ctx, reviewID)
	if responseErr == nil {
		response = &domain.StoreReviewResponse{Content: responseRow.Content, AuthorLabel: domain.StoreResponseAuthorLabel, CreatedAt: responseRow.CreatedAt, UpdatedAt: responseRow.UpdatedAt}
	} else if !errors.Is(responseErr, pgx.ErrNoRows) {
		return nil, nil, responseErr
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	var editedAt *time.Time
	if reviewRow.EditedAt.Valid {
		t := reviewRow.EditedAt.Time
		editedAt = &t
	}

	return &domain.Review{
		ID:               reviewRow.ID,
		OrderItemID:      reviewRow.OrderItemID,
		UserID:           reviewRow.UserID,
		ProductID:        reviewRow.ProductID,
		VariantID:        reviewRow.VariantID,
		PurchasedOptions: []domain.PurchasedOption{},
		Rating:           int(reviewRow.Rating),
		Comment:          reviewRow.Comment,
		Media:            savedMedia,
		VerifiedPurchase: true,
		AuthorLabel:      domain.DefaultAuthorLabel,
		CreatedAt:        reviewRow.CreatedAt,
		UpdatedAt:        reviewRow.UpdatedAt,
		EditedAt:         editedAt,
		Viewer: &domain.ReviewViewerState{
			IsOwner:        true,
			CanEdit:        false,
			RemainingEdits: 0,
		},
		Response: response,
	}, removedObjectKeys, nil
}

func (r *ReviewRepository) GetProductReviews(ctx context.Context, productID string, page, limit int, currentUserID string) ([]domain.Review, int64, error) {
	if _, err := uuid.Parse(productID); err != nil {
		return nil, 0, domain.ErrInvalidProductID
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 10
	}
	offset := (page - 1) * limit

	if r.db == nil {
		return []domain.Review{}, 0, nil
	}

	q := sqlc.New(r.db)
	total, err := q.CountProductReviews(ctx, productID)
	if err != nil {
		return nil, 0, err
	}

	if total == 0 {
		return []domain.Review{}, 0, nil
	}

	reviewRows, err := q.ListProductReviews(ctx, sqlc.ListProductReviewsParams{
		ProductID:   productID,
		LimitCount:  int32(limit),
		OffsetCount: int32(offset),
	})
	if err != nil {
		return nil, 0, err
	}

	if len(reviewRows) == 0 {
		return []domain.Review{}, total, nil
	}

	reviewIDs := make([]string, len(reviewRows))
	for i, r := range reviewRows {
		reviewIDs[i] = r.ID
	}

	mediaRows, err := q.ListReviewMediaByReviewIDs(ctx, reviewIDs)
	if err != nil {
		return nil, 0, err
	}

	mediaByReview := make(map[string][]domain.ReviewMedia)
	for _, m := range mediaRows {
		mediaByReview[m.ReviewID] = append(mediaByReview[m.ReviewID], domain.ReviewMedia{
			ID:        m.ID,
			ReviewID:  m.ReviewID,
			ObjectKey: m.ObjectKey,
			Type:      domain.MediaType(m.Type),
			MimeType:  m.MimeType,
			SizeBytes: m.SizeBytes,
			Position:  int(m.Position),
			URL:       domain.FormatMediaURL(m.ID),
			CreatedAt: m.CreatedAt,
		})
	}

	reviews := make([]domain.Review, len(reviewRows))
	for i, row := range reviewRows {
		mediaList := mediaByReview[row.ID]
		if mediaList == nil {
			mediaList = []domain.ReviewMedia{}
		}

		var purchasedOptions []domain.PurchasedOption
		if row.PurchasedOptions != "" {
			_ = json.Unmarshal([]byte(row.PurchasedOptions), &purchasedOptions)
		}
		if purchasedOptions == nil {
			purchasedOptions = []domain.PurchasedOption{}
		}

		var editedAt *time.Time
		if row.EditedAt.Valid {
			t := row.EditedAt.Time
			editedAt = &t
		}

		var viewer *domain.ReviewViewerState
		if currentUserID != "" && currentUserID == row.UserID {
			canEdit := editedAt == nil
			remainingEdits := 0
			if canEdit {
				remainingEdits = 1
			}
			viewer = &domain.ReviewViewerState{
				IsOwner:        true,
				CanEdit:        canEdit,
				RemainingEdits: remainingEdits,
			}
		}

		reviews[i] = domain.Review{
			ID:               row.ID,
			OrderItemID:      row.OrderItemID,
			ProductID:        row.ProductID,
			VariantID:        row.VariantID,
			PurchasedOptions: purchasedOptions,
			Rating:           int(row.Rating),
			Comment:          row.Comment,
			Media:            mediaList,
			VerifiedPurchase: true,
			AuthorLabel:      domain.MaskAuthorEmail(row.AuthorEmail),
			CreatedAt:        row.CreatedAt,
			UpdatedAt:        row.UpdatedAt,
			EditedAt:         editedAt,
			Viewer:           viewer,
			Response:         storeResponse(row.ResponseContent.String, row.ResponseContent.Valid, row.ResponseCreatedAt.Time, row.ResponseUpdatedAt.Time),
		}
	}

	return reviews, total, nil
}

func (r *ReviewRepository) GetProductReviewSummary(ctx context.Context, productID string) (*domain.ReviewSummary, error) {
	if _, err := uuid.Parse(productID); err != nil {
		return nil, domain.ErrInvalidProductID
	}

	q := sqlc.New(r.db)
	summaryRow, err := q.GetProductReviewSummary(ctx, productID)
	if err != nil {
		return nil, err
	}

	if summaryRow.ReviewCount == 0 {
		return &domain.ReviewSummary{
			ReviewCount:   0,
			AverageRating: nil,
		}, nil
	}

	var avg float64
	if summaryRow.AverageRating.Valid {
		fVal, err := summaryRow.AverageRating.Float64Value()
		if err == nil && fVal.Valid {
			avg = fVal.Float64
		}
	}
	rounded := domain.ComputeAverageRating(avg)

	return &domain.ReviewSummary{
		ReviewCount:   summaryRow.ReviewCount,
		AverageRating: &rounded,
	}, nil
}

func (r *ReviewRepository) GetReferencedReviewMediaByID(ctx context.Context, mediaID string) (*domain.ReviewMedia, error) {
	if _, err := uuid.Parse(mediaID); err != nil {
		return nil, domain.ErrReviewMediaNotFound
	}

	q := sqlc.New(r.db)
	row, err := q.GetReferencedReviewMediaByID(ctx, mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReviewMediaNotFound
		}
		return nil, err
	}

	return &domain.ReviewMedia{
		ID:        row.ID,
		ReviewID:  row.ReviewID,
		ObjectKey: row.ObjectKey,
		Type:      domain.MediaType(row.Type),
		MimeType:  row.MimeType,
		SizeBytes: row.SizeBytes,
		Position:  int(row.Position),
		URL:       domain.FormatMediaURL(row.ID),
		CreatedAt: row.CreatedAt,
	}, nil
}

func (r *ReviewRepository) IsObjectKeyReferenced(ctx context.Context, objectKey string) (bool, error) {
	q := sqlc.New(r.db)
	return q.IsObjectKeyReferenced(ctx, objectKey)
}

func (r *ReviewRepository) ListAllReferencedObjectKeys(ctx context.Context) ([]string, error) {
	q := sqlc.New(r.db)
	return q.ListAllReferencedObjectKeys(ctx)
}

func (r *ReviewRepository) ListOwnerReviews(ctx context.Context, userID string, page, limit int) ([]domain.OwnedReviewHistoryItem, int64, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return []domain.OwnedReviewHistoryItem{}, 0, nil
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 10
	}
	offset := (page - 1) * limit

	if r.db == nil {
		return []domain.OwnedReviewHistoryItem{}, 0, nil
	}

	q := sqlc.New(r.db)
	total, err := q.CountOwnerReviews(ctx, userID)
	if err != nil {
		return nil, 0, err
	}

	if total == 0 {
		return []domain.OwnedReviewHistoryItem{}, 0, nil
	}

	reviewRows, err := q.ListOwnerReviews(ctx, sqlc.ListOwnerReviewsParams{
		UserID:      userID,
		LimitCount:  int32(limit),
		OffsetCount: int32(offset),
	})
	if err != nil {
		return nil, 0, err
	}

	if len(reviewRows) == 0 {
		return []domain.OwnedReviewHistoryItem{}, total, nil
	}

	reviewIDs := make([]string, len(reviewRows))
	for i, row := range reviewRows {
		reviewIDs[i] = row.ID
	}

	mediaRows, err := q.ListReviewMediaByReviewIDs(ctx, reviewIDs)
	if err != nil {
		return nil, 0, err
	}

	mediaByReview := make(map[string][]domain.ReviewMedia)
	for _, m := range mediaRows {
		mediaByReview[m.ReviewID] = append(mediaByReview[m.ReviewID], domain.ReviewMedia{
			ID:        m.ID,
			ReviewID:  m.ReviewID,
			ObjectKey: m.ObjectKey,
			Type:      domain.MediaType(m.Type),
			MimeType:  m.MimeType,
			SizeBytes: m.SizeBytes,
			Position:  int(m.Position),
			URL:       domain.FormatMediaURL(m.ID),
			CreatedAt: m.CreatedAt,
		})
	}

	items := make([]domain.OwnedReviewHistoryItem, len(reviewRows))
	for i, row := range reviewRows {
		mediaList := mediaByReview[row.ID]
		if mediaList == nil {
			mediaList = []domain.ReviewMedia{}
		}

		var purchasedOptions []domain.PurchasedOption
		if row.PurchasedOptions != "" {
			_ = json.Unmarshal([]byte(row.PurchasedOptions), &purchasedOptions)
		}
		if purchasedOptions == nil {
			purchasedOptions = []domain.PurchasedOption{}
		}

		var editedAt *time.Time
		if row.EditedAt.Valid {
			t := row.EditedAt.Time
			editedAt = &t
		}

		canEdit := editedAt == nil
		remainingEdits := 0
		if canEdit {
			remainingEdits = 1
		}

		var publicPath *string
		if row.IsProductPublic {
			path := fmt.Sprintf("/products/%s", row.ProductID)
			publicPath = &path
		}

		items[i] = domain.OwnedReviewHistoryItem{
			Review: domain.Review{
				ID:               row.ID,
				OrderItemID:      row.OrderItemID,
				ProductID:        row.ProductID,
				VariantID:        row.VariantID,
				PurchasedOptions: purchasedOptions,
				Rating:           int(row.Rating),
				Comment:          row.Comment,
				Media:            mediaList,
				VerifiedPurchase: true,
				AuthorLabel:      domain.DefaultAuthorLabel,
				CreatedAt:        row.CreatedAt,
				UpdatedAt:        row.UpdatedAt,
				EditedAt:         editedAt,
				Viewer: &domain.ReviewViewerState{
					IsOwner:        true,
					CanEdit:        canEdit,
					RemainingEdits: remainingEdits,
				},
				Response: storeResponse(row.ResponseContent.String, row.ResponseContent.Valid, row.ResponseCreatedAt.Time, row.ResponseUpdatedAt.Time),
			},
			Product: domain.ReviewHistoryProduct{
				ID:         row.ProductID,
				Name:       row.PurchasedProductName,
				PublicPath: publicPath,
			},
		}
	}

	return items, total, nil
}

func storeResponse(content string, valid bool, createdAt, updatedAt time.Time) *domain.StoreReviewResponse {
	if !valid {
		return nil
	}
	return &domain.StoreReviewResponse{Content: content, AuthorLabel: domain.StoreResponseAuthorLabel, CreatedAt: createdAt, UpdatedAt: updatedAt}
}

func (r *ReviewRepository) CreateReviewResponse(ctx context.Context, reviewID, adminID, content string) (*domain.AdminStoreReviewResponse, error) {
	q := sqlc.New(r.db)
	row, err := q.InsertReviewResponse(ctx, sqlc.InsertReviewResponseParams{ReviewID: reviewID, AdminID: adminID, Content: content})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			exists, existsErr := q.ReviewExists(ctx, reviewID)
			if existsErr != nil {
				return nil, existsErr
			}
			if !exists {
				return nil, domain.ErrReviewNotFound
			}
			return nil, domain.ErrReviewResponseConflict
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, domain.ErrReviewResponseConflict
		}
		return nil, err
	}
	return &domain.AdminStoreReviewResponse{StoreReviewResponse: domain.StoreReviewResponse{Content: row.Content, AuthorLabel: domain.StoreResponseAuthorLabel, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}, Version: int(row.Version)}, nil
}

func (r *ReviewRepository) UpdateReviewResponse(ctx context.Context, reviewID, adminID, content string, version int) (*domain.AdminStoreReviewResponse, error) {
	q := sqlc.New(r.db)
	row, err := q.UpdateReviewResponse(ctx, sqlc.UpdateReviewResponseParams{ReviewID: reviewID, AdminID: adminID, Content: content, Version: int32(version)})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			exists, existsErr := q.ReviewExists(ctx, reviewID)
			if existsErr != nil {
				return nil, existsErr
			}
			if !exists {
				return nil, domain.ErrReviewNotFound
			}
			return nil, domain.ErrReviewResponseConflict
		}
		return nil, err
	}
	return &domain.AdminStoreReviewResponse{StoreReviewResponse: domain.StoreReviewResponse{Content: row.Content, AuthorLabel: domain.StoreResponseAuthorLabel, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}, Version: int(row.Version)}, nil
}

func (r *ReviewRepository) ListAdminReviews(ctx context.Context, page, limit int) ([]domain.AdminReviewItem, int64, error) {
	q := sqlc.New(r.db)
	total, err := q.CountAdminReviews(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.ListAdminReviews(ctx, sqlc.ListAdminReviewsParams{LimitCount: int32(limit), OffsetCount: int32((page - 1) * limit)})
	if err != nil {
		return nil, 0, err
	}
	reviewIDs := make([]string, len(rows))
	for i, row := range rows {
		reviewIDs[i] = row.ID
	}
	mediaByReview := make(map[string][]domain.ReviewMedia)
	if len(reviewIDs) > 0 {
		mediaRows, mediaErr := q.ListReviewMediaByReviewIDs(ctx, reviewIDs)
		if mediaErr != nil {
			return nil, 0, mediaErr
		}
		for _, media := range mediaRows {
			mediaByReview[media.ReviewID] = append(mediaByReview[media.ReviewID], domain.ReviewMedia{ID: media.ID, ReviewID: media.ReviewID, ObjectKey: media.ObjectKey, Type: domain.MediaType(media.Type), MimeType: media.MimeType, SizeBytes: media.SizeBytes, Position: int(media.Position), URL: domain.FormatMediaURL(media.ID), CreatedAt: media.CreatedAt})
		}
	}
	items := make([]domain.AdminReviewItem, len(rows))
	for i, row := range rows {
		var options []domain.PurchasedOption
		_ = json.Unmarshal([]byte(row.PurchasedOptions), &options)
		if options == nil {
			options = []domain.PurchasedOption{}
		}
		var publicPath *string
		if row.IsProductPublic {
			path := fmt.Sprintf("/products/%s", row.ProductID)
			publicPath = &path
		}
		var version *int
		if row.ResponseVersion.Valid {
			v := int(row.ResponseVersion.Int32)
			version = &v
		}
		media := mediaByReview[row.ID]
		if media == nil {
			media = []domain.ReviewMedia{}
		}
		items[i] = domain.AdminReviewItem{
			Review:  domain.Review{ID: row.ID, OrderItemID: row.OrderItemID, ProductID: row.ProductID, VariantID: row.VariantID, PurchasedOptions: options, Rating: int(row.Rating), Comment: row.Comment, Media: media, VerifiedPurchase: true, AuthorLabel: domain.DefaultAuthorLabel, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, Viewer: nil, Response: storeResponse(row.ResponseContent.String, row.ResponseContent.Valid, row.ResponseCreatedAt.Time, row.ResponseUpdatedAt.Time)},
			Product: domain.ReviewHistoryProduct{ID: row.ProductID, Name: row.PurchasedProductName, PublicPath: publicPath}, ResponseVersion: version,
		}
	}
	return items, total, nil
}
