package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type chatDB interface {
	sqlc.DBTX
}

type ChatRepository struct {
	db chatDB
}

func NewChatRepository(db chatDB) *ChatRepository {
	return &ChatRepository{db: db}
}

var _ domain.ChatRepository = (*ChatRepository)(nil)

func toDomainChatAttachment(row sqlc.ChatAttachment) *domain.ChatAttachment {
	var messageID *string
	if row.MessageID.Valid {
		idStr := uuid.UUID(row.MessageID.Bytes).String()
		messageID = &idStr
	}
	return &domain.ChatAttachment{
		ID:         row.ID,
		MessageID:  messageID,
		UploaderID: row.UploaderID,
		FileType:   domain.ChatAttachmentType(row.FileType),
		FileURL:    "/api/v1/chat/media/" + row.ID,
		FileName:   row.FileName,
		FileSize:   row.FileSize,
		MimeType:   row.MimeType,
		ObjectKey:  row.ObjectKey,
		CreatedAt:  row.CreatedAt,
	}
}

func (r *ChatRepository) CreatePendingAttachment(ctx context.Context, uploaderID string, objectKey string, fileType domain.ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*domain.ChatAttachment, error) {
	q := sqlc.New(r.db)
	row, err := q.CreatePendingAttachment(ctx, sqlc.CreatePendingAttachmentParams{
		UploaderID: uploaderID,
		ObjectKey:  objectKey,
		FileType:   string(fileType),
		FileName:   fileName,
		FileSize:   fileSize,
		MimeType:   mimeType,
	})
	if err != nil {
		return nil, err
	}
	return toDomainChatAttachment(row), nil
}

func (r *ChatRepository) GetAttachmentByID(ctx context.Context, attachmentID string) (*domain.ChatAttachment, error) {
	q := sqlc.New(r.db)
	row, err := q.GetAttachmentByID(ctx, attachmentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrChatAttachmentNotFound
		}
		return nil, err
	}
	return toDomainChatAttachment(row), nil
}

func (r *ChatRepository) GetMessageByID(ctx context.Context, messageID string) (*domain.ChatMessage, error) {
	q := sqlc.New(r.db)
	row, err := q.GetMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	var attachedOrderID *string
	if row.AttachedOrderID.Valid {
		s := uuid.UUID(row.AttachedOrderID.Bytes).String()
		attachedOrderID = &s
	}

	var attachedOrder *domain.AttachedOrderCard
	if attachedOrderID != nil {
		card, _ := r.GetAttachedOrderCard(ctx, *attachedOrderID)
		attachedOrder = card
	}

	var msgUUID pgtype.UUID
	if parsedUUID, err := uuid.Parse(messageID); err == nil {
		msgUUID = pgtype.UUID{Bytes: parsedUUID, Valid: true}
	}
	attRows, err := q.ListAttachmentsByMessageID(ctx, msgUUID)
	attachments := make([]domain.ChatAttachment, 0, len(attRows))
	if err == nil {
		for _, a := range attRows {
			attachments = append(attachments, *toDomainChatAttachment(a))
		}
	}

	return &domain.ChatMessage{
		ID:              row.ID,
		ConversationID:  row.ConversationID,
		SenderID:        row.SenderID,
		SenderRole:      domain.ChatSenderRole(row.SenderRole),
		SenderName:      row.SenderName,
		Content:         row.Content,
		AttachedOrderID: attachedOrderID,
		AttachedOrder:   attachedOrder,
		Attachments:     attachments,
		CreatedAt:       row.CreatedAt,
		IsRead:          row.IsRead,
	}, nil
}

