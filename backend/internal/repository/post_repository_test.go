package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

func TestMapPostCommentRow(t *testing.T) {
	now := time.Now().UTC()
	parentUUID := uuid.New()
	replyUserUUID := uuid.New()

	t.Run("converts row with null parent and null reply_to_user", func(t *testing.T) {
		row := sqlc.ListCommentsByPostIDRow{
			ID:               uuid.NewString(),
			PostID:           uuid.NewString(),
			AuthorID:         uuid.NewString(),
			ParentID:         pgtype.UUID{Valid: false},
			ReplyToUserID:    pgtype.UUID{Valid: false},
			Content:          "Bình luận cấp 1",
			CreatedAt:        now,
			UpdatedAt:        now,
			AuthorEmail:      "customer1@example.com",
			AuthorRole:       "customer",
			AuthorName:       "Nguyễn Văn A",
			ReplyToUserEmail: pgtype.Text{Valid: false},
			ReplyToUserRole:  pgtype.Text{Valid: false},
			ReplyToUserName:  "",
		}

		domainComment := mapCommentRow(row, domain.ReactionSummary{})

		assert.Equal(t, row.ID, domainComment.ID)
		assert.Equal(t, row.PostID, domainComment.PostID)
		assert.Equal(t, row.AuthorID, domainComment.AuthorID)
		assert.Equal(t, "Nguyễn Văn A", domainComment.AuthorName)
		assert.Equal(t, "customer", domainComment.AuthorRole)
		assert.Nil(t, domainComment.ParentID, "parentID should be nil when not valid")
		assert.Nil(t, domainComment.ReplyToUserID, "replyToUserID should be nil when not valid")
		assert.Nil(t, domainComment.ReplyToUserName, "replyToUserName should be nil when reply_to_user_id is null")
		assert.Equal(t, "Bình luận cấp 1", domainComment.Content)
	})

	t.Run("converts row with valid parent and valid reply_to_user", func(t *testing.T) {
		row := sqlc.ListCommentsByPostIDRow{
			ID:               uuid.NewString(),
			PostID:           uuid.NewString(),
			AuthorID:         uuid.NewString(),
			ParentID:         pgtype.UUID{Bytes: parentUUID, Valid: true},
			ReplyToUserID:    pgtype.UUID{Bytes: replyUserUUID, Valid: true},
			Content:          "Dạ cảm ơn shop!",
			CreatedAt:        now,
			UpdatedAt:        now,
			AuthorEmail:      "customer2@example.com",
			AuthorRole:       "customer",
			AuthorName:       "Trần Thị B",
			ReplyToUserEmail: pgtype.Text{String: "admin@example.com", Valid: true},
			ReplyToUserRole:  pgtype.Text{String: "admin", Valid: true},
			ReplyToUserName:  "Quản trị viên",
		}

		domainComment := mapCommentRow(row, domain.ReactionSummary{})

		require.NotNil(t, domainComment.ParentID)
		assert.Equal(t, parentUUID.String(), *domainComment.ParentID)
		require.NotNil(t, domainComment.ReplyToUserID)
		assert.Equal(t, replyUserUUID.String(), *domainComment.ReplyToUserID)
		require.NotNil(t, domainComment.ReplyToUserName)
		assert.Equal(t, "Quản trị viên", *domainComment.ReplyToUserName)
	})
}

func TestMapNotificationRow(t *testing.T) {
	now := time.Now().UTC()
	actorUUID := uuid.New()
	postUUID := uuid.New()
	commentUUID := uuid.New()

	t.Run("converts row with null actor, comment, reaction, and empty metadata", func(t *testing.T) {
		row := sqlc.ListNotificationsByRecipientRow{
			ID:               uuid.NewString(),
			RecipientID:      uuid.NewString(),
			ActorID:          pgtype.UUID{Valid: false},
			Category:         "post",
			NotificationType: "post_reaction",
			PostID:           pgtype.UUID{Bytes: postUUID, Valid: true},
			CommentID:        pgtype.UUID{Valid: false},
			ReactionType:     pgtype.Text{Valid: false},
			Excerpt:          "Bài viết mới",
			Metadata:         []byte("{}"),
			IsRead:           false,
			CreatedAt:        now,
			ActorEmail:       pgtype.Text{Valid: false},
			ActorRole:        pgtype.Text{Valid: false},
			ActorName:        "",
		}

		item := mapNotificationRow(row)

		assert.Equal(t, row.ID, item.ID)
		assert.Equal(t, row.RecipientID, item.RecipientID)
		assert.Nil(t, item.ActorID)
		assert.Nil(t, item.ActorName, "actorName must be nil when actor_id is null")
		assert.Nil(t, item.ActorRole, "actorRole must be nil when actor_id is null")
		assert.Equal(t, domain.NotificationCategory("post"), item.Category)
		assert.Equal(t, domain.PostNotificationType("post_reaction"), item.NotificationType)
		require.NotNil(t, item.PostID)
		assert.Equal(t, postUUID.String(), *item.PostID)
		assert.Nil(t, item.CommentID)
		assert.Nil(t, item.ReactionType)
		assert.NotNil(t, item.Metadata)
		assert.Empty(t, item.Metadata)
		assert.False(t, item.IsRead)
	})

	t.Run("converts row with valid actor and reaction type and non-empty metadata", func(t *testing.T) {
		metaMap := map[string]interface{}{"source": "mobile", "score": float64(10)}
		metaBytes, _ := json.Marshal(metaMap)

		row := sqlc.ListNotificationsByRecipientRow{
			ID:               uuid.NewString(),
			RecipientID:      uuid.NewString(),
			ActorID:          pgtype.UUID{Bytes: actorUUID, Valid: true},
			Category:         "post",
			NotificationType: "comment_reply",
			PostID:           pgtype.UUID{Bytes: postUUID, Valid: true},
			CommentID:        pgtype.UUID{Bytes: commentUUID, Valid: true},
			ReactionType:     pgtype.Text{String: "love", Valid: true},
			Excerpt:          "Dạ cảm ơn shop nhiều ạ!",
			Metadata:         metaBytes,
			IsRead:           true,
			CreatedAt:        now,
			ActorEmail:       pgtype.Text{String: "customer@example.com", Valid: true},
			ActorRole:        pgtype.Text{String: "customer", Valid: true},
			ActorName:        "Lê Văn C",
		}

		item := mapNotificationRow(row)

		require.NotNil(t, item.ActorID)
		assert.Equal(t, actorUUID.String(), *item.ActorID)
		require.NotNil(t, item.ActorName)
		assert.Equal(t, "Lê Văn C", *item.ActorName)
		require.NotNil(t, item.ActorRole)
		assert.Equal(t, "customer", *item.ActorRole)
		require.NotNil(t, item.ReactionType)
		assert.Equal(t, domain.ReactionTypeLove, *item.ReactionType)
		assert.Equal(t, "mobile", item.Metadata["source"])
		assert.Equal(t, float64(10), item.Metadata["score"])
		assert.True(t, item.IsRead)
	})
}

