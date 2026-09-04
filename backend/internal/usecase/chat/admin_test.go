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
)

type adminMockChatRepo struct {
	mockChatRepo
	listConversationsForAdminFn func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error)
	getConversationByIDFn       func(ctx context.Context, conversationID string) (*domain.Conversation, error)
	listMessagesFn              func(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error)
	createMessageFn             func(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error)
	markConversationReadFn      func(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error
	getAttachmentsByIDsFn       func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error)
}

func (m *adminMockChatRepo) ListConversationsForAdmin(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
	if m.listConversationsForAdminFn != nil {
		return m.listConversationsForAdminFn(ctx, filter)
	}
	return []domain.Conversation{}, 0, nil
}

func (m *adminMockChatRepo) GetConversationByID(ctx context.Context, conversationID string) (*domain.Conversation, error) {
	if m.getConversationByIDFn != nil {
		return m.getConversationByIDFn(ctx, conversationID)
	}
	return &domain.Conversation{
		ID:            conversationID,
		UserID:        "cust-1",
		CustomerEmail: "cust@example.com",
		CustomerName:  "Khách hàng",
		UnreadCount:   0,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}, nil
}

func (m *adminMockChatRepo) ListMessages(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
	if m.listMessagesFn != nil {
		return m.listMessagesFn(ctx, conversationID, limit, offset, currentRole)
	}
	return []domain.ChatMessage{}, nil
}

func (m *adminMockChatRepo) CreateMessage(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
	if m.createMessageFn != nil {
		return m.createMessageFn(ctx, input)
	}
	return &domain.ChatMessage{
		ID:             uuid.NewString(),
		ConversationID: input.ConversationID,
		SenderID:       input.SenderID,
		SenderRole:     input.SenderRole,
		SenderName:     "Hỗ trợ viên",
		Content:        input.Content,
		Attachments:    []domain.ChatAttachment{},
		CreatedAt:      time.Now(),
		IsRead:         false,
	}, nil
}

func (m *adminMockChatRepo) MarkConversationRead(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error {
	if m.markConversationReadFn != nil {
		return m.markConversationReadFn(ctx, conversationID, readerRole)
	}
	return nil
}

func (m *adminMockChatRepo) GetAttachmentsByIDs(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
	if m.getAttachmentsByIDsFn != nil {
		return m.getAttachmentsByIDsFn(ctx, attachmentIDs)
	}
	return []domain.ChatAttachment{}, nil
}

func TestAdminUseCase_ListAdminConversations(t *testing.T) {
	t.Run("default values applied when empty", func(t *testing.T) {
		called := false
		repo := &adminMockChatRepo{
			listConversationsForAdminFn: func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
				called = true
				assert.Equal(t, "all", filter.Status)
				assert.Equal(t, 20, filter.Limit)
				assert.Equal(t, 0, filter.Offset)
				assert.Equal(t, "", filter.Search)
				return []domain.Conversation{
					{ID: "conv-1", CustomerEmail: "cust1@example.com"},
				}, 1, nil
			},
		}
		uc := New(repo, nil)

		convs, total, err := uc.ListAdminConversations(context.Background(), domain.AdminConversationFilter{})
		require.NoError(t, err)
		assert.True(t, called)
		assert.Equal(t, 1, total)
		assert.Len(t, convs, 1)
	})

	t.Run("custom filter status, search, and pagination", func(t *testing.T) {
		repo := &adminMockChatRepo{
			listConversationsForAdminFn: func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
				assert.Equal(t, "unread", filter.Status)
				assert.Equal(t, "order-123", filter.Search)
				assert.Equal(t, 10, filter.Limit)
				assert.Equal(t, 20, filter.Offset)
				return []domain.Conversation{}, 0, nil
			},
		}
		uc := New(repo, nil)

		convs, total, err := uc.ListAdminConversations(context.Background(), domain.AdminConversationFilter{
			Status: "unread",
			Search: "  order-123  ",
			Limit:  10,
			Offset: 20,
		})
		require.NoError(t, err)
		assert.Equal(t, 0, total)
		assert.NotNil(t, convs)
	})

	t.Run("repo error propagated", func(t *testing.T) {
		repo := &adminMockChatRepo{
			listConversationsForAdminFn: func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
				return nil, 0, errors.New("db query error")
			},
		}
		uc := New(repo, nil)

		convs, total, err := uc.ListAdminConversations(context.Background(), domain.AdminConversationFilter{})
		assert.Error(t, err)
		assert.Equal(t, 0, total)
		assert.Nil(t, convs)
	})

	t.Run("convenience method ListConversationsForAdmin", func(t *testing.T) {
		repo := &adminMockChatRepo{
			listConversationsForAdminFn: func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
				assert.Equal(t, "unread", filter.Status)
				assert.Equal(t, "email@example.com", filter.Search)
				return []domain.Conversation{{ID: "c-1"}}, 1, nil
			},
		}
		uc := New(repo, nil)

		convs, err := uc.ListConversationsForAdmin(context.Background(), "unread", "email@example.com", 20, 0)
		require.NoError(t, err)
		assert.Len(t, convs, 1)
	})
}

