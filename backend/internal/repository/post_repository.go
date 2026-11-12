package repository

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type postDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type PostRepository struct {
	db postDB
}

func NewPostRepository(db postDB) *PostRepository {
	return &PostRepository{db: db}
}

var _ domain.PostRepository = (*PostRepository)(nil)

// ============================================================================
// Internal Helpers
// ============================================================================

func parseUUID(s string) (uuid.UUID, error) {
	return uuid.Parse(strings.TrimSpace(s))
}

func toPgUUID(id string) pgtype.UUID {
	u, err := uuid.Parse(strings.TrimSpace(id))
	if err != nil {
		return pgtype.UUID{Valid: false}
	}
	return pgtype.UUID{Bytes: u, Valid: true}
}

func toPgUUIDPtr(id *string) pgtype.UUID {
	if id == nil || strings.TrimSpace(*id) == "" {
		return pgtype.UUID{Valid: false}
	}
	return toPgUUID(*id)
}


func toPgTextPtr(s *string) pgtype.Text {
	if s == nil || strings.TrimSpace(*s) == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: *s, Valid: true}
}

type reactionCountItem struct {
	ReactionType string
	Count        int64
}

func aggregateReactionSummary(rows []reactionCountItem, viewer *domain.ReactionType) domain.ReactionSummary {
	counts := domain.ReactionCounts{}
	total := 0
	for _, r := range rows {
		c := int(r.Count)
		total += c
		switch domain.ReactionType(r.ReactionType) {
		case domain.ReactionTypeLike:
			counts.Like += c
		case domain.ReactionTypeLove:
			counts.Love += c
		case domain.ReactionTypeHaha:
			counts.Haha += c
		case domain.ReactionTypeWow:
			counts.Wow += c
		case domain.ReactionTypeSad:
			counts.Sad += c
		case domain.ReactionTypeAngry:
			counts.Angry += c
		}
	}
	return domain.ReactionSummary{
		TotalCount:     total,
		Counts:         counts,
		ViewerReaction: viewer,
	}
}

func toDomainPostMediaAttachment(m sqlc.PostMedium) domain.PostMediaAttachment {
	var postID *string
	if m.PostID.Valid {
		s := uuid.UUID(m.PostID.Bytes).String()
		postID = &s
	}
	return domain.PostMediaAttachment{
		ID:         m.ID,
		FileURL:    "/api/v1/posts/media/" + m.ID,
		FileType:   domain.PostMediaType(m.FileType),
		FileName:   m.FileName,
		FileSize:   m.FileSize,
		MimeType:   m.MimeType,
		Position:   int(m.Position),
		ObjectKey:  m.ObjectKey,
		PostID:     postID,
		UploaderID: m.UploaderID,
	}
}

func toDomainReferredProductCard(p sqlc.ListReferredProductsByPostIDRow) domain.ReferredProductCard {
	return domain.ReferredProductCard{
		ID:       p.ProductID,
		Name:     p.ProductName,
		Brand:    p.ProductBrand,
		Price:    p.Price,
		Currency: p.Currency,
		ImageURL: p.ImageUrl,
		InStock:  p.InStock,
		Active:   p.Active,
	}
}

func toDomainReferredProductCardFromBatch(p sqlc.ListReferredProductsByPostIDsRow) domain.ReferredProductCard {
	return domain.ReferredProductCard{
		ID:       p.ProductID,
		Name:     p.ProductName,
		Brand:    p.ProductBrand,
		Price:    p.Price,
		Currency: p.Currency,
		ImageURL: p.ImageUrl,
		InStock:  p.InStock,
		Active:   p.Active,
	}
}

func mapCommentRow(row sqlc.ListCommentsByPostIDRow, reactions domain.ReactionSummary) domain.PostComment {
	var replyToUserID *string
	var replyToUserName *string
	if row.ReplyToUserID.Valid {
		idStr := uuid.UUID(row.ReplyToUserID.Bytes).String()
		replyToUserID = &idStr
		if row.ReplyToUserName != "" {
			name := row.ReplyToUserName
			replyToUserName = &name
		}
	}

	return domain.PostComment{
		ID:              row.ID,
		PostID:          row.PostID,
		AuthorID:        row.AuthorID,
		AuthorName:      row.AuthorName,
		AuthorRole:      row.AuthorRole,
		ParentID:        pgUUIDToStrPtr(row.ParentID),
		ReplyToUserID:   replyToUserID,
		ReplyToUserName: replyToUserName,
		Content:         row.Content,
		Reactions:       reactions,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}
}

func mapGetCommentRow(row sqlc.GetPostCommentByIDRow, reactions domain.ReactionSummary) domain.PostComment {
	var replyToUserID *string
	var replyToUserName *string
	if row.ReplyToUserID.Valid {
		idStr := uuid.UUID(row.ReplyToUserID.Bytes).String()
		replyToUserID = &idStr
		if row.ReplyToUserName != "" {
			name := row.ReplyToUserName
			replyToUserName = &name
		}
	}

	return domain.PostComment{
		ID:              row.ID,
		PostID:          row.PostID,
		AuthorID:        row.AuthorID,
		AuthorName:      row.AuthorName,
		AuthorRole:      row.AuthorRole,
		ParentID:        pgUUIDToStrPtr(row.ParentID),
		ReplyToUserID:   replyToUserID,
		ReplyToUserName: replyToUserName,
		Content:         row.Content,
		Reactions:       reactions,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}
}

func buildCommentThreads(comments []domain.PostComment) []domain.PostCommentThread {
	if len(comments) == 0 {
		return make([]domain.PostCommentThread, 0)
	}

	threads := make([]domain.PostCommentThread, 0)
	threadIndexMap := make(map[string]int)

	for _, c := range comments {
		if c.ParentID == nil {
			threadIndexMap[c.ID] = len(threads)
			threads = append(threads, domain.PostCommentThread{
				PostComment: c,
				Replies:     make([]domain.PostComment, 0),
			})
		}
	}

	for _, c := range comments {
		if c.ParentID != nil {
			if idx, ok := threadIndexMap[*c.ParentID]; ok {
				threads[idx].Replies = append(threads[idx].Replies, c)
			} else {
				threadIndexMap[c.ID] = len(threads)
				threads = append(threads, domain.PostCommentThread{
					PostComment: c,
					Replies:     make([]domain.PostComment, 0),
				})
			}
		}
	}

	return threads
}