func TestBuildCommentThreads(t *testing.T) {
	parent1ID := uuid.NewString()
	parent2ID := uuid.NewString()
	reply1ID := uuid.NewString()
	reply2ID := uuid.NewString()
	reply3ID := uuid.NewString()

	t1 := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 10, 20, 10, 5, 0, 0, time.UTC)
	t3 := time.Date(2026, 10, 20, 10, 10, 0, 0, time.UTC)
	t4 := time.Date(2026, 10, 20, 10, 15, 0, 0, time.UTC)
	t5 := time.Date(2026, 10, 20, 10, 20, 0, 0, time.UTC)

	comments := []domain.PostComment{
		{ID: parent1ID, Content: "Cấp 1 - 1", ParentID: nil, CreatedAt: t1},
		{ID: reply1ID, Content: "Cấp 2 - 1.1", ParentID: &parent1ID, CreatedAt: t2},
		{ID: parent2ID, Content: "Cấp 1 - 2", ParentID: nil, CreatedAt: t3},
		{ID: reply2ID, Content: "Cấp 2 - 1.2", ParentID: &parent1ID, CreatedAt: t4},
		{ID: reply3ID, Content: "Cấp 2 - 2.1", ParentID: &parent2ID, CreatedAt: t5},
	}

	threads := buildCommentThreads(comments)
	require.Len(t, threads, 2)

	// Thread 1
	assert.Equal(t, parent1ID, threads[0].ID)
	require.Len(t, threads[0].Replies, 2)
	assert.Equal(t, reply1ID, threads[0].Replies[0].ID)
	assert.Equal(t, reply2ID, threads[0].Replies[1].ID)

	// Thread 2
	assert.Equal(t, parent2ID, threads[1].ID)
	require.Len(t, threads[1].Replies, 1)
	assert.Equal(t, reply3ID, threads[1].Replies[0].ID)

	// Empty comments list must return non-nil empty slice
	emptyThreads := buildCommentThreads(nil)
	assert.NotNil(t, emptyThreads)
	assert.Empty(t, emptyThreads)
}

func TestAggregateReactionSummary(t *testing.T) {
	t.Run("empty reaction rows produce zero counts and empty slice safety", func(t *testing.T) {
		summary := aggregateReactionSummary(nil, nil)
		assert.Equal(t, 0, summary.TotalCount)
		assert.Equal(t, 0, summary.Counts.Like)
		assert.Equal(t, 0, summary.Counts.Love)
		assert.Equal(t, 0, summary.Counts.Haha)
		assert.Equal(t, 0, summary.Counts.Wow)
		assert.Equal(t, 0, summary.Counts.Sad)
		assert.Equal(t, 0, summary.Counts.Angry)
		assert.Nil(t, summary.ViewerReaction)
	})

	t.Run("aggregates multiple reaction rows with viewer reaction", func(t *testing.T) {
		rows := []reactionCountItem{
			{ReactionType: "like", Count: 5},
			{ReactionType: "love", Count: 3},
			{ReactionType: "haha", Count: 2},
			{ReactionType: "wow", Count: 1},
			{ReactionType: "sad", Count: 0},
			{ReactionType: "angry", Count: 4},
		}
		viewer := domain.ReactionTypeLove
		summary := aggregateReactionSummary(rows, &viewer)

		assert.Equal(t, 15, summary.TotalCount)
		assert.Equal(t, 5, summary.Counts.Like)
		assert.Equal(t, 3, summary.Counts.Love)
		assert.Equal(t, 2, summary.Counts.Haha)
		assert.Equal(t, 1, summary.Counts.Wow)
		assert.Equal(t, 0, summary.Counts.Sad)
		assert.Equal(t, 4, summary.Counts.Angry)
		require.NotNil(t, summary.ViewerReaction)
		assert.Equal(t, domain.ReactionTypeLove, *summary.ViewerReaction)
	})
}

