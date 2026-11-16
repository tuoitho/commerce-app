package repository

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type NotificationRepository struct {
	db postDB
}

func NewNotificationRepository(db postDB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

var _ domain.NotificationRepository = (*NotificationRepository)(nil)

type rawNotificationRow struct {
	ID               string
	RecipientID      string
	ActorID          pgtype.UUID
	GroupKey         string
	ActorCount       int32
	Category         string
	NotificationType string
	PostID           pgtype.UUID
	CommentID        pgtype.UUID
	ReactionType     pgtype.Text
	Excerpt          string
	Metadata         []byte
	IsRead           bool
	CreatedAt        time.Time
	UpdatedAt        time.Time
	ActorRole        *string
	ActorName        *string
}

func buildNotificationItemFromRaw(row rawNotificationRow) domain.NotificationItem {
	var actorID *string
	if row.ActorID.Valid {
		idStr := uuid.UUID(row.ActorID.Bytes).String()
		actorID = &idStr
	} else {
		// System/store-originated notifications explicitly keep actor fields nil.
		row.ActorName = nil
		row.ActorRole = nil
	}

	var reactionType *domain.ReactionType
	if row.ReactionType.Valid && row.ReactionType.String != "" {
		rt := domain.ReactionType(row.ReactionType.String)
		reactionType = &rt
	}

	actorCount := int(row.ActorCount)
	if actorCount <= 0 {
		actorCount = 1
	}

	updatedAt := row.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = row.CreatedAt
	}

	return domain.NotificationItem{
		ID:               row.ID,
		RecipientID:      row.RecipientID,
		ActorID:          actorID,
		ActorName:        row.ActorName,
		ActorRole:        row.ActorRole,
		GroupKey:         row.GroupKey,
		ActorCount:       actorCount,
		Category:         domain.NotificationCategory(row.Category),
		NotificationType: domain.NotificationType(row.NotificationType),
		PostID:           pgUUIDToStrPtr(row.PostID),
		CommentID:        pgUUIDToStrPtr(row.CommentID),
		ReactionType:     reactionType,
		Excerpt:          row.Excerpt,
		Metadata:         cleanPublicNotificationMetadata(row.Metadata),
		IsRead:           row.IsRead,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        updatedAt,
	}
}

func nullableTrimmedStr(v pgtype.Text, fallback string) *string {
	s := strings.TrimSpace(fallback)
	if v.Valid && strings.TrimSpace(v.String) != "" {
		s = strings.TrimSpace(v.String)
	}
	if s == "" {
		return nil
	}
	return &s
}

func marshalSystemNotificationMeta(
	inputMeta map[string]interface{},
	actor *domain.NotificationActorSummary,
) []byte {
	metaMap := make(map[string]interface{})
	for k, v := range inputMeta {
		if k != "_actorIds" {
			metaMap[k] = v
		}
	}
	if actor != nil {
		metaMap["recentActors"] = []domain.NotificationActorSummary{*actor}
		metaMap["_actorIds"] = []string{actor.ID}
	}
	if b, err := json.Marshal(metaMap); err == nil {
		return b
	}
	return []byte("{}")
}

func (r *NotificationRepository) ListNotificationsByCategory(
	ctx context.Context,
	recipientID string,
	category string,
	limit, offset int,
) (*domain.NotificationsListResult, error) {
	if _, err := parseUUID(recipientID); err != nil {
		return &domain.NotificationsListResult{
			Items:       make([]domain.NotificationItem, 0),
			UnreadCount: 0,
		}, nil
	}
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	q := sqlc.New(r.db)
	rows, err := q.ListNotificationsByRecipientFiltered(ctx, sqlc.ListNotificationsByRecipientFilteredParams{
		RecipientID: recipientID,
		Category:    strings.TrimSpace(category),
		QueryLimit:  int32(limit),
		QueryOffset: int32(offset),
	})
	if err != nil {
		return nil, err
	}

	unread, err := q.CountUnreadNotifications(ctx, recipientID)
	if err != nil {
		return nil, err
	}

	items := make([]domain.NotificationItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, buildNotificationItemFromRaw(rawNotificationRow{
			ID:               row.ID,
			RecipientID:      row.RecipientID,
			ActorID:          row.ActorID,
			GroupKey:         row.GroupKey,
			ActorCount:       row.ActorCount,
			Category:         row.Category,
			NotificationType: row.NotificationType,
			PostID:           row.PostID,
			CommentID:        row.CommentID,
			ReactionType:     row.ReactionType,
			Excerpt:          row.Excerpt,
			Metadata:         row.Metadata,
			IsRead:           row.IsRead,
			CreatedAt:        row.CreatedAt,
			UpdatedAt:        row.UpdatedAt,
			ActorRole:        nullableTrimmedStr(row.ActorRole, ""),
			ActorName:        nullableTrimmedStr(pgtype.Text{String: row.ActorName, Valid: row.ActorName != ""}, ""),
		}))
	}

	itemPtrs := make([]*domain.NotificationItem, len(items))
	for i := range items {
		itemPtrs[i] = &items[i]
	}
	refreshNotificationRecentActors(ctx, q, itemPtrs)

	return &domain.NotificationsListResult{
		Items:       items,
		UnreadCount: int(unread),
	}, nil
}

