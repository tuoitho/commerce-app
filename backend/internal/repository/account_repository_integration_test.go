//go:build integration

package repository

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
	"commerce-backend/internal/security"
)

func TestUserProfile_DefaultNullAndCheckConstraints(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	users := NewUserRepository(tx)
	sessions := NewSessionRepository(tx)

	created, err := users.Create(ctx, uniqueEmailToken()+"@example.com", "hash", domain.RoleCustomer)
	require.NoError(t, err)
	assert.Nil(t, created.DisplayName)
	assert.Nil(t, created.Phone)
	assert.Nil(t, created.AvatarKey)

	invalidCases := map[string]struct {
		stmt string
		arg  string
	}{
		"empty display_name":     {`UPDATE users SET display_name = '' WHERE id = $1`, ""},
		"blank display_name":     {`UPDATE users SET display_name = '   ' WHERE id = $1`, "   "},
		"long display_name > 80": {`UPDATE users SET display_name = $2 WHERE id = $1`, strings.Repeat("a", 81)},
		"phone bad prefix":       {`UPDATE users SET phone = $2 WHERE id = $1`, "1912345678"},
		"phone too short":        {`UPDATE users SET phone = $2 WHERE id = $1`, "091234567"},
		"phone non digits":       {`UPDATE users SET phone = $2 WHERE id = $1`, "091234567a"},
		"avatar invalid ext":     {`UPDATE users SET avatar_key = $2 WHERE id = $1`, "550e8400-e29b-41d4-a716-446655440000.gif"},
		"avatar traversal":       {`UPDATE users SET avatar_key = $2 WHERE id = $1`, "../550e8400-e29b-41d4-a716-446655440000.webp"},
		"avatar uppercase uuid":  {`UPDATE users SET avatar_key = $2 WHERE id = $1`, "550E8400-E29B-41D4-A716-446655440000.png"},
	}

	for name, tc := range invalidCases {
		t.Run(name, func(t *testing.T) {
			_, err := tx.Exec(ctx, "SAVEPOINT c")
			require.NoError(t, err)
			if tc.arg == "" && strings.Contains(tc.stmt, "$2") {
				_, err = tx.Exec(ctx, tc.stmt, created.ID, tc.arg)
			} else if strings.Contains(tc.stmt, "$2") {
				_, err = tx.Exec(ctx, tc.stmt, created.ID, tc.arg)
			} else {
				_, err = tx.Exec(ctx, tc.stmt, created.ID)
			}
			assert.Error(t, err)
			_, err = tx.Exec(ctx, "ROLLBACK TO SAVEPOINT c")
			require.NoError(t, err)
		})
	}

	validName := strings.Repeat("á", 80)
	validPhone := "0912345678"
	validAvatar := "550e8400-e29b-41d4-a716-446655440000.webp"
	_, err = tx.Exec(ctx, `UPDATE users SET display_name = $2, phone = $3, avatar_key = $4 WHERE id = $1`,
		created.ID, validName, validPhone, validAvatar)
	require.NoError(t, err)

	byEmail, err := users.GetByEmail(ctx, created.Email)
	require.NoError(t, err)
	require.NotNil(t, byEmail.DisplayName)
	require.NotNil(t, byEmail.Phone)
	require.NotNil(t, byEmail.AvatarKey)
	assert.Equal(t, validName, *byEmail.DisplayName)
	assert.Equal(t, validPhone, *byEmail.Phone)
	assert.Equal(t, validAvatar, *byEmail.AvatarKey)

	byID, err := users.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, byID.DisplayName)
	assert.Equal(t, validName, *byID.DisplayName)

	pair, err := security.GenerateRefreshToken()
	require.NoError(t, err)
	_, err = sessions.CreateRefreshToken(ctx, created.ID, pair.Hash, time.Now().Add(time.Hour))
	require.NoError(t, err)

	_, tokenUser, err := sessions.GetRefreshTokenByHash(ctx, pair.Hash)
	require.NoError(t, err)
	require.NotNil(t, tokenUser.DisplayName)
	require.NotNil(t, tokenUser.Phone)
	require.NotNil(t, tokenUser.AvatarKey)
	assert.Equal(t, validName, *tokenUser.DisplayName)
	assert.Equal(t, validPhone, *tokenUser.Phone)
	assert.Equal(t, validAvatar, *tokenUser.AvatarKey)
}