func TestPostRepository_InvalidUUIDHandling(t *testing.T) {
	repo := NewPostRepository(nil)
	ctx := context.Background()

	t.Run("GetPostByID returns ErrPostNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.GetPostByID(ctx, "invalid-uuid", nil)
		assert.True(t, errors.Is(err, domain.ErrPostNotFound))
	})

	t.Run("UpdatePost returns ErrPostNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.UpdatePost(ctx, domain.UpdatePostInput{PostID: "invalid-uuid"})
		assert.True(t, errors.Is(err, domain.ErrPostNotFound))
	})

	t.Run("DeletePost returns ErrPostNotFound for invalid UUID", func(t *testing.T) {
		err := repo.DeletePost(ctx, "invalid-uuid")
		assert.True(t, errors.Is(err, domain.ErrPostNotFound))
	})

	t.Run("GetMediaByID returns ErrPostMediaNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.GetMediaByID(ctx, "invalid-uuid")
		assert.True(t, errors.Is(err, domain.ErrPostMediaNotFound))
	})

	t.Run("DeleteMedia returns ErrPostMediaNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.DeleteMedia(ctx, "invalid-uuid")
		assert.True(t, errors.Is(err, domain.ErrPostMediaNotFound))
	})

	t.Run("SetPostReaction returns ErrPostNotFound for invalid UUID", func(t *testing.T) {
		_, _, err := repo.SetPostReaction(ctx, "invalid-post-uuid", uuid.NewString(), nil)
		assert.True(t, errors.Is(err, domain.ErrPostNotFound))

		_, _, err = repo.SetPostReaction(ctx, uuid.NewString(), "invalid-user-uuid", nil)
		assert.True(t, errors.Is(err, domain.ErrPostNotFound))
	})

	t.Run("SetCommentReaction returns ErrPostCommentNotFound for invalid UUID", func(t *testing.T) {
		_, _, err := repo.SetCommentReaction(ctx, "invalid-comment-uuid", uuid.NewString(), nil)
		assert.True(t, errors.Is(err, domain.ErrPostCommentNotFound))

		_, _, err = repo.SetCommentReaction(ctx, uuid.NewString(), "invalid-user-uuid", nil)
		assert.True(t, errors.Is(err, domain.ErrPostCommentNotFound))
	})

	t.Run("GetCommentByID returns ErrPostCommentNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.GetCommentByID(ctx, "invalid-comment-uuid")
		assert.True(t, errors.Is(err, domain.ErrPostCommentNotFound))
	})

	t.Run("DeleteComment returns ErrPostCommentNotFound for invalid UUID", func(t *testing.T) {
		_, _, err := repo.DeleteComment(ctx, "invalid-comment-uuid")
		assert.True(t, errors.Is(err, domain.ErrPostCommentNotFound))
	})

	t.Run("MarkNotificationRead returns ErrNotificationNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.MarkNotificationRead(ctx, "invalid-notif-uuid", uuid.NewString())
		assert.True(t, errors.Is(err, domain.ErrNotificationNotFound))

		_, err = repo.MarkNotificationRead(ctx, uuid.NewString(), "invalid-user-uuid")
		assert.True(t, errors.Is(err, domain.ErrNotificationNotFound))
	})

	t.Run("ListNotifications returns empty items for invalid recipient UUID", func(t *testing.T) {
		res, err := repo.ListNotifications(ctx, "invalid-recipient-uuid", 10, 0)
		assert.NoError(t, err)
		require.NotNil(t, res)
		assert.NotNil(t, res.Items)
		assert.Empty(t, res.Items)
		assert.Equal(t, 0, res.UnreadCount)
	})

	t.Run("GetUnreadNotificationCount returns 0 for invalid recipient UUID", func(t *testing.T) {
		count, err := repo.GetUnreadNotificationCount(ctx, "invalid-recipient-uuid")
		assert.NoError(t, err)
		assert.Equal(t, 0, count)
	})

	t.Run("MarkAllNotificationsRead succeeds without error for invalid recipient UUID", func(t *testing.T) {
		err := repo.MarkAllNotificationsRead(ctx, "invalid-recipient-uuid")
		assert.NoError(t, err)
	})
}

func TestPostRepository_GetMediaByIDs_Empty(t *testing.T) {
	repo := NewPostRepository(nil)
	ctx := context.Background()

	media, err := repo.GetMediaByIDs(ctx, []string{})
	assert.NoError(t, err)
	assert.NotNil(t, media)
	assert.Empty(t, media)
}

func TestPostModels_EmptySlicesJSONSerialization(t *testing.T) {
	// 1. PostItem serialization: media and referredProducts must serialize as [] instead of null
	item := domain.PostItem{
		ID:               uuid.NewString(),
		AuthorID:         uuid.NewString(),
		AuthorName:       "Admin",
		AuthorRole:       "admin",
		Content:          "Nội dung bài viết",
		Media:            make([]domain.PostMediaAttachment, 0),
		ReferredProducts: make([]domain.ReferredProductCard, 0),
		Reactions:        domain.ReactionSummary{},
		CommentCount:     0,
		CreatedAt:        time.Now().UTC(),
		UpdatedAt:        time.Now().UTC(),
	}

	itemJSON, err := json.Marshal(item)
	require.NoError(t, err)
	assert.Contains(t, string(itemJSON), `"media":[]`)
	assert.Contains(t, string(itemJSON), `"referredProducts":[]`)

	// 2. PostDetail and PostCommentThread serialization: comments and replies must serialize as []
	thread := domain.PostCommentThread{
		PostComment: domain.PostComment{
			ID:        uuid.NewString(),
			PostID:    item.ID,
			AuthorID:  item.AuthorID,
			Content:   "Bình luận",
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		},
		Replies: make([]domain.PostComment, 0),
	}
	detail := domain.PostDetail{
		PostItem: item,
		Comments: []domain.PostCommentThread{thread},
	}
	detailJSON, err := json.Marshal(detail)
	require.NoError(t, err)
	assert.Contains(t, string(detailJSON), `"comments":[{"`)
	assert.Contains(t, string(detailJSON), `"replies":[]`)

	// 3. NotificationsListResult serialization: items must serialize as []
	notifs := domain.NotificationsListResult{
		Items:       make([]domain.NotificationItem, 0),
		UnreadCount: 0,
	}
	notifsJSON, err := json.Marshal(notifs)
	require.NoError(t, err)
	assert.Contains(t, string(notifsJSON), `"items":[]`)
}

// ============================================================================
// In-Memory Fake postDB for Notification Rollup & Reaction Sync Tests
// ============================================================================

type fakeUserRecord struct {
	ID          string
	Email       string
	Role        string
	DisplayName string
}

type fakeReactionRecord struct {
	UserID       string
	ReactionType string
	UpdatedAt    time.Time
}

type fakeNotificationRecord struct {
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
}

