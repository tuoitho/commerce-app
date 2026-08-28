package review

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type ReviewFileInput struct {
	Reader      io.Reader
	Size        int64
	ContentType string
	Filename    string
}

type ReviewUseCase struct {
	repo        domain.ReviewRepository
	mediaStore  domain.ReviewMediaStore
	catalogRepo domain.CatalogRepository
}

func NewReviewUseCase(
	repo domain.ReviewRepository,
	mediaStore domain.ReviewMediaStore,
	catalogRepo domain.CatalogRepository,
) *ReviewUseCase {
	return &ReviewUseCase{
		repo:        repo,
		mediaStore:  mediaStore,
		catalogRepo: catalogRepo,
	}
}

func detectImageMime(header []byte) (string, bool) {
	if len(header) >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF {
		return string(domain.ReviewMimeTypeJPEG), true
	}
	if len(header) >= 8 && bytes.Equal(header[:8], []byte("\x89PNG\r\n\x1a\n")) {
		return string(domain.ReviewMimeTypePNG), true
	}
	if len(header) >= 12 && string(header[:4]) == "RIFF" && string(header[8:12]) == "WEBP" {
		return string(domain.ReviewMimeTypeWebP), true
	}
	return "", false
}

func detectVideoMime(header []byte) (string, bool) {
	if len(header) >= 4 && header[0] == 0x1A && header[1] == 0x45 && header[2] == 0xDF && header[3] == 0xA3 {
		return string(domain.ReviewMimeTypeWebM), true
	}
	if len(header) >= 12 && string(header[4:8]) == "ftyp" {
		return string(domain.ReviewMimeTypeMP4), true
	}
	return "", false
}

type preparedMedia struct {
	input       domain.CreateReviewMediaInput
	data        []byte
}

func (uc *ReviewUseCase) CreateReview(
	ctx context.Context,
	userID, orderID, orderItemID string,
	rating int16,
	comment string,
	images []ReviewFileInput,
	video *ReviewFileInput,
) (*domain.Review, error) {
	fieldErrors := make(map[string]string)

	if rating < 1 || rating > 5 {
		fieldErrors["rating"] = "Số sao đánh giá phải từ 1 đến 5"
	}

	trimmedComment := strings.TrimSpace(comment)
	if len([]rune(trimmedComment)) > domain.MaxReviewCommentLength {
		fieldErrors["comment"] = "Nhận xét không được vượt quá 1.000 ký tự"
	}

	if len(images) > domain.MaxReviewImagesCount {
		fieldErrors["images"] = fmt.Sprintf("Tối đa %d ảnh cho mỗi đánh giá", domain.MaxReviewImagesCount)
	}

	reviewUUID := uuid.NewString()

	var preparedList []preparedMedia
	var position int16 = 0

	for _, img := range images {
		if img.Size <= 0 || img.Size > domain.MaxReviewImageSizeBytes {
			fieldErrors["images"] = "Dung lượng mỗi ảnh không được vượt quá 5MB"
			break
		}
		data, err := io.ReadAll(img.Reader)
		if err != nil {
			fieldErrors["images"] = "Không thể đọc dữ liệu ảnh"
			break
		}
		mime, ok := detectImageMime(data)
		if !ok {
			fieldErrors["images"] = "Ảnh phải thuộc định dạng JPEG, PNG hoặc WebP"
			break
		}
		mediaUUID := uuid.NewString()
		objectKey := fmt.Sprintf("reviews/%s/%s", reviewUUID, mediaUUID)
		preparedList = append(preparedList, preparedMedia{
			input: domain.CreateReviewMediaInput{
				MediaType: domain.ReviewMediaTypeImage,
				MimeType:  mime,
				ObjectKey: objectKey,
				SizeBytes: int64(len(data)),
				Position:  position,
			},
			data: data,
		})
		position++
	}

	if video != nil {
		if video.Size <= 0 || video.Size > domain.MaxReviewVideoSizeBytes {
			fieldErrors["video"] = "Dung lượng video không được vượt quá 50MB"
		} else {
			data, err := io.ReadAll(video.Reader)
			if err != nil {
				fieldErrors["video"] = "Không thể đọc dữ liệu video"
			} else {
				mime, ok := detectVideoMime(data)
				if !ok {
					fieldErrors["video"] = "Video phải thuộc định dạng MP4 hoặc WebM"
				} else {
					mediaUUID := uuid.NewString()
					objectKey := fmt.Sprintf("reviews/%s/%s", reviewUUID, mediaUUID)
					preparedList = append(preparedList, preparedMedia{
						input: domain.CreateReviewMediaInput{
							MediaType: domain.ReviewMediaTypeVideo,
							MimeType:  mime,
							ObjectKey: objectKey,
							SizeBytes: int64(len(data)),
							Position:  position,
						},
						data: data,
					})
				}
			}
		}
	}

	if len(fieldErrors) > 0 {
		return nil, domain.NewValidationError(fieldErrors)
	}

	// Upload objects to private MinIO storage
	var uploadedKeys []string
	for _, p := range preparedList {
		err := uc.mediaStore.PutObject(ctx, p.input.ObjectKey, bytes.NewReader(p.data), p.input.SizeBytes, p.input.MimeType)
		if err != nil {
			_ = uc.mediaStore.RemoveObjects(ctx, uploadedKeys)
			return nil, err
		}
		uploadedKeys = append(uploadedKeys, p.input.ObjectKey)
	}

	var createMediaInputs []domain.CreateReviewMediaInput
	for _, p := range preparedList {
		createMediaInputs = append(createMediaInputs, p.input)
	}

	// Atomically create review in repository
	review, err := uc.repo.CreateReview(ctx, domain.CreateReviewInput{
		UserID:      userID,
		OrderID:     orderID,
		OrderItemID: orderItemID,
		Rating:      rating,
		Comment:     trimmedComment,
		Media:       createMediaInputs,
	})
	if err != nil {
		_ = uc.mediaStore.RemoveObjects(ctx, uploadedKeys)
		return nil, err
	}

	return review, nil
}