func (r *ChatRepository) GetConversationByID(ctx context.Context, conversationID string) (*domain.Conversation, error) {
	q := sqlc.New(r.db)
	row, err := q.GetConversationByID(ctx, conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &domain.Conversation{
		ID:                 row.ID,
		UserID:             row.UserID,
		CustomerEmail:      row.CustomerEmail,
		CustomerName:       row.CustomerName,
		CustomerLastActive: pgTimestamptzToTimePtr(row.CustomerLastActive),
		LastMessageAt:      row.LastMessageAt,
		LastMessageSnippet: row.LastMessageSnippet,
		UnreadCount:        int(row.UnreadCountAdmin),
		CreatedAt:          row.CreatedAt,
		UpdatedAt:          row.UpdatedAt,
	}, nil
}

func (r *ChatRepository) GetConversationByUserID(ctx context.Context, userID string) (*domain.Conversation, error) {
	q := sqlc.New(r.db)
	row, err := q.GetConversationByUserID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &domain.Conversation{
		ID:                 row.ID,
		UserID:             row.UserID,
		CustomerEmail:      row.CustomerEmail,
		CustomerName:       row.CustomerName,
		CustomerLastActive: pgTimestamptzToTimePtr(row.CustomerLastActive),
		LastMessageAt:      row.LastMessageAt,
		LastMessageSnippet: row.LastMessageSnippet,
		UnreadCount:        int(row.UnreadCountCustomer),
		CreatedAt:          row.CreatedAt,
		UpdatedAt:          row.UpdatedAt,
	}, nil
}

func (r *ChatRepository) GetOrCreateConversation(ctx context.Context, userID string) (*domain.Conversation, error) {
	q := sqlc.New(r.db)
	_, err := q.CreateConversation(ctx, userID)
	if err != nil {
		return nil, err
	}
	return r.GetConversationByUserID(ctx, userID)
}

func (r *ChatRepository) ListConversationsForAdmin(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
	q := sqlc.New(r.db)
	total, err := q.CountConversationsForAdmin(ctx, sqlc.CountConversationsForAdminParams{
		Status: filter.Status,
		Search: filter.Search,
	})
	if err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []domain.Conversation{}, 0, nil
	}
	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}
	rows, err := q.ListConversationsForAdmin(ctx, sqlc.ListConversationsForAdminParams{
		Status:      filter.Status,
		Search:      filter.Search,
		LimitCount:  int32(limit),
		OffsetCount: int32(offset),
	})
	if err != nil {
		return nil, 0, err
	}
	convs := make([]domain.Conversation, len(rows))
	for i, row := range rows {
		convs[i] = domain.Conversation{
			ID:                 row.ID,
			UserID:             row.UserID,
			CustomerEmail:      row.CustomerEmail,
			CustomerName:       row.CustomerName,
			CustomerLastActive: pgTimestamptzToTimePtr(row.CustomerLastActive),
			LastMessageAt:      row.LastMessageAt,
			LastMessageSnippet: row.LastMessageSnippet,
			UnreadCount:        int(row.UnreadCount),
			CreatedAt:          row.CreatedAt,
			UpdatedAt:          row.UpdatedAt,
		}
	}
	return convs, int(total), nil
}