type fakeNotificationPostDB struct {
	pgx.Tx
	clock            time.Time
	users            map[string]fakeUserRecord
	postReactions    map[string][]fakeReactionRecord
	commentReactions map[string][]fakeReactionRecord
	notifications    []*fakeNotificationRecord
}

func newFakeNotificationPostDB() *fakeNotificationPostDB {
	return &fakeNotificationPostDB{
		clock:            time.Date(2026, 10, 21, 8, 0, 0, 0, time.UTC),
		users:            make(map[string]fakeUserRecord),
		postReactions:    make(map[string][]fakeReactionRecord),
		commentReactions: make(map[string][]fakeReactionRecord),
		notifications:    make([]*fakeNotificationRecord, 0),
	}
}

func (f *fakeNotificationPostDB) nextTime() time.Time {
	f.clock = f.clock.Add(time.Second)
	return f.clock
}

func (f *fakeNotificationPostDB) seedUser(id, email, role, displayName string) {
	f.users[id] = fakeUserRecord{
		ID:          id,
		Email:       email,
		Role:        role,
		DisplayName: displayName,
	}
}

func (f *fakeNotificationPostDB) setPostReactionRecord(postID, userID string, rx *domain.ReactionType) {
	list := f.postReactions[postID]
	filtered := make([]fakeReactionRecord, 0, len(list))
	for _, item := range list {
		if item.UserID != userID {
			filtered = append(filtered, item)
		}
	}
	if rx != nil {
		filtered = append([]fakeReactionRecord{{
			UserID:       userID,
			ReactionType: string(*rx),
			UpdatedAt:    f.nextTime(),
		}}, filtered...)
	}
	f.postReactions[postID] = filtered
}

func (f *fakeNotificationPostDB) setCommentReactionRecord(commentID, userID string, rx *domain.ReactionType) {
	list := f.commentReactions[commentID]
	filtered := make([]fakeReactionRecord, 0, len(list))
	for _, item := range list {
		if item.UserID != userID {
			filtered = append(filtered, item)
		}
	}
	if rx != nil {
		filtered = append([]fakeReactionRecord{{
			UserID:       userID,
			ReactionType: string(*rx),
			UpdatedAt:    f.nextTime(),
		}}, filtered...)
	}
	f.commentReactions[commentID] = filtered
}

func (f *fakeNotificationPostDB) Begin(_ context.Context) (pgx.Tx, error) {
	return f, nil
}

func (f *fakeNotificationPostDB) Commit(_ context.Context) error {
	return nil
}

func (f *fakeNotificationPostDB) Rollback(_ context.Context) error {
	return nil
}

func (f *fakeNotificationPostDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	switch {
	case strings.Contains(sql, "-- name: DeleteUnreadNotificationByGroupKey :exec"):
		recipientID := args[0].(string)
		groupKey := args[1].(string)
		kept := make([]*fakeNotificationRecord, 0, len(f.notifications))
		deleted := 0
		for _, n := range f.notifications {
			if n.RecipientID == recipientID && n.GroupKey == groupKey && !n.IsRead && n.GroupKey != "" {
				deleted++
				continue
			}
			kept = append(kept, n)
		}
		f.notifications = kept
		return pgconn.NewCommandTag(fmt.Sprintf("DELETE %d", deleted)), nil

	case strings.Contains(sql, "-- name: MarkAllNotificationsAsRead :exec"):
		recipientID := args[0].(string)
		for _, n := range f.notifications {
			if n.RecipientID == recipientID && !n.IsRead {
				n.IsRead = true
			}
		}
		return pgconn.NewCommandTag("UPDATE 1"), nil
	}
	return pgconn.NewCommandTag(""), fmt.Errorf("unexpected Exec SQL: %s", sql)
}

func (f *fakeNotificationPostDB) notificationRowValues(n *fakeNotificationRecord) []any {
	metaCopy := make([]byte, len(n.Metadata))
	copy(metaCopy, n.Metadata)
	return []any{
		n.ID,
		n.RecipientID,
		n.ActorID,
		n.GroupKey,
		n.ActorCount,
		n.Category,
		n.NotificationType,
		n.PostID,
		n.CommentID,
		n.ReactionType,
		n.Excerpt,
		metaCopy,
		n.IsRead,
		n.CreatedAt,
		n.UpdatedAt,
	}
}

func (f *fakeNotificationPostDB) notificationWithActorRowValues(n *fakeNotificationRecord) []any {
	base := f.notificationRowValues(n)
	var actorEmail pgtype.Text
	var actorRole pgtype.Text
	var actorName string
	if n.ActorID.Valid {
		actorIDStr := uuid.UUID(n.ActorID.Bytes).String()
		if u, ok := f.users[actorIDStr]; ok {
			actorEmail = pgtype.Text{String: u.Email, Valid: true}
			actorRole = pgtype.Text{String: u.Role, Valid: true}
			actorName = u.DisplayName
		}
	}
	return append(base, actorEmail, actorRole, actorName)
}

