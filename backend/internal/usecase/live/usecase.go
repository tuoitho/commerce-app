// Package live implements live shopping sessions: lifecycle, the live cart with
// live prices, and the projections served to viewers and admins.
package live

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type Dependencies struct {
	Repo            domain.LiveRepository
	Media           domain.MediaServer
	Broadcaster     domain.LiveEventBroadcaster
	Clock           func() time.Time
	Logger          *slog.Logger
	WebRTCPublicURL string
	HLSPublicURL    string
	// SignalTimeout ends a live session whose publisher has been gone this long.
	SignalTimeout time.Duration
}

type UseCase struct {
	repo        domain.LiveRepository
	media       domain.MediaServer
	broadcaster domain.LiveEventBroadcaster
	clock       func() time.Time
	logger      *slog.Logger
	webrtcURL   string
	hlsURL      string
	timeout     time.Duration

	signalMu      sync.RWMutex
	signal        map[string]bool
	lastMediaWarn time.Time
}

var _ domain.LiveQuotaObserver = (*UseCase)(nil)

func New(deps Dependencies) *UseCase {
	clock := deps.Clock
	if clock == nil {
		clock = time.Now
	}
	broadcaster := deps.Broadcaster
	if broadcaster == nil {
		broadcaster = noopBroadcaster{}
	}
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	timeout := deps.SignalTimeout
	if timeout <= 0 {
		timeout = 10 * time.Minute
	}
	return &UseCase{
		repo:        deps.Repo,
		media:       deps.Media,
		broadcaster: broadcaster,
		clock:       clock,
		logger:      logger,
		webrtcURL:   deps.WebRTCPublicURL,
		hlsURL:      deps.HLSPublicURL,
		timeout:     timeout,
		signal:      map[string]bool{},
	}
}

// CurrentSummary returns the session being broadcast, or nil when none is.
func (uc *UseCase) CurrentSummary(ctx context.Context) (*domain.LiveSummary, error) {
	s, err := uc.repo.GetCurrentSession(ctx)
	if errors.Is(err, domain.ErrLivestreamNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &domain.LiveSummary{ID: s.ID, Title: s.Title, StartedAt: s.StartedAt}, nil
}

// SessionView is the projection served to viewers.
func (uc *UseCase) SessionView(ctx context.Context, id string) (*domain.LiveSessionView, error) {
	s, err := uc.getSession(ctx, id)
	if err != nil {
		return nil, err
	}
	return uc.customerView(ctx, s)
}

// AdminCurrent returns the admin projection of the session being broadcast,
// or nil when none is.
func (uc *UseCase) AdminCurrent(ctx context.Context) (*domain.AdminLiveSession, error) {
	s, err := uc.repo.GetCurrentSession(ctx)
	if errors.Is(err, domain.ErrLivestreamNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return uc.adminView(ctx, s)
}

func (uc *UseCase) AdminSession(ctx context.Context, id string) (*domain.AdminLiveSession, error) {
	s, err := uc.getSession(ctx, id)
	if err != nil {
		return nil, err
	}
	return uc.adminView(ctx, s)
}

// Create starts a new live session after checking the media server is up.
func (uc *UseCase) Create(ctx context.Context, adminID, title string, products []domain.LiveProductInput) (*domain.AdminLiveSession, error) {
	title = strings.TrimSpace(title)
	fields := map[string]string{}
	if n := utf8.RuneCountInString(title); n < 1 || n > domain.LiveTitleMaxLength {
		fields["title"] = "Tiêu đề phải từ 1 đến 120 ký tự"
	}
	normalized, err := uc.validateProducts(ctx, "", products, fields)
	if err != nil {
		return nil, err
	}
	if len(fields) > 0 {
		return nil, domain.NewValidationError(fields)
	}
	if err := uc.media.Ping(ctx); err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrMediaServerUnavailable, err)
	}
	s, err := uc.repo.CreateSession(ctx, title, adminID, normalized)
	if err != nil {
		return nil, err
	}
	return uc.adminView(ctx, s)
}

