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
	Begin(context.Context) (pgx.Tx, error)
}

type ChatRepository struct {
	db chatDB
}

func NewChatRepository(db chatDB) *ChatRepository {
	return &ChatRepository{db: db}
}

var _ domain.ChatRepository = (*ChatRepository)(nil)

func uuidToPgtype(s *string) pgtype.UUID {
	if s == nil || *s == "" {
		return pgtype.UUID{}
	}
	parsed, err := uuid.Parse(*s)
	if err != nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: parsed, Valid: true}
}

func pgtypeToUUIDString(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	str := uuid.UUID(u.Bytes).String()
	return &str
}

func (r *ChatRepository) GetConversationByID(ctx context.Context, id string) (*domain.Conversation, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, domain.ErrConversationNotFound
	}
	q := sqlc.New(r.db)
	row, err := q.GetConversationByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrConversationNotFound
		}
		return nil, err
	}

	return mapConversationRow(row), nil
}

func (r *ChatRepository) GetConversationByUserID(ctx context.Context, userID string) (*domain.Conversation, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrConversationNotFound
	}
	q := sqlc.New(r.db)
	row, err := q.GetConversationByUserID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrConversationNotFound
		}
		return nil, err
	}

	return mapConversationRow(row), nil
}

func (r *ChatRepository) CreateConversationForUser(ctx context.Context, userID string) (*domain.Conversation, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrConversationNotFound
	}
	q := sqlc.New(r.db)
	row, err := q.CreateConversationForUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	return mapConversationRow(row), nil
}

func (r *ChatRepository) ListAdminConversations(ctx context.Context, unreadOnly bool, page, pageSize int) ([]domain.Conversation, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	q := sqlc.New(r.db)
	total, err := q.CountAdminConversations(ctx, unreadOnly)
	if err != nil {
		return nil, 0, err
	}

	rows, err := q.ListAdminConversations(ctx, sqlc.ListAdminConversationsParams{
		UnreadOnly:  unreadOnly,
		LimitCount:  int32(pageSize),
		OffsetCount: int32(offset),
	})
	if err != nil {
		return nil, 0, err
	}

	now := time.Now()
	res := make([]domain.Conversation, len(rows))
	for i, row := range rows {
		conv := domain.Conversation{
			ID:                   row.ID,
			UserID:               row.UserID,
			CustomerEmail:        row.CustomerEmail,
			CustomerLastReadAt:   row.CustomerLastReadAt,
			AdminLastReadAt:      row.AdminLastReadAt,
			CustomerLastActiveAt: row.CustomerLastActiveAt,
			LastMessageAt:        row.LastMessageAt,
			AdminUnreadCount:     int(row.AdminUnreadCount),
			CreatedAt:            row.CreatedAt,
			UpdatedAt:            row.UpdatedAt,
		}
		if row.AdminLastActiveAt.Valid {
			t := row.AdminLastActiveAt.Time
			conv.AdminLastActiveAt = &t
		}
		conv.CustomerPresence = domain.CalculatePresence(&conv.CustomerLastActiveAt, now)
		conv.AdminPresence = domain.CalculatePresence(conv.AdminLastActiveAt, now)

		// Lấy preview tin nhắn mới nhất
		lastMsg, err := q.GetLastMessageByConversationID(ctx, row.ID)
		if err == nil {
			conv.LastMessage = &domain.MessageSummary{
				ID:         lastMsg.ID,
				SenderRole: lastMsg.SenderRole,
				Content:    lastMsg.Content,
				CreatedAt:  lastMsg.CreatedAt,
			}
		}

		res[i] = conv
	}

	return res, int(total), nil
}

func (r *ChatRepository) InsertMessage(ctx context.Context, conversationID, senderID, senderRole, messageType string, orderID *string, content string) (*domain.Message, error) {
	if messageType == "" {
		if orderID != nil && *orderID != "" {
			messageType = "order"
		} else {
			messageType = "text"
		}
	}

	q := sqlc.New(r.db)
	row, err := q.InsertChatMessage(ctx, sqlc.InsertChatMessageParams{
		ConversationID: conversationID,
		SenderID:       senderID,
		SenderRole:     senderRole,
		MessageType:    messageType,
		OrderID:        uuidToPgtype(orderID),
		Content:        content,
	})
	if err != nil {
		return nil, err
	}

	_ = q.UpdateConversationLastMessage(ctx, conversationID)

	msg := &domain.Message{
		ID:             row.ID,
		ConversationID: row.ConversationID,
		SenderID:       row.SenderID,
		SenderRole:     row.SenderRole,
		MessageType:    row.MessageType,
		OrderID:        pgtypeToUUIDString(row.OrderID),
		Content:        row.Content,
		Media:          []domain.MessageMedia{},
		CreatedAt:      row.CreatedAt,
	}

	if msg.OrderID != nil {
		if summary, err := r.GetOrderSummaryByID(ctx, *msg.OrderID); err == nil {
			msg.OrderSummary = summary
		}
	}

	return msg, nil
}