func (r *NotificationRepository) MarkNotificationRead(ctx context.Context, notificationID, recipientID string) (*domain.NotificationItem, error) {
	return NewPostRepository(r.db).MarkNotificationRead(ctx, notificationID, recipientID)
}

func (r *NotificationRepository) MarkAllNotificationsRead(ctx context.Context, recipientID string) error {
	return NewPostRepository(r.db).MarkAllNotificationsRead(ctx, recipientID)
}

func (r *NotificationRepository) GetUnreadNotificationCount(ctx context.Context, recipientID string) (int, error) {
	return NewPostRepository(r.db).GetUnreadNotificationCount(ctx, recipientID)
}

func (r *NotificationRepository) CreateSystemNotification(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
	// System-wide notifications keep GroupKey empty so every lifecycle event is distinct.
	input.GroupKey = ""
	input.ActorCount = 1
	return NewPostRepository(r.db).CreateNotification(ctx, input)
}

func (r *NotificationRepository) CreateSystemNotificationsForActiveAdmins(
	ctx context.Context,
	input domain.CreateNotificationInput,
) ([]domain.NotificationItem, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	adminIDs, err := q.ListActiveAdminIDs(ctx)
	if err != nil {
		return nil, err
	}
	if len(adminIDs) == 0 {
		return []domain.NotificationItem{}, nil
	}

	actor := resolveActorSummary(ctx, q, input.ActorID, input.Metadata)
	metaBytes := marshalSystemNotificationMeta(input.Metadata, actor)

	var actorName, actorRole *string
	if actor != nil {
		n := actor.Name
		rl := actor.Role
		actorName = &n
		actorRole = &rl
	}

	var rxType *string
	if input.ReactionType != nil {
		s := string(*input.ReactionType)
		rxType = &s
	}

	created := make([]domain.NotificationItem, 0, len(adminIDs))
	for _, adminID := range adminIDs {
		row, err := q.CreateNotification(ctx, sqlc.CreateNotificationParams{
			RecipientID:      adminID,
			ActorID:          toPgUUIDPtr(input.ActorID),
			GroupKey:         "",
			ActorCount:       1,
			Category:         string(input.Category),
			NotificationType: string(input.NotificationType),
			PostID:           toPgUUIDPtr(input.PostID),
			CommentID:        toPgUUIDPtr(input.CommentID),
			ReactionType:     toPgTextPtr(rxType),
			Excerpt:          input.Excerpt,
			Metadata:         metaBytes,
		})
		if err != nil {
			return nil, err
		}
		created = append(created, buildNotificationItemFromRaw(rawNotificationRow{
			ID:               row.ID,
			RecipientID:      row.RecipientID,
			ActorID:          row.ActorID,
			GroupKey:         row.GroupKey,
			ActorCount:       row.ActorCount,
			Category:         row.Category,
			NotificationType: row.NotificationType,
			PostID:           row.PostID,
			CommentID:        row.CommentID,
			ReactionType:     row.ReactionType,
			Excerpt:          row.Excerpt,
			Metadata:         row.Metadata,
			IsRead:           row.IsRead,
			CreatedAt:        row.CreatedAt,
			UpdatedAt:        row.UpdatedAt,
			ActorRole:        actorRole,
			ActorName:        actorName,
		}))
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return created, nil
}

func (r *NotificationRepository) BatchCreateCustomerLiveNotifications(
	ctx context.Context,
	excerpt string,
	metadata map[string]interface{},
) ([]domain.NotificationItem, error) {
	metaBytes := marshalSystemNotificationMeta(metadata, nil)

	q := sqlc.New(r.db)
	rows, err := q.BatchCreateCustomerLiveNotifications(ctx, sqlc.BatchCreateCustomerLiveNotificationsParams{
		Excerpt:  excerpt,
		Metadata: metaBytes,
	})
	if err != nil {
		return nil, err
	}

	items := make([]domain.NotificationItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, buildNotificationItemFromRaw(rawNotificationRow{
			ID:               row.ID,
			RecipientID:      row.RecipientID,
			ActorID:          row.ActorID,
			GroupKey:         row.GroupKey,
			ActorCount:       row.ActorCount,
			Category:         row.Category,
			NotificationType: row.NotificationType,
			PostID:           row.PostID,
			CommentID:        row.CommentID,
			ReactionType:     row.ReactionType,
			Excerpt:          row.Excerpt,
			Metadata:         row.Metadata,
			IsRead:           row.IsRead,
			CreatedAt:        row.CreatedAt,
			UpdatedAt:        row.UpdatedAt,
		}))
	}
	return items, nil
}

func (r *NotificationRepository) GetReviewNotificationContext(ctx context.Context, reviewID string) (*domain.ReviewNotificationContext, error) {
	if _, err := parseUUID(reviewID); err != nil {
		return nil, domain.ErrReviewNotFound
	}

	q := sqlc.New(r.db)
	row, err := q.GetReviewNotificationContext(ctx, reviewID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReviewNotFound
		}
		return nil, err
	}

	return &domain.ReviewNotificationContext{
		ReviewID:    row.ReviewID,
		CustomerID:  row.CustomerID,
		OrderID:     row.OrderID,
		ProductID:   row.ProductID,
		ProductName: row.ProductName,
	}, nil
}
