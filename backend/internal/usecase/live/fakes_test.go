package live

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"commerce-backend/internal/domain"
)

type fakeRepo struct {
	mu         sync.Mutex
	sessions   map[string]*domain.LiveSession
	products   map[string][]domain.LiveCatalogProduct
	variants   map[string][]domain.LiveCatalogVariant
	comments   map[string][]domain.LiveComment
	validation *domain.LiveValidationData
	created    []domain.LiveProductInput
	replaced   []domain.LiveProductInput
	createErr  error
	calls      []string
	now        time.Time
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		sessions: map[string]*domain.LiveSession{},
		products: map[string][]domain.LiveCatalogProduct{},
		variants: map[string][]domain.LiveCatalogVariant{},
		comments: map[string][]domain.LiveComment{},
		validation: &domain.LiveValidationData{
			Products: map[string]domain.LiveValidationProduct{},
			Variants: map[string]domain.LiveValidationVariant{},
			Sold:     map[string]int{},
		},
	}
}

func (f *fakeRepo) record(call string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, call)
}

func (f *fakeRepo) GetSession(_ context.Context, id string) (*domain.LiveSession, error) {
	s, ok := f.sessions[id]
	if !ok {
		return nil, domain.ErrLivestreamNotFound
	}
	copy := *s
	return &copy, nil
}

func (f *fakeRepo) GetCurrentSession(_ context.Context) (*domain.LiveSession, error) {
	for _, s := range f.sessions {
		if s.IsLive() {
			copy := *s
			return &copy, nil
		}
	}
	return nil, domain.ErrLivestreamNotFound
}

func (f *fakeRepo) ValidationData(_ context.Context, _ string, _, _ []string) (*domain.LiveValidationData, error) {
	return f.validation, nil
}

func (f *fakeRepo) CreateSession(_ context.Context, title, createdBy string, products []domain.LiveProductInput) (*domain.LiveSession, error) {
	f.record("create")
	if f.createErr != nil {
		return nil, f.createErr
	}
	f.created = products
	s := &domain.LiveSession{ID: "11111111-1111-1111-1111-111111111111", Title: title, Status: domain.LiveStatusLive, CreatedBy: createdBy, StartedAt: time.Date(2026, 11, 13, 10, 0, 0, 0, time.UTC)}
	f.sessions[s.ID] = s
	return s, nil
}

func (f *fakeRepo) ReplaceProducts(_ context.Context, sessionID string, products []domain.LiveProductInput) error {
	s, ok := f.sessions[sessionID]
	if !ok {
		return domain.ErrLivestreamNotFound
	}
	if !s.IsLive() {
		return domain.ErrLivestreamEnded
	}
	f.replaced = products
	return nil
}

func (f *fakeRepo) SetPinnedProduct(_ context.Context, sessionID string, productID *string) error {
	s, ok := f.sessions[sessionID]
	if !ok {
		return domain.ErrLivestreamNotFound
	}
	if !s.IsLive() {
		return domain.ErrLivestreamEnded
	}
	s.PinnedProductID = productID
	return nil
}

func (f *fakeRepo) EndSession(_ context.Context, sessionID, reason string) (*domain.LiveSession, error) {
	f.record("end")
	s, ok := f.sessions[sessionID]
	if !ok {
		return nil, domain.ErrLivestreamNotFound
	}
	if !s.IsLive() {
		return nil, domain.ErrLivestreamEnded
	}
	ended := time.Date(2026, 11, 13, 10, 30, 0, 0, time.UTC)
	s.Status, s.EndedAt, s.EndReason = domain.LiveStatusEnded, &ended, &reason
	copy := *s
	return &copy, nil
}

func (f *fakeRepo) ListCatalog(_ context.Context, sessionID string) ([]domain.LiveCatalogProduct, []domain.LiveCatalogVariant, error) {
	return f.products[sessionID], f.variants[sessionID], nil
}

