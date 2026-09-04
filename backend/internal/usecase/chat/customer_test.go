package chat

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/storage/chatmedia"
)

type customerMockChatRepo struct {
	mockChatRepo
	getOrCreateConversationFn func(ctx context.Context, userID string) (*domain.Conversation, error)
	listMessagesFn            func(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error)
	createMessageFn           func(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error)
	markConversationReadFn    func(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error
	getAttachedOrderCardFn    func(ctx context.Context, orderID string) (*domain.AttachedOrderCard, error)
	getAttachmentsByIDsFn     func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error)
	listRecentOrdersForChatFn func(ctx context.Context, userID string, limit int) ([]domain.AttachedOrderCard, error)
	updateUserLastActiveFn    func(ctx context.Context, userID string, t time.Time) error
}

func (m *customerMockChatRepo) GetOrCreateConversation(ctx context.Context, userID string) (*domain.Conversation, error) {
	if m.getOrCreateConversationFn != nil {
		return m.getOrCreateConversationFn(ctx, userID)
	}
	return &domain.Conversation{
		ID:            "conv-" + userID,
		UserID:        userID,
		CustomerEmail: userID + "@example.com",
		CustomerName:  "Khách hàng",
		UnreadCount:   0,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}, nil
}

func (m *customerMockChatRepo) ListMessages(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
	if m.listMessagesFn != nil {
		return m.listMessagesFn(ctx, conversationID, limit, offset, currentRole)
	}
	return []domain.ChatMessage{}, nil
}

func (m *customerMockChatRepo) CreateMessage(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
	if m.createMessageFn != nil {
		return m.createMessageFn(ctx, input)
	}
	return &domain.ChatMessage{
		ID:              uuid.NewString(),
		ConversationID:  input.ConversationID,
		SenderID:        input.SenderID,
		SenderRole:      input.SenderRole,
		SenderName:      "Khách hàng",
		Content:         input.Content,
		AttachedOrderID: input.AttachedOrderID,
		Attachments:     []domain.ChatAttachment{},
		CreatedAt:       time.Now(),
		IsRead:          false,
	}, nil
}

