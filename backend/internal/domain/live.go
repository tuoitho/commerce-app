package domain

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"time"
)

const (
	LiveStatusLive  = "live"
	LiveStatusEnded = "ended"

	LiveEndReasonAdmin      = "admin"
	LiveEndReasonSignalLost = "signal_lost"

	LiveTitleMaxLength   = 120
	LiveMaxProducts      = 50
	LiveQuotaMin         = 1
	LiveQuotaMax         = 100000
	LiveRecentComments   = 50
	LiveCommentMaxLength = 200
	LiveCommentInterval  = 2 * time.Second

	// LiveShopAuthorName is how comments written by an admin are labelled.
	LiveShopAuthorName = "Chủ shop"
)

var (
	ErrLivestreamNotFound      = errors.New("livestream not found")
	ErrLivestreamAlreadyActive = errors.New("livestream already active")
	ErrLivestreamEnded         = errors.New("livestream ended")
	ErrLiveCommentNotFound     = errors.New("live comment not found")
	ErrRateLimited             = errors.New("rate limited")
	ErrMediaServerUnavailable  = errors.New("media server unavailable")
)

// LiveQuotaExceededError reports an order line asking for more units than the
// live-price quota still has.
type LiveQuotaExceededError struct {
	ProductName string
	Remaining   int64
}

func (e *LiveQuotaExceededError) Error() string {
	return fmt.Sprintf("Chỉ còn %d suất giá live cho %s. Vui lòng giảm số lượng.", e.Remaining, e.ProductName)
}

// LivePath is the MediaMTX path a session's stream is published to.
func LivePath(sessionID string) string {
	return "live/" + sessionID
}

type LiveSession struct {
	ID              string
	Title           string
	Status          string
	CreatedBy       string
	PinnedProductID *string
	HeartCount      int64
	PeakViewers     int
	StartedAt       time.Time
	LastSignalAt    *time.Time
	EndedAt         *time.Time
	EndReason       *string
}

func (s *LiveSession) IsLive() bool { return s.Status == LiveStatusLive }

// LiveCatalogProduct is a product attached to a session, as stored.
type LiveCatalogProduct struct {
	ProductID string
	Position  int
	Name      string
	Brand     string
	ImageURL  string
	Active    bool
}

// LiveCatalogVariant is a variant of an attached product with its live price
// configuration and whether that live price is currently in effect.
type LiveCatalogVariant struct {
	VariantID       string
	ProductID       string
	Active          bool
	StockQuantity   int64
	RegularPriceVND MoneyVND
	HasLivePrice    bool
	LivePriceVND    MoneyVND
	Quota           *int
	Sold            int
	LiveActive      bool
	OptionLabel     string
}

type LiveComment struct {
	ID         string    `json:"id"`
	SessionID  string    `json:"sessionId"`
	UserID     string    `json:"-"`
	AuthorName string    `json:"authorName"`
	AuthorRole string    `json:"authorRole"`
	Content    string    `json:"content"`
	Hidden     bool      `json:"hidden"`
	CreatedAt  time.Time `json:"createdAt"`
}

type LiveVariantInput struct {
	VariantID    string
	LivePriceVND MoneyVND
	Quota        *int
}

type LiveProductInput struct {
	ProductID string
	Variants  []LiveVariantInput
}

// LiveValidationProduct and LiveValidationVariant carry the catalog facts needed
// to validate a session's product list.
type LiveValidationProduct struct {
	ID     string
	Active bool
}

type LiveValidationVariant struct {
	ID              string
	ProductID       string
	Active          bool
	RegularPriceVND MoneyVND
}

type LiveValidationData struct {
	Products map[string]LiveValidationProduct
	Variants map[string]LiveValidationVariant
	// Sold maps variant id to units already sold at the live price in the session.
	Sold map[string]int
}

// View types (TYPE-LIVE).

type LiveSummary struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	StartedAt time.Time `json:"startedAt"`
}

type LiveMedia struct {
	WhipURL string `json:"whipUrl,omitempty"`
	WhepURL string `json:"whepUrl"`
	HLSURL  string `json:"hlsUrl"`
}

type LiveVariantPrice struct {
	VariantID       string   `json:"variantId"`
	OptionLabel     string   `json:"optionLabel"`
	RegularPriceVND MoneyVND `json:"regularPriceVnd"`
	LivePriceVND    MoneyVND `json:"livePriceVnd"`
	Quota           *int     `json:"quota"`
	Sold            int      `json:"sold"`
	Remaining       *int     `json:"remaining"`
	Active          bool     `json:"active"`
}

type LiveProduct struct {
	ProductID          string             `json:"productId"`
	Position           int                `json:"position"`
	Name               string             `json:"name"`
	Brand              string             `json:"brand"`
	ImageURL           string             `json:"imageUrl"`
	MinPriceVND        MoneyVND           `json:"minPriceVnd"`
	MaxPriceVND        MoneyVND           `json:"maxPriceVnd"`
	RegularMinPriceVND MoneyVND           `json:"regularMinPriceVnd"`
	RegularMaxPriceVND MoneyVND           `json:"regularMaxPriceVnd"`
	HasLivePrice       bool               `json:"hasLivePrice"`
	InStock            bool               `json:"inStock"`
	LivePrices         []LiveVariantPrice `json:"livePrices"`
}