func TestAdminUseCase_ListAdminMessages(t *testing.T) {
	convUUID := uuid.NewString()

	t.Run("invalid conversationID returns ErrConversationNotFound", func(t *testing.T) {
		uc := New(&adminMockChatRepo{}, nil)

		msgs, err := uc.ListAdminMessages(context.Background(), "not-a-uuid", 50, 0)
		assert.ErrorIs(t, err, domain.ErrConversationNotFound)
		assert.Nil(t, msgs)
	})

	t.Run("conversation not found returns ErrConversationNotFound", func(t *testing.T) {
		repo := &adminMockChatRepo{
			getConversationByIDFn: func(ctx context.Context, conversationID string) (*domain.Conversation, error) {
				return nil, domain.ErrNotFound
			},
		}
		uc := New(repo, nil)

		msgs, err := uc.ListAdminMessages(context.Background(), convUUID, 50, 0)
		assert.ErrorIs(t, err, domain.ErrConversationNotFound)
		assert.Nil(t, msgs)
	})

	t.Run("success returns messages with Admin role context", func(t *testing.T) {
		repo := &adminMockChatRepo{
			listMessagesFn: func(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
				assert.Equal(t, convUUID, conversationID)
				assert.Equal(t, domain.ChatSenderAdmin, currentRole)
				assert.Equal(t, 50, limit)
				assert.Equal(t, 0, offset)
				return []domain.ChatMessage{
					{ID: "msg-1", Content: "Chào bạn!"},
				}, nil
			},
		}
		uc := New(repo, nil)

		msgs, err := uc.ListAdminMessages(context.Background(), convUUID, 50, 0)
		require.NoError(t, err)
		assert.Len(t, msgs, 1)
		assert.Equal(t, "msg-1", msgs[0].ID)
	})

	t.Run("convenience method ListAdminConversationMessages", func(t *testing.T) {
		repo := &adminMockChatRepo{
			listMessagesFn: func(ctx context.Context, conversationID string, limit, offset int, currentRole domain.ChatSenderRole) ([]domain.ChatMessage, error) {
				return []domain.ChatMessage{{ID: "msg-2"}}, nil
			},
		}
		uc := New(repo, nil)

		msgs, err := uc.ListAdminConversationMessages(context.Background(), convUUID, 10, 5)
		require.NoError(t, err)
		assert.Len(t, msgs, 1)
	})
}