// ReplaceProducts replaces the live cart, keeping units already sold.
func (uc *UseCase) ReplaceProducts(ctx context.Context, id string, products []domain.LiveProductInput) (*domain.AdminLiveSession, error) {
	s, err := uc.getSession(ctx, id)
	if err != nil {
		return nil, err
	}
	if !s.IsLive() {
		return nil, domain.ErrLivestreamEnded
	}
	fields := map[string]string{}
	normalized, err := uc.validateProducts(ctx, s.ID, products, fields)
	if err != nil {
		return nil, err
	}
	if len(fields) > 0 {
		return nil, domain.NewValidationError(fields)
	}
	if err := uc.repo.ReplaceProducts(ctx, s.ID, normalized); err != nil {
		return nil, err
	}
	return uc.reloadAndAnnounce(ctx, s.ID)
}

// SetPin pins a product of the live cart, or clears the pin when productID is nil.
func (uc *UseCase) SetPin(ctx context.Context, id string, productID *string) (*domain.AdminLiveSession, error) {
	s, err := uc.getSession(ctx, id)
	if err != nil {
		return nil, err
	}
	if !s.IsLive() {
		return nil, domain.ErrLivestreamEnded
	}
	if productID != nil {
		products, _, err := uc.repo.ListCatalog(ctx, s.ID)
		if err != nil {
			return nil, err
		}
		if !containsActiveProduct(products, *productID) {
			return nil, domain.NewValidationError(map[string]string{"productId": "Sản phẩm không thuộc giỏ hàng live"})
		}
	}
	if err := uc.repo.SetPinnedProduct(ctx, s.ID, productID); err != nil {
		return nil, err
	}
	return uc.reloadAndAnnounce(ctx, s.ID)
}

// End finishes a session: pending hearts are stored first so the summary is
// complete, then viewers are told and disconnected.
func (uc *UseCase) End(ctx context.Context, id, reason string) (*domain.AdminLiveSession, error) {
	s, err := uc.getSession(ctx, id)
	if err != nil {
		return nil, err
	}
	if !s.IsLive() {
		return nil, domain.ErrLivestreamEnded
	}
	if err := uc.broadcaster.FlushHearts(ctx, s.ID); err != nil {
		return nil, err
	}
	ended, err := uc.repo.EndSession(ctx, s.ID, reason)
	if err != nil {
		return nil, err
	}
	view, err := uc.adminView(ctx, ended)
	if err != nil {
		return nil, err
	}
	endedAt := uc.clock().UTC()
	if ended.EndedAt != nil {
		endedAt = ended.EndedAt.UTC()
	}
	uc.broadcaster.Broadcast(s.ID, domain.LiveEventEnded, domain.LiveEndedEvent{EndedAt: endedAt, Reason: reason})
	uc.broadcaster.CloseRoom(s.ID)
	uc.forgetSignal(s.ID)
	return view, nil
}

// LiveQuotaChanged re-announces the live cart after orders changed sold units.
func (uc *UseCase) LiveQuotaChanged(ctx context.Context) {
	s, err := uc.repo.GetCurrentSession(ctx)
	if err != nil {
		return
	}
	_ = uc.announceProducts(ctx, s)
}

func (uc *UseCase) getSession(ctx context.Context, id string) (*domain.LiveSession, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, domain.ErrLivestreamNotFound
	}
	return uc.repo.GetSession(ctx, id)
}