type LiveSessionView struct {
	ID              string        `json:"id"`
	Title           string        `json:"title"`
	Status          string        `json:"status"`
	StartedAt       time.Time     `json:"startedAt"`
	EndedAt         *time.Time    `json:"endedAt"`
	ViewerCount     int           `json:"viewerCount"`
	HeartCount      int64         `json:"heartCount"`
	SignalOnline    bool          `json:"signalOnline"`
	PinnedProductID *string       `json:"pinnedProductId"`
	Products        []LiveProduct `json:"products"`
	Comments        []LiveComment `json:"comments"`
	Media           *LiveMedia    `json:"media"`
}

type LiveSessionSummary struct {
	DurationSeconds int64   `json:"durationSeconds"`
	PeakViewers     int     `json:"peakViewers"`
	CommentCount    int64   `json:"commentCount"`
	HeartCount      int64   `json:"heartCount"`
	EndReason       *string `json:"endReason"`
}

type AdminLiveSession struct {
	LiveSessionView
	Summary LiveSessionSummary `json:"summary"`
}

// LiveProductsEvent is the payload of the live:products realtime event.
type LiveProductsEvent struct {
	Products        []LiveProduct `json:"products"`
	PinnedProductID *string       `json:"pinnedProductId"`
}

// LiveSignalEvent is the payload of the live:signal realtime event.
type LiveSignalEvent struct {
	Online bool `json:"online"`
}

// LiveCommentHiddenEvent is the payload of the live:comment_hidden realtime event.
type LiveCommentHiddenEvent struct {
	CommentID string `json:"commentId"`
}

// LiveEndedEvent is the payload of the live:ended realtime event.
type LiveEndedEvent struct {
	EndedAt time.Time `json:"endedAt"`
	Reason  string    `json:"reason"`
}

const (
	LiveEventComment       = "live:comment"
	LiveEventCommentHidden = "live:comment_hidden"
	LiveEventHearts        = "live:hearts"
	LiveEventViewers       = "live:viewers"
	LiveEventProducts      = "live:products"
	LiveEventSignal        = "live:signal"
	LiveEventEnded         = "live:ended"
)

// MediaServer is the media server that relays live video between the
// broadcaster and viewers.
type MediaServer interface {
	// Ping returns an error when the media server cannot be reached.
	Ping(ctx context.Context) error
	// PathOnline reports whether a publisher is streaming to path.
	PathOnline(ctx context.Context, path string) (bool, error)
}

// LiveEventBroadcaster delivers realtime events to everyone in a session's room.
type LiveEventBroadcaster interface {
	Broadcast(sessionID string, event string, payload any)
	// FlushHearts persists hearts counted in memory but not yet stored.
	FlushHearts(ctx context.Context, sessionID string) error
	// CloseRoom disconnects every client of the session's room.
	CloseRoom(sessionID string)
	ViewerCount(sessionID string) int
}

// LiveQuotaObserver is notified after live-price quota changed because an
// order was placed or cancelled.
type LiveQuotaObserver interface {
	LiveQuotaChanged(ctx context.Context)
}

type LiveRepository interface {
	GetSession(ctx context.Context, id string) (*LiveSession, error)
	// GetCurrentSession returns ErrLivestreamNotFound when no session is live.
	GetCurrentSession(ctx context.Context) (*LiveSession, error)
	ValidationData(ctx context.Context, sessionID string, productIDs, variantIDs []string) (*LiveValidationData, error)
	CreateSession(ctx context.Context, title, createdBy string, products []LiveProductInput) (*LiveSession, error)
	ReplaceProducts(ctx context.Context, sessionID string, products []LiveProductInput) error
	SetPinnedProduct(ctx context.Context, sessionID string, productID *string) error
	EndSession(ctx context.Context, sessionID, reason string) (*LiveSession, error)
	ListCatalog(ctx context.Context, sessionID string) ([]LiveCatalogProduct, []LiveCatalogVariant, error)
	ListRecentComments(ctx context.Context, sessionID string, includeHidden bool, limit int) ([]LiveComment, error)
	CountComments(ctx context.Context, sessionID string) (int64, error)
	InsertComment(ctx context.Context, sessionID, userID, content string) (*LiveComment, error)
	// HideComment returns ErrLiveCommentNotFound for an unknown comment.
	HideComment(ctx context.Context, id string) (*LiveComment, error)
	// LastCommentAt returns nil when the user has not commented in the session.
	LastCommentAt(ctx context.Context, sessionID, userID string) (*time.Time, error)
	// TouchSignal records that the session's publisher was seen at at.
	TouchSignal(ctx context.Context, sessionID string, at time.Time) error
	AddHearts(ctx context.Context, sessionID string, delta int64) error
	UpdatePeakViewers(ctx context.Context, sessionID string, viewers int) error
}

// CompareMoneyVND compares two canonical VND amounts like strings.Compare.
func CompareMoneyVND(a, b MoneyVND) int {
	x, okX := new(big.Int).SetString(string(a), 10)
	y, okY := new(big.Int).SetString(string(b), 10)
	if !okX || !okY {
		return 0
	}
	return x.Cmp(y)
}