func TestUserProfile_DownstreamDisplayNamePriority(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	users := NewUserRepository(tx)
	posts := NewPostRepository(tx)
	chat := NewChatRepository(tx)
	live := NewLiveRepository(tx)
	q := sqlc.New(tx)

	cust, err := users.Create(ctx, "cust."+uniqueEmailToken()+"@example.com", "hash", domain.RoleCustomer)
	require.NoError(t, err)
	admin, err := users.Create(ctx, "admin."+uniqueEmailToken()+"@example.com", "hash", domain.RoleAdmin)
	require.NoError(t, err)

	// Default fallback name comes from default address when display_name is NULL.
	_, err = tx.Exec(ctx, `
		INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
		VALUES ($1, 'Tên Địa Chỉ', '0912345678', 79, 'TP.HCM', 26734, 'Phường 1', '123 Đường A', true)
	`, cust.ID)
	require.NoError(t, err)

	postDetail, err := posts.CreatePost(ctx, domain.CreatePostInput{
		AuthorID: cust.ID,
		Content:  "Bài viết kiểm tra tên",
	})
	require.NoError(t, err)
	assert.Equal(t, "Tên Địa Chỉ", postDetail.AuthorName)

	adminPost, err := posts.CreatePost(ctx, domain.CreatePostInput{
		AuthorID: admin.ID,
		Content:  "Bài viết quản trị",
	})
	require.NoError(t, err)
	assert.Equal(t, "Quản trị viên", adminPost.AuthorName)

	// Notification on admin's post with customer actor while display_name is NULL
	like := domain.ReactionTypeLike
	_, err = posts.CreateNotification(ctx, domain.CreateNotificationInput{
		RecipientID:      admin.ID,
		ActorID:          &cust.ID,
		GroupKey:         domain.NotificationGroupKeyPostReaction(adminPost.ID),
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypePostReaction,
		PostID:           &adminPost.ID,
		ReactionType:     &like,
		Excerpt:          "Bài viết quản trị",
	})
	require.NoError(t, err)

	// Chat conversation + customer & admin messages
	conv, err := chat.GetOrCreateConversation(ctx, cust.ID)
	require.NoError(t, err)
	assert.Equal(t, "Tên Địa Chỉ", conv.CustomerName)

	_, err = q.InsertChatMessage(ctx, sqlc.InsertChatMessageParams{
		ConversationID: conv.ID,
		SenderID:       cust.ID,
		SenderRole:     string(domain.ChatSenderCustomer),
		Content:        "Xin chào shop",
	})
	require.NoError(t, err)
	_, err = q.InsertChatMessage(ctx, sqlc.InsertChatMessageParams{
		ConversationID: conv.ID,
		SenderID:       admin.ID,
		SenderRole:     string(domain.ChatSenderAdmin),
		Content:        "Shop chào bạn",
	})
	require.NoError(t, err)

	// Live session + customer & admin comments
	_, err = tx.Exec(ctx, `UPDATE live_sessions SET status = 'ended' WHERE status = 'live'`)
	require.NoError(t, err)
	session, err := live.CreateSession(ctx, "Phiên Live Test", admin.ID, nil)
	require.NoError(t, err)
	_, err = live.InsertComment(ctx, session.ID, cust.ID, "Còn hàng không shop?")
	require.NoError(t, err)
	_, err = live.InsertComment(ctx, session.ID, admin.ID, "Dạ còn ạ!")
	require.NoError(t, err)

	// Now set customer's display_name -> must take precedence everywhere, including stored recentActors.
	_, err = tx.Exec(ctx, `UPDATE users SET display_name = 'Nguyễn Minh Anh' WHERE id = $1`, cust.ID)
	require.NoError(t, err)

	updatedPost, err := posts.GetPostByID(ctx, postDetail.ID, nil)
	require.NoError(t, err)
	assert.Equal(t, "Nguyễn Minh Anh", updatedPost.AuthorName)

	adminPostAfter, err := posts.GetPostByID(ctx, adminPost.ID, nil)
	require.NoError(t, err)
	assert.Equal(t, "Quản trị viên", adminPostAfter.AuthorName)

	notifList, err := posts.ListNotifications(ctx, admin.ID, 10, 0)
	require.NoError(t, err)
	require.Len(t, notifList.Items, 1)
	require.NotNil(t, notifList.Items[0].ActorName)
	assert.Equal(t, "Nguyễn Minh Anh", *notifList.Items[0].ActorName)
	rawRecent, err := json.Marshal(notifList.Items[0].Metadata["recentActors"])
	require.NoError(t, err)
	var actors []domain.NotificationActorSummary
	require.NoError(t, json.Unmarshal(rawRecent, &actors))
	require.Len(t, actors, 1)
	assert.Equal(t, "Nguyễn Minh Anh", actors[0].Name)

	updatedConv, err := chat.GetConversationByUserID(ctx, cust.ID)
	require.NoError(t, err)
	assert.Equal(t, "Nguyễn Minh Anh", updatedConv.CustomerName)

	msgs, err := chat.ListMessages(ctx, conv.ID, 10, 0, domain.ChatSenderAdmin)
	require.NoError(t, err)
	require.Len(t, msgs, 2)
	assert.Equal(t, "Nguyễn Minh Anh", msgs[0].SenderName)
	assert.Equal(t, "Hỗ trợ viên", msgs[1].SenderName)

	liveComments, err := live.ListRecentComments(ctx, session.ID, false, 10)
	require.NoError(t, err)
	require.Len(t, liveComments, 2)
	byUser := map[string]string{}
	for _, c := range liveComments {
		byUser[c.UserID] = c.AuthorName
	}
	assert.Equal(t, "Nguyễn Minh Anh", byUser[cust.ID])
	assert.Equal(t, "Chủ shop", byUser[admin.ID])
}