func cleanPublicNotificationMetadata(raw []byte) map[string]interface{} {
	meta := make(map[string]interface{})
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &meta)
	}
	delete(meta, "_actorIds")
	if rawRecent, ok := meta["recentActors"]; ok && rawRecent != nil {
		if b, err := json.Marshal(rawRecent); err == nil {
			var actors []domain.NotificationActorSummary
			if err := json.Unmarshal(b, &actors); err == nil {
				meta["recentActors"] = actors
			}
		}
	}
	return meta
}

func mapNotificationRow(row sqlc.ListNotificationsByRecipientRow) domain.NotificationItem {
	var actorID *string
	var actorName *string
	var actorRole *string
	if row.ActorID.Valid {
		idStr := uuid.UUID(row.ActorID.Bytes).String()
		actorID = &idStr
		if row.ActorName != "" {
			name := row.ActorName
			actorName = &name
		}
		if row.ActorRole.Valid && row.ActorRole.String != "" {
			role := row.ActorRole.String
			actorRole = &role
		}
	}

	var reactionType *domain.ReactionType
	if row.ReactionType.Valid && row.ReactionType.String != "" {
		rt := domain.ReactionType(row.ReactionType.String)
		reactionType = &rt
	}

	meta := cleanPublicNotificationMetadata(row.Metadata)

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
		ActorName:        actorName,
		ActorRole:        actorRole,
		GroupKey:         row.GroupKey,
		ActorCount:       actorCount,
		Category:         domain.NotificationCategory(row.Category),
		NotificationType: domain.PostNotificationType(row.NotificationType),
		PostID:           pgUUIDToStrPtr(row.PostID),
		CommentID:        pgUUIDToStrPtr(row.CommentID),
		ReactionType:     reactionType,
		Excerpt:          row.Excerpt,
		Metadata:         meta,
		IsRead:           row.IsRead,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        updatedAt,
	}
}

func mapGetNotificationRow(row sqlc.GetNotificationByIDRow) domain.NotificationItem {
	var actorID *string
	var actorName *string
	var actorRole *string
	if row.ActorID.Valid {
		idStr := uuid.UUID(row.ActorID.Bytes).String()
		actorID = &idStr
		if row.ActorName != "" {
			name := row.ActorName
			actorName = &name
		}
		if row.ActorRole.Valid && row.ActorRole.String != "" {
			role := row.ActorRole.String
			actorRole = &role
		}
	}

	var reactionType *domain.ReactionType
	if row.ReactionType.Valid && row.ReactionType.String != "" {
		rt := domain.ReactionType(row.ReactionType.String)
		reactionType = &rt
	}

	meta := cleanPublicNotificationMetadata(row.Metadata)

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
		ActorName:        actorName,
		ActorRole:        actorRole,
		GroupKey:         row.GroupKey,
		ActorCount:       actorCount,
		Category:         domain.NotificationCategory(row.Category),
		NotificationType: domain.PostNotificationType(row.NotificationType),
		PostID:           pgUUIDToStrPtr(row.PostID),
		CommentID:        pgUUIDToStrPtr(row.CommentID),
		ReactionType:     reactionType,
		Excerpt:          row.Excerpt,
		Metadata:         meta,
		IsRead:           row.IsRead,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        updatedAt,
	}
}

// ============================================================================
// Post CRUD
// ============================================================================

