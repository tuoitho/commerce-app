package domain_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"commerce-backend/internal/domain"
)

func TestReactionType_Validity(t *testing.T) {
	// Requirements: 3.1, 3.5, 5.1
	validTypes := []domain.ReactionType{
		domain.ReactionTypeLike,
		domain.ReactionTypeLove,
		domain.ReactionTypeHaha,
		domain.ReactionTypeWow,
		domain.ReactionTypeSad,
		domain.ReactionTypeAngry,
	}

	for _, rt := range validTypes {
		if !rt.IsValid() {
			t.Errorf("expected reaction type %q to be valid", rt)
		}
	}

	invalidTypes := []domain.ReactionType{
		"",
		"dislike",
		"happy",
		"LIKE",
		"thumbs_up",
		"angry1",
	}

	for _, rt := range invalidTypes {
		if rt.IsValid() {
			t.Errorf("expected reaction type %q to be invalid", rt)
		}
	}
}

func TestPostMediaConstraints(t *testing.T) {
	// Requirements: 1.6, 1.7
	if domain.MaxImageSizeBytes != 10*1024*1024 {
		t.Errorf("expected MaxImageSizeBytes to be 10MB (10485760), got %d", domain.MaxImageSizeBytes)
	}
	if domain.MaxVideoSizeBytes != 50*1024*1024 {
		t.Errorf("expected MaxVideoSizeBytes to be 50MB (52428800), got %d", domain.MaxVideoSizeBytes)
	}

	validImageMimes := []string{"image/jpeg", "image/png", "image/webp", "image/gif"}
	for _, m := range validImageMimes {
		if !domain.IsValidMediaMimeType(m) {
			t.Errorf("expected %q to be valid media mime type", m)
		}
	}

	validVideoMimes := []string{"video/mp4", "video/webm"}
	for _, m := range validVideoMimes {
		if !domain.IsValidMediaMimeType(m) {
			t.Errorf("expected %q to be valid media mime type", m)
		}
	}

	invalidMimes := []string{"application/pdf", "image/svg+xml", "text/plain", "video/avi"}
	for _, m := range invalidMimes {
		if domain.IsValidMediaMimeType(m) {
			t.Errorf("expected %q to be invalid media mime type", m)
		}
	}
}

func TestContentLengthLimits(t *testing.T) {
	// Requirements: 1.3, 4.2
	if domain.MaxPostContentLength != 5000 {
		t.Errorf("expected MaxPostContentLength to be 5000, got %d", domain.MaxPostContentLength)
	}
	if domain.MaxCommentContentLength != 1000 {
		t.Errorf("expected MaxCommentContentLength to be 1000, got %d", domain.MaxCommentContentLength)
	}
}

