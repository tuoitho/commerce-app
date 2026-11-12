package post

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type UseCase struct {
	repo        domain.PostRepository
	catalogRepo domain.CatalogRepository
	mediaStore  domain.PostMediaStore
	broadcaster domain.NotificationBroadcaster
}

var _ domain.PostUseCase = (*UseCase)(nil)

type Option func(*UseCase)

func WithBroadcaster(broadcaster domain.NotificationBroadcaster) Option {
	return func(uc *UseCase) {
		uc.broadcaster = broadcaster
	}
}

func New(
	repo domain.PostRepository,
	catalogRepo domain.CatalogRepository,
	mediaStore domain.PostMediaStore,
	opts ...Option,
) *UseCase {
	uc := &UseCase{
		repo:        repo,
		catalogRepo: catalogRepo,
		mediaStore:  mediaStore,
	}
	for _, opt := range opts {
		opt(uc)
	}
	return uc
}

func sanitizeFilename(name string) string {
	clean := filepath.Base(strings.TrimSpace(name))
	clean = strings.ReplaceAll(clean, "\\", "_")
	clean = strings.ReplaceAll(clean, "/", "_")
	if clean == "" || clean == "." {
		return "file"
	}
	return clean
}

// ============================================================================
// Media Upload & Streaming
// ============================================================================

func (uc *UseCase) UploadMedia(ctx context.Context, adminID string, fileName string, reader io.Reader, size int64, mimeType string) (*domain.PostMediaAttachment, error) {
	if strings.TrimSpace(adminID) == "" {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(adminID); err != nil {
		return nil, domain.ErrInvalidToken
	}

	normMime := strings.ToLower(strings.TrimSpace(mimeType))
	if normMime == "image/jpg" {
		normMime = "image/jpeg"
	}

	var fileType domain.PostMediaType
	switch normMime {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		fileType = domain.PostMediaTypeImage
	case "video/mp4", "video/webm":
		fileType = domain.PostMediaTypeVideo
	default:
		return nil, domain.NewValidationError(map[string]string{
			"file_type": "Định dạng tệp không được hỗ trợ (chỉ chấp nhận JPEG, PNG, WebP, GIF, MP4, WebM)",
		})
	}

	if size <= 0 {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		})
	}

	if fileType == domain.PostMediaTypeImage && size > domain.MaxImageSizeBytes {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		})
	}

	if fileType == domain.PostMediaTypeVideo && size > domain.MaxVideoSizeBytes {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		})
	}

	safeName := sanitizeFilename(fileName)
	objectKey := fmt.Sprintf("posts/%s/%s", uuid.NewString(), safeName)

	if err := uc.mediaStore.PutObject(ctx, objectKey, reader, size, normMime); err != nil {
		return nil, fmt.Errorf("upload to media store: %w", err)
	}

	attachment, err := uc.repo.CreatePendingMedia(ctx, adminID, objectKey, fileType, safeName, size, normMime)
	if err != nil {
		_ = uc.mediaStore.RemoveObject(ctx, objectKey)
		return nil, fmt.Errorf("create pending media: %w", err)
	}

	return attachment, nil
}

func (uc *UseCase) GetMediaStream(ctx context.Context, mediaID string, start, length int64) (io.ReadCloser, *domain.PostMediaAttachment, int64, error) {
	if _, err := uuid.Parse(mediaID); err != nil {
		return nil, nil, 0, domain.ErrPostMediaNotFound
	}

	media, err := uc.repo.GetMediaByID(ctx, mediaID)
	if err != nil {
		return nil, nil, 0, err
	}

	if length < 0 {
		return nil, media, media.FileSize, nil
	}

	if start > 0 || length > 0 {
		stream, err := uc.mediaStore.GetObjectRange(ctx, media.ObjectKey, start, length)
		if err != nil {
			return nil, nil, 0, err
		}
		return stream, media, length, nil
	}

	stream, err := uc.mediaStore.GetObject(ctx, media.ObjectKey)
	if err != nil {
		return nil, nil, 0, err
	}

	return stream, media, media.FileSize, nil
}

// ============================================================================
// Admin Post Management
// ============================================================================

type batchActiveProductChecker interface {
	CountActiveProductsByIDs(ctx context.Context, ids []string) (int, error)
}