func (uc *UseCase) reloadAndAnnounce(ctx context.Context, id string) (*domain.AdminLiveSession, error) {
	s, err := uc.repo.GetSession(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := uc.announceProducts(ctx, s); err != nil {
		return nil, err
	}
	return uc.adminView(ctx, s)
}

func (uc *UseCase) announceProducts(ctx context.Context, s *domain.LiveSession) error {
	products, err := uc.liveProducts(ctx, s)
	if err != nil {
		return err
	}
	uc.broadcaster.Broadcast(s.ID, domain.LiveEventProducts, domain.LiveProductsEvent{
		Products:        products,
		PinnedProductID: pinnedIn(s.PinnedProductID, products),
	})
	return nil
}

func (uc *UseCase) customerView(ctx context.Context, s *domain.LiveSession) (*domain.LiveSessionView, error) {
	view := uc.baseView(s)
	if !s.IsLive() {
		return view, nil
	}
	products, err := uc.liveProducts(ctx, s)
	if err != nil {
		return nil, err
	}
	comments, err := uc.repo.ListRecentComments(ctx, s.ID, false, domain.LiveRecentComments)
	if err != nil {
		return nil, err
	}
	view.Products = products
	view.Comments = nonNilComments(comments)
	view.PinnedProductID = pinnedIn(s.PinnedProductID, products)
	view.Media = &domain.LiveMedia{WhepURL: uc.whepURL(s.ID), HLSURL: uc.hlsSessionURL(s.ID)}
	return view, nil
}

func (uc *UseCase) adminView(ctx context.Context, s *domain.LiveSession) (*domain.AdminLiveSession, error) {
	view := uc.baseView(s)
	products, err := uc.liveProducts(ctx, s)
	if err != nil {
		return nil, err
	}
	comments, err := uc.repo.ListRecentComments(ctx, s.ID, true, domain.LiveRecentComments)
	if err != nil {
		return nil, err
	}
	commentCount, err := uc.repo.CountComments(ctx, s.ID)
	if err != nil {
		return nil, err
	}
	view.Products = products
	view.Comments = nonNilComments(comments)
	if s.IsLive() {
		view.PinnedProductID = pinnedIn(s.PinnedProductID, products)
		view.Media = &domain.LiveMedia{WhipURL: uc.whipURL(s.ID), WhepURL: uc.whepURL(s.ID), HLSURL: uc.hlsSessionURL(s.ID)}
	}
	end := uc.clock()
	if s.EndedAt != nil {
		end = *s.EndedAt
	}
	duration := int64(end.Sub(s.StartedAt) / time.Second)
	if duration < 0 {
		duration = 0
	}
	return &domain.AdminLiveSession{
		LiveSessionView: *view,
		Summary: domain.LiveSessionSummary{
			DurationSeconds: duration,
			PeakViewers:     s.PeakViewers,
			CommentCount:    commentCount,
			HeartCount:      s.HeartCount,
			EndReason:       s.EndReason,
		},
	}, nil
}

func (uc *UseCase) baseView(s *domain.LiveSession) *domain.LiveSessionView {
	view := &domain.LiveSessionView{
		ID:         s.ID,
		Title:      s.Title,
		Status:     s.Status,
		StartedAt:  s.StartedAt.UTC(),
		HeartCount: s.HeartCount,
		Products:   []domain.LiveProduct{},
		Comments:   []domain.LiveComment{},
	}
	if s.EndedAt != nil {
		ended := s.EndedAt.UTC()
		view.EndedAt = &ended
	}
	if s.IsLive() {
		view.ViewerCount = uc.broadcaster.ViewerCount(s.ID)
		view.SignalOnline = uc.signalOnline(s.ID)
	}
	return view
}

func (uc *UseCase) liveProducts(ctx context.Context, s *domain.LiveSession) ([]domain.LiveProduct, error) {
	products, variants, err := uc.repo.ListCatalog(ctx, s.ID)
	if err != nil {
		return nil, err
	}
	return buildLiveProducts(products, variants), nil
}

func (uc *UseCase) whipURL(id string) string {
	return uc.webrtcURL + "/" + domain.LivePath(id) + "/whip"
}

func (uc *UseCase) whepURL(id string) string {
	return uc.webrtcURL + "/" + domain.LivePath(id) + "/whep"
}

func (uc *UseCase) hlsSessionURL(id string) string {
	return uc.hlsURL + "/" + domain.LivePath(id) + "/index.m3u8"
}

func (uc *UseCase) signalOnline(id string) bool {
	uc.signalMu.RLock()
	defer uc.signalMu.RUnlock()
	return uc.signal[id]
}

func (uc *UseCase) forgetSignal(id string) {
	uc.signalMu.Lock()
	defer uc.signalMu.Unlock()
	delete(uc.signal, id)
}

func containsActiveProduct(products []domain.LiveCatalogProduct, id string) bool {
	for _, p := range products {
		if p.ProductID == id && p.Active {
			return true
		}
	}
	return false
}

// pinnedIn hides a pin whose product is no longer shown in the live cart.
func pinnedIn(pinned *string, products []domain.LiveProduct) *string {
	if pinned == nil {
		return nil
	}
	for _, p := range products {
		if p.ProductID == *pinned {
			id := *pinned
			return &id
		}
	}
	return nil
}

func nonNilComments(comments []domain.LiveComment) []domain.LiveComment {
	if comments == nil {
		return []domain.LiveComment{}
	}
	return comments
}

type noopBroadcaster struct{}

func (noopBroadcaster) Broadcast(string, string, any)             {}
func (noopBroadcaster) FlushHearts(context.Context, string) error { return nil }
func (noopBroadcaster) CloseRoom(string)                          {}
func (noopBroadcaster) ViewerCount(string) int                    { return 0 }
