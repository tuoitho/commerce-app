package review

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"regexp"
	"time"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/storage"
)

var hex64Regex = regexp.MustCompile(`^[0-9a-f]{64}$`)

type FileUpload struct {
	Index        int
	Reader       io.Reader
	DeclaredSize int64
}

type MediaManifestItem struct {
	Source      string // "upload" or "existing"
	UploadIndex *int
	SHA256      string
	SizeBytes   int64
	MediaID     string
}

type CreateInput struct {
	OrderID     string
	OrderItemID string
	UserID      string
	Rating      int
	RatingSet   bool
	Comment     string
	Media       []MediaManifestItem
	Files       []FileUpload
}

type EditInput struct {
	ReviewID  string
	UserID    string
	Rating    int
	RatingSet bool
	Comment   string
	Media     []MediaManifestItem
	Files     []FileUpload
}

type Dependencies struct {
	Reviews     domain.ReviewRepository
	Storage     storage.Storage
	Logger      *slog.Logger
	GracePeriod time.Duration
}

type UseCase struct {
	reviews     domain.ReviewRepository
	storage     storage.Storage
	logger      *slog.Logger
	gracePeriod time.Duration
}

func New(deps Dependencies) *UseCase {
	gp := deps.GracePeriod
	if gp <= 0 {
		gp = 60 * time.Minute
	}
	return &UseCase{
		reviews:     deps.Reviews,
		storage:     deps.Storage,
		logger:      deps.Logger,
		gracePeriod: gp,
	}
}