func (r *PostRepository) CreatePost(ctx context.Context, input domain.CreatePostInput) (*domain.PostDetail, error) {
	if _, err := parseUUID(input.AuthorID); err != nil {
		return nil, domain.ErrNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	postRow, err := q.CreatePost(ctx, sqlc.CreatePostParams{
		AuthorID: input.AuthorID,
		Content:  input.Content,
	})
	if err != nil {
		return nil, err
	}

	for i, mediaID := range input.MediaIDs {
		if err := q.AttachMediaToPost(ctx, sqlc.AttachMediaToPostParams{
			PostID:   toPgUUID(postRow.ID),
			Position: int32(i),
			ID:       mediaID,
		}); err != nil {
			return nil, err
		}
	}

	for i, prodID := range input.ReferredProductIDs {
		if err := q.InsertPostReferredProduct(ctx, sqlc.InsertPostReferredProductParams{
			PostID:    postRow.ID,
			ProductID: prodID,
			Position:  int32(i),
		}); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.GetPostByID(ctx, postRow.ID, &input.AuthorID)
}

func (r *PostRepository) GetPostByID(ctx context.Context, postID string, viewerUserID *string) (*domain.PostDetail, error) {
	if _, err := parseUUID(postID); err != nil {
		return nil, domain.ErrPostNotFound
	}

	q := sqlc.New(r.db)
	postRow, err := q.GetPostByID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrPostNotFound
		}
		return nil, err
	}

	postUUID := toPgUUID(postID)

	mediaRows, err := q.ListMediaByPostID(ctx, postUUID)
	if err != nil {
		return nil, err
	}
	media := make([]domain.PostMediaAttachment, 0, len(mediaRows))
	for _, m := range mediaRows {
		media = append(media, toDomainPostMediaAttachment(m))
	}

	prodRows, err := q.ListReferredProductsByPostID(ctx, postID)
	if err != nil {
		return nil, err
	}
	prods := make([]domain.ReferredProductCard, 0, len(prodRows))
	for _, p := range prodRows {
		prods = append(prods, toDomainReferredProductCard(p))
	}

	postReactionRows, err := q.GetPostReactionCounts(ctx, postID)
	if err != nil {
		return nil, err
	}
	reactionItems := make([]reactionCountItem, 0, len(postReactionRows))
	for _, pr := range postReactionRows {
		reactionItems = append(reactionItems, reactionCountItem{
			ReactionType: pr.ReactionType,
			Count:        pr.Count,
		})
	}

	var viewerReaction *domain.ReactionType
	if viewerUserID != nil && *viewerUserID != "" {
		if _, err := parseUUID(*viewerUserID); err == nil {
			vr, err := q.GetUserPostReaction(ctx, sqlc.GetUserPostReactionParams{
				PostID: postID,
				UserID: *viewerUserID,
			})
			if err == nil {
				rt := domain.ReactionType(vr)
				viewerReaction = &rt
			}
		}
	}
	reactions := aggregateReactionSummary(reactionItems, viewerReaction)

	commentRows, err := q.ListCommentsByPostID(ctx, postID)
	if err != nil {
		return nil, err
	}

	var threads []domain.PostCommentThread
	if len(commentRows) > 0 {
		commentIDs := make([]string, 0, len(commentRows))
		for _, c := range commentRows {
			commentIDs = append(commentIDs, c.ID)
		}

		commentRxCounts, err := q.GetBatchCommentReactionCounts(ctx, commentIDs)
		if err != nil {
			return nil, err
		}
		commentRxMap := make(map[string][]reactionCountItem)
		for _, cr := range commentRxCounts {
			commentRxMap[cr.CommentID] = append(commentRxMap[cr.CommentID], reactionCountItem{
				ReactionType: cr.ReactionType,
				Count:        cr.Count,
			})
		}

		userCommentRxMap := make(map[string]domain.ReactionType)
		if viewerUserID != nil && *viewerUserID != "" {
			if _, err := parseUUID(*viewerUserID); err == nil {
				userRxs, err := q.GetBatchUserCommentReactions(ctx, sqlc.GetBatchUserCommentReactionsParams{
					CommentIds: commentIDs,
					UserID:     *viewerUserID,
				})
				if err == nil {
					for _, ur := range userRxs {
						userCommentRxMap[ur.CommentID] = domain.ReactionType(ur.ReactionType)
					}
				}
			}
		}

		domainComments := make([]domain.PostComment, 0, len(commentRows))
		for _, c := range commentRows {
			var userRx *domain.ReactionType
			if rx, ok := userCommentRxMap[c.ID]; ok {
				userRx = &rx
			}
			cRxSummary := aggregateReactionSummary(commentRxMap[c.ID], userRx)
			domainComments = append(domainComments, mapCommentRow(c, cRxSummary))
		}
		threads = buildCommentThreads(domainComments)
	} else {
		threads = make([]domain.PostCommentThread, 0)
	}

	return &domain.PostDetail{
		PostItem: domain.PostItem{
			ID:               postRow.ID,
			AuthorID:         postRow.AuthorID,
			AuthorName:       postRow.AuthorName,
			AuthorRole:       postRow.AuthorRole,
			Content:          postRow.Content,
			Media:            media,
			ReferredProducts: prods,
			Reactions:        reactions,
			CommentCount:     int(postRow.CommentCount),
			CreatedAt:        postRow.CreatedAt,
			UpdatedAt:        postRow.UpdatedAt,
		},
		Comments: threads,
	}, nil
}

func (r *PostRepository) ListPosts(ctx context.Context, filter domain.ListPostsFilter) ([]domain.PostItem, int, error) {
	q := sqlc.New(r.db)

	total, err := q.CountPosts(ctx)
	if err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return make([]domain.PostItem, 0), 0, nil
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 10
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	rows, err := q.ListPosts(ctx, sqlc.ListPostsParams{
		QueryLimit:  int32(limit),
		QueryOffset: int32(offset),
	})
	if err != nil {
		return nil, 0, err
	}
	if len(rows) == 0 {
		return make([]domain.PostItem, 0), int(total), nil
	}

	postIDs := make([]string, 0, len(rows))
	for _, p := range rows {
		postIDs = append(postIDs, p.ID)
	}

	mediaRows, err := q.ListMediaByPostIDs(ctx, postIDs)
	if err != nil {
		return nil, 0, err
	}
	mediaMap := make(map[string][]domain.PostMediaAttachment)
	for _, m := range mediaRows {
		if m.PostID.Valid {
			pID := uuid.UUID(m.PostID.Bytes).String()
			mediaMap[pID] = append(mediaMap[pID], toDomainPostMediaAttachment(m))
		}
	}

	prodRows, err := q.ListReferredProductsByPostIDs(ctx, postIDs)
	if err != nil {
		return nil, 0, err
	}
	prodMap := make(map[string][]domain.ReferredProductCard)
	for _, p := range prodRows {
		prodMap[p.PostID] = append(prodMap[p.PostID], toDomainReferredProductCardFromBatch(p))
	}

	postRxRows, err := q.GetBatchPostReactionCounts(ctx, postIDs)
	if err != nil {
		return nil, 0, err
	}
	postRxMap := make(map[string][]reactionCountItem)
	for _, rx := range postRxRows {
		postRxMap[rx.PostID] = append(postRxMap[rx.PostID], reactionCountItem{
			ReactionType: rx.ReactionType,
			Count:        rx.Count,
		})
	}

	userRxMap := make(map[string]domain.ReactionType)
	if filter.ViewerUserID != nil && *filter.ViewerUserID != "" {
		if _, err := parseUUID(*filter.ViewerUserID); err == nil {
			uRxs, err := q.GetBatchUserPostReactions(ctx, sqlc.GetBatchUserPostReactionsParams{
				PostIds: postIDs,
				UserID:  *filter.ViewerUserID,
			})
			if err == nil {
				for _, ur := range uRxs {
					userRxMap[ur.PostID] = domain.ReactionType(ur.ReactionType)
				}
			}
		}
	}

	items := make([]domain.PostItem, 0, len(rows))
	for _, row := range rows {
		media := mediaMap[row.ID]
		if media == nil {
			media = make([]domain.PostMediaAttachment, 0)
		}

		prods := prodMap[row.ID]
		if prods == nil {
			prods = make([]domain.ReferredProductCard, 0)
		}

		var viewerRx *domain.ReactionType
		if rx, ok := userRxMap[row.ID]; ok {
			viewerRx = &rx
		}
		rxSummary := aggregateReactionSummary(postRxMap[row.ID], viewerRx)

		items = append(items, domain.PostItem{
			ID:               row.ID,
			AuthorID:         row.AuthorID,
			AuthorName:       row.AuthorName,
			AuthorRole:       row.AuthorRole,
			Content:          row.Content,
			Media:            media,
			ReferredProducts: prods,
			Reactions:        rxSummary,
			CommentCount:     int(row.CommentCount),
			CreatedAt:        row.CreatedAt,
			UpdatedAt:        row.UpdatedAt,
		})
	}

	return items, int(total), nil
}