func TestAccountRepository_ProfileAvatarAndRotateSession(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	users := NewUserRepository(tx)
	sessions := NewSessionRepository(tx)
	acc := NewAccountRepository(tx)

	hash1, err := security.HashPassword("initialPass123")
	require.NoError(t, err)
	u, err := users.Create(ctx, "acc."+uniqueEmailToken()+"@example.com", hash1, domain.RoleCustomer)
	require.NoError(t, err)

	// 1. UpdateProfile sets then clears fields
	name := "Trần Bảo Ngọc"
	phone := "0987654321"
	updated, err := acc.UpdateProfile(ctx, u.ID, &name, &phone)
	require.NoError(t, err)
	require.NotNil(t, updated.DisplayName)
	require.NotNil(t, updated.Phone)
	assert.Equal(t, name, *updated.DisplayName)
	assert.Equal(t, phone, *updated.Phone)

	cleared, err := acc.UpdateProfile(ctx, u.ID, nil, nil)
	require.NoError(t, err)
	assert.Nil(t, cleared.DisplayName)
	assert.Nil(t, cleared.Phone)

	// 2. UpdateAvatar stores key, returns previous key on overwrite, and clears on delete
	k1 := "550e8400-e29b-41d4-a716-446655440001.png"
	u1, prev1, err := acc.UpdateAvatar(ctx, u.ID, &k1)
	require.NoError(t, err)
	assert.Nil(t, prev1)
	require.NotNil(t, u1.AvatarKey)
	assert.Equal(t, k1, *u1.AvatarKey)

	k2 := "550e8400-e29b-41d4-a716-446655440002.webp"
	u2, prev2, err := acc.UpdateAvatar(ctx, u.ID, &k2)
	require.NoError(t, err)
	require.NotNil(t, prev2)
	assert.Equal(t, k1, *prev2)
	require.NotNil(t, u2.AvatarKey)
	assert.Equal(t, k2, *u2.AvatarKey)

	u3, prev3, err := acc.UpdateAvatar(ctx, u.ID, nil)
	require.NoError(t, err)
	require.NotNil(t, prev3)
	assert.Equal(t, k2, *prev3)
	assert.Nil(t, u3.AvatarKey)

	// 3. ChangePasswordAndRotateSession atomically updates hash, revokes prior tokens, and saves new token
	old1, err := security.GenerateRefreshToken()
	require.NoError(t, err)
	old2, err := security.GenerateRefreshToken()
	require.NoError(t, err)
	_, err = sessions.CreateRefreshToken(ctx, u.ID, old1.Hash, time.Now().Add(time.Hour))
	require.NoError(t, err)
	_, err = sessions.CreateRefreshToken(ctx, u.ID, old2.Hash, time.Now().Add(time.Hour))
	require.NoError(t, err)

	newHash, err := security.HashPassword("rotatedPass456")
	require.NoError(t, err)
	newTok, err := security.GenerateRefreshToken()
	require.NoError(t, err)

	rotatedUser, err := acc.ChangePasswordAndRotateSession(ctx, u.ID, newHash, newTok.Hash, time.Now().Add(24*time.Hour))
	require.NoError(t, err)
	assert.True(t, security.CheckPassword("rotatedPass456", rotatedUser.PasswordHash))

	tOld1, _, err := sessions.GetRefreshTokenByHash(ctx, old1.Hash)
	require.NoError(t, err)
	assert.NotNil(t, tOld1.RevokedAt, "prior session 1 must be revoked")

	tOld2, _, err := sessions.GetRefreshTokenByHash(ctx, old2.Hash)
	require.NoError(t, err)
	assert.NotNil(t, tOld2.RevokedAt, "prior session 2 must be revoked")

	tNew, uNew, err := sessions.GetRefreshTokenByHash(ctx, newTok.Hash)
	require.NoError(t, err)
	assert.Nil(t, tNew.RevokedAt, "new session token must remain active")
	assert.Equal(t, u.ID, uNew.ID)
}