func (uc *UseCase) CreateReview(ctx context.Context, in CreateInput) (*domain.Review, error) {
	if _, err := uuid.Parse(in.OrderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(in.OrderItemID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	// 1. Validate rating and comment
	fields := make(map[string]string)
	if !in.RatingSet || in.Rating < 1 || in.Rating > 5 {
		fields["rating"] = "Điểm đánh giá phải từ 1 đến 5 sao"
	}
	trimmedComment := domain.NormalizeComment(in.Comment)
	if len(trimmedComment) > domain.MaxReviewCommentLength {
		fields["comment"] = "Nhận xét không được vượt quá 1000 ký tự"
	}

	// 2. Validate media count
	if len(in.Media) > domain.MaxReviewMediaCount {
		fields["media"] = "Tối đa 5 tệp và không quá 2 video"
	}

	// Check file index references
	seenIndices := make(map[int]bool)
	for _, m := range in.Media {
		if m.Source != "upload" || m.UploadIndex == nil {
			fields["media"] = "Dữ liệu tệp không hợp lệ"
			break
		}
		idx := *m.UploadIndex
		if idx < 0 || idx >= len(in.Files) {
			fields["media"] = "Chỉ số tệp không hợp lệ"
			break
		}
		if seenIndices[idx] {
			fields["media"] = "Chỉ số tệp bị trùng lặp"
			break
		}
		seenIndices[idx] = true
	}

	if len(fields) == 0 && len(in.Media) > 0 && len(seenIndices) != len(in.Files) {
		fields["media"] = "Mỗi tệp tải lên phải được tham chiếu đúng một lần"
	}

	if len(fields) > 0 {
		return nil, domain.NewValidationError(fields)
	}

	// 3. Check eligibility before processing files
	if uc.reviews != nil {
		_, err := uc.reviews.CheckEligibility(ctx, in.OrderID, in.OrderItemID, in.UserID)
		if err != nil {
			return nil, err
		}
	}

	// Process and stream uploaded files
	opID := uuid.NewString()
	var uploadedKeys []string
	cleanupUploaded := func() {
		for _, key := range uploadedKeys {
			_ = uc.storage.DeleteObject(context.Background(), key)
		}
	}

	var mediaList []domain.ReviewMedia
	videoCount := 0

	for i, m := range in.Media {
		idx := *m.UploadIndex
		file := in.Files[idx]

		// Check sha256 pattern
		if !hex64Regex.MatchString(m.SHA256) {
			fields[fmt.Sprintf("files.%d", idx)] = "Mã băm tệp không hợp lệ"
			continue
		}

		// Read and compute hash/size and detect MIME
		var buf bytes.Buffer
		hasher := sha256.New()
		multiWriter := io.MultiWriter(&buf, hasher)

		written, err := io.Copy(multiWriter, file.Reader)
		if err != nil {
			cleanupUploaded()
			return nil, fmt.Errorf("read file data: %w", err)
		}

		actualHash := hex.EncodeToString(hasher.Sum(nil))
		if actualHash != m.SHA256 || written != m.SizeBytes {
			fields[fmt.Sprintf("files.%d", idx)] = "Thông tin kích thước hoặc mã băm tệp không khớp"
			continue
		}

		data := buf.Bytes()
		detectedMIME := DetectMIME(data)
		mediaType, allowed := ClassifyMediaType(detectedMIME)
		if !allowed {
			fields[fmt.Sprintf("files.%d", idx)] = "Định dạng tệp không được hỗ trợ"
			continue
		}

		if mediaType == domain.MediaTypeImage && written > domain.MaxReviewImageSizeBytes {
			fields[fmt.Sprintf("files.%d", idx)] = "Kích thước ảnh không được vượt quá 5MB"
			continue
		}
		if mediaType == domain.MediaTypeVideo {
			videoCount++
			if written > domain.MaxReviewVideoSizeBytes {
				fields[fmt.Sprintf("files.%d", idx)] = "Kích thước video không được vượt quá 50MB"
				continue
			}
		}

		if videoCount > domain.MaxReviewVideoCount {
			fields["media"] = "Tối đa 5 tệp và không quá 2 video"
			continue
		}

		// Stream to MinIO
		objectKey := fmt.Sprintf("reviews/%s/%s", opID, uuid.NewString())
		_, err = uc.storage.PutObject(ctx, objectKey, bytes.NewReader(data), written, detectedMIME)
		if err != nil {
			cleanupUploaded()
			return nil, fmt.Errorf("upload file to storage: %w", err)
		}
		uploadedKeys = append(uploadedKeys, objectKey)

		mediaList = append(mediaList, domain.ReviewMedia{
			ObjectKey: objectKey,
			Type:      mediaType,
			MimeType:  detectedMIME,
			SizeBytes: written,
			Position:  i,
		})
	}

	if len(fields) > 0 {
		cleanupUploaded()
		return nil, domain.NewValidationError(fields)
	}

	// Commit review in database
	review, err := uc.reviews.CreateReview(ctx, in.OrderID, in.OrderItemID, in.UserID, in.Rating, trimmedComment, mediaList)
	if err != nil {
		cleanupUploaded()
		return nil, err
	}

	return review, nil
}

func (uc *UseCase) GetOwnedReview(ctx context.Context, reviewID, userID string) (*domain.Review, error) {
	if _, err := uuid.Parse(reviewID); err != nil {
		return nil, domain.ErrReviewNotFound
	}
	return uc.reviews.GetReviewForUser(ctx, reviewID, userID)
}

func (uc *UseCase) ListOwnedReviews(ctx context.Context, userID string, page, limit int) ([]domain.OwnedReviewHistoryItem, int64, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return []domain.OwnedReviewHistoryItem{}, 0, nil
	}
	return uc.reviews.ListOwnerReviews(ctx, userID, page, limit)
}

func (uc *UseCase) ListAdminReviews(ctx context.Context, page, limit int, sort, productID, search string) ([]domain.AdminReviewItem, int64, error) {
	if sort == "" {
		sort = "latest"
	}
	if sort != "latest" && sort != "most_helpful" && sort != "most_unhelpful" {
		return nil, 0, domain.NewValidationError(map[string]string{"sort": "Giá trị sắp xếp không hợp lệ (latest, most_helpful, most_unhelpful)"})
	}
	if productID != "" {
		if _, err := uuid.Parse(productID); err != nil {
			return nil, 0, domain.NewValidationError(map[string]string{"productId": "Mã sản phẩm không hợp lệ"})
		}
	}
	if uc == nil || uc.reviews == nil {
		return []domain.AdminReviewItem{}, 0, nil
	}
	return uc.reviews.ListAdminReviews(ctx, page, limit, sort, productID, search)
}

func (uc *UseCase) VoteReview(ctx context.Context, reviewID, userID, voteType string) (*domain.ReviewVoteResult, error) {
	if uc == nil || uc.reviews == nil {
		return nil, domain.ErrReviewNotFound
	}
	if _, err := uuid.Parse(reviewID); err != nil {
		return nil, domain.NewValidationError(map[string]string{"reviewId": "Mã đánh giá không hợp lệ"})
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrReviewNotFound
	}
	if voteType != "helpful" && voteType != "unhelpful" {
		return nil, domain.NewValidationError(map[string]string{"vote": "Loại biểu quyết phải là 'helpful' hoặc 'unhelpful'"})
	}
	return uc.reviews.VoteReview(ctx, reviewID, userID, voteType == "helpful")
}

func (uc *UseCase) UnvoteReview(ctx context.Context, reviewID, userID string) (*domain.ReviewVoteResult, error) {
	if uc == nil || uc.reviews == nil {
		return nil, domain.ErrReviewNotFound
	}
	if _, err := uuid.Parse(reviewID); err != nil {
		return nil, domain.NewValidationError(map[string]string{"reviewId": "Mã đánh giá không hợp lệ"})
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrReviewNotFound
	}
	return uc.reviews.UnvoteReview(ctx, reviewID, userID)
}

func (uc *UseCase) GetAdminReviewStats(ctx context.Context) (*domain.AdminReviewStats, error) {
	if uc == nil || uc.reviews == nil {
		return &domain.AdminReviewStats{}, nil
	}
	return uc.reviews.GetAdminReviewStats(ctx)
}

func (uc *UseCase) CreateStoreResponse(ctx context.Context, reviewID, adminID, content string) (*domain.AdminStoreReviewResponse, error) {
	if _, err := uuid.Parse(reviewID); err != nil {
		return nil, domain.NewValidationError(map[string]string{"reviewId": "Mã đánh giá không hợp lệ"})
	}
	trimmed, err := domain.NormalizeStoreReviewResponseContent(content)
	if err != nil {
		return nil, err
	}
	return uc.reviews.CreateReviewResponse(ctx, reviewID, adminID, trimmed)
}

func (uc *UseCase) UpdateStoreResponse(ctx context.Context, reviewID, adminID, content string, version int) (*domain.AdminStoreReviewResponse, error) {
	fields := map[string]string{}
	if _, err := uuid.Parse(reviewID); err != nil {
		fields["reviewId"] = "Mã đánh giá không hợp lệ"
	}
	if version < 1 {
		fields["version"] = "Phiên bản phản hồi phải là số nguyên dương"
	}
	trimmed, contentErr := domain.NormalizeStoreReviewResponseContent(content)
	if contentErr != nil {
		fields["content"] = "Nội dung phản hồi phải có từ 1 đến 1000 ký tự"
	}
	if len(fields) > 0 {
		return nil, domain.NewValidationError(fields)
	}
	return uc.reviews.UpdateReviewResponse(ctx, reviewID, adminID, trimmed, version)
}

func (uc *UseCase) EditReview(ctx context.Context, in EditInput) (*domain.Review, error) {
	if _, err := uuid.Parse(in.ReviewID); err != nil {
		return nil, domain.ErrReviewNotFound
	}

	// 1. Get existing review to verify ownership and editability
	existing, err := uc.reviews.GetReviewForUser(ctx, in.ReviewID, in.UserID)
	if err != nil {
		return nil, err
	}
	if existing.EditedAt != nil {
		return nil, domain.ErrReviewEditLimitReached
	}

	// 2. Validate rating and comment
	fields := make(map[string]string)
	if !in.RatingSet || in.Rating < 1 || in.Rating > 5 {
		fields["rating"] = "Điểm đánh giá phải từ 1 đến 5 sao"
	}
	trimmedComment := domain.NormalizeComment(in.Comment)
	if len(trimmedComment) > domain.MaxReviewCommentLength {
		fields["comment"] = "Nhận xét không được vượt quá 1000 ký tự"
	}

	// 3. Validate media count
	if len(in.Media) > domain.MaxReviewMediaCount {
		fields["media"] = "Tối đa 5 tệp và không quá 2 video"
	}

	// Index existing review media by ID
	existingMediaMap := make(map[string]domain.ReviewMedia)
	for _, m := range existing.Media {
		existingMediaMap[m.ID] = m
	}

	seenExistingIDs := make(map[string]bool)
	seenUploadIndices := make(map[int]bool)

	for _, m := range in.Media {
		switch m.Source {
		case "existing":
			if _, err := uuid.Parse(m.MediaID); err != nil {
				fields["media"] = "Mã tệp hiện có không hợp lệ"
				break
			}
			if _, ok := existingMediaMap[m.MediaID]; !ok {
				fields["media"] = "Tệp hiện có không thuộc đánh giá này"
				break
			}
			if seenExistingIDs[m.MediaID] {
				fields["media"] = "Tệp hiện có bị trùng lặp"
				break
			}
			seenExistingIDs[m.MediaID] = true
		case "upload":
			if m.UploadIndex == nil {
				fields["media"] = "Chỉ số tệp không hợp lệ"
				break
			}
			idx := *m.UploadIndex
			if idx < 0 || idx >= len(in.Files) {
				fields["media"] = "Chỉ số tệp không hợp lệ"
				break
			}
			if seenUploadIndices[idx] {
				fields["media"] = "Chỉ số tệp bị trùng lặp"
				break
			}
			seenUploadIndices[idx] = true
		default:
			fields["media"] = "Nguồn tệp không hợp lệ"
		}
	}

	if len(fields) == 0 && len(in.Files) > 0 && len(seenUploadIndices) != len(in.Files) {
		fields["media"] = "Mỗi tệp tải lên phải được tham chiếu đúng một lần"
	}

	if len(fields) > 0 {
		return nil, domain.NewValidationError(fields)
	}

	// Process upload files and build media list
	opID := uuid.NewString()
	var newlyUploadedKeys []string
	cleanupNewUploads := func() {
		for _, key := range newlyUploadedKeys {
			_ = uc.storage.DeleteObject(context.Background(), key)
		}
	}

	var desiredMedia []domain.ReviewMedia
	videoCount := 0

	for i, m := range in.Media {
		if m.Source == "existing" {
			em := existingMediaMap[m.MediaID]
			if em.Type == domain.MediaTypeVideo {
				videoCount++
			}
			desiredMedia = append(desiredMedia, domain.ReviewMedia{
				ObjectKey: em.ObjectKey,
				Type:      em.Type,
				MimeType:  em.MimeType,
				SizeBytes: em.SizeBytes,
				Position:  i,
			})
			continue
		}

		// Upload source
		idx := *m.UploadIndex
		file := in.Files[idx]

		if !hex64Regex.MatchString(m.SHA256) {
			fields[fmt.Sprintf("files.%d", idx)] = "Mã băm tệp không hợp lệ"
			continue
		}

		var buf bytes.Buffer
		hasher := sha256.New()
		multiWriter := io.MultiWriter(&buf, hasher)

		written, err := io.Copy(multiWriter, file.Reader)
		if err != nil {
			cleanupNewUploads()
			return nil, fmt.Errorf("read upload data: %w", err)
		}

		actualHash := hex.EncodeToString(hasher.Sum(nil))
		if actualHash != m.SHA256 || written != m.SizeBytes {
			fields[fmt.Sprintf("files.%d", idx)] = "Thông tin kích thước hoặc mã băm tệp không khớp"
			continue
		}

		data := buf.Bytes()
		detectedMIME := DetectMIME(data)
		mediaType, allowed := ClassifyMediaType(detectedMIME)
		if !allowed {
			fields[fmt.Sprintf("files.%d", idx)] = "Định dạng tệp không được hỗ trợ"
			continue
		}

		if mediaType == domain.MediaTypeImage && written > domain.MaxReviewImageSizeBytes {
			fields[fmt.Sprintf("files.%d", idx)] = "Kích thước ảnh không được vượt quá 5MB"
			continue
		}
		if mediaType == domain.MediaTypeVideo {
			videoCount++
			if written > domain.MaxReviewVideoSizeBytes {
				fields[fmt.Sprintf("files.%d", idx)] = "Kích thước video không được vượt quá 50MB"
				continue
			}
		}

		if videoCount > domain.MaxReviewVideoCount {
			fields["media"] = "Tối đa 5 tệp và không quá 2 video"
			continue
		}

		objectKey := fmt.Sprintf("reviews/%s/%s", opID, uuid.NewString())
		_, err = uc.storage.PutObject(ctx, objectKey, bytes.NewReader(data), written, detectedMIME)
		if err != nil {
			cleanupNewUploads()
			return nil, fmt.Errorf("upload to storage: %w", err)
		}
		newlyUploadedKeys = append(newlyUploadedKeys, objectKey)

		desiredMedia = append(desiredMedia, domain.ReviewMedia{
			ObjectKey: objectKey,
			Type:      mediaType,
			MimeType:  detectedMIME,
			SizeBytes: written,
			Position:  i,
		})
	}

	if videoCount > domain.MaxReviewVideoCount {
		fields["media"] = "Tối đa 5 tệp và không quá 2 video"
	}

	if len(fields) > 0 {
		cleanupNewUploads()
		return nil, domain.NewValidationError(fields)
	}

	// Update DB conditionally
	updatedReview, removedKeys, err := uc.reviews.UpdateReview(ctx, in.ReviewID, in.UserID, in.Rating, trimmedComment, desiredMedia)
	if err != nil {
		cleanupNewUploads()
		return nil, err
	}

	// After commit success: delete removed keys from storage asynchronously/synchronously
	for _, k := range removedKeys {
		_ = uc.storage.DeleteObject(context.Background(), k)
	}

	return updatedReview, nil
}

func (uc *UseCase) GetPublicMedia(ctx context.Context, mediaID string, start, end int64) (*storage.MediaObject, error) {
	if _, err := uuid.Parse(mediaID); err != nil {
		return nil, domain.ErrReviewMediaNotFound
	}

	if uc.reviews == nil {
		return nil, domain.ErrReviewMediaNotFound
	}

	// 1. Check database reference first
	media, err := uc.reviews.GetReferencedReviewMediaByID(ctx, mediaID)
	if err != nil {
		return nil, err
	}

	if uc.storage == nil {
		return nil, storage.ErrStorageUnavailable
	}

	// 2. Fetch object from storage
	obj, err := uc.storage.GetObject(ctx, media.ObjectKey, start, end)
	if err != nil {
		if errors.Is(err, storage.ErrObjectNotFound) {
			return nil, domain.ErrReviewMediaNotFound
		}
		return nil, err
	}
	return obj, nil
}

func (uc *UseCase) ListProductReviews(ctx context.Context, productID string, page, limit int, currentUserID string) ([]domain.Review, int64, error) {
	if uc == nil || uc.reviews == nil {
		return []domain.Review{}, 0, nil
	}
	if _, err := uuid.Parse(productID); err != nil {
		return nil, 0, domain.ErrInvalidProductID
	}
	return uc.reviews.GetProductReviews(ctx, productID, page, limit, currentUserID)
}

func (uc *UseCase) GetProductReviewSummary(ctx context.Context, productID string) (*domain.ReviewSummary, error) {
	if uc == nil || uc.reviews == nil {
		return &domain.ReviewSummary{ReviewCount: 0, AverageRating: nil}, nil
	}
	if _, err := uuid.Parse(productID); err != nil {
		return nil, domain.ErrInvalidProductID
	}
	return uc.reviews.GetProductReviewSummary(ctx, productID)
}

func (uc *UseCase) Reconcile(ctx context.Context) error {
	objects, err := uc.storage.ListObjects(ctx, "reviews/")
	if err != nil {
		return fmt.Errorf("list objects for reconcile: %w", err)
	}

	now := time.Now().UTC()
	deletedCount := 0

	for _, obj := range objects {
		// Only consider objects older than grace period
		if now.Sub(obj.LastModified) < uc.gracePeriod {
			continue
		}

		isReferenced, err := uc.reviews.IsObjectKeyReferenced(ctx, obj.Key)
		if err != nil {
			uc.logger.Warn("reconciler check reference failed", "key", obj.Key, "error", err)
			continue
		}

		if !isReferenced {
			if err := uc.storage.DeleteObject(ctx, obj.Key); err != nil {
				uc.logger.Warn("reconciler delete unreferenced object failed", "key", obj.Key, "error", err)
			} else {
				deletedCount++
			}
		}
	}

	if deletedCount > 0 {
		uc.logger.Info("reconciliation finished", "deleted_objects", deletedCount)
	}
	return nil
}