func (uc *UseCase) validateReferredProducts(ctx context.Context, dedupedProducts []string) error {
	for _, pid := range dedupedProducts {
		if _, err := uuid.Parse(pid); err != nil {
			return domain.ErrProductNotFound
		}
	}
	if batchChecker, ok := uc.catalogRepo.(batchActiveProductChecker); ok {
		count, err := batchChecker.CountActiveProductsByIDs(ctx, dedupedProducts)
		if err != nil || count != len(dedupedProducts) {
			return domain.ErrProductNotFound
		}
		return nil
	}
	for _, pid := range dedupedProducts {
		prod, err := uc.catalogRepo.GetProductByID(ctx, pid)
		if err != nil || prod == nil || !prod.Active {
			return domain.ErrProductNotFound
		}
	}
	return nil
}

func (uc *UseCase) CreatePost(ctx context.Context, adminID string, req domain.CreatePostRequest) (*domain.PostDetail, error) {
	if strings.TrimSpace(adminID) == "" {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(adminID); err != nil {
		return nil, domain.ErrInvalidToken
	}

	content := strings.TrimSpace(req.Content)
	contentRunes := utf8.RuneCountInString(content)
	if contentRunes < domain.MinPostContentLength || contentRunes > domain.MaxPostContentLength {
		return nil, domain.NewValidationError(map[string]string{
			"content": "Nội dung bài viết phải từ 1 đến 5.000 ký tự",
		})
	}

	// Validate referredProductIds (1..10, deduplicated preserving order)
	var dedupedProducts []string
	seenProducts := make(map[string]bool)
	for _, pid := range req.ReferredProductIDs {
		trimmed := strings.TrimSpace(pid)
		if trimmed != "" && !seenProducts[trimmed] {
			seenProducts[trimmed] = true
			dedupedProducts = append(dedupedProducts, trimmed)
		}
	}

	if len(dedupedProducts) < domain.MinReferredProducts || len(dedupedProducts) > domain.MaxReferredProducts {
		return nil, domain.NewValidationError(map[string]string{
			"referredProductIds": "Vui lòng chọn từ 1 đến 10 sản phẩm giới thiệu",
		})
	}

	if err := uc.validateReferredProducts(ctx, dedupedProducts); err != nil {
		return nil, err
	}

	// Validate mediaIds (optional, 0..10, deduplicated preserving order)
	var dedupedMedia []string
	seenMedia := make(map[string]bool)
	for _, mid := range req.MediaIDs {
		trimmed := strings.TrimSpace(mid)
		if trimmed != "" && !seenMedia[trimmed] {
			seenMedia[trimmed] = true
			dedupedMedia = append(dedupedMedia, trimmed)
		}
	}

	if len(dedupedMedia) > domain.MaxMediaAttachments {
		return nil, domain.NewValidationError(map[string]string{
			"mediaIds": "Tối đa 10 tệp đính kèm",
		})
	}

	if len(dedupedMedia) > 0 {
		for _, mid := range dedupedMedia {
			if _, err := uuid.Parse(mid); err != nil {
				return nil, domain.NewValidationError(map[string]string{
					"mediaIds": "Tệp đính kèm không hợp lệ hoặc đã được sử dụng",
				})
			}
		}

		mediaList, err := uc.repo.GetMediaByIDs(ctx, dedupedMedia)
		if err != nil {
			return nil, err
		}
		if len(mediaList) != len(dedupedMedia) {
			return nil, domain.NewValidationError(map[string]string{
				"mediaIds": "Tệp đính kèm không hợp lệ hoặc đã được sử dụng",
			})
		}
		for _, m := range mediaList {
			if m.UploaderID != adminID || m.PostID != nil {
				return nil, domain.NewValidationError(map[string]string{
					"mediaIds": "Tệp đính kèm không hợp lệ hoặc đã được sử dụng",
				})
			}
		}
	}

	return uc.repo.CreatePost(ctx, domain.CreatePostInput{
		AuthorID:           adminID,
		Content:            content,
		MediaIDs:           dedupedMedia,
		ReferredProductIDs: dedupedProducts,
	})
}

func (uc *UseCase) UpdatePost(ctx context.Context, adminID string, postID string, req domain.UpdatePostRequest) (*domain.PostDetail, error) {
	if strings.TrimSpace(adminID) == "" {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(adminID); err != nil {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(postID); err != nil {
		return nil, domain.ErrPostNotFound
	}

	existingPost, err := uc.repo.GetPostByID(ctx, postID, nil)
	if err != nil {
		return nil, err
	}

	content := strings.TrimSpace(req.Content)
	contentRunes := utf8.RuneCountInString(content)
	if contentRunes < domain.MinPostContentLength || contentRunes > domain.MaxPostContentLength {
		return nil, domain.NewValidationError(map[string]string{
			"content": "Nội dung bài viết phải từ 1 đến 5.000 ký tự",
		})
	}

	var dedupedProducts []string
	seenProducts := make(map[string]bool)
	for _, pid := range req.ReferredProductIDs {
		trimmed := strings.TrimSpace(pid)
		if trimmed != "" && !seenProducts[trimmed] {
			seenProducts[trimmed] = true
			dedupedProducts = append(dedupedProducts, trimmed)
		}
	}

	if len(dedupedProducts) < domain.MinReferredProducts || len(dedupedProducts) > domain.MaxReferredProducts {
		return nil, domain.NewValidationError(map[string]string{
			"referredProductIds": "Vui lòng chọn từ 1 đến 10 sản phẩm giới thiệu",
		})
	}

	if err := uc.validateReferredProducts(ctx, dedupedProducts); err != nil {
		return nil, err
	}

	var dedupedMedia []string
	seenMedia := make(map[string]bool)
	for _, mid := range req.MediaIDs {
		trimmed := strings.TrimSpace(mid)
		if trimmed != "" && !seenMedia[trimmed] {
			seenMedia[trimmed] = true
			dedupedMedia = append(dedupedMedia, trimmed)
		}
	}

	if len(dedupedMedia) > domain.MaxMediaAttachments {
		return nil, domain.NewValidationError(map[string]string{
			"mediaIds": "Tối đa 10 tệp đính kèm",
		})
	}

	if len(dedupedMedia) > 0 {
		for _, mid := range dedupedMedia {
			if _, err := uuid.Parse(mid); err != nil {
				return nil, domain.NewValidationError(map[string]string{
					"mediaIds": "Tệp đính kèm không hợp lệ hoặc đã được sử dụng",
				})
			}
		}

		mediaList, err := uc.repo.GetMediaByIDs(ctx, dedupedMedia)
		if err != nil {
			return nil, err
		}
		if len(mediaList) != len(dedupedMedia) {
			return nil, domain.NewValidationError(map[string]string{
				"mediaIds": "Tệp đính kèm không hợp lệ hoặc đã được sử dụng",
			})
		}
		for _, m := range mediaList {
			belongsToThisPost := m.PostID != nil && *m.PostID == postID
			isNewPendingByAdmin := m.PostID == nil && m.UploaderID == adminID
			if !belongsToThisPost && !isNewPendingByAdmin {
				return nil, domain.NewValidationError(map[string]string{
					"mediaIds": "Tệp đính kèm không hợp lệ hoặc đã được sử dụng",
				})
			}
		}
	}

	// Identify removed media for cleanup from store
	var toDeleteKeys []string
	keepMediaMap := make(map[string]bool)
	for _, m := range dedupedMedia {
		keepMediaMap[m] = true
	}
	for _, oldMedia := range existingPost.Media {
		if !keepMediaMap[oldMedia.ID] && oldMedia.ObjectKey != "" {
			toDeleteKeys = append(toDeleteKeys, oldMedia.ObjectKey)
		}
	}

	updatedPost, err := uc.repo.UpdatePost(ctx, domain.UpdatePostInput{
		PostID:             postID,
		Content:            content,
		MediaIDs:           dedupedMedia,
		ReferredProductIDs: dedupedProducts,
	})
	if err != nil {
		return nil, err
	}

	if len(toDeleteKeys) > 0 {
		_ = uc.mediaStore.RemoveObjects(ctx, toDeleteKeys)
	}

	return updatedPost, nil
}

func (uc *UseCase) DeletePost(ctx context.Context, adminID string, postID string) error {
	if strings.TrimSpace(adminID) == "" {
		return domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(adminID); err != nil {
		return domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(postID); err != nil {
		return domain.ErrPostNotFound
	}

	existingPost, err := uc.repo.GetPostByID(ctx, postID, nil)
	if err != nil {
		return err
	}

	if err := uc.repo.DeletePost(ctx, postID); err != nil {
		return err
	}

	// Best-effort cleanup of media objects
	if len(existingPost.Media) > 0 {
		keys := make([]string, 0, len(existingPost.Media))
		for _, m := range existingPost.Media {
			if m.ObjectKey != "" {
				keys = append(keys, m.ObjectKey)
			}
		}
		if len(keys) > 0 {
			_ = uc.mediaStore.RemoveObjects(ctx, keys)
		}
	}

	return nil
}

func truncateExcerpt(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes]) + "..."
}

// ============================================================================
// Public & Authenticated Posts
// ============================================================================

func (uc *UseCase) ListPosts(ctx context.Context, viewerUserID *string, page, limit int) ([]domain.PostItem, int, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 10
	}
	offset := (page - 1) * limit

	var validViewer *string
	if viewerUserID != nil && strings.TrimSpace(*viewerUserID) != "" {
		if _, err := uuid.Parse(strings.TrimSpace(*viewerUserID)); err == nil {
			v := strings.TrimSpace(*viewerUserID)
			validViewer = &v
		}
	}

	items, total, err := uc.repo.ListPosts(ctx, domain.ListPostsFilter{
		ViewerUserID: validViewer,
		Limit:        limit,
		Offset:       offset,
	})
	if err != nil {
		return nil, 0, 0, err
	}

	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	return items, total, totalPages, nil
}

func (uc *UseCase) GetPostByID(ctx context.Context, viewerUserID *string, postID string) (*domain.PostDetail, error) {
	if _, err := uuid.Parse(postID); err != nil {
		return nil, domain.ErrPostNotFound
	}
	var validViewer *string
	if viewerUserID != nil && strings.TrimSpace(*viewerUserID) != "" {
		if _, err := uuid.Parse(strings.TrimSpace(*viewerUserID)); err == nil {
			v := strings.TrimSpace(*viewerUserID)
			validViewer = &v
		}
	}
	return uc.repo.GetPostByID(ctx, postID, validViewer)
}

// ============================================================================
// Interactions & Notifications
// ============================================================================

func (uc *UseCase) ReactToPost(ctx context.Context, userID string, postID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(postID); err != nil {
		return nil, domain.ErrPostNotFound
	}

	if reaction != nil && !reaction.IsValid() {
		return nil, domain.NewValidationError(map[string]string{
			"reaction": "Loại cảm xúc không hợp lệ",
		})
	}

	existingPost, err := uc.repo.GetPostByID(ctx, postID, &userID)
	if err != nil {
		return nil, err
	}

	summary, prevReaction, err := uc.repo.SetPostReaction(ctx, postID, userID, reaction)
	if err != nil {
		return nil, err
	}

	groupKey := domain.NotificationGroupKeyPostReaction(existingPost.ID)
	if reaction == nil {
		if prevReaction != nil && existingPost.AuthorID != userID {
			notif, err := uc.repo.SyncUnreadReactionNotification(ctx, existingPost.AuthorID, groupKey, &existingPost.ID, nil)
			if err == nil && uc.broadcaster != nil {
				if notif != nil {
					_ = uc.broadcaster.BroadcastNotification(ctx, existingPost.AuthorID, notif)
				} else {
					_ = uc.broadcaster.BroadcastNotification(ctx, existingPost.AuthorID, &domain.NotificationItem{
						RecipientID:      existingPost.AuthorID,
						GroupKey:         groupKey,
						ActorCount:       0,
						Category:         domain.NotificationCategoryPost,
						NotificationType: domain.NotificationTypePostReaction,
						PostID:           &existingPost.ID,
					})
				}
			}
		}
		return summary, nil
	}

	reactionChanged := prevReaction == nil || *prevReaction != *reaction
	if reactionChanged && existingPost.AuthorID != userID {
		notif, err := uc.repo.CreateNotification(ctx, domain.CreateNotificationInput{
			RecipientID:      existingPost.AuthorID,
			ActorID:          &userID,
			GroupKey:         groupKey,
			Category:         domain.NotificationCategoryPost,
			NotificationType: domain.NotificationTypePostReaction,
			PostID:           &existingPost.ID,
			CommentID:        nil,
			ReactionType:     reaction,
			Excerpt:          truncateExcerpt(existingPost.Content, 100),
			Metadata:         map[string]interface{}{},
		})
		if err == nil && uc.broadcaster != nil && notif != nil {
			_ = uc.broadcaster.BroadcastNotification(ctx, existingPost.AuthorID, notif)
		}
	}

	return summary, nil
}

func (uc *UseCase) ReactToComment(ctx context.Context, userID string, commentID string, reaction *domain.ReactionType) (*domain.ReactionSummary, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(commentID); err != nil {
		return nil, domain.ErrPostCommentNotFound
	}

	if reaction != nil && !reaction.IsValid() {
		return nil, domain.NewValidationError(map[string]string{
			"reaction": "Loại cảm xúc không hợp lệ",
		})
	}

	comment, err := uc.repo.GetCommentByID(ctx, commentID)
	if err != nil {
		return nil, err
	}

	summary, prevReaction, err := uc.repo.SetCommentReaction(ctx, commentID, userID, reaction)
	if err != nil {
		return nil, err
	}

	groupKey := domain.NotificationGroupKeyCommentReaction(comment.ID)
	if reaction == nil {
		if prevReaction != nil && comment.AuthorID != userID {
			notif, err := uc.repo.SyncUnreadReactionNotification(ctx, comment.AuthorID, groupKey, &comment.PostID, &comment.ID)
			if err == nil && uc.broadcaster != nil {
				if notif != nil {
					_ = uc.broadcaster.BroadcastNotification(ctx, comment.AuthorID, notif)
				} else {
					_ = uc.broadcaster.BroadcastNotification(ctx, comment.AuthorID, &domain.NotificationItem{
						RecipientID:      comment.AuthorID,
						GroupKey:         groupKey,
						ActorCount:       0,
						Category:         domain.NotificationCategoryPost,
						NotificationType: domain.NotificationTypeCommentReaction,
						PostID:           &comment.PostID,
						CommentID:        &comment.ID,
					})
				}
			}
		}
		return summary, nil
	}

	reactionChanged := prevReaction == nil || *prevReaction != *reaction
	if reactionChanged && comment.AuthorID != userID {
		notif, err := uc.repo.CreateNotification(ctx, domain.CreateNotificationInput{
			RecipientID:      comment.AuthorID,
			ActorID:          &userID,
			GroupKey:         groupKey,
			Category:         domain.NotificationCategoryPost,
			NotificationType: domain.NotificationTypeCommentReaction,
			PostID:           &comment.PostID,
			CommentID:        &comment.ID,
			ReactionType:     reaction,
			Excerpt:          truncateExcerpt(comment.Content, 100),
			Metadata:         map[string]interface{}{},
		})
		if err == nil && uc.broadcaster != nil && notif != nil {
			_ = uc.broadcaster.BroadcastNotification(ctx, comment.AuthorID, notif)
		}
	}

	return summary, nil
}

func (uc *UseCase) CreateComment(ctx context.Context, userID string, postID string, req domain.CreateCommentRequest) (*domain.PostComment, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(postID); err != nil {
		return nil, domain.ErrPostNotFound
	}

	content := strings.TrimSpace(req.Content)
	contentRunes := utf8.RuneCountInString(content)
	if contentRunes < domain.MinCommentContentLength || contentRunes > domain.MaxCommentContentLength {
		return nil, domain.NewValidationError(map[string]string{
			"content": "Nội dung bình luận phải từ 1 đến 1.000 ký tự",
		})
	}

	post, err := uc.repo.GetPostByID(ctx, postID, nil)
	if err != nil {
		return nil, err
	}

	var parentComment *domain.PostComment
	if req.ParentCommentID != nil && strings.TrimSpace(*req.ParentCommentID) != "" {
		parentID := strings.TrimSpace(*req.ParentCommentID)
		if _, err := uuid.Parse(parentID); err != nil {
			return nil, domain.ErrPostCommentNotFound
		}
		pComment, err := uc.repo.GetCommentByID(ctx, parentID)
		if err != nil || pComment == nil || pComment.PostID != postID {
			return nil, domain.ErrPostCommentNotFound
		}
		parentComment = pComment
	}

	createdComment, err := uc.repo.CreateComment(ctx, domain.CreateCommentInput{
		PostID:          postID,
		AuthorID:        userID,
		ParentCommentID: req.ParentCommentID,
		Content:         content,
	})
	if err != nil {
		return nil, err
	}

	excerpt := truncateExcerpt(content, 100)
	if parentComment == nil {
		if post.AuthorID != userID {
			notif, err := uc.repo.CreateNotification(ctx, domain.CreateNotificationInput{
				RecipientID:      post.AuthorID,
				ActorID:          &userID,
				GroupKey:         domain.NotificationGroupKeyPostComment(post.ID),
				Category:         domain.NotificationCategoryPost,
				NotificationType: domain.NotificationTypePostComment,
				PostID:           &post.ID,
				CommentID:        &createdComment.ID,
				ReactionType:     nil,
				Excerpt:          excerpt,
				Metadata:         map[string]interface{}{},
			})
			if err == nil && uc.broadcaster != nil && notif != nil {
				_ = uc.broadcaster.BroadcastNotification(ctx, post.AuthorID, notif)
			}
		}
	} else {
		targetAuthorID := parentComment.AuthorID
		postAuthorID := post.AuthorID

		rootCommentID := parentComment.ID
		if parentComment.ParentID != nil && strings.TrimSpace(*parentComment.ParentID) != "" {
			rootCommentID = strings.TrimSpace(*parentComment.ParentID)
		} else if createdComment != nil && createdComment.ParentID != nil && strings.TrimSpace(*createdComment.ParentID) != "" {
			rootCommentID = strings.TrimSpace(*createdComment.ParentID)
		}

		if targetAuthorID != userID {
			notif, err := uc.repo.CreateNotification(ctx, domain.CreateNotificationInput{
				RecipientID:      targetAuthorID,
				ActorID:          &userID,
				GroupKey:         domain.NotificationGroupKeyCommentReply(rootCommentID),
				Category:         domain.NotificationCategoryPost,
				NotificationType: domain.NotificationTypeCommentReply,
				PostID:           &post.ID,
				CommentID:        &createdComment.ID,
				ReactionType:     nil,
				Excerpt:          excerpt,
				Metadata:         map[string]interface{}{},
			})
			if err == nil && uc.broadcaster != nil && notif != nil {
				_ = uc.broadcaster.BroadcastNotification(ctx, targetAuthorID, notif)
			}
		}

		if postAuthorID != userID && postAuthorID != targetAuthorID {
			notif, err := uc.repo.CreateNotification(ctx, domain.CreateNotificationInput{
				RecipientID:      postAuthorID,
				ActorID:          &userID,
				GroupKey:         domain.NotificationGroupKeyPostComment(post.ID),
				Category:         domain.NotificationCategoryPost,
				NotificationType: domain.NotificationTypePostComment,
				PostID:           &post.ID,
				CommentID:        &createdComment.ID,
				ReactionType:     nil,
				Excerpt:          excerpt,
				Metadata:         map[string]interface{}{},
			})
			if err == nil && uc.broadcaster != nil && notif != nil {
				_ = uc.broadcaster.BroadcastNotification(ctx, postAuthorID, notif)
			}
		}
	}

	return createdComment, nil
}

func (uc *UseCase) DeleteComment(ctx context.Context, userID string, userRole string, postID string, commentID string) (string, int, error) {
	if strings.TrimSpace(userID) == "" {
		return "", 0, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(userID); err != nil {
		return "", 0, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(postID); err != nil {
		return "", 0, domain.ErrPostNotFound
	}
	if _, err := uuid.Parse(commentID); err != nil {
		return "", 0, domain.ErrPostCommentNotFound
	}

	if _, err := uc.repo.GetPostByID(ctx, postID, nil); err != nil {
		return "", 0, err
	}

	comment, err := uc.repo.GetCommentByID(ctx, commentID)
	if err != nil {
		return "", 0, err
	}
	if comment.PostID != postID {
		return "", 0, domain.ErrPostCommentNotFound
	}

	if comment.AuthorID != userID && userRole != "admin" {
		return "", 0, domain.ErrForbidden
	}

	return uc.repo.DeleteComment(ctx, commentID)
}

func (uc *UseCase) ListNotifications(ctx context.Context, recipientID string, limit, offset int) (*domain.NotificationsListResult, error) {
	if strings.TrimSpace(recipientID) == "" {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(recipientID); err != nil {
		return nil, domain.ErrInvalidToken
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	return uc.repo.ListNotifications(ctx, recipientID, limit, offset)
}

func (uc *UseCase) MarkNotificationRead(ctx context.Context, recipientID string, notificationID string) (*domain.NotificationItem, int, error) {
	if strings.TrimSpace(recipientID) == "" {
		return nil, 0, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(recipientID); err != nil {
		return nil, 0, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(notificationID); err != nil {
		return nil, 0, domain.ErrNotificationNotFound
	}

	item, err := uc.repo.MarkNotificationRead(ctx, notificationID, recipientID)
	if err != nil {
		return nil, 0, err
	}

	count, err := uc.repo.GetUnreadNotificationCount(ctx, recipientID)
	if err != nil {
		return nil, 0, err
	}

	return item, count, nil
}

func (uc *UseCase) MarkAllNotificationsRead(ctx context.Context, recipientID string) (int, error) {
	if strings.TrimSpace(recipientID) == "" {
		return 0, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(recipientID); err != nil {
		return 0, domain.ErrInvalidToken
	}

	if err := uc.repo.MarkAllNotificationsRead(ctx, recipientID); err != nil {
		return 0, err
	}

	return 0, nil
}