func (r *ChatRepository) ListMessages(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
	q := sqlc.New(r.db)
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := q.ListMessagesByConversationID(ctx, sqlc.ListMessagesByConversationIDParams{
		ConversationID: conversationID,
		LimitCount:     int32(limit),
		OffsetCount:    int32(offset),
	})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []domain.ChatMessage{}, nil
	}

	messageIDs := make([]string, len(rows))
	orderIDsMap := make(map[string]struct{})
	for i, row := range rows {
		messageIDs[i] = row.ID
		if row.AttachedOrderID.Valid {
			orderIDsMap[uuid.UUID(row.AttachedOrderID.Bytes).String()] = struct{}{}
		}
	}

	attRows, err := q.ListAttachmentsByMessageIDs(ctx, messageIDs)
	if err != nil {
		return nil, err
	}
	attMap := make(map[string][]domain.ChatAttachment)
	for _, aRow := range attRows {
		if aRow.MessageID.Valid {
			mID := uuid.UUID(aRow.MessageID.Bytes).String()
			attMap[mID] = append(attMap[mID], *toDomainChatAttachment(aRow))
		}
	}

	orderCardsMap := make(map[string]*domain.AttachedOrderCard)
	for orderID := range orderIDsMap {
		card, err := r.GetAttachedOrderCard(ctx, orderID)
		if err == nil && card != nil {
			orderCardsMap[orderID] = card
		}
	}

	messages := make([]domain.ChatMessage, len(rows))
	for i, row := range rows {
		var attachedOrderID *string
		var attachedOrder *domain.AttachedOrderCard
		if row.AttachedOrderID.Valid {
			s := uuid.UUID(row.AttachedOrderID.Bytes).String()
			attachedOrderID = &s
			attachedOrder = orderCardsMap[s]
		}
		atts := attMap[row.ID]
		if atts == nil {
			atts = []domain.ChatAttachment{}
		}
		messages[i] = domain.ChatMessage{
			ID:              row.ID,
			ConversationID:  row.ConversationID,
			SenderID:        row.SenderID,
			SenderRole:      domain.ChatSenderRole(row.SenderRole),
			SenderName:      row.SenderName,
			Content:         row.Content,
			AttachedOrderID: attachedOrderID,
			AttachedOrder:   attachedOrder,
			Attachments:     atts,
			CreatedAt:       row.CreatedAt,
			IsRead:          row.IsRead,
		}
	}
	return messages, nil
}

func (r *ChatRepository) CreateMessage(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
	var attachedOrderUUID pgtype.UUID
	if input.AttachedOrderID != nil && *input.AttachedOrderID != "" {
		parsedOrder, err := uuid.Parse(*input.AttachedOrderID)
		if err == nil {
			attachedOrderUUID = pgtype.UUID{Bytes: parsedOrder, Valid: true}
		}
	}

	var dbtx sqlc.DBTX = r.db
	var tx pgx.Tx
	if starter, ok := r.db.(txStarter); ok {
		var err error
		tx, err = starter.Begin(ctx)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback(ctx)
		dbtx = tx
	}

	q := sqlc.New(dbtx)
	msgRow, err := q.InsertChatMessage(ctx, sqlc.InsertChatMessageParams{
		ConversationID:  input.ConversationID,
		SenderID:        input.SenderID,
		SenderRole:      string(input.SenderRole),
		Content:         input.Content,
		AttachedOrderID: attachedOrderUUID,
	})
	if err != nil {
		return nil, err
	}

	if len(input.AttachmentIDs) > 0 {
		parsedMsgUUID, err := uuid.Parse(msgRow.ID)
		if err != nil {
			return nil, err
		}
		err = q.AttachFilesToMessage(ctx, sqlc.AttachFilesToMessageParams{
			MessageID:     pgtype.UUID{Bytes: parsedMsgUUID, Valid: true},
			AttachmentIds: input.AttachmentIDs,
			UploaderID:    input.SenderID,
		})
		if err != nil {
			return nil, err
		}
	}

	if err := q.UpdateConversationLastMessageAt(ctx, sqlc.UpdateConversationLastMessageAtParams{
		ID:            input.ConversationID,
		LastMessageAt: msgRow.CreatedAt,
	}); err != nil {
		return nil, err
	}

	if tx != nil {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
	}

	return r.GetMessageByID(ctx, msgRow.ID)
}

func (r *ChatRepository) GetAttachmentsByIDs(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
	if len(attachmentIDs) == 0 {
		return []domain.ChatAttachment{}, nil
	}
	q := sqlc.New(r.db)
	rows, err := q.GetAttachmentsByIDs(ctx, attachmentIDs)
	if err != nil {
		return nil, err
	}
	attachments := make([]domain.ChatAttachment, len(rows))
	for i, row := range rows {
		attachments[i] = *toDomainChatAttachment(row)
	}
	return attachments, nil
}