func (r *ChatRepository) InsertMessageMedia(ctx context.Context, messageID, mediaType, objectKey, contentType string, fileSize int64, fileName string) (*domain.MessageMedia, error) {
	q := sqlc.New(r.db)
	row, err := q.InsertChatMessageMedia(ctx, sqlc.InsertChatMessageMediaParams{
		MessageID:   messageID,
		MediaType:   mediaType,
		ObjectKey:   objectKey,
		ContentType: contentType,
		FileSize:    fileSize,
		FileName:    fileName,
	})
	if err != nil {
		return nil, err
	}

	return &domain.MessageMedia{
		ID:          row.ID,
		MessageID:   row.MessageID,
		MediaType:   row.MediaType,
		ObjectKey:   row.ObjectKey,
		URL:         "/media/chat/" + row.ID,
		ContentType: row.ContentType,
		FileSize:    row.FileSize,
		FileName:    row.FileName,
		CreatedAt:   row.CreatedAt,
	}, nil
}

func (r *ChatRepository) ListMessages(ctx context.Context, conversationID string, limit int, before *time.Time) ([]domain.Message, bool, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	fetchLimit := limit + 1
	q := sqlc.New(r.db)

	type msgWithOrder struct {
		sqlc.ListRecentChatMessagesRow
	}

	var rawRows []sqlc.ListRecentChatMessagesRow
	var err error

	if before != nil {
		rows, bErr := q.ListChatMessagesBefore(ctx, sqlc.ListChatMessagesBeforeParams{
			ConversationID: conversationID,
			CreatedAt:      *before,
			Limit:          int32(fetchLimit),
		})
		err = bErr
		for _, rItem := range rows {
			rawRows = append(rawRows, sqlc.ListRecentChatMessagesRow{
				ID:             rItem.ID,
				ConversationID: rItem.ConversationID,
				SenderID:       rItem.SenderID,
				SenderRole:     rItem.SenderRole,
				MessageType:    rItem.MessageType,
				OrderID:        rItem.OrderID,
				Content:        rItem.Content,
				CreatedAt:      rItem.CreatedAt,
			})
		}
	} else {
		rawRows, err = q.ListRecentChatMessages(ctx, sqlc.ListRecentChatMessagesParams{
			ConversationID: conversationID,
			Limit:          int32(fetchLimit),
		})
	}
	if err != nil {
		return nil, false, err
	}

	hasMore := false
	if len(rawRows) > limit {
		hasMore = true
		// rawRows sắp xếp ASC. Phần tử đầu tiên (index 0) là tin cũ nhất trong số fetchLimit tin.
		// Khi chỉ lấy 'limit' tin gần nhất/gần mốc before nhất, ta bỏ phần tử đầu tiên.
		rawRows = rawRows[len(rawRows)-limit:]
	}

	if len(rawRows) == 0 {
		return []domain.Message{}, false, nil
	}

	messageIDs := make([]string, len(rawRows))
	for i, m := range rawRows {
		messageIDs[i] = m.ID
	}

	mediaRows, err := q.ListChatMessageMediaByMessageIDs(ctx, messageIDs)
	if err != nil {
		return nil, false, err
	}

	mediaByMsgID := make(map[string][]domain.MessageMedia)
	for _, m := range mediaRows {
		mediaByMsgID[m.MessageID] = append(mediaByMsgID[m.MessageID], domain.MessageMedia{
			ID:          m.ID,
			MessageID:   m.MessageID,
			MediaType:   m.MediaType,
			ObjectKey:   m.ObjectKey,
			URL:         "/media/chat/" + m.ID,
			ContentType: m.ContentType,
			FileSize:    m.FileSize,
			FileName:    m.FileName,
			CreatedAt:   m.CreatedAt,
		})
	}

	messages := make([]domain.Message, len(rawRows))
	for i, m := range rawRows {
		media := mediaByMsgID[m.ID]
		if media == nil {
			media = []domain.MessageMedia{}
		}

		orderIDStr := pgtypeToUUIDString(m.OrderID)
		var orderSummary *domain.OrderSummary
		if orderIDStr != nil {
			if sum, err := r.GetOrderSummaryByID(ctx, *orderIDStr); err == nil {
				orderSummary = sum
			}
		}

		messages[i] = domain.Message{
			ID:             m.ID,
			ConversationID: m.ConversationID,
			SenderID:       m.SenderID,
			SenderRole:     m.SenderRole,
			MessageType:    m.MessageType,
			OrderID:        orderIDStr,
			OrderSummary:   orderSummary,
			Content:        m.Content,
			Media:          media,
			CreatedAt:      m.CreatedAt,
		}
	}

	return messages, hasMore, nil
}