func (m *customerMockChatRepo) MarkConversationRead(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error {
	if m.markConversationReadFn != nil {
		return m.markConversationReadFn(ctx, conversationID, readerRole)
	}
	return nil
}

func (m *customerMockChatRepo) GetAttachedOrderCard(ctx context.Context, orderID string) (*domain.AttachedOrderCard, error) {
	if m.getAttachedOrderCardFn != nil {
		return m.getAttachedOrderCardFn(ctx, orderID)
	}
	return nil, domain.ErrNotFound
}

func (m *customerMockChatRepo) GetAttachmentsByIDs(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
	if m.getAttachmentsByIDsFn != nil {
		return m.getAttachmentsByIDsFn(ctx, attachmentIDs)
	}
	return []domain.ChatAttachment{}, nil
}

func (m *customerMockChatRepo) ListRecentOrdersForChat(ctx context.Context, userID string, limit int) ([]domain.AttachedOrderCard, error) {
	if m.listRecentOrdersForChatFn != nil {
		return m.listRecentOrdersForChatFn(ctx, userID, limit)
	}
	return []domain.AttachedOrderCard{}, nil
}

func (m *customerMockChatRepo) UpdateUserLastActive(ctx context.Context, userID string, t time.Time) error {
	if m.updateUserLastActiveFn != nil {
		return m.updateUserLastActiveFn(ctx, userID, t)
	}
	return nil
}

func TestCustomerUseCase_GetOrCreateCustomerConversation(t *testing.T) {
	ctx := context.Background()
	fakeStore := chatmedia.NewFakeStore()

	t.Run("empty customerID returns ErrInvalidToken", func(t *testing.T) {
		repo := &customerMockChatRepo{}
		uc := New(repo, fakeStore)

		_, err := uc.GetOrCreateCustomerConversation(ctx, "")
		assert.ErrorIs(t, err, domain.ErrInvalidToken)

		_, err = uc.GetOrCreateCustomerConversation(ctx, "   ")
		assert.ErrorIs(t, err, domain.ErrInvalidToken)
	})

	t.Run("success returns conversation and updates last active", func(t *testing.T) {
		custID := uuid.NewString()
		updatedActive := false
		repo := &customerMockChatRepo{
			updateUserLastActiveFn: func(ctx context.Context, userID string, t time.Time) error {
				if userID == custID {
					updatedActive = true
				}
				return nil
			},
		}
		uc := New(repo, fakeStore)

		conv, err := uc.GetOrCreateCustomerConversation(ctx, custID)
		require.NoError(t, err)
		assert.NotNil(t, conv)
		assert.Equal(t, custID, conv.UserID)
		assert.True(t, updatedActive)
	})

	t.Run("repo error propagates", func(t *testing.T) {
		custID := uuid.NewString()
		expectedErr := errors.New("db error")
		repo := &customerMockChatRepo{
			getOrCreateConversationFn: func(ctx context.Context, userID string) (*domain.Conversation, error) {
				return nil, expectedErr
			},
		}
		uc := New(repo, fakeStore)

		_, err := uc.GetOrCreateCustomerConversation(ctx, custID)
		assert.ErrorIs(t, err, expectedErr)
	})
}

func TestCustomerUseCase_ListCustomerMessages(t *testing.T) {
	ctx := context.Background()
	fakeStore := chatmedia.NewFakeStore()
	custID := uuid.NewString()

	t.Run("empty customerID returns ErrInvalidToken", func(t *testing.T) {
		repo := &customerMockChatRepo{}
		uc := New(repo, fakeStore)

		_, err := uc.ListCustomerMessages(ctx, "", 50, 0)
		assert.ErrorIs(t, err, domain.ErrInvalidToken)
	})

	t.Run("normalizes pagination parameters", func(t *testing.T) {
		var capturedLimit, capturedOffset int
		repo := &customerMockChatRepo{
			listMessagesFn: func(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
				capturedLimit = limit
				capturedOffset = offset
				return []domain.ChatMessage{}, nil
			},
		}
		uc := New(repo, fakeStore)

		_, err := uc.ListCustomerMessages(ctx, custID, -1, -5)
		require.NoError(t, err)
		assert.Equal(t, DefaultMessageLimit, capturedLimit)
		assert.Equal(t, 0, capturedOffset)

		_, err = uc.ListCustomerMessages(ctx, custID, 999, 10)
		require.NoError(t, err)
		assert.Equal(t, DefaultMessageLimit, capturedLimit)
		assert.Equal(t, 10, capturedOffset)

		_, err = uc.ListCustomerMessages(ctx, custID, 30, 20)
		require.NoError(t, err)
		assert.Equal(t, 30, capturedLimit)
		assert.Equal(t, 20, capturedOffset)
	})

	t.Run("returns messages list", func(t *testing.T) {
		expectedMsgs := []domain.ChatMessage{
			{ID: "m1", Content: "Msg 1", CreatedAt: time.Now()},
			{ID: "m2", Content: "Msg 2", CreatedAt: time.Now().Add(time.Minute)},
		}
		repo := &customerMockChatRepo{
			listMessagesFn: func(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
				return expectedMsgs, nil
			},
		}
		uc := New(repo, fakeStore)

		msgs, err := uc.ListCustomerMessages(ctx, custID, 50, 0)
		require.NoError(t, err)
		assert.Len(t, msgs, 2)
		assert.Equal(t, "m1", msgs[0].ID)
	})
}

func TestCustomerUseCase_SendCustomerMessage(t *testing.T) {
	ctx := context.Background()
	fakeStore := chatmedia.NewFakeStore()
	custID := uuid.NewString()
	otherCustID := uuid.NewString()

	t.Run("empty customerID returns ErrInvalidToken", func(t *testing.T) {
		repo := &customerMockChatRepo{}
		uc := New(repo, fakeStore)

		_, err := uc.SendCustomerMessage(ctx, "", domain.SendMessageInput{Content: "Hello"})
		assert.ErrorIs(t, err, domain.ErrInvalidToken)
	})

	t.Run("rejects message exceeding 2000 runes", func(t *testing.T) {
		repo := &customerMockChatRepo{}
		uc := New(repo, fakeStore)

		longContent := strings.Repeat("a", 2001)
		_, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{Content: longContent})
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "content")
	})

	t.Run("rejects completely empty message (empty content, no attachments, no order)", func(t *testing.T) {
		repo := &customerMockChatRepo{}
		uc := New(repo, fakeStore)

		for _, emptyStr := range []string{"", "   ", "\t\n"} {
			_, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{Content: emptyStr})
			var valErr *domain.ValidationError
			require.True(t, errors.As(err, &valErr))
			assert.Contains(t, valErr.Fields, "content")
		}
	})

	t.Run("rejects order with invalid UUID", func(t *testing.T) {
		repo := &customerMockChatRepo{}
		uc := New(repo, fakeStore)

		invalidOrderID := "not-a-uuid"
		_, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:         "Hello",
			AttachedOrderID: &invalidOrderID,
		})
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "attachedOrderId")
	})

	t.Run("rejects order not found", func(t *testing.T) {
		repo := &customerMockChatRepo{
			getAttachedOrderCardFn: func(ctx context.Context, orderID string) (*domain.AttachedOrderCard, error) {
				return nil, domain.ErrNotFound
			},
		}
		uc := New(repo, fakeStore)

		orderID := uuid.NewString()
		_, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:         "Hello",
			AttachedOrderID: &orderID,
		})
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "attachedOrderId")
	})

	t.Run("rejects order belonging to another customer", func(t *testing.T) {
		orderID := uuid.NewString()
		repo := &customerMockChatRepo{
			getAttachedOrderCardFn: func(ctx context.Context, oID string) (*domain.AttachedOrderCard, error) {
				return &domain.AttachedOrderCard{
					ID:       orderID,
					UserID:   otherCustID, // Different user!
					Status:   domain.OrderStatusDelivered,
					TotalVND: "500000",
				}, nil
			},
		}
		uc := New(repo, fakeStore)

		_, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:         "Checking someone else's order",
			AttachedOrderID: &orderID,
		})
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "attachedOrderId")
	})

	t.Run("rejects attachment with invalid UUID", func(t *testing.T) {
		repo := &customerMockChatRepo{}
		uc := New(repo, fakeStore)

		_, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:       "Hello",
			AttachmentIDs: []string{"invalid-uuid"},
		})
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "attachmentIds")
	})

	t.Run("rejects attachment if count mismatch (attachment not found)", func(t *testing.T) {
		attID1 := uuid.NewString()
		attID2 := uuid.NewString()
		repo := &customerMockChatRepo{
			getAttachmentsByIDsFn: func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
				// Returns only 1 out of 2 requested
				return []domain.ChatAttachment{
					{ID: attID1, UploaderID: custID, MessageID: nil},
				}, nil
			},
		}
		uc := New(repo, fakeStore)

		_, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:       "Hello",
			AttachmentIDs: []string{attID1, attID2},
		})
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "attachmentIds")
	})

	t.Run("rejects attachment belonging to another user", func(t *testing.T) {
		attID := uuid.NewString()
		repo := &customerMockChatRepo{
			getAttachmentsByIDsFn: func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
				return []domain.ChatAttachment{
					{ID: attID, UploaderID: otherCustID, MessageID: nil},
				}, nil
			},
		}
		uc := New(repo, fakeStore)

		_, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:       "Hello",
			AttachmentIDs: []string{attID},
		})
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "attachmentIds")
	})

	t.Run("rejects attachment already linked to another message", func(t *testing.T) {
		attID := uuid.NewString()
		existingMsgID := uuid.NewString()
		repo := &customerMockChatRepo{
			getAttachmentsByIDsFn: func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
				return []domain.ChatAttachment{
					{ID: attID, UploaderID: custID, MessageID: &existingMsgID},
				}, nil
			},
		}
		uc := New(repo, fakeStore)

		_, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:       "Hello",
			AttachmentIDs: []string{attID},
		})
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "attachmentIds")
	})

	t.Run("success sending text-only message", func(t *testing.T) {
		var capturedInput domain.CreateMessageInput
		repo := &customerMockChatRepo{
			createMessageFn: func(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
				capturedInput = input
				return &domain.ChatMessage{
					ID:             "msg-123",
					ConversationID: input.ConversationID,
					SenderID:       input.SenderID,
					SenderRole:     input.SenderRole,
					SenderName:     "Khách hàng",
					Content:        input.Content,
					CreatedAt:      time.Now(),
				}, nil
			},
		}
		uc := New(repo, fakeStore)

		msg, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content: "Em cần tư vấn đơn hàng",
		})
		require.NoError(t, err)
		assert.NotNil(t, msg)
		assert.Equal(t, "msg-123", msg.ID)
		assert.Equal(t, custID, capturedInput.SenderID)
		assert.Equal(t, domain.ChatSenderCustomer, capturedInput.SenderRole)
		assert.Equal(t, "Em cần tư vấn đơn hàng", capturedInput.Content)
		assert.Nil(t, capturedInput.AttachedOrderID)
	})

	t.Run("success sending message with valid order attached", func(t *testing.T) {
		orderID := uuid.NewString()
		repo := &customerMockChatRepo{
			getAttachedOrderCardFn: func(ctx context.Context, oID string) (*domain.AttachedOrderCard, error) {
				return &domain.AttachedOrderCard{
					ID:       orderID,
					UserID:   custID,
					Status:   domain.OrderStatusConfirmed,
					TotalVND: "120000",
				}, nil
			},
			createMessageFn: func(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
				return &domain.ChatMessage{
					ID:              "msg-with-order",
					ConversationID:  input.ConversationID,
					SenderID:        input.SenderID,
					SenderRole:      input.SenderRole,
					Content:         input.Content,
					AttachedOrderID: input.AttachedOrderID,
					CreatedAt:       time.Now(),
				}, nil
			},
		}
		uc := New(repo, fakeStore)

		msg, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:         "Hỏi về đơn hàng này",
			AttachedOrderID: &orderID,
		})
		require.NoError(t, err)
		assert.NotNil(t, msg)
		assert.Equal(t, &orderID, msg.AttachedOrderID)
	})

	t.Run("success sending message with empty content when order is attached", func(t *testing.T) {
		orderID := uuid.NewString()
		repo := &customerMockChatRepo{
			getAttachedOrderCardFn: func(ctx context.Context, oID string) (*domain.AttachedOrderCard, error) {
				return &domain.AttachedOrderCard{
					ID:       orderID,
					UserID:   custID,
					Status:   domain.OrderStatusConfirmed,
					TotalVND: "120000",
				}, nil
			},
		}
		uc := New(repo, fakeStore)

		msg, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:         "",
			AttachedOrderID: &orderID,
		})
		require.NoError(t, err)
		assert.NotNil(t, msg)
	})

	t.Run("success sending message with empty content when attachment is attached", func(t *testing.T) {
		attID := uuid.NewString()
		repo := &customerMockChatRepo{
			getAttachmentsByIDsFn: func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
				return []domain.ChatAttachment{
					{ID: attID, UploaderID: custID, MessageID: nil},
				}, nil
			},
		}
		uc := New(repo, fakeStore)

		msg, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{
			Content:       "",
			AttachmentIDs: []string{attID},
		})
		require.NoError(t, err)
		assert.NotNil(t, msg)
	})
}