func TestAdminUseCase_SendAdminReply(t *testing.T) {
	convUUID := uuid.NewString()
	adminID := "admin-1"

	t.Run("empty adminID returns ErrInvalidToken", func(t *testing.T) {
		uc := New(&adminMockChatRepo{}, nil)

		msg, err := uc.SendAdminReply(context.Background(), "", convUUID, "Hello", nil)
		assert.ErrorIs(t, err, domain.ErrInvalidToken)
		assert.Nil(t, msg)
	})

	t.Run("invalid conversationID returns ErrConversationNotFound", func(t *testing.T) {
		uc := New(&adminMockChatRepo{}, nil)

		msg, err := uc.SendAdminReply(context.Background(), adminID, "invalid-uuid", "Hello", nil)
		assert.ErrorIs(t, err, domain.ErrConversationNotFound)
		assert.Nil(t, msg)
	})

	t.Run("conversation not found returns ErrConversationNotFound", func(t *testing.T) {
		repo := &adminMockChatRepo{
			getConversationByIDFn: func(ctx context.Context, conversationID string) (*domain.Conversation, error) {
				return nil, domain.ErrNotFound
			},
		}
		uc := New(repo, nil)

		msg, err := uc.SendAdminReply(context.Background(), adminID, convUUID, "Hello", nil)
		assert.ErrorIs(t, err, domain.ErrConversationNotFound)
		assert.Nil(t, msg)
	})

	t.Run("content exceeding 2000 runes returns validation error", func(t *testing.T) {
		uc := New(&adminMockChatRepo{}, nil)

		longContent := strings.Repeat("đ", 2001)
		msg, err := uc.SendAdminReply(context.Background(), adminID, convUUID, longContent, nil)
		assert.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Equal(t, "Nội dung tin nhắn không được vượt quá 2000 ký tự", valErr.Fields["content"])
		assert.Nil(t, msg)
	})

	t.Run("empty content and no attachments returns validation error", func(t *testing.T) {
		uc := New(&adminMockChatRepo{}, nil)

		msg, err := uc.SendAdminReply(context.Background(), adminID, convUUID, "   ", nil)
		assert.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Equal(t, "Nội dung tin nhắn không được để trống khi không có tệp đính kèm", valErr.Fields["content"])
		assert.Nil(t, msg)
	})

	t.Run("valid text content creates message with admin role", func(t *testing.T) {
		created := false
		repo := &adminMockChatRepo{
			createMessageFn: func(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
				created = true
				assert.Equal(t, convUUID, input.ConversationID)
				assert.Equal(t, adminID, input.SenderID)
				assert.Equal(t, domain.ChatSenderAdmin, input.SenderRole)
				assert.Equal(t, "Dạ shop chào bạn, shop có thể hỗ trợ gì ạ?", input.Content)
				assert.Nil(t, input.AttachedOrderID)
				assert.Empty(t, input.AttachmentIDs)
				return &domain.ChatMessage{
					ID:         "msg-new",
					SenderRole: domain.ChatSenderAdmin,
					Content:    input.Content,
				}, nil
			},
		}
		uc := New(repo, nil)

		msg, err := uc.SendAdminReply(context.Background(), adminID, convUUID, "Dạ shop chào bạn, shop có thể hỗ trợ gì ạ?", nil)
		require.NoError(t, err)
		assert.True(t, created)
		assert.NotNil(t, msg)
		assert.Equal(t, "msg-new", msg.ID)
	})

	t.Run("attachment ID is not a valid uuid returns validation error", func(t *testing.T) {
		uc := New(&adminMockChatRepo{}, nil)

		msg, err := uc.SendAdminReply(context.Background(), adminID, convUUID, "ảnh đây", []string{"invalid-att-id"})
		assert.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Equal(t, "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất", valErr.Fields["attachmentIds"])
		assert.Nil(t, msg)
	})

	t.Run("attachment not found in database returns validation error", func(t *testing.T) {
		attUUID := uuid.NewString()
		repo := &adminMockChatRepo{
			getAttachmentsByIDsFn: func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
				return []domain.ChatAttachment{}, nil
			},
		}
		uc := New(repo, nil)

		msg, err := uc.SendAdminReply(context.Background(), adminID, convUUID, "ảnh", []string{attUUID})
		assert.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Equal(t, "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất", valErr.Fields["attachmentIds"])
		assert.Nil(t, msg)
	})

	t.Run("attachment uploader does not match adminID returns validation error", func(t *testing.T) {
		attUUID := uuid.NewString()
		repo := &adminMockChatRepo{
			getAttachmentsByIDsFn: func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
				return []domain.ChatAttachment{
					{ID: attUUID, UploaderID: "other-user", MessageID: nil},
				}, nil
			},
		}
		uc := New(repo, nil)

		msg, err := uc.SendAdminReply(context.Background(), adminID, convUUID, "ảnh", []string{attUUID})
		assert.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Equal(t, "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất", valErr.Fields["attachmentIds"])
		assert.Nil(t, msg)
	})

	t.Run("attachment already attached to another message returns validation error", func(t *testing.T) {
		attUUID := uuid.NewString()
		existingMsgID := "msg-existing"
		repo := &adminMockChatRepo{
			getAttachmentsByIDsFn: func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
				return []domain.ChatAttachment{
					{ID: attUUID, UploaderID: adminID, MessageID: &existingMsgID},
				}, nil
			},
		}
		uc := New(repo, nil)

		msg, err := uc.SendAdminReply(context.Background(), adminID, convUUID, "ảnh", []string{attUUID})
		assert.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Equal(t, "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất", valErr.Fields["attachmentIds"])
		assert.Nil(t, msg)
	})

	t.Run("valid attachment with empty content succeeds", func(t *testing.T) {
		attUUID := uuid.NewString()
		repo := &adminMockChatRepo{
			getAttachmentsByIDsFn: func(ctx context.Context, attachmentIDs []string) ([]domain.ChatAttachment, error) {
				return []domain.ChatAttachment{
					{ID: attUUID, UploaderID: adminID, MessageID: nil},
				}, nil
			},
			createMessageFn: func(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
				assert.Equal(t, []string{attUUID}, input.AttachmentIDs)
				return &domain.ChatMessage{ID: "msg-att"}, nil
			},
		}
		uc := New(repo, nil)

		msg, err := uc.SendAdminReply(context.Background(), adminID, convUUID, "", []string{attUUID})
		require.NoError(t, err)
		assert.NotNil(t, msg)
		assert.Equal(t, "msg-att", msg.ID)
	})

	t.Run("convenience method SendAdminReplyWithInput", func(t *testing.T) {
		repo := &adminMockChatRepo{
			createMessageFn: func(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
				assert.Equal(t, "Xin chào qua input", input.Content)
				return &domain.ChatMessage{ID: "msg-inp"}, nil
			},
		}
		uc := New(repo, nil)

		msg, err := uc.SendAdminReplyWithInput(context.Background(), adminID, convUUID, domain.SendAdminReplyInput{
			Content: "Xin chào qua input",
		})
		require.NoError(t, err)
		assert.NotNil(t, msg)
	})
}