func (f *fakeNotificationPostDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	switch {
	case strings.Contains(sql, "-- name: GetUnreadNotificationByGroupKeyForUpdate :one"),
		strings.Contains(sql, "-- name: GetUnreadNotificationByGroupKey :one"):
		recipientID := args[0].(string)
		groupKey := args[1].(string)
		for _, n := range f.notifications {
			if n.RecipientID == recipientID && n.GroupKey == groupKey && !n.IsRead && n.GroupKey != "" {
				return &fakeRow{values: f.notificationRowValues(n)}
			}
		}
		return &fakeRow{err: pgx.ErrNoRows}

	case strings.Contains(sql, "-- name: CreateNotification :one"):
		ts := f.nextTime()
		rec := &fakeNotificationRecord{
			ID:               uuid.NewString(),
			RecipientID:      args[0].(string),
			ActorID:          args[1].(pgtype.UUID),
			GroupKey:         args[2].(string),
			ActorCount:       args[3].(int32),
			Category:         args[4].(string),
			NotificationType: args[5].(string),
			PostID:           args[6].(pgtype.UUID),
			CommentID:        args[7].(pgtype.UUID),
			ReactionType:     args[8].(pgtype.Text),
			Excerpt:          args[9].(string),
			Metadata:         append([]byte(nil), args[10].([]byte)...),
			IsRead:           false,
			CreatedAt:        ts,
			UpdatedAt:        ts,
		}
		f.notifications = append(f.notifications, rec)
		return &fakeRow{values: f.notificationRowValues(rec)}

	case strings.Contains(sql, "-- name: UpsertUnreadNotification :one"):
		recipientID := args[0].(string)
		groupKey := args[2].(string)
		ts := f.nextTime()
		if groupKey != "" {
			for _, n := range f.notifications {
				if n.RecipientID == recipientID && n.GroupKey == groupKey && !n.IsRead {
					n.ActorID = args[1].(pgtype.UUID)
					n.ActorCount = args[3].(int32)
					n.NotificationType = args[5].(string)
					n.PostID = args[6].(pgtype.UUID)
					n.CommentID = args[7].(pgtype.UUID)
					n.ReactionType = args[8].(pgtype.Text)
					n.Excerpt = args[9].(string)
					n.Metadata = append([]byte(nil), args[10].([]byte)...)
					n.UpdatedAt = ts
					return &fakeRow{values: f.notificationRowValues(n)}
				}
			}
		}
		rec := &fakeNotificationRecord{
			ID:               uuid.NewString(),
			RecipientID:      recipientID,
			ActorID:          args[1].(pgtype.UUID),
			GroupKey:         groupKey,
			ActorCount:       args[3].(int32),
			Category:         args[4].(string),
			NotificationType: args[5].(string),
			PostID:           args[6].(pgtype.UUID),
			CommentID:        args[7].(pgtype.UUID),
			ReactionType:     args[8].(pgtype.Text),
			Excerpt:          args[9].(string),
			Metadata:         append([]byte(nil), args[10].([]byte)...),
			IsRead:           false,
			CreatedAt:        ts,
			UpdatedAt:        ts,
		}
		f.notifications = append(f.notifications, rec)
		return &fakeRow{values: f.notificationRowValues(rec)}

	case strings.Contains(sql, "-- name: UpdateUnreadNotificationRollup :one"):
		id := args[8].(string)
		for _, n := range f.notifications {
			if n.ID == id {
				n.ActorID = args[0].(pgtype.UUID)
				n.ActorCount = args[1].(int32)
				n.NotificationType = args[2].(string)
				n.PostID = args[3].(pgtype.UUID)
				n.CommentID = args[4].(pgtype.UUID)
				n.ReactionType = args[5].(pgtype.Text)
				n.Excerpt = args[6].(string)
				n.Metadata = append([]byte(nil), args[7].([]byte)...)
				n.UpdatedAt = f.nextTime()
				return &fakeRow{values: f.notificationRowValues(n)}
			}
		}
		return &fakeRow{err: pgx.ErrNoRows}

	case strings.Contains(sql, "-- name: GetNotificationByID :one"):
		id := args[0].(string)
		for _, n := range f.notifications {
			if n.ID == id {
				return &fakeRow{values: f.notificationWithActorRowValues(n)}
			}
		}
		return &fakeRow{err: pgx.ErrNoRows}

	case strings.Contains(sql, "-- name: MarkNotificationAsRead :one"):
		id := args[0].(string)
		recipientID := args[1].(string)
		for _, n := range f.notifications {
			if n.ID == id && n.RecipientID == recipientID {
				n.IsRead = true
				return &fakeRow{values: f.notificationRowValues(n)}
			}
		}
		return &fakeRow{err: pgx.ErrNoRows}

	case strings.Contains(sql, "-- name: CountUnreadNotifications :one"):
		recipientID := args[0].(string)
		var count int64
		for _, n := range f.notifications {
			if n.RecipientID == recipientID && !n.IsRead {
				count++
			}
		}
		return &fakeRow{values: []any{count}}
	}

	return &fakeRow{err: fmt.Errorf("unexpected QueryRow SQL: %s", sql)}
}

func (f *fakeNotificationPostDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	switch {
	case strings.Contains(sql, "-- name: GetUserDisplayNames :many"):
		userIDs := args[0].([]string)
		var rows [][]any
		for _, id := range userIDs {
			if u, ok := f.users[id]; ok {
				rows = append(rows, []any{u.ID, u.Email, u.Role, u.DisplayName})
			}
		}
		return &fakeRows{rows: rows}, nil

	case strings.Contains(sql, "-- name: GetDistinctPostReactionActors :many"):
		postID := args[0].(string)
		recipientID := args[1].(string)
		var rows [][]any
		for _, r := range f.postReactions[postID] {
			if r.UserID == recipientID {
				continue
			}
			if u, ok := f.users[r.UserID]; ok {
				rows = append(rows, []any{r.UserID, r.ReactionType, r.UpdatedAt, u.Email, u.Role, u.DisplayName})
			}
		}
		return &fakeRows{rows: rows}, nil

	case strings.Contains(sql, "-- name: GetDistinctCommentReactionActors :many"):
		commentID := args[0].(string)
		recipientID := args[1].(string)
		var rows [][]any
		for _, r := range f.commentReactions[commentID] {
			if r.UserID == recipientID {
				continue
			}
			if u, ok := f.users[r.UserID]; ok {
				rows = append(rows, []any{r.UserID, r.ReactionType, r.UpdatedAt, u.Email, u.Role, u.DisplayName})
			}
		}
		return &fakeRows{rows: rows}, nil

	case strings.Contains(sql, "-- name: ListNotificationsByRecipient :many"):
		recipientID := args[0].(string)
		offset := int(args[1].(int32))
		limit := int(args[2].(int32))

		var matched []*fakeNotificationRecord
		for _, n := range f.notifications {
			if n.RecipientID == recipientID {
				matched = append(matched, n)
			}
		}
		sort.Slice(matched, func(i, j int) bool {
			if !matched[i].UpdatedAt.Equal(matched[j].UpdatedAt) {
				return matched[i].UpdatedAt.After(matched[j].UpdatedAt)
			}
			return matched[i].ID > matched[j].ID
		})
		if offset > len(matched) {
			matched = nil
		} else {
			matched = matched[offset:]
			if len(matched) > limit {
				matched = matched[:limit]
			}
		}
		var rows [][]any
		for _, n := range matched {
			rows = append(rows, f.notificationWithActorRowValues(n))
		}
		return &fakeRows{rows: rows}, nil
	}

	return nil, fmt.Errorf("unexpected Query SQL: %s", sql)
}