func TestCustomerUseCase_MarkCustomerConversationRead(t *testing.T) {
	ctx := context.Background()
	fakeStore := chatmedia.NewFakeStore()
	custID := uuid.NewString()

	t.Run("empty customerID returns ErrInvalidToken", func(t *testing.T) {
		repo := &customerMockChatRepo{}
		uc := New(repo, fakeStore)

		err := uc.MarkCustomerConversationRead(ctx, "")
		assert.ErrorIs(t, err, domain.ErrInvalidToken)
	})

	t.Run("marks customer conversation read successfully", func(t *testing.T) {
		markedRead := false
		repo := &customerMockChatRepo{
			markConversationReadFn: func(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error {
				assert.Equal(t, domain.ChatSenderCustomer, readerRole)
				markedRead = true
				return nil
			},
		}
		uc := New(repo, fakeStore)

		err := uc.MarkCustomerConversationRead(ctx, custID)
		require.NoError(t, err)
		assert.True(t, markedRead)
	})
}

func TestCustomerUseCase_ListCustomerOrdersForChat(t *testing.T) {
	ctx := context.Background()
	fakeStore := chatmedia.NewFakeStore()
	custID := uuid.NewString()

	t.Run("empty customerID returns ErrInvalidToken", func(t *testing.T) {
		repo := &customerMockChatRepo{}
		uc := New(repo, fakeStore)

		_, err := uc.ListCustomerOrdersForChat(ctx, "", 10)
		assert.ErrorIs(t, err, domain.ErrInvalidToken)
	})

	t.Run("normalizes limit and returns orders", func(t *testing.T) {
		var capturedLimit int
		repo := &customerMockChatRepo{
			listRecentOrdersForChatFn: func(ctx context.Context, userID string, limit int) ([]domain.AttachedOrderCard, error) {
				capturedLimit = limit
				return []domain.AttachedOrderCard{
					{ID: "ord-1", UserID: custID, Status: domain.OrderStatusDelivered, TotalVND: "150000"},
				}, nil
			},
		}
		uc := New(repo, fakeStore)

		orders, err := uc.ListCustomerOrdersForChat(ctx, custID, 0)
		require.NoError(t, err)
		assert.Equal(t, DefaultOrderPickerLimit, capturedLimit)
		assert.Len(t, orders, 1)

		ordersPicker, err := uc.ListCustomerOrdersForPicker(ctx, custID, 999)
		require.NoError(t, err)
		assert.Equal(t, DefaultOrderPickerLimit, capturedLimit)
		assert.Len(t, ordersPicker, 1)
	})
}

type testBroadcaster struct {
	broadcastNewMessageCalls   []*domain.ChatMessage
	broadcastMessagesReadCalls []struct {
		convID     string
		readerRole domain.ChatSenderRole
		readAt     time.Time
	}
	isAnyAdminOnlineResult bool
	isUserOnlineResult     bool
}

func (b *testBroadcaster) BroadcastNewMessage(ctx context.Context, msg *domain.ChatMessage) error {
	b.broadcastNewMessageCalls = append(b.broadcastNewMessageCalls, msg)
	return nil
}

func (b *testBroadcaster) BroadcastMessagesRead(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole, readAt time.Time) error {
	b.broadcastMessagesReadCalls = append(b.broadcastMessagesReadCalls, struct {
		convID     string
		readerRole domain.ChatSenderRole
		readAt     time.Time
	}{conversationID, readerRole, readAt})
	return nil
}

func (b *testBroadcaster) BroadcastPresence(ctx context.Context, userID string, role domain.ChatSenderRole, isOnline bool, lastActiveAt time.Time) error {
	return nil
}

func (b *testBroadcaster) IsUserOnline(userID string) bool {
	return b.isUserOnlineResult
}

func (b *testBroadcaster) IsAnyAdminOnline() bool {
	return b.isAnyAdminOnlineResult
}

var _ domain.ChatEventBroadcaster = (*testBroadcaster)(nil)

func TestCustomerUseCase_Broadcaster(t *testing.T) {
	ctx := context.Background()
	fakeStore := chatmedia.NewFakeStore()
	custID := uuid.NewString()
	convID := uuid.NewString()

	broadcaster := &testBroadcaster{isAnyAdminOnlineResult: true}
	repo := &customerMockChatRepo{
		getOrCreateConversationFn: func(ctx context.Context, userID string) (*domain.Conversation, error) {
			return &domain.Conversation{ID: convID, UserID: userID}, nil
		},
		createMessageFn: func(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
			return &domain.ChatMessage{
				ID:             "msg-123",
				ConversationID: input.ConversationID,
				SenderID:       input.SenderID,
				SenderRole:     input.SenderRole,
				Content:        input.Content,
			}, nil
		},
		markConversationReadFn: func(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error {
			return nil
		},
	}

	uc := New(repo, fakeStore, WithBroadcaster(broadcaster))

	t.Run("GetOrCreateCustomerConversation sets IsOnline from broadcaster", func(t *testing.T) {
		conv, err := uc.GetOrCreateCustomerConversation(ctx, custID)
		require.NoError(t, err)
		assert.True(t, conv.IsOnline)
	})

	t.Run("SendCustomerMessage emits BroadcastNewMessage", func(t *testing.T) {
		msg, err := uc.SendCustomerMessage(ctx, custID, domain.SendMessageInput{Content: "Hello realtime"})
		require.NoError(t, err)
		require.NotNil(t, msg)
		require.Len(t, broadcaster.broadcastNewMessageCalls, 1)
		assert.Equal(t, "msg-123", broadcaster.broadcastNewMessageCalls[0].ID)
	})

	t.Run("MarkCustomerConversationRead emits BroadcastMessagesRead", func(t *testing.T) {
		err := uc.MarkCustomerConversationRead(ctx, custID)
		require.NoError(t, err)
		require.Len(t, broadcaster.broadcastMessagesReadCalls, 1)
		assert.Equal(t, convID, broadcaster.broadcastMessagesReadCalls[0].convID)
		assert.Equal(t, domain.ChatSenderCustomer, broadcaster.broadcastMessagesReadCalls[0].readerRole)
	})
}