func TestAdminUseCase_MarkAdminConversationRead(t *testing.T) {
	convUUID := uuid.NewString()

	t.Run("invalid conversationID returns ErrConversationNotFound", func(t *testing.T) {
		uc := New(&adminMockChatRepo{}, nil)

		err := uc.MarkAdminConversationRead(context.Background(), "invalid-id")
		assert.ErrorIs(t, err, domain.ErrConversationNotFound)
	})

	t.Run("conversation not found returns ErrConversationNotFound", func(t *testing.T) {
		repo := &adminMockChatRepo{
			getConversationByIDFn: func(ctx context.Context, conversationID string) (*domain.Conversation, error) {
				return nil, domain.ErrNotFound
			},
		}
		uc := New(repo, nil)

		err := uc.MarkAdminConversationRead(context.Background(), convUUID)
		assert.ErrorIs(t, err, domain.ErrConversationNotFound)
	})

	t.Run("success calls repo with admin role", func(t *testing.T) {
		marked := false
		repo := &adminMockChatRepo{
			markConversationReadFn: func(ctx context.Context, conversationID string, readerRole domain.ChatSenderRole) error {
				marked = true
				assert.Equal(t, convUUID, conversationID)
				assert.Equal(t, domain.ChatSenderAdmin, readerRole)
				return nil
			},
		}
		uc := New(repo, nil)

		err := uc.MarkAdminConversationRead(context.Background(), convUUID)
		require.NoError(t, err)
		assert.True(t, marked)
	})
}

func TestAdminUseCase_Broadcaster(t *testing.T) {
	ctx := context.Background()
	adminUUID := uuid.NewString()
	convUUID := uuid.NewString()
	custUUID := uuid.NewString()

	broadcaster := &testBroadcaster{isUserOnlineResult: true}
	repo := &adminMockChatRepo{
		listConversationsForAdminFn: func(ctx context.Context, filter domain.AdminConversationFilter) ([]domain.Conversation, int, error) {
			return []domain.Conversation{
				{ID: convUUID, UserID: custUUID},
			}, 1, nil
		},
		getConversationByIDFn: func(ctx context.Context, conversationID string) (*domain.Conversation, error) {
			return &domain.Conversation{ID: convUUID, UserID: custUUID}, nil
		},
		createMessageFn: func(ctx context.Context, input domain.CreateMessageInput) (*domain.ChatMessage, error) {
			return &domain.ChatMessage{
				ID:             "msg-admin-1",
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

	uc := New(repo, nil, WithBroadcaster(broadcaster))

	t.Run("ListAdminConversations sets IsOnline from broadcaster", func(t *testing.T) {
		convs, total, err := uc.ListAdminConversations(ctx, domain.AdminConversationFilter{})
		require.NoError(t, err)
		assert.Equal(t, 1, total)
		assert.True(t, convs[0].IsOnline)
	})

	t.Run("SendAdminReply emits BroadcastNewMessage", func(t *testing.T) {
		msg, err := uc.SendAdminReply(ctx, adminUUID, convUUID, "Admin reply", nil)
		require.NoError(t, err)
		require.NotNil(t, msg)
		require.Len(t, broadcaster.broadcastNewMessageCalls, 1)
		assert.Equal(t, "msg-admin-1", broadcaster.broadcastNewMessageCalls[0].ID)
	})

	t.Run("MarkAdminConversationRead emits BroadcastMessagesRead", func(t *testing.T) {
		err := uc.MarkAdminConversationRead(ctx, convUUID)
		require.NoError(t, err)
		require.Len(t, broadcaster.broadcastMessagesReadCalls, 1)
		assert.Equal(t, convUUID, broadcaster.broadcastMessagesReadCalls[0].convID)
		assert.Equal(t, domain.ChatSenderAdmin, broadcaster.broadcastMessagesReadCalls[0].readerRole)
	})
}