type fakeRow struct {
	values []any
	err    error
}

func (r *fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) != len(r.values) {
		return fmt.Errorf("scan dest count %d != values count %d", len(dest), len(r.values))
	}
	for i := range dest {
		reflect.ValueOf(dest[i]).Elem().Set(reflect.ValueOf(r.values[i]))
	}
	return nil
}

type fakeRows struct {
	pgx.Rows
	rows [][]any
	idx  int
}

func (r *fakeRows) Close()                                       {}
func (r *fakeRows) Err() error                                   { return nil }
func (r *fakeRows) CommandTag() pgconn.CommandTag                { return pgconn.NewCommandTag("") }
func (r *fakeRows) Values() ([]any, error)                       { return nil, nil }
func (r *fakeRows) RawValues() [][]byte                          { return nil }
func (r *fakeRows) Conn() *pgx.Conn                              { return nil }
func (r *fakeRows) Next() bool {
	if r.idx < len(r.rows) {
		r.idx++
		return true
	}
	return false
}
func (r *fakeRows) Scan(dest ...any) error {
	row := r.rows[r.idx-1]
	if len(dest) != len(row) {
		return fmt.Errorf("rows scan dest count %d != values count %d", len(dest), len(row))
	}
	for i := range dest {
		reflect.ValueOf(dest[i]).Elem().Set(reflect.ValueOf(row[i]))
	}
	return nil
}

func extractTestRecentActors(t *testing.T, meta map[string]interface{}) []domain.NotificationActorSummary {
	t.Helper()
	require.NotNil(t, meta)
	raw, ok := meta["recentActors"]
	require.True(t, ok, "metadata.recentActors must be present")
	if typed, ok := raw.([]domain.NotificationActorSummary); ok {
		return typed
	}
	b, err := json.Marshal(raw)
	require.NoError(t, err)
	var out []domain.NotificationActorSummary
	require.NoError(t, json.Unmarshal(b, &out))
	return out
}

func TestPostRepository_NotificationRollup_1_2_3PlusActors_And_SameActorDeduplication(t *testing.T) {
	ctx := context.Background()
	db := newFakeNotificationPostDB()
	repo := NewPostRepository(db)

	adminID := uuid.NewString()
	cust1ID := uuid.NewString()
	cust2ID := uuid.NewString()
	cust3ID := uuid.NewString()
	postID := uuid.NewString()

	db.seedUser(adminID, "admin@example.com", "admin", "Quản trị viên")
	db.seedUser(cust1ID, "cust1@example.com", "customer", "Nguyễn Văn A")
	db.seedUser(cust2ID, "cust2@example.com", "customer", "Trần Thị B")
	db.seedUser(cust3ID, "cust3@example.com", "customer", "Lê Văn C")

	groupKey := domain.NotificationGroupKeyPostReaction(postID)
	likeRx := domain.ReactionTypeLike
	loveRx := domain.ReactionTypeLove
	hahaRx := domain.ReactionTypeHaha
	wowRx := domain.ReactionTypeWow
	sadRx := domain.ReactionTypeSad

	// 1. First actor reacts -> actorCount = 1, recentActors = [cust1]
	notif1, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust1ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &postID,
		ReactionType:     &likeRx,
		Excerpt:          "Bài viết giới thiệu sản phẩm mới",
	})
	require.NoError(t, err)
	require.NotNil(t, notif1)
	assert.Equal(t, groupKey, notif1.GroupKey)
	assert.Equal(t, 1, notif1.ActorCount)
	require.NotNil(t, notif1.ActorID)
	assert.Equal(t, cust1ID, *notif1.ActorID)
	require.NotNil(t, notif1.ActorName)
	assert.Equal(t, "Nguyễn Văn A", *notif1.ActorName)
	recent1 := extractTestRecentActors(t, notif1.Metadata)
	require.Len(t, recent1, 1)
	assert.Equal(t, domain.NotificationActorSummary{ID: cust1ID, Name: "Nguyễn Văn A", Role: "customer"}, recent1[0])

	// 2. Same actor (cust1) changes reaction while notification is unread -> actorCount stays 1
	notif1Dup, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust1ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &postID,
		ReactionType:     &loveRx,
		Excerpt:          "Bài viết giới thiệu sản phẩm mới",
	})
	require.NoError(t, err)
	require.NotNil(t, notif1Dup)
	assert.Equal(t, notif1.ID, notif1Dup.ID, "must update existing unread notification row")
	assert.Equal(t, 1, notif1Dup.ActorCount, "duplicate interaction by same actor must not inflate actorCount")
	require.NotNil(t, notif1Dup.ReactionType)
	assert.Equal(t, domain.ReactionTypeLove, *notif1Dup.ReactionType)
	recent1Dup := extractTestRecentActors(t, notif1Dup.Metadata)
	require.Len(t, recent1Dup, 1)
	assert.Equal(t, cust1ID, recent1Dup[0].ID)

	// 3. Second actor (cust2) reacts -> actorCount = 2, recentActors = [cust2, cust1]
	notif2, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust2ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &postID,
		ReactionType:     &hahaRx,
		Excerpt:          "Bài viết giới thiệu sản phẩm mới",
	})
	require.NoError(t, err)
	require.NotNil(t, notif2)
	assert.Equal(t, notif1.ID, notif2.ID)
	assert.Equal(t, 2, notif2.ActorCount)
	require.NotNil(t, notif2.ActorID)
	assert.Equal(t, cust2ID, *notif2.ActorID)
	recent2 := extractTestRecentActors(t, notif2.Metadata)
	require.Len(t, recent2, 2)
	assert.Equal(t, cust2ID, recent2[0].ID)
	assert.Equal(t, "Trần Thị B", recent2[0].Name)
	assert.Equal(t, cust1ID, recent2[1].ID)
	assert.Equal(t, "Nguyễn Văn A", recent2[1].Name)

	// 4. Third actor (cust3) reacts -> actorCount = 3, recentActors = [cust3, cust2] (capped at 2)
	notif3, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust3ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &postID,
		ReactionType:     &wowRx,
		Excerpt:          "Bài viết giới thiệu sản phẩm mới",
	})
	require.NoError(t, err)
	require.NotNil(t, notif3)
	assert.Equal(t, notif1.ID, notif3.ID)
	assert.Equal(t, 3, notif3.ActorCount)
	require.NotNil(t, notif3.ActorID)
	assert.Equal(t, cust3ID, *notif3.ActorID)
	recent3 := extractTestRecentActors(t, notif3.Metadata)
	require.Len(t, recent3, 2, "recentActors must be capped at at most 2 actors")
	assert.Equal(t, cust3ID, recent3[0].ID)
	assert.Equal(t, "Lê Văn C", recent3[0].Name)
	assert.Equal(t, cust2ID, recent3[1].ID)
	assert.Equal(t, "Trần Thị B", recent3[1].Name)

	// 5. First actor (cust1) interacts again after 3 actors -> actorCount stays 3, recentActors = [cust1, cust3]
	notif3RepeatFirst, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust1ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &postID,
		ReactionType:     &sadRx,
		Excerpt:          "Bài viết giới thiệu sản phẩm mới",
	})
	require.NoError(t, err)
	require.NotNil(t, notif3RepeatFirst)
	assert.Equal(t, notif1.ID, notif3RepeatFirst.ID)
	assert.Equal(t, 3, notif3RepeatFirst.ActorCount, "previously seen actor must not inflate actorCount")
	recentRepeat := extractTestRecentActors(t, notif3RepeatFirst.Metadata)
	require.Len(t, recentRepeat, 2)
	assert.Equal(t, cust1ID, recentRepeat[0].ID)
	assert.Equal(t, cust3ID, recentRepeat[1].ID)
}

