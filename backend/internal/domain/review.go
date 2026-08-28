package domain

import (
	"fmt"
	"math"
	"strings"
	"time"
)

const (
	MaxReviewMediaCount     = 5
	MaxReviewVideoCount     = 2
	MaxReviewImageSizeBytes = 5 * 1024 * 1024  // 5242880 bytes (5 MiB)
	MaxReviewVideoSizeBytes = 50 * 1024 * 1024 // 52428800 bytes (50 MiB)
	MaxReviewCommentLength  = 1000
	DefaultAuthorLabel      = "Khách hàng đã mua hàng"
)

type MediaType string

const (
	MediaTypeImage MediaType = "image"
	MediaTypeVideo MediaType = "video"
)

var AllowedImageMIMEs = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
}

var AllowedVideoMIMEs = map[string]bool{
	"video/mp4":  true,
	"video/webm": true,
}

type PurchasedOption struct {
	GroupLabel string `json:"groupLabel"`
	ValueLabel string `json:"valueLabel"`
}

type ReviewMedia struct {
	ID        string    `json:"id"`
	ReviewID  string    `json:"reviewId,omitempty"`
	ObjectKey string    `json:"-"`
	Type      MediaType `json:"type"`
	MimeType  string    `json:"mimeType"`
	SizeBytes int64     `json:"sizeBytes"`
	Position  int       `json:"position"`
	URL       string    `json:"url"`
	CreatedAt time.Time `json:"createdAt"`
}

type ReviewViewerState struct {
	IsOwner        bool `json:"isOwner"`
	CanEdit        bool `json:"canEdit"`
	RemainingEdits int  `json:"remainingEdits"`
}

type Review struct {
	ID               string             `json:"id"`
	OrderItemID      string             `json:"orderItemId,omitempty"`
	UserID           string             `json:"-"`
	ProductID        string             `json:"productId"`
	VariantID        string             `json:"variantId"`
	PurchasedOptions []PurchasedOption  `json:"purchasedOptions"`
	Rating           int                `json:"rating"`
	Comment          string             `json:"comment"`
	Media            []ReviewMedia      `json:"media"`
	VerifiedPurchase bool               `json:"verifiedPurchase"`
	AuthorLabel      string             `json:"authorLabel"`
	CreatedAt        time.Time          `json:"createdAt"`
	UpdatedAt        time.Time          `json:"updatedAt"`
	EditedAt         *time.Time         `json:"-"`
	Viewer           *ReviewViewerState `json:"viewer"`
}

type ReviewSummary struct {
	AverageRating *float64 `json:"averageRating"`
	ReviewCount   int64    `json:"reviewCount"`
}

type ReviewHistoryProduct struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	PublicPath *string `json:"publicPath"`
}

type OwnedReviewHistoryItem struct {
	Review  Review               `json:"review"`
	Product ReviewHistoryProduct `json:"product"`
}

type OrderItemReviewStatus string

const (
	OrderItemReviewIneligible OrderItemReviewStatus = "ineligible"
	OrderItemReviewEligible   OrderItemReviewStatus = "eligible"
	OrderItemReviewReviewed   OrderItemReviewStatus = "reviewed"
)

type OrderItemReviewState struct {
	Status         OrderItemReviewStatus `json:"status"`
	ReviewID       *string               `json:"reviewId"`
	CanEdit        bool                  `json:"canEdit"`
	RemainingEdits int                   `json:"remainingEdits"`
}

// ComputeAverageRating rounds an arithmetic mean to one decimal using round-half-up (e.g. 4.25 -> 4.3).
func ComputeAverageRating(mean float64) float64 {
	// Round half-up: floor(mean * 10 + 0.5) / 10
	return math.Floor(mean*10+0.5) / 10.0
}

// FormatMediaURL builds the public media URL path for a given media ID.
func FormatMediaURL(mediaID string) string {
	return fmt.Sprintf("/media/reviews/%s", mediaID)
}

// NormalizeComment trims leading and trailing whitespace.
func NormalizeComment(comment string) string {
	return strings.TrimSpace(comment)
}