func (uc *ReviewUseCase) UpdateReview(
	ctx context.Context,
	userID, orderID, orderItemID string,
	rating int16,
	comment string,
	retainedMediaIDs []string,
	images []ReviewFileInput,
	video *ReviewFileInput,
) (*domain.Review, error) {
	fieldErrors := make(map[string]string)

	if rating < 1 || rating > 5 {
		fieldErrors["rating"] = "Số sao đánh giá phải từ 1 đến 5"
	}

	trimmedComment := strings.TrimSpace(comment)
	if len([]rune(trimmedComment)) > domain.MaxReviewCommentLength {
		fieldErrors["comment"] = "Nhận xét không được vượt quá 1.000 ký tự"
	}

	for _, id := range retainedMediaIDs {
		if _, err := uuid.Parse(id); err != nil {
			fieldErrors["retainedMediaIds"] = "Mã tệp đính kèm giữ lại không hợp lệ"
			break
		}
	}

	reviewUUID := uuid.NewString()

	var preparedList []preparedMedia
	var position int16 = int16(len(retainedMediaIDs))

	for _, img := range images {
		if img.Size <= 0 || img.Size > domain.MaxReviewImageSizeBytes {
			fieldErrors["images"] = "Dung lượng mỗi ảnh không được vượt quá 5MB"
			break
		}
		data, err := io.ReadAll(img.Reader)
		if err != nil {
			fieldErrors["images"] = "Không thể đọc dữ liệu ảnh"
			break
		}
		mime, ok := detectImageMime(data)
		if !ok {
			fieldErrors["images"] = "Ảnh phải thuộc định dạng JPEG, PNG hoặc WebP"
			break
		}
		mediaUUID := uuid.NewString()
		objectKey := fmt.Sprintf("reviews/%s/%s", reviewUUID, mediaUUID)
		preparedList = append(preparedList, preparedMedia{
			input: domain.CreateReviewMediaInput{
				MediaType: domain.ReviewMediaTypeImage,
				MimeType:  mime,
				ObjectKey: objectKey,
				SizeBytes: int64(len(data)),
				Position:  position,
			},
			data: data,
		})
		position++
	}

	if video != nil {
		if video.Size <= 0 || video.Size > domain.MaxReviewVideoSizeBytes {
			fieldErrors["video"] = "Dung lượng video không được vượt quá 50MB"
		} else {
			data, err := io.ReadAll(video.Reader)
			if err != nil {
				fieldErrors["video"] = "Không thể đọc dữ liệu video"
			} else {
				mime, ok := detectVideoMime(data)
				if !ok {
					fieldErrors["video"] = "Video phải thuộc định dạng MP4 hoặc WebM"
				} else {
					mediaUUID := uuid.NewString()
					objectKey := fmt.Sprintf("reviews/%s/%s", reviewUUID, mediaUUID)
					preparedList = append(preparedList, preparedMedia{
						input: domain.CreateReviewMediaInput{
							MediaType: domain.ReviewMediaTypeVideo,
							MimeType:  mime,
							ObjectKey: objectKey,
							SizeBytes: int64(len(data)),
							Position:  position,
						},
						data: data,
					})
				}
			}
		}
	}

	if len(fieldErrors) > 0 {
		return nil, domain.NewValidationError(fieldErrors)
	}

	// Upload new objects
	var uploadedKeys []string
	for _, p := range preparedList {
		err := uc.mediaStore.PutObject(ctx, p.input.ObjectKey, bytes.NewReader(p.data), p.input.SizeBytes, p.input.MimeType)
		if err != nil {
			_ = uc.mediaStore.RemoveObjects(ctx, uploadedKeys)
			return nil, err
		}
		uploadedKeys = append(uploadedKeys, p.input.ObjectKey)
	}

	var newMediaInputs []domain.CreateReviewMediaInput
	for _, p := range preparedList {
		newMediaInputs = append(newMediaInputs, p.input)
	}

	review, deletedOldKeys, err := uc.repo.UpdateReview(ctx, domain.UpdateReviewInput{
		UserID:           userID,
		OrderID:          orderID,
		OrderItemID:      orderItemID,
		Rating:           rating,
		Comment:          trimmedComment,
		RetainedMediaIDs: retainedMediaIDs,
		NewMedia:         newMediaInputs,
	})
	if err != nil {
		_ = uc.mediaStore.RemoveObjects(ctx, uploadedKeys)
		return nil, err
	}

	// Clean up replaced objects best-effort
	if len(deletedOldKeys) > 0 {
		_ = uc.mediaStore.RemoveObjects(ctx, deletedOldKeys)
	}

	return review, nil
}