func TestPostRepository_NotificationRollup_NewRowAfterMarkedRead(t *testing.T) {
	ctx := context.Background()
	db := newFakeNotificationPostDB()
	repo := NewPostRepository(db)

	adminID := uuid.NewString()
	cust1ID := uuid.NewString()
	cust2ID := uuid.NewString()
	postID := uuid.NewString()
	comment1ID := uuid.NewString()
	comment2ID := uuid.NewString()

	db.seedUser(adminID, "admin@example.com", "admin", "Quản trị viên")
	db.seedUser(cust1ID, "cust1@example.com", "customer", "Nguyễn Văn A")
	db.seedUser(cust2ID, "cust2@example.com", "customer", "Trần Thị B")

	groupKey := domain.NotificationGroupKeyPostComment(postID)

	// 1. Customer 1 comments on post -> unread notification created
	notif1, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust1ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostComment,
		PostID:           &postID,
		CommentID:        &comment1ID,
		Excerpt:          "Bình luận đầu tiên",
	})
	require.NoError(t, err)
	require.NotNil(t, notif1)
	assert.False(t, notif1.IsRead)
	assert.Equal(t, 1, notif1.ActorCount)

	// 2. Admin marks notif1 as read
	marked, err := repo.MarkNotificationRead(ctx, notif1.ID, adminID)
	require.NoError(t, err)
	require.NotNil(t, marked)
	assert.True(t, marked.IsRead)

	// 3. Customer 2 comments on the same post -> must create a NEW unread notification row
	notif2, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust2ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostComment,
		PostID:           &postID,
		CommentID:        &comment2ID,
		Excerpt:          "Bình luận thứ hai sau khi đã đọc",
	})
	require.NoError(t, err)
	require.NotNil(t, notif2)
	assert.NotEqual(t, notif1.ID, notif2.ID, "must create a new unread notification after previous one was marked read")
	assert.False(t, notif2.IsRead)
	assert.Equal(t, 1, notif2.ActorCount)
	recent2 := extractTestRecentActors(t, notif2.Metadata)
	require.Len(t, recent2, 1)
	assert.Equal(t, cust2ID, recent2[0].ID)

	// 4. ListNotifications returns both notifications ordered by updated_at DESC, id DESC with UnreadCount = 1
	listRes, err := repo.ListNotifications(ctx, adminID, 20, 0)
	require.NoError(t, err)
	require.NotNil(t, listRes)
	assert.Equal(t, 1, listRes.UnreadCount)
	require.Len(t, listRes.Items, 2)
	assert.Equal(t, notif2.ID, listRes.Items[0].ID)
	assert.Equal(t, notif1.ID, listRes.Items[1].ID)
}