func (r *PostRepository) UpdatePost(ctx context.Context, input domain.UpdatePostInput) (*domain.PostDetail, error) {
	if _, err := parseUUID(input.PostID); err != nil {
		return nil, domain.ErrPostNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	_, err = q.GetPostByIDForUpdate(ctx, input.PostID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrPostNotFound
		}
		return nil, err
	}

	_, err = q.UpdatePost(ctx, sqlc.UpdatePostParams{
		ID:      input.PostID,
		Content: input.Content,
	})
	if err != nil {
		return nil, err
	}

	postUUID := toPgUUID(input.PostID)
	if len(input.MediaIDs) > 0 {
		_, err = q.DetachMediaFromPostExcept(ctx, sqlc.DetachMediaFromPostExceptParams{
			PostID:  postUUID,
			KeepIds: input.MediaIDs,
		})
		if err != nil {
			return nil, err
		}
		for i, mediaID := range input.MediaIDs {
			if err := q.AttachMediaToPost(ctx, sqlc.AttachMediaToPostParams{
				PostID:   postUUID,
				Position: int32(i),
				ID:       mediaID,
			}); err != nil {
				return nil, err
			}
		}
	} else {
		_, err = q.DeletePostMediaByPostID(ctx, postUUID)
		if err != nil {
			return nil, err
		}
	}

	if err := q.DeletePostReferredProducts(ctx, input.PostID); err != nil {
		return nil, err
	}
	for i, prodID := range input.ReferredProductIDs {
		if err := q.InsertPostReferredProduct(ctx, sqlc.InsertPostReferredProductParams{
			PostID:    input.PostID,
			ProductID: prodID,
			Position:  int32(i),
		}); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.GetPostByID(ctx, input.PostID, nil)
}

func (r *PostRepository) DeletePost(ctx context.Context, postID string) error {
	if _, err := parseUUID(postID); err != nil {
		return domain.ErrPostNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	_, err = q.GetPostByIDForUpdate(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrPostNotFound
		}
		return err
	}

	if err := q.DeletePost(ctx, postID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// ============================================================================
// Media
// ============================================================================

func (r *PostRepository) CreatePendingMedia(ctx context.Context, uploaderID string, objectKey string, fileType domain.PostMediaType, fileName string, fileSize int64, mimeType string) (*domain.PostMediaAttachment, error) {
	if _, err := parseUUID(uploaderID); err != nil {
		return nil, domain.ErrNotFound
	}

	q := sqlc.New(r.db)
	row, err := q.CreatePostMedia(ctx, sqlc.CreatePostMediaParams{
		PostID:     pgtype.UUID{Valid: false},
		UploaderID: uploaderID,
		ObjectKey:  objectKey,
		FileType:   string(fileType),
		FileName:   fileName,
		FileSize:   fileSize,
		MimeType:   mimeType,
		Position:   0,
	})
	if err != nil {
		return nil, err
	}

	m := toDomainPostMediaAttachment(row)
	return &m, nil
}

func (r *PostRepository) GetMediaByID(ctx context.Context, mediaID string) (*domain.PostMediaAttachment, error) {
	if _, err := parseUUID(mediaID); err != nil {
		return nil, domain.ErrPostMediaNotFound
	}

	q := sqlc.New(r.db)
	row, err := q.GetPostMediaByID(ctx, mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrPostMediaNotFound
		}
		return nil, err
	}

	m := toDomainPostMediaAttachment(row)
	return &m, nil
}

func (r *PostRepository) GetMediaByIDs(ctx context.Context, mediaIDs []string) ([]domain.PostMediaAttachment, error) {
	if len(mediaIDs) == 0 {
		return make([]domain.PostMediaAttachment, 0), nil
	}

	q := sqlc.New(r.db)
	rows, err := q.ListPostMediaByIDs(ctx, mediaIDs)
	if err != nil {
		return nil, err
	}

	items := make([]domain.PostMediaAttachment, 0, len(rows))
	for _, row := range rows {
		items = append(items, toDomainPostMediaAttachment(row))
	}
	return items, nil
}

func (r *PostRepository) DeleteMedia(ctx context.Context, mediaID string) (string, error) {
	if _, err := parseUUID(mediaID); err != nil {
		return "", domain.ErrPostMediaNotFound
	}

	q := sqlc.New(r.db)
	objKey, err := q.DeletePostMediaByID(ctx, mediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", domain.ErrPostMediaNotFound
		}
		return "", err
	}
	return objKey, nil
}

// ============================================================================
// Reactions
// ============================================================================

func (r *CatalogRepository) CountActiveProductsByIDs(ctx context.Context, productIDs []string) (int, error) {
	if len(productIDs) == 0 {
		return 0, nil
	}
	count, err := r.q.CountActiveProductsByIDs(ctx, productIDs)
	if err != nil {
		return 0, err
	}
	return int(count), nil
}

func (r *PostRepository) SetPostReaction(ctx context.Context, postID string, userID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
	if _, err := parseUUID(postID); err != nil {
		return nil, nil, domain.ErrPostNotFound
	}
	if _, err := parseUUID(userID); err != nil {
		return nil, nil, domain.ErrPostNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	_, err = q.GetPostByIDForUpdate(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, domain.ErrPostNotFound
		}
		return nil, nil, err
	}

	var prevReaction *domain.ReactionType
	prevRxStr, err := q.GetUserPostReaction(ctx, sqlc.GetUserPostReactionParams{
		PostID: postID,
		UserID: userID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, err
	}
	if err == nil && prevRxStr != "" {
		rx := domain.ReactionType(prevRxStr)
		prevReaction = &rx
	}

	if reaction != nil {
		_, err = q.UpsertPostReaction(ctx, sqlc.UpsertPostReactionParams{
			PostID:       postID,
			UserID:       userID,
			ReactionType: string(*reaction),
		})
		if err != nil {
			return nil, nil, err
		}
	} else {
		err = q.DeletePostReaction(ctx, sqlc.DeletePostReactionParams{
			PostID: postID,
			UserID: userID,
		})
		if err != nil {
			return nil, nil, err
		}
	}

	countsRows, err := q.GetPostReactionCounts(ctx, postID)
	if err != nil {
		return nil, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	rxItems := make([]reactionCountItem, 0, len(countsRows))
	for _, c := range countsRows {
		rxItems = append(rxItems, reactionCountItem{
			ReactionType: c.ReactionType,
			Count:        c.Count,
		})
	}

	summary := aggregateReactionSummary(rxItems, reaction)
	return &summary, prevReaction, nil
}

func (r *PostRepository) SetCommentReaction(ctx context.Context, commentID string, userID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
	if _, err := parseUUID(commentID); err != nil {
		return nil, nil, domain.ErrPostCommentNotFound
	}
	if _, err := parseUUID(userID); err != nil {
		return nil, nil, domain.ErrPostCommentNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	_, err = q.GetPostCommentByIDForUpdate(ctx, commentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, domain.ErrPostCommentNotFound
		}
		return nil, nil, err
	}

	var prevReaction *domain.ReactionType
	prevRxStr, err := q.GetUserCommentReaction(ctx, sqlc.GetUserCommentReactionParams{
		CommentID: commentID,
		UserID:    userID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, err
	}
	if err == nil && prevRxStr != "" {
		rx := domain.ReactionType(prevRxStr)
		prevReaction = &rx
	}

	if reaction != nil {
		_, err = q.UpsertCommentReaction(ctx, sqlc.UpsertCommentReactionParams{
			CommentID:    commentID,
			UserID:       userID,
			ReactionType: string(*reaction),
		})
		if err != nil {
			return nil, nil, err
		}
	} else {
		err = q.DeleteCommentReaction(ctx, sqlc.DeleteCommentReactionParams{
			CommentID: commentID,
			UserID:    userID,
		})
		if err != nil {
			return nil, nil, err
		}
	}

	countsRows, err := q.GetCommentReactionCounts(ctx, commentID)
	if err != nil {
		return nil, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	rxItems := make([]reactionCountItem, 0, len(countsRows))
	for _, c := range countsRows {
		rxItems = append(rxItems, reactionCountItem{
			ReactionType: c.ReactionType,
			Count:        c.Count,
		})
	}

	summary := aggregateReactionSummary(rxItems, reaction)
	return &summary, prevReaction, nil
}

// ============================================================================
// Comments
// ============================================================================

func (r *PostRepository) CreateComment(ctx context.Context, input domain.CreateCommentInput) (*domain.PostComment, error) {
	if _, err := parseUUID(input.PostID); err != nil {
		return nil, domain.ErrPostNotFound
	}
	if _, err := parseUUID(input.AuthorID); err != nil {
		return nil, domain.ErrNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	_, err = q.GetPostByIDForUpdate(ctx, input.PostID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrPostNotFound
		}
		return nil, err
	}

	var actualParentID *string
	var actualReplyToUserID *string

	if input.ParentCommentID != nil && *input.ParentCommentID != "" {
		if _, err := parseUUID(*input.ParentCommentID); err != nil {
			return nil, domain.ErrPostCommentNotFound
		}
		target, err := q.GetPostCommentByID(ctx, *input.ParentCommentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, domain.ErrPostCommentNotFound
			}
			return nil, err
		}
		if target.PostID != input.PostID {
			return nil, domain.ErrPostCommentNotFound
		}

		if !target.ParentID.Valid {
			// Target is a level 1 comment
			actualParentID = &target.ID
			actualReplyToUserID = &target.AuthorID
		} else {
			// Target is already a level 2 comment: flatten to the root level 1 parent
			pID := uuid.UUID(target.ParentID.Bytes).String()
			actualParentID = &pID
			actualReplyToUserID = &target.AuthorID
		}
	}

	createdComment, err := q.CreatePostComment(ctx, sqlc.CreatePostCommentParams{
		PostID:        input.PostID,
		AuthorID:      input.AuthorID,
		ParentID:      toPgUUIDPtr(actualParentID),
		ReplyToUserID: toPgUUIDPtr(actualReplyToUserID),
		Content:       input.Content,
	})
	if err != nil {
		return nil, err
	}

	fullCommentRow, err := q.GetPostCommentByID(ctx, createdComment.ID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	comment := mapGetCommentRow(fullCommentRow, domain.ReactionSummary{})
	return &comment, nil
}

func (r *PostRepository) DeleteComment(ctx context.Context, commentID string) (string, int, error) {
	if _, err := parseUUID(commentID); err != nil {
		return "", 0, domain.ErrPostCommentNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return "", 0, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	c, err := q.GetPostCommentByIDForUpdate(ctx, commentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", 0, domain.ErrPostCommentNotFound
		}
		return "", 0, err
	}

	if err := q.DeletePostComment(ctx, commentID); err != nil {
		return "", 0, err
	}

	count, err := q.CountCommentsByPostID(ctx, c.PostID)
	if err != nil {
		return "", 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return "", 0, err
	}

	return commentID, int(count), nil
}

func (r *PostRepository) GetCommentByID(ctx context.Context, commentID string) (*domain.PostComment, error) {
	if _, err := parseUUID(commentID); err != nil {
		return nil, domain.ErrPostCommentNotFound
	}

	q := sqlc.New(r.db)
	row, err := q.GetPostCommentByID(ctx, commentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrPostCommentNotFound
		}
		return nil, err
	}

	rxRows, err := q.GetCommentReactionCounts(ctx, commentID)
	if err != nil {
		return nil, err
	}
	rxItems := make([]reactionCountItem, 0, len(rxRows))
	for _, cr := range rxRows {
		rxItems = append(rxItems, reactionCountItem{
			ReactionType: cr.ReactionType,
			Count:        cr.Count,
		})
	}
	summary := aggregateReactionSummary(rxItems, nil)

	comment := mapGetCommentRow(row, summary)
	return &comment, nil
}

// ============================================================================
// Notifications
// ============================================================================

func resolveNotificationGroupKey(input domain.CreateNotificationInput) string {
	if gk := strings.TrimSpace(input.GroupKey); gk != "" {
		return gk
	}
	switch input.NotificationType {
	case domain.NotificationTypePostReaction:
		if input.PostID != nil && strings.TrimSpace(*input.PostID) != "" {
			return domain.NotificationGroupKeyPostReaction(*input.PostID)
		}
	case domain.NotificationTypeCommentReaction:
		if input.CommentID != nil && strings.TrimSpace(*input.CommentID) != "" {
			return domain.NotificationGroupKeyCommentReaction(*input.CommentID)
		}
	case domain.NotificationTypePostComment:
		if input.PostID != nil && strings.TrimSpace(*input.PostID) != "" {
			return domain.NotificationGroupKeyPostComment(*input.PostID)
		}
	case domain.NotificationTypeCommentReply:
		if input.CommentID != nil && strings.TrimSpace(*input.CommentID) != "" {
			return domain.NotificationGroupKeyCommentReply(*input.CommentID)
		}
	}
	return ""
}

func parseNotificationMetadata(raw []byte) (map[string]interface{}, []domain.NotificationActorSummary, []string) {
	meta := make(map[string]interface{})
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &meta)
	}

	var recentActors []domain.NotificationActorSummary
	if rawRecent, ok := meta["recentActors"]; ok && rawRecent != nil {
		if b, err := json.Marshal(rawRecent); err == nil {
			_ = json.Unmarshal(b, &recentActors)
		}
	}

	var actorIDs []string
	seen := make(map[string]bool)
	if rawIDs, ok := meta["_actorIds"]; ok && rawIDs != nil {
		if b, err := json.Marshal(rawIDs); err == nil {
			var parsed []string
			if err := json.Unmarshal(b, &parsed); err == nil {
				for _, id := range parsed {
					trimmed := strings.TrimSpace(id)
					if trimmed != "" && !seen[trimmed] {
						seen[trimmed] = true
						actorIDs = append(actorIDs, trimmed)
					}
				}
			}
		}
	}
	for _, a := range recentActors {
		trimmed := strings.TrimSpace(a.ID)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			actorIDs = append(actorIDs, trimmed)
		}
	}

	return meta, recentActors, actorIDs
}

func resolveActorSummary(ctx context.Context, q *sqlc.Queries, actorID *string, fallbackMeta map[string]interface{}) *domain.NotificationActorSummary {
	if actorID == nil || strings.TrimSpace(*actorID) == "" {
		return nil
	}
	id := strings.TrimSpace(*actorID)
	if _, err := parseUUID(id); err != nil {
		return nil
	}

	if fallbackMeta != nil {
		if rawRecent, ok := fallbackMeta["recentActors"]; ok && rawRecent != nil {
			if b, err := json.Marshal(rawRecent); err == nil {
				var parsed []domain.NotificationActorSummary
				if err := json.Unmarshal(b, &parsed); err == nil {
					for _, a := range parsed {
						if a.ID == id && strings.TrimSpace(a.Name) != "" {
							role := strings.TrimSpace(a.Role)
							if role == "" {
								role = "customer"
							}
							return &domain.NotificationActorSummary{
								ID:   id,
								Name: strings.TrimSpace(a.Name),
								Role: role,
							}
						}
					}
				}
			}
		}
	}

	if rows, err := q.GetUserDisplayNames(ctx, []string{id}); err == nil && len(rows) > 0 {
		name := strings.TrimSpace(rows[0].DisplayName)
		if name == "" {
			name = "Khách hàng"
		}
		role := strings.TrimSpace(rows[0].Role)
		if role == "" {
			role = "customer"
		}
		return &domain.NotificationActorSummary{
			ID:   rows[0].ID,
			Name: name,
			Role: role,
		}
	}

	return &domain.NotificationActorSummary{
		ID:   id,
		Name: "Khách hàng",
		Role: "customer",
	}
}

func mergeNotificationRollupActors(
	existingRecent []domain.NotificationActorSummary,
	existingActorIDs []string,
	existingActorCount int,
	currentActor *domain.NotificationActorSummary,
) ([]domain.NotificationActorSummary, []string, int) {
	seen := make(map[string]bool)
	var actorIDs []string
	for _, id := range existingActorIDs {
		trimmed := strings.TrimSpace(id)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			actorIDs = append(actorIDs, trimmed)
		}
	}
	for _, a := range existingRecent {
		trimmed := strings.TrimSpace(a.ID)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			actorIDs = append(actorIDs, trimmed)
		}
	}

	baseCount := existingActorCount
	if len(actorIDs) > baseCount {
		baseCount = len(actorIDs)
	}
	if baseCount < 0 {
		baseCount = 0
	}

	if currentActor == nil {
		if baseCount <= 0 {
			baseCount = 1
		}
		recent := existingRecent
		if len(recent) > 2 {
			recent = recent[:2]
		}
		return recent, actorIDs, baseCount
	}

	newCount := baseCount
	if !seen[currentActor.ID] {
		seen[currentActor.ID] = true
		actorIDs = append(actorIDs, currentActor.ID)
		newCount = baseCount + 1
		if len(actorIDs) > newCount {
			newCount = len(actorIDs)
		}
	} else if newCount <= 0 {
		newCount = 1
	}

	recent := make([]domain.NotificationActorSummary, 0, 2)
	recent = append(recent, *currentActor)
	for _, a := range existingRecent {
		if a.ID != currentActor.ID {
			recent = append(recent, a)
			if len(recent) == 2 {
				break
			}
		}
	}

	return recent, actorIDs, newCount
}