func (f *fakeRepo) ListRecentComments(_ context.Context, sessionID string, includeHidden bool, limit int) ([]domain.LiveComment, error) {
	var out []domain.LiveComment
	for _, c := range f.comments[sessionID] {
		if c.Hidden && !includeHidden {
			continue
		}
		out = append(out, c)
	}
	if len(out) > limit {
		out = out[len(out)-limit:]
	}
	return out, nil
}

func (f *fakeRepo) CountComments(_ context.Context, sessionID string) (int64, error) {
	return int64(len(f.comments[sessionID])), nil
}

func (f *fakeRepo) InsertComment(_ context.Context, sessionID, userID, content string) (*domain.LiveComment, error) {
	f.record("insert-comment")
	role, name := "customer", "Lan"
	if userID == adminID {
		role, name = "admin", domain.LiveShopAuthorName
	}
	c := domain.LiveComment{ID: fmt.Sprintf("cccccccc-0000-0000-0000-%012d", len(f.comments[sessionID])+1), SessionID: sessionID, UserID: userID, AuthorName: name, AuthorRole: role, Content: content, CreatedAt: f.now}
	f.comments[sessionID] = append(f.comments[sessionID], c)
	return &c, nil
}

func (f *fakeRepo) HideComment(_ context.Context, id string) (*domain.LiveComment, error) {
	for sid, list := range f.comments {
		for i := range list {
			if list[i].ID == id {
				list[i].Hidden = true
				c := f.comments[sid][i]
				return &c, nil
			}
		}
	}
	return nil, domain.ErrLiveCommentNotFound
}

func (f *fakeRepo) LastCommentAt(_ context.Context, sessionID, userID string) (*time.Time, error) {
	var last *time.Time
	for _, c := range f.comments[sessionID] {
		if c.UserID == userID {
			at := c.CreatedAt
			last = &at
		}
	}
	return last, nil
}

func (f *fakeRepo) TouchSignal(_ context.Context, sessionID string, at time.Time) error {
	if s, ok := f.sessions[sessionID]; ok && s.IsLive() {
		s.LastSignalAt = &at
	}
	return nil
}

func (f *fakeRepo) AddHearts(context.Context, string, int64) error { return nil }

func (f *fakeRepo) UpdatePeakViewers(context.Context, string, int) error { return nil }

type fakeMedia struct {
	pingErr error
	online  map[string]bool
	onErr   error
	calls   int
}

func (m *fakeMedia) Ping(context.Context) error { return m.pingErr }

func (m *fakeMedia) PathOnline(_ context.Context, path string) (bool, error) {
	m.calls++
	if m.onErr != nil {
		return false, m.onErr
	}
	return m.online[path], nil
}

type sentEvent struct {
	SessionID string
	Event     string
	Payload   any
}

type fakeBroadcaster struct {
	mu      sync.Mutex
	events  []sentEvent
	viewers map[string]int
	log     *[]string
	flushes int
}

func (b *fakeBroadcaster) Broadcast(sessionID, event string, payload any) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.events = append(b.events, sentEvent{sessionID, event, payload})
	if b.log != nil {
		*b.log = append(*b.log, "broadcast:"+event)
	}
}

func (b *fakeBroadcaster) FlushHearts(context.Context, string) error {
	b.flushes++
	if b.log != nil {
		*b.log = append(*b.log, "flush")
	}
	return nil
}

func (b *fakeBroadcaster) CloseRoom(string) {
	if b.log != nil {
		*b.log = append(*b.log, "close")
	}
}

func (b *fakeBroadcaster) ViewerCount(sessionID string) int { return b.viewers[sessionID] }

func (b *fakeBroadcaster) eventsOf(name string) []sentEvent {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []sentEvent
	for _, e := range b.events {
		if e.Event == name {
			out = append(out, e)
		}
	}
	return out
}

var errBoom = errors.New("boom")