func TestPostRepository_SyncUnreadReactionNotification_RetractAndUpdate(t *testing.T) {
	ctx := context.Background()
	db := newFakeNotificationPostDB()
	repo := NewPostRepository(db)

	adminID := uuid.NewString()
	cust1ID := uuid.NewString()
	cust2ID := uuid.NewString()
	cust3ID := uuid.NewString()
	postID := uuid.NewString()

	db.seedUser(adminID, "admin@example.com", "admin", "Quản trị viên")
	db.seedUser(cust1ID, "cust1@example.com", "customer", "Nguyễn Văn A")
	db.seedUser(cust2ID, "cust2@example.com", "customer", "Trần Thị B")
	db.seedUser(cust3ID, "cust3@example.com", "customer", "Lê Văn C")

	groupKey := domain.NotificationGroupKeyPostReaction(postID)
	likeRx := domain.ReactionTypeLike
	loveRx := domain.ReactionTypeLove
	wowRx := domain.ReactionTypeWow

	// Cust1, Cust2, Cust3 react to post
	db.setPostReactionRecord(postID, cust1ID, &likeRx)
	_, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust1ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &postID,
		ReactionType:     &likeRx,
		Excerpt:          "Bài viết test reaction sync",
	})
	require.NoError(t, err)

	db.setPostReactionRecord(postID, cust2ID, &loveRx)
	_, err = repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust2ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &postID,
		ReactionType:     &loveRx,
		Excerpt:          "Bài viết test reaction sync",
	})
	require.NoError(t, err)

	db.setPostReactionRecord(postID, cust3ID, &wowRx)
	notif3, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust3ID,
		GroupKey:         groupKey,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &postID,
		ReactionType:     &wowRx,
		Excerpt:          "Bài viết test reaction sync",
	})
	require.NoError(t, err)
	require.Equal(t, 3, notif3.ActorCount)

	// 1. Cust3 removes reaction -> 2 actors remain (cust2, cust1), notification updated in place
	db.setPostReactionRecord(postID, cust3ID, nil)
	synced2, err := repo.SyncUnreadReactionNotification(ctx, adminID, groupKey, &postID, nil)
	require.NoError(t, err)
	require.NotNil(t, synced2, "unread notification must be updated and returned when remaining actors exist")
	assert.Equal(t, notif3.ID, synced2.ID)
	assert.Equal(t, 2, synced2.ActorCount)
	require.NotNil(t, synced2.ActorID)
	assert.Equal(t, cust2ID, *synced2.ActorID)
	require.NotNil(t, synced2.ReactionType)
	assert.Equal(t, domain.ReactionTypeLove, *synced2.ReactionType)
	recentAfterCust3Removed := extractTestRecentActors(t, synced2.Metadata)
	require.Len(t, recentAfterCust3Removed, 2)
	assert.Equal(t, cust2ID, recentAfterCust3Removed[0].ID)
	assert.Equal(t, cust1ID, recentAfterCust3Removed[1].ID)

	// 2. Cust2 removes reaction -> 1 actor remains (cust1), notification updated in place
	db.setPostReactionRecord(postID, cust2ID, nil)
	synced1, err := repo.SyncUnreadReactionNotification(ctx, adminID, groupKey, &postID, nil)
	require.NoError(t, err)
	require.NotNil(t, synced1)
	assert.Equal(t, notif3.ID, synced1.ID)
	assert.Equal(t, 1, synced1.ActorCount)
	require.NotNil(t, synced1.ActorID)
	assert.Equal(t, cust1ID, *synced1.ActorID)
	require.NotNil(t, synced1.ReactionType)
	assert.Equal(t, domain.ReactionTypeLike, *synced1.ReactionType)
	recentAfterCust2Removed := extractTestRecentActors(t, synced1.Metadata)
	require.Len(t, recentAfterCust2Removed, 1)
	assert.Equal(t, cust1ID, recentAfterCust2Removed[0].ID)

	// 3. Cust1 removes reaction -> 0 actors remain, unread notification deleted and returns (nil, nil)
	db.setPostReactionRecord(postID, cust1ID, nil)
	synced0, err := repo.SyncUnreadReactionNotification(ctx, adminID, groupKey, &postID, nil)
	require.NoError(t, err)
	assert.Nil(t, synced0, "unread notification must be deleted and nil returned when no actors remain")

	listRes, err := repo.ListNotifications(ctx, adminID, 20, 0)
	require.NoError(t, err)
	assert.Empty(t, listRes.Items)
	assert.Equal(t, 0, listRes.UnreadCount)

	// 4. Comment reaction rollup and sync (including auto-derived groupKey when GroupKey is omitted)
	commentID := uuid.NewString()
	commentGroupKey := domain.NotificationGroupKeyCommentReaction(commentID)
	db.setCommentReactionRecord(commentID, cust1ID, &likeRx)
	cNotif1, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust1ID,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypeCommentReaction,
		PostID:           &postID,
		CommentID:        &commentID,
		ReactionType:     &likeRx,
		Excerpt:          "Bình luận test reaction sync",
	})
	require.NoError(t, err)
	require.NotNil(t, cNotif1)
	assert.Equal(t, commentGroupKey, cNotif1.GroupKey)
	assert.Equal(t, 1, cNotif1.ActorCount)

	db.setCommentReactionRecord(commentID, cust2ID, &loveRx)
	cNotif2, err := repo.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      adminID,
		ActorID:          &cust2ID,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypeCommentReaction,
		PostID:           &postID,
		CommentID:        &commentID,
		ReactionType:     &loveRx,
		Excerpt:          "Bình luận test reaction sync",
	})
	require.NoError(t, err)
	require.NotNil(t, cNotif2)
	assert.Equal(t, cNotif1.ID, cNotif2.ID)
	assert.Equal(t, 2, cNotif2.ActorCount)

	// Cust2 removes reaction on comment -> 1 actor remains (cust1)
	db.setCommentReactionRecord(commentID, cust2ID, nil)
	cSynced1, err := repo.SyncUnreadReactionNotification(ctx, adminID, commentGroupKey, &postID, &commentID)
	require.NoError(t, err)
	require.NotNil(t, cSynced1)
	assert.Equal(t, 1, cSynced1.ActorCount)
	require.NotNil(t, cSynced1.ActorID)
	assert.Equal(t, cust1ID, *cSynced1.ActorID)

	// Cust1 removes reaction on comment -> 0 actors remain, notification deleted
	db.setCommentReactionRecord(commentID, cust1ID, nil)
	cSynced0, err := repo.SyncUnreadReactionNotification(ctx, adminID, commentGroupKey, &postID, &commentID)
	require.NoError(t, err)
	assert.Nil(t, cSynced0)
}