func (r *PostRepository) CreateNotification(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
	if _, err := parseUUID(input.RecipientID); err != nil {
		return nil, domain.ErrNotFound
	}

	category := string(input.Category)
	if category == "" {
		category = string(domain.NotificationCategoryPost)
	}

	groupKey := resolveNotificationGroupKey(input)

	var rxType *string
	if input.ReactionType != nil {
		s := string(*input.ReactionType)
		rxType = &s
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	currentActor := resolveActorSummary(ctx, q, input.ActorID, input.Metadata)

	var savedID string
	if groupKey != "" {
		existing, err := q.GetUnreadNotificationByGroupKeyForUpdate(ctx, sqlc.GetUnreadNotificationByGroupKeyForUpdateParams{
			RecipientID: input.RecipientID,
			GroupKey:    groupKey,
		})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}

		if err == nil {
			metaMap, existingRecent, existingActorIDs := parseNotificationMetadata(existing.Metadata)
			for k, v := range input.Metadata {
				if k != "recentActors" && k != "_actorIds" {
					metaMap[k] = v
				}
			}

			if len(existingRecent) == 0 && existing.ActorID.Valid {
				prevID := uuid.UUID(existing.ActorID.Bytes).String()
				if prevActor := resolveActorSummary(ctx, q, &prevID, nil); prevActor != nil {
					existingRecent = []domain.NotificationActorSummary{*prevActor}
					existingActorIDs = append(existingActorIDs, prevActor.ID)
				}
			}

			mergedRecent, mergedActorIDs, newCount := mergeNotificationRollupActors(
				existingRecent,
				existingActorIDs,
				int(existing.ActorCount),
				currentActor,
			)
			metaMap["recentActors"] = mergedRecent
			metaMap["_actorIds"] = mergedActorIDs

			metaBytes := []byte("{}")
			if b, mErr := json.Marshal(metaMap); mErr == nil {
				metaBytes = b
			}

			updatedRow, err := q.UpdateUnreadNotificationRollup(ctx, sqlc.UpdateUnreadNotificationRollupParams{
				ID:               existing.ID,
				ActorID:          toPgUUIDPtr(input.ActorID),
				ActorCount:       int32(newCount),
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
			savedID = updatedRow.ID
		} else {
			metaMap := make(map[string]interface{})
			for k, v := range input.Metadata {
				metaMap[k] = v
			}
			if currentActor != nil {
				metaMap["recentActors"] = []domain.NotificationActorSummary{*currentActor}
				metaMap["_actorIds"] = []string{currentActor.ID}
			}

			actorCount := int32(input.ActorCount)
			if actorCount <= 0 {
				actorCount = 1
			}

			metaBytes := []byte("{}")
			if b, mErr := json.Marshal(metaMap); mErr == nil {
				metaBytes = b
			}

			createdRow, err := q.UpsertUnreadNotification(ctx, sqlc.UpsertUnreadNotificationParams{
				RecipientID:      input.RecipientID,
				ActorID:          toPgUUIDPtr(input.ActorID),
				GroupKey:         groupKey,
				ActorCount:       actorCount,
				Category:         category,
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
			savedID = createdRow.ID
		}
	} else {
		metaMap := make(map[string]interface{})
		for k, v := range input.Metadata {
			metaMap[k] = v
		}
		if currentActor != nil {
			metaMap["recentActors"] = []domain.NotificationActorSummary{*currentActor}
			metaMap["_actorIds"] = []string{currentActor.ID}
		}

		actorCount := int32(input.ActorCount)
		if actorCount <= 0 {
			actorCount = 1
		}

		metaBytes := []byte("{}")
		if b, mErr := json.Marshal(metaMap); mErr == nil {
			metaBytes = b
		}

		row, err := q.CreateNotification(ctx, sqlc.CreateNotificationParams{
			RecipientID:      input.RecipientID,
			ActorID:          toPgUUIDPtr(input.ActorID),
			GroupKey:         "",
			ActorCount:       actorCount,
			Category:         category,
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
		savedID = row.ID
	}

	fullRow, err := q.GetNotificationByID(ctx, savedID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	item := mapGetNotificationRow(fullRow)
	return &item, nil
}

func (r *PostRepository) DeleteUnreadNotificationByGroupKey(ctx context.Context, recipientID, groupKey string) error {
	if _, err := parseUUID(recipientID); err != nil {
		return nil
	}
	trimmedKey := strings.TrimSpace(groupKey)
	if trimmedKey == "" {
		return nil
	}
	q := sqlc.New(r.db)
	return q.DeleteUnreadNotificationByGroupKey(ctx, sqlc.DeleteUnreadNotificationByGroupKeyParams{
		RecipientID: recipientID,
		GroupKey:    trimmedKey,
	})
}

type reactionActorRow struct {
	UserID       string
	ReactionType string
	Role         string
	DisplayName  string
}

func (r *PostRepository) SyncUnreadReactionNotification(ctx context.Context, recipientID, groupKey string, postID, commentID *string) (*domain.NotificationItem, error) {
	if _, err := parseUUID(recipientID); err != nil {
		return nil, nil
	}

	trimmedKey := strings.TrimSpace(groupKey)
	if trimmedKey == "" {
		if commentID != nil && strings.TrimSpace(*commentID) != "" {
			trimmedKey = domain.NotificationGroupKeyCommentReaction(*commentID)
		} else if postID != nil && strings.TrimSpace(*postID) != "" {
			trimmedKey = domain.NotificationGroupKeyPostReaction(*postID)
		}
	}
	if trimmedKey == "" {
		return nil, nil
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	existing, err := q.GetUnreadNotificationByGroupKeyForUpdate(ctx, sqlc.GetUnreadNotificationByGroupKeyForUpdateParams{
		RecipientID: recipientID,
		GroupKey:    trimmedKey,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	var targetCommentID string
	if commentID != nil && strings.TrimSpace(*commentID) != "" {
		targetCommentID = strings.TrimSpace(*commentID)
	} else if existing.CommentID.Valid {
		targetCommentID = uuid.UUID(existing.CommentID.Bytes).String()
	} else if strings.HasPrefix(trimmedKey, "comment_reaction:") {
		targetCommentID = strings.TrimSpace(strings.TrimPrefix(trimmedKey, "comment_reaction:"))
	}

	var targetPostID string
	if postID != nil && strings.TrimSpace(*postID) != "" {
		targetPostID = strings.TrimSpace(*postID)
	} else if existing.PostID.Valid {
		targetPostID = uuid.UUID(existing.PostID.Bytes).String()
	} else if strings.HasPrefix(trimmedKey, "post_reaction:") {
		targetPostID = strings.TrimSpace(strings.TrimPrefix(trimmedKey, "post_reaction:"))
	}

	var remaining []reactionActorRow
	seenActors := make(map[string]bool)

	if targetCommentID != "" && (commentID != nil || strings.HasPrefix(trimmedKey, "comment_reaction:") || existing.NotificationType == string(domain.NotificationTypeCommentReaction)) {
		rows, err := q.GetDistinctCommentReactionActors(ctx, sqlc.GetDistinctCommentReactionActorsParams{
			CommentID:   targetCommentID,
			RecipientID: recipientID,
		})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if !seenActors[row.UserID] {
				seenActors[row.UserID] = true
				remaining = append(remaining, reactionActorRow{
					UserID:       row.UserID,
					ReactionType: row.ReactionType,
					Role:         row.Role,
					DisplayName:  row.DisplayName,
				})
			}
		}
	} else if targetPostID != "" {
		rows, err := q.GetDistinctPostReactionActors(ctx, sqlc.GetDistinctPostReactionActorsParams{
			PostID:      targetPostID,
			RecipientID: recipientID,
		})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if !seenActors[row.UserID] {
				seenActors[row.UserID] = true
				remaining = append(remaining, reactionActorRow{
					UserID:       row.UserID,
					ReactionType: row.ReactionType,
					Role:         row.Role,
					DisplayName:  row.DisplayName,
				})
			}
		}
	}

	if len(remaining) == 0 {
		if err := q.DeleteUnreadNotificationByGroupKey(ctx, sqlc.DeleteUnreadNotificationByGroupKeyParams{
			RecipientID: recipientID,
			GroupKey:    trimmedKey,
		}); err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return nil, nil
	}

	latest := remaining[0]
	limit := 2
	if len(remaining) < limit {
		limit = len(remaining)
	}
	recentActors := make([]domain.NotificationActorSummary, 0, limit)
	for i := 0; i < limit; i++ {
		name := strings.TrimSpace(remaining[i].DisplayName)
		if name == "" {
			name = "Khách hàng"
		}
		role := strings.TrimSpace(remaining[i].Role)
		if role == "" {
			role = "customer"
		}
		recentActors = append(recentActors, domain.NotificationActorSummary{
			ID:   remaining[i].UserID,
			Name: name,
			Role: role,
		})
	}

	actorIDs := make([]string, 0, len(remaining))
	for _, a := range remaining {
		actorIDs = append(actorIDs, a.UserID)
	}

	metaMap, _, _ := parseNotificationMetadata(existing.Metadata)
	metaMap["recentActors"] = recentActors
	metaMap["_actorIds"] = actorIDs

	metaBytes := []byte("{}")
	if b, mErr := json.Marshal(metaMap); mErr == nil {
		metaBytes = b
	}

	latestRx := latest.ReactionType
	updatedRow, err := q.UpdateUnreadNotificationRollup(ctx, sqlc.UpdateUnreadNotificationRollupParams{
		ID:               existing.ID,
		ActorID:          toPgUUID(latest.UserID),
		ActorCount:       int32(len(remaining)),
		NotificationType: existing.NotificationType,
		PostID:           existing.PostID,
		CommentID:        existing.CommentID,
		ReactionType:     toPgTextPtr(&latestRx),
		Excerpt:          existing.Excerpt,
		Metadata:         metaBytes,
	})
	if err != nil {
		return nil, err
	}

	fullRow, err := q.GetNotificationByID(ctx, updatedRow.ID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	item := mapGetNotificationRow(fullRow)
	return &item, nil
}

func (r *PostRepository) ListNotifications(ctx context.Context, recipientID string, limit, offset int) (*domain.NotificationsListResult, error) {
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
	rows, err := q.ListNotificationsByRecipient(ctx, sqlc.ListNotificationsByRecipientParams{
		RecipientID: recipientID,
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
		items = append(items, mapNotificationRow(row))
	}

	return &domain.NotificationsListResult{
		Items:       items,
		UnreadCount: int(unread),
	}, nil
}

func (r *PostRepository) MarkNotificationRead(ctx context.Context, notificationID string, recipientID string) (*domain.NotificationItem, error) {
	if _, err := parseUUID(notificationID); err != nil {
		return nil, domain.ErrNotificationNotFound
	}
	if _, err := parseUUID(recipientID); err != nil {
		return nil, domain.ErrNotificationNotFound
	}

	q := sqlc.New(r.db)
	_, err := q.MarkNotificationAsRead(ctx, sqlc.MarkNotificationAsReadParams{
		ID:          notificationID,
		RecipientID: recipientID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotificationNotFound
		}
		return nil, err
	}

	fullRow, err := q.GetNotificationByID(ctx, notificationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotificationNotFound
		}
		return nil, err
	}

	item := mapGetNotificationRow(fullRow)
	return &item, nil
}

func (r *PostRepository) MarkAllNotificationsRead(ctx context.Context, recipientID string) error {
	if _, err := parseUUID(recipientID); err != nil {
		return nil
	}

	q := sqlc.New(r.db)
	return q.MarkAllNotificationsAsRead(ctx, recipientID)
}

func (r *PostRepository) GetUnreadNotificationCount(ctx context.Context, recipientID string) (int, error) {
	if _, err := parseUUID(recipientID); err != nil {
		return 0, nil
	}

	q := sqlc.New(r.db)
	count, err := q.CountUnreadNotifications(ctx, recipientID)
	if err != nil {
		return 0, err
	}
	return int(count), nil
}
