package domain

import (
	"context"
	"io"
	"net/mail"
	"strings"
	"time"
)

const (
	MaxReviewImageSizeBytes     int64 = 5_000_000
	MaxReviewVideoSizeBytes     int64 = 50_000_000
	MaxReviewImagesCount        int   = 5
	MaxReviewVideosCount        int   = 1
	MaxReviewCommentLength      int   = 1000
	MaxReviewMultipartSizeBytes int64 = 80_000_000
)

type ReviewMediaType string

const (
	ReviewMediaTypeImage ReviewMediaType = "image"
	ReviewMediaTypeVideo ReviewMediaType = "video"
)

func (t ReviewMediaType) IsValid() bool {
	switch t {
	case ReviewMediaTypeImage, ReviewMediaTypeVideo:
		return true
	default:
		return false
	}
}

type ReviewMimeType string

const (
	ReviewMimeTypeJPEG ReviewMimeType = "image/jpeg"
	ReviewMimeTypePNG  ReviewMimeType = "image/png"
	ReviewMimeTypeWebP ReviewMimeType = "image/webp"
	ReviewMimeTypeMP4  ReviewMimeType = "video/mp4"
	ReviewMimeTypeWebM ReviewMimeType = "video/webm"
)

func (m ReviewMimeType) IsValid() bool {
	switch m {
	case ReviewMimeTypeJPEG, ReviewMimeTypePNG, ReviewMimeTypeWebP, ReviewMimeTypeMP4, ReviewMimeTypeWebM:
		return true
	default:
		return false
	}
}

func (m ReviewMimeType) IsImage() bool {
	switch m {
	case ReviewMimeTypeJPEG, ReviewMimeTypePNG, ReviewMimeTypeWebP:
		return true
	default:
		return false
	}
}

func (m ReviewMimeType) IsVideo() bool {
	switch m {
	case ReviewMimeTypeMP4, ReviewMimeTypeWebM:
		return true
	default:
		return false
	}
}

type OrderItemReviewStatus string

const (
	ReviewStatusEligible   OrderItemReviewStatus = "eligible"
	ReviewStatusReviewed   OrderItemReviewStatus = "reviewed"
	ReviewStatusRefunded   OrderItemReviewStatus = "refunded"
	ReviewStatusIneligible OrderItemReviewStatus = "ineligible"
)

func (s OrderItemReviewStatus) IsValid() bool {
	switch s {
	case ReviewStatusEligible, ReviewStatusReviewed, ReviewStatusRefunded, ReviewStatusIneligible:
		return true
	default:
		return false
	}
}

type ReviewMedia struct {
	ID        string          `json:"id"`
	ReviewID  string          `json:"reviewId,omitempty"`
	Type      ReviewMediaType `json:"type"`
	URL       string          `json:"url"`
	MimeType  string          `json:"mimeType"`
	ObjectKey string          `json:"objectKey,omitempty"`
	SizeBytes int64           `json:"sizeBytes,omitempty"`
	Position  int16           `json:"position"`
	CreatedAt time.Time       `json:"createdAt,omitempty"`
}

type Review struct {
	AdminReply    *string       `json:"adminReply,omitempty"`
	AdminRepliedAt *time.Time  `json:"adminRepliedAt,omitempty"`
	ID          string        `json:"id"`
	OrderItemID string        `json:"orderItemId,omitempty"`
	Rating      int16         `json:"rating"`
	Comment     string        `json:"comment"`
	EditCount   int16         `json:"editCount"`
	Media       []ReviewMedia `json:"media"`
	CreatedAt   time.Time     `json:"createdAt"`
	UpdatedAt   time.Time     `json:"updatedAt"`
	Edited      bool          `json:"edited"`
	CanEdit     bool          `json:"canEdit"`
}

type PublicReviewer struct {
	MaskedEmail *string `json:"maskedEmail"`
}

type PublicPurchase struct {
	Model   string       `json:"model"`
	Options []CartOption `json:"options"`
}

type HelpfulnessVote string

const (
	HelpfulnessVoteHelpful   HelpfulnessVote = "helpful"
	HelpfulnessVoteUnhelpful HelpfulnessVote = "unhelpful"
)

func (v HelpfulnessVote) IsValid() bool {
	return v == HelpfulnessVoteHelpful || v == HelpfulnessVoteUnhelpful
}

type HelpfulnessState struct {
	HelpfulCount   int64            `json:"helpfulCount"`
	UnhelpfulCount int64            `json:"unhelpfulCount"`
	ViewerVote     *HelpfulnessVote `json:"viewerVote"`
}

type PublicReview struct {
	ID                    string            `json:"id"`
	Rating                int16             `json:"rating"`
	Comment               string            `json:"comment"`
	Reviewer              PublicReviewer    `json:"reviewer"`
	Purchase              PublicPurchase    `json:"purchase"`
	Media                 []ReviewMedia     `json:"media"`
	Helpfulness           HelpfulnessState  `json:"helpfulness"`
	AdminReply            *string           `json:"adminReply,omitempty"`
	AdminRepliedAt        *time.Time        `json:"adminRepliedAt,omitempty"`
	AdminReplyID          *string           `json:"adminReplyId,omitempty"`
	AdminReplyHelpfulness *HelpfulnessState `json:"adminReplyHelpfulness,omitempty"`
	Edited                bool              `json:"edited"`
	CreatedAt             time.Time         `json:"createdAt"`
	UpdatedAt             time.Time         `json:"updatedAt"`
}