func (r *ChatRepository) MarkConversationRead(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error {
	q := sqlc.New(r.db)
	now := time.Now().UTC()
	if readerRole == domain.ChatSenderCustomer {
		return q.MarkCustomerConversationRead(ctx, sqlc.MarkCustomerConversationReadParams{
			CustomerLastReadAt: now,
			ID:                 conversationID,
		})
	}
	return q.MarkAdminConversationRead(ctx, sqlc.MarkAdminConversationReadParams{
		AdminLastReadAt: now,
		ID:              conversationID,
	})
}

func (r *ChatRepository) GetAttachedOrderCard(ctx context.Context, orderID string) (*domain.AttachedOrderCard, error) {
	q := sqlc.New(r.db)
	orderRow, err := q.GetOrderForChatCard(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	count, err := q.CountOrderItemsForChat(ctx, orderID)
	if err != nil {
		return nil, err
	}

	items, err := q.ListOrderItemsSummaryForChat(ctx, orderID)
	if err != nil {
		return nil, err
	}

	itemsSummary := make([]domain.AttachedOrderItemSummary, len(items))
	for i, it := range items {
		itemsSummary[i] = domain.AttachedOrderItemSummary{
			ProductName:  it.ProductName,
			Quantity:     it.Quantity,
			UnitPriceVND: domain.MoneyVND(it.UnitPriceVnd),
			ImageURL:     it.ImageUrl,
		}
	}

	return &domain.AttachedOrderCard{
		ID:              orderRow.ID,
		UserID:          orderRow.UserID,
		Status:          domain.OrderStatus(orderRow.Status),
		TotalVND:        domain.MoneyVND(orderRow.TotalVnd),
		CreatedAt:       orderRow.CreatedAt,
		ItemsSummary:    itemsSummary,
		TotalItemsCount: int(count),
	}, nil
}

func (r *ChatRepository) ListRecentOrdersForChat(ctx context.Context, userID string, limit int) ([]domain.AttachedOrderCard, error) {
	q := sqlc.New(r.db)
	if limit <= 0 {
		limit = 10
	}
	orderRows, err := q.ListRecentOrdersForChatPicker(ctx, sqlc.ListRecentOrdersForChatPickerParams{
		UserID:     userID,
		LimitCount: int32(limit),
	})
	if err != nil {
		return nil, err
	}
	if len(orderRows) == 0 {
		return []domain.AttachedOrderCard{}, nil
	}

	orderIDs := make([]string, len(orderRows))
	for i, row := range orderRows {
		orderIDs[i] = row.ID
	}

	items, err := q.ListOrderItemsSummaryByOrderIDs(ctx, orderIDs)
	if err != nil {
		return nil, err
	}

	itemsMap := make(map[string][]domain.AttachedOrderItemSummary)
	countsMap := make(map[string]int)
	for _, it := range items {
		itemsMap[it.OrderID] = append(itemsMap[it.OrderID], domain.AttachedOrderItemSummary{
			ProductName:  it.ProductName,
			Quantity:     it.Quantity,
			UnitPriceVND: domain.MoneyVND(it.UnitPriceVnd),
			ImageURL:     it.ImageUrl,
		})
		countsMap[it.OrderID]++
	}

	cards := make([]domain.AttachedOrderCard, len(orderRows))
	for i, o := range orderRows {
		its := itemsMap[o.ID]
		if its == nil {
			its = []domain.AttachedOrderItemSummary{}
		}
		cards[i] = domain.AttachedOrderCard{
			ID:              o.ID,
			UserID:          userID,
			Status:          domain.OrderStatus(o.Status),
			TotalVND:        domain.MoneyVND(o.TotalVnd),
			CreatedAt:       o.CreatedAt,
			ItemsSummary:    its,
			TotalItemsCount: countsMap[o.ID],
		}
	}
	return cards, nil
}

func (r *ChatRepository) UpdateUserLastActive(ctx context.Context, userID string, t time.Time) error {
	q := sqlc.New(r.db)
	return q.UpdateUserLastActive(ctx, sqlc.UpdateUserLastActiveParams{
		ID:           userID,
		LastActiveAt: pgtype.Timestamptz{Time: t, Valid: true},
	})
}