func (uc *ReviewUseCase) GetPublicReviews(ctx context.Context, productID string, page, limit int) (*domain.ProductReviewsResult, error) {
	if _, err := uuid.Parse(productID); err != nil {
		return nil, domain.ErrProductNotFound
	}

	if uc.catalogRepo != nil {
		product, err := uc.catalogRepo.GetProductByID(ctx, productID)
		if err != nil || product == nil || !product.Active {
			return nil, domain.ErrProductNotFound
		}
	}

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 10 {
		limit = 10
	}

	return uc.repo.GetPublicReviewsByProductID(ctx, productID, page, limit)
}

func (uc *ReviewUseCase) GetReviewMedia(ctx context.Context, mediaID string) (*domain.ReviewMedia, error) {
	if _, err := uuid.Parse(mediaID); err != nil {
		return nil, domain.ErrReviewMediaNotFound
	}
	return uc.repo.GetReviewMediaByID(ctx, mediaID)
}

func (uc *ReviewUseCase) StreamMedia(ctx context.Context, mediaID string, start, length int64) (io.ReadCloser, *domain.ReviewMedia, error) {
	media, err := uc.GetReviewMedia(ctx, mediaID)
	if err != nil {
		return nil, nil, err
	}

	if start >= 0 && length > 0 {
		stream, err := uc.mediaStore.GetObjectRange(ctx, media.ObjectKey, start, length)
		if err != nil {
			return nil, nil, err
		}
		return stream, media, nil
	}

	stream, err := uc.mediaStore.GetObject(ctx, media.ObjectKey)
	if err != nil {
		return nil, nil, err
	}
	return stream, media, nil
}

func (uc *ReviewUseCase) GetUserReviews(ctx context.Context, userID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrInvalidToken
	}

	if ratingFilter < 0 || ratingFilter > 5 {
		return nil, domain.NewValidationError(map[string]string{
			"rating": "Số sao lọc không hợp lệ, phải từ 1 đến 5 hoặc 0 để lấy tất cả",
		})
	}

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 10 {
		limit = 10
	}

	return uc.repo.GetUserReviews(ctx, userID, ratingFilter, page, limit)
}