type ProductReviewSummary struct {
	TotalReviews  int64            `json:"totalReviews"`
	AverageRating string           `json:"averageRating"`
	RatingCounts  map[string]int64 `json:"ratingCounts"`
}

type ProductReviewsResult struct {
	Summary ProductReviewSummary `json:"summary"`
	Reviews []PublicReview       `json:"reviews"`
	Total   int64                `json:"total"`
}

type UserReviewProduct struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	BrandName string       `json:"brandName"`
	Model     string       `json:"model"`
	ImageURL  string       `json:"imageUrl"`
	Options   []CartOption `json:"options"`
}

type UserReviewOrder struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
}

type UserReview struct {
	AdminReply    *string       `json:"adminReply,omitempty"`
	AdminRepliedAt *time.Time  `json:"adminRepliedAt,omitempty"`
	ID          string            `json:"id"`
	OrderItemID string            `json:"orderItemId"`
	Order       UserReviewOrder   `json:"order"`
	Product     UserReviewProduct `json:"product"`
	Rating      int16             `json:"rating"`
	Comment     string            `json:"comment"`
	EditCount   int16             `json:"editCount"`
	CanEdit     bool              `json:"canEdit"`
	Edited      bool              `json:"edited"`
	Media       []ReviewMedia     `json:"media"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

type UserReviewsResult struct {
	Reviews []UserReview `json:"reviews"`
	Total   int64        `json:"total"`
}

type CreateReviewMediaInput struct {
	MediaType ReviewMediaType
	MimeType  string
	ObjectKey string
	SizeBytes int64
	Position  int16
}

type CreateReviewInput struct {
	UserID       string
	OrderID      string
	OrderItemID  string
	Rating       int16
	Comment      string
	Media        []CreateReviewMediaInput
}

type UpdateReviewInput struct {
	UserID          string
	OrderID         string
	OrderItemID     string
	ReviewID        string
	Rating          int16
	Comment         string
	RetainedMediaIDs []string
	NewMedia        []CreateReviewMediaInput
}

type ReviewRepository interface {
	CreateReview(ctx context.Context, input CreateReviewInput) (*Review, error)
	UpdateReview(ctx context.Context, input UpdateReviewInput) (*Review, []string, error)
	GetReviewByID(ctx context.Context, id string) (*Review, error)
	GetReviewByOrderItemID(ctx context.Context, orderItemID string) (*Review, error)
	ListReviewsByOrderItemIDs(ctx context.Context, orderItemIDs []string) (map[string]*Review, error)
	GetReviewMediaByID(ctx context.Context, mediaID string) (*ReviewMedia, error)
	GetPublicReviewsByProductID(ctx context.Context, productID string, viewerUserID *string, page, limit int) (*ProductReviewsResult, error)
	GetUserReviews(ctx context.Context, userID string, ratingFilter int16, page, limit int) (*UserReviewsResult, error)
	GetAdminReviews(ctx context.Context, ratingFilter int16, hasReplyFilter string, page, limit int) (*AdminReviewsResult, error)
	UpdateAdminReply(ctx context.Context, reviewID string, reply *string) (*Review, error)
	SetReviewVote(ctx context.Context, reviewID, userID string, vote *HelpfulnessVote) (*HelpfulnessState, error)
	SetReviewReplyVote(ctx context.Context, replyID, userID string, vote *HelpfulnessVote) (*HelpfulnessState, error)
}

type ReviewObjectInfo struct {
	Key         string
	Size        int64
	ContentType string
	ETag        string
}

type ReviewMediaStore interface {
	PutObject(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) error
	StatObject(ctx context.Context, objectKey string) (*ReviewObjectInfo, error)
	GetObject(ctx context.Context, objectKey string) (io.ReadCloser, error)
	GetObjectRange(ctx context.Context, objectKey string, start, length int64) (io.ReadCloser, error)
	RemoveObject(ctx context.Context, objectKey string) error
	RemoveObjects(ctx context.Context, objectKeys []string) error
	CheckHealth(ctx context.Context) error
}

func MaskReviewerEmail(rawEmail string) *string {
	rawEmail = strings.TrimSpace(rawEmail)
	if rawEmail == "" {
		return nil
	}
	parsed, err := mail.ParseAddress(rawEmail)
	if err != nil {
		return nil
	}
	addr := parsed.Address
	parts := strings.SplitN(addr, "@", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil
	}
	local := parts[0]
	domain := parts[1]
	runes := []rune(local)
	masked := string(runes[0]) + "***@" + domain
	return &masked
}

type AdminReview struct {
	ID             string            `json:"id"`
	OrderItemID    string            `json:"orderItemId"`
	Rating         int16             `json:"rating"`
	Comment        string            `json:"comment"`
	EditCount      int16             `json:"editCount"`
	Media          []ReviewMedia     `json:"media"`
	CreatedAt      time.Time         `json:"createdAt"`
	UpdatedAt      time.Time         `json:"updatedAt"`
	AdminReply     *string           `json:"adminReply,omitempty"`
	AdminRepliedAt *time.Time        `json:"adminRepliedAt,omitempty"`
	ReviewerEmail  *string           `json:"reviewerEmail,omitempty"`
	Product        UserReviewProduct `json:"product"`
}

type AdminReviewsResult struct {
	Reviews []AdminReview `json:"reviews"`
	Total   int64         `json:"total"`
}