func TestContract_TypePostDomainJSON(t *testing.T) {
	// Requirements: 1.3, 2.1, 4.1, 6.1; Contract TYPE-POST-DOMAIN@1
	viewerReaction := domain.ReactionTypeLove
	summary := domain.ReactionSummary{
		TotalCount: 42,
		Counts: domain.ReactionCounts{
			Like:  10,
			Love:  20,
			Haha:  5,
			Wow:   4,
			Sad:   2,
			Angry: 1,
		},
		ViewerReaction: &viewerReaction,
	}

	data, err := json.Marshal(summary)
	if err != nil {
		t.Fatalf("failed to marshal ReactionSummary: %v", err)
	}
	jsonStr := string(data)
	for _, expectedKey := range []string{`"totalCount":42`, `"like":10`, `"love":20`, `"viewerReaction":"love"`} {
		if !strings.Contains(jsonStr, expectedKey) {
			t.Errorf("ReactionSummary json missing %q, got: %s", expectedKey, jsonStr)
		}
	}

	// Verify ViewerReaction null serialization
	summaryNil := domain.ReactionSummary{
		TotalCount:     0,
		Counts:         domain.ReactionCounts{},
		ViewerReaction: nil,
	}
	dataNil, err := json.Marshal(summaryNil)
	if err != nil {
		t.Fatalf("failed to marshal ReactionSummary: %v", err)
	}
	if !strings.Contains(string(dataNil), `"viewerReaction":null`) {
		t.Errorf("expected '\"viewerReaction\":null', got: %s", string(dataNil))
	}

	// Verify PostItem serialization
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	post := domain.PostItem{
		ID:         "post-uuid-1",
		AuthorID:   "author-uuid-1",
		AuthorName: "Quản trị viên",
		AuthorRole: "admin",
		Content:    "Bài viết giới thiệu sản phẩm mới",
		Media: []domain.PostMediaAttachment{
			{
				ID:        "media-uuid-1",
				FileURL:   "/api/v1/posts/media/media-uuid-1",
				FileType:  domain.PostMediaTypeImage,
				FileName:  "photo.jpg",
				FileSize:  1024,
				MimeType:  "image/jpeg",
				Position:  0,
				ObjectKey: "posts/media-uuid-1/photo.jpg",
			},
		},
		ReferredProducts: []domain.ReferredProductCard{
			{
				ID:       "prod-uuid-1",
				Name:     "Điện thoại cao cấp",
				Brand:    "Apple",
				Price:    "25990000",
				Currency: "VND",
				ImageURL: "https://example.com/img.jpg",
				InStock:  true,
				Active:   true,
			},
		},
		Reactions:    summary,
		CommentCount: 5,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	postData, err := json.Marshal(post)
	if err != nil {
		t.Fatalf("failed to marshal PostItem: %v", err)
	}
	postJSON := string(postData)
	for _, expectedKey := range []string{
		`"authorId":"author-uuid-1"`,
		`"authorName":"Quản trị viên"`,
		`"authorRole":"admin"`,
		`"fileUrl":"/api/v1/posts/media/media-uuid-1"`,
		`"fileType":"image"`,
		`"referredProducts":`,
		`"inStock":true`,
		`"active":true`,
		`"commentCount":5`,
	} {
		if !strings.Contains(postJSON, expectedKey) {
			t.Errorf("PostItem JSON missing %q, got: %s", expectedKey, postJSON)
		}
	}
	if strings.Contains(postJSON, "objectKey") || strings.Contains(postJSON, "ObjectKey") {
		t.Errorf("PostItem JSON must not leak ObjectKey, got: %s", postJSON)
	}

	// Verify PostComment and PostCommentThread
	parentID := "comment-root-1"
	replyToUser := "user-2"
	replyToName := "Nguyễn Văn B"
	commentReply := domain.PostComment{
		ID:              "comment-reply-1",
		PostID:          post.ID,
		AuthorID:        "author-2",
		AuthorName:      "Nguyễn Văn A",
		AuthorRole:      "customer",
		ParentID:        &parentID,
		ReplyToUserID:   &replyToUser,
		ReplyToUserName: &replyToName,
		Content:         "Cảm ơn shop!",
		Reactions:       summary,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	thread := domain.PostCommentThread{
		PostComment: domain.PostComment{
			ID:         parentID,
			PostID:     post.ID,
			AuthorID:   replyToUser,
			AuthorName: replyToName,
			AuthorRole: "customer",
			Content:    "Bình luận gốc",
			Reactions:  summary,
			CreatedAt:  now,
			UpdatedAt:  now,
		},
		Replies: []domain.PostComment{commentReply},
	}

	threadData, err := json.Marshal(thread)
	if err != nil {
		t.Fatalf("failed to marshal PostCommentThread: %v", err)
	}
	threadJSON := string(threadData)
	for _, expectedKey := range []string{
		`"parentId":"comment-root-1"`,
		`"replyToUserId":"user-2"`,
		`"replyToUserName":"Nguyễn Văn B"`,
		`"replies":`,
	} {
		if !strings.Contains(threadJSON, expectedKey) {
			t.Errorf("PostCommentThread JSON missing %q, got: %s", expectedKey, threadJSON)
		}
	}
}

func TestContract_NotificationItemJSON(t *testing.T) {
	// Requirements: 6.1, 6.2, 6.6; Contract TYPE-POST-DOMAIN@2 and Contract API-NOTIFICATIONS@2
	actorID := "actor-uuid-2"
	actorName := "Trần Thị B"
	actorRole := "customer"
	postID := "post-uuid-1"
	commentID := "comment-uuid-1"
	reactionType := domain.ReactionTypeLike
	createdAt := time.Date(2026, 10, 20, 16, 30, 0, 0, time.UTC)
	updatedAt := time.Date(2026, 10, 20, 16, 35, 0, 0, time.UTC)

	recentActors := []domain.NotificationActorSummary{
		{
			ID:   "actor-uuid-2",
			Name: "Trần Thị B",
			Role: "customer",
		},
		{
			ID:   "actor-uuid-1",
			Name: "Nguyễn Văn A",
			Role: "customer",
		},
	}

	notif := domain.NotificationItem{
		ID:               "notif-uuid-1",
		RecipientID:      "recipient-uuid-1",
		ActorID:          &actorID,
		ActorName:        &actorName,
		ActorRole:        &actorRole,
		GroupKey:         domain.NotificationGroupKeyCommentReply("parent-comment-uuid-1"),
		ActorCount:       2,
		Category:         domain.NotificationCategoryPost,
		NotificationType: domain.NotificationTypeCommentReply,
		PostID:           &postID,
		CommentID:        &commentID,
		ReactionType:     &reactionType,
		Excerpt:          "Dạ cảm ơn shop nhiều ạ!",
		Metadata: map[string]interface{}{
			"recentActors": recentActors,
		},
		IsRead:    false,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}

	data, err := json.Marshal(notif)
	if err != nil {
		t.Fatalf("failed to marshal NotificationItem: %v", err)
	}
	notifJSON := string(data)
	for _, expectedKey := range []string{
		`"recipientId":"recipient-uuid-1"`,
		`"actorId":"actor-uuid-2"`,
		`"actorName":"Trần Thị B"`,
		`"actorRole":"customer"`,
		`"groupKey":"comment_reply:parent-comment-uuid-1"`,
		`"actorCount":2`,
		`"category":"post"`,
		`"notificationType":"comment_reply"`,
		`"postId":"post-uuid-1"`,
		`"commentId":"comment-uuid-1"`,
		`"reactionType":"like"`,
		`"excerpt":"Dạ cảm ơn shop nhiều ạ!"`,
		`"recentActors":[{"id":"actor-uuid-2","name":"Trần Thị B","role":"customer"},{"id":"actor-uuid-1","name":"Nguyễn Văn A","role":"customer"}]`,
		`"isRead":false`,
		`"createdAt":"2026-10-20T16:30:00Z"`,
		`"updatedAt":"2026-10-20T16:35:00Z"`,
	} {
		if !strings.Contains(notifJSON, expectedKey) {
			t.Errorf("NotificationItem JSON missing %q, got: %s", expectedKey, notifJSON)
		}
	}
}

func TestNotificationGroupKeys(t *testing.T) {
	// Requirements: 6.1, 6.2; Contract DB-POSTS@2
	if got := domain.NotificationGroupKeyPostReaction("post-123"); got != "post_reaction:post-123" {
		t.Errorf("expected post_reaction:post-123, got %q", got)
	}
	if got := domain.NotificationGroupKeyCommentReaction("comment-456"); got != "comment_reaction:comment-456" {
		t.Errorf("expected comment_reaction:comment-456, got %q", got)
	}
	if got := domain.NotificationGroupKeyPostComment("post-123"); got != "post_comment:post-123" {
		t.Errorf("expected post_comment:post-123, got %q", got)
	}
	if got := domain.NotificationGroupKeyCommentReply("root-789"); got != "comment_reply:root-789" {
		t.Errorf("expected comment_reply:root-789, got %q", got)
	}
}