func (r *ChatRepository) GetMediaByID(ctx context.Context, mediaID string) (*domain.MessageMedia, error) {
	q := sqlc.New(r.db)
	m, err := q.GetChatMessageMediaByID(ctx, mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrChatMessageMediaNotFound
		}
		return nil, err
	}

	return &domain.MessageMedia{
		ID:          m.ID,
		MessageID:   m.MessageID,
		MediaType:   m.MediaType,
		ObjectKey:   m.ObjectKey,
		URL:         "/media/chat/" + m.ID,
		ContentType: m.ContentType,
		FileSize:    m.FileSize,
		FileName:    m.FileName,
		CreatedAt:   m.CreatedAt,
	}, nil
}

func (r *ChatRepository) MarkCustomerRead(ctx context.Context, conversationID string) error {
	q := sqlc.New(r.db)
	return q.UpdateCustomerLastRead(ctx, conversationID)
}

func (r *ChatRepository) MarkAdminRead(ctx context.Context, conversationID string) error {
	q := sqlc.New(r.db)
	return q.UpdateAdminLastRead(ctx, conversationID)
}

func (r *ChatRepository) UpdateCustomerActive(ctx context.Context, conversationID string) error {
	q := sqlc.New(r.db)
	return q.UpdateCustomerLastActive(ctx, conversationID)
}

func (r *ChatRepository) UpdateAdminActive(ctx context.Context, conversationID string) error {
	q := sqlc.New(r.db)
	return q.UpdateAdminLastActive(ctx, conversationID)
}

func (r *ChatRepository) GetCustomerTotalUnread(ctx context.Context, userID string) (int, error) {
	q := sqlc.New(r.db)
	c, err := q.GetCustomerTotalUnreadCount(ctx, userID)
	return int(c), err
}

func (r *ChatRepository) GetOrderSummaryByID(ctx context.Context, orderID string) (*domain.OrderSummary, error) {
	q := sqlc.New(r.db)
	row, err := q.GetOrderSummaryByID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	return &domain.OrderSummary{
		ID:            row.ID,
		Status:        row.Status,
		TotalVND:      row.TotalVnd,
		RecipientName: row.RecipientName,
		CreatedAt:     row.CreatedAt,
		ItemCount:     int(row.ItemCount),
		FirstItemName: row.FirstItemName,
	}, nil
}

func (r *ChatRepository) CheckOrderOwnership(ctx context.Context, orderID, userID string) error {
	q := sqlc.New(r.db)
	ownerID, err := q.CheckOrderOwnership(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrOrderNotEligibleForChat
		}
		return err
	}
	if ownerID != userID {
		return domain.ErrOrderNotEligibleForChat
	}
	return nil
}

func mapConversationRow(row sqlc.ChatConversation) *domain.Conversation {
	now := time.Now()
	conv := &domain.Conversation{
		ID:                   row.ID,
		UserID:               row.UserID,
		CustomerLastReadAt:   row.CustomerLastReadAt,
		AdminLastReadAt:      row.AdminLastReadAt,
		CustomerLastActiveAt: row.CustomerLastActiveAt,
		LastMessageAt:        row.LastMessageAt,
		CreatedAt:            row.CreatedAt,
		UpdatedAt:            row.UpdatedAt,
	}
	if row.AdminLastActiveAt.Valid {
		t := row.AdminLastActiveAt.Time
		conv.AdminLastActiveAt = &t
	}
	conv.CustomerPresence = domain.CalculatePresence(&conv.CustomerLastActiveAt, now)
	conv.AdminPresence = domain.CalculatePresence(conv.AdminLastActiveAt, now)
	return conv
}
