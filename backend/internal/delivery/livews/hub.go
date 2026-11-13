// Package livews runs the realtime rooms of live sessions: comments, hearts,
// viewer counts, live cart and signal updates are fanned out to every client
// connected to a session.
package livews

import (
	"context"
	"encoding/json"
	"log/slog"
	"sort"
	"sync"
	"time"

	"commerce-backend/internal/domain"
)

const (
	heartsPerSecond   = 10
	maxHeartsPerFrame = 50
	maxBursts         = 20
	burstInterval     = 300 * time.Millisecond
	persistInterval   = 2 * time.Second
)

// Store is the persistence the hub needs.
type Store interface {
	GetSession(ctx context.Context, id string) (*domain.LiveSession, error)
	AddHearts(ctx context.Context, sessionID string, delta int64) error
	UpdatePeakViewers(ctx context.Context, sessionID string, viewers int) error
}

type heartWindow struct {
	start time.Time
	count int
}

type room struct {
	clients map[*Client]bool
	// viewers counts open connections per customer; its length is the viewer count.
	viewers map[string]int
	peak    int
	total   int64
	pending int64
	bursts  map[string]int
	limits  map[string]*heartWindow
}

// Hub implements domain.LiveEventBroadcaster.
type Hub struct {
	mu     sync.Mutex
	rooms  map[string]*room
	ended  map[string]bool
	signal map[string][]byte
	store  Store
	logger *slog.Logger
	now    func() time.Time
}

var _ domain.LiveEventBroadcaster = (*Hub)(nil)

func NewHub(store Store, logger *slog.Logger) *Hub {
	if logger == nil {
		logger = slog.Default()
	}
	return &Hub{
		rooms:  map[string]*room{},
		ended:  map[string]bool{},
		signal: map[string][]byte{},
		store:  store,
		logger: logger,
		now:    time.Now,
	}
}

// Run announces hearts and stores them periodically until ctx is done.
func (h *Hub) Run(ctx context.Context) {
	bursts := time.NewTicker(burstInterval)
	persist := time.NewTicker(persistInterval)
	defer bursts.Stop()
	defer persist.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-bursts.C:
			h.flushBursts()
		case <-persist.C:
			h.persistHearts(ctx)
		}
	}
}

// Close stores pending hearts and disconnects every client on shutdown.
func (h *Hub) Close() {
	h.persistHearts(context.Background())
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, r := range h.rooms {
		for c := range r.clients {
			c.closeWith(closeRestart)
		}
		delete(h.rooms, id)
	}
}

func (h *Hub) Broadcast(sessionID, event string, payload any) {
	data, err := encode(event, payload)
	if err != nil {
		h.logger.Error("encode live event failed", "event", event, "error", err)
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if event == domain.LiveEventSignal {
		h.signal[sessionID] = data
	}
	if r := h.rooms[sessionID]; r != nil {
		h.sendAll(r, data)
	}
}

func (h *Hub) FlushHearts(ctx context.Context, sessionID string) error {
	h.mu.Lock()
	r := h.rooms[sessionID]
	if r == nil || r.pending == 0 {
		h.mu.Unlock()
		return nil
	}
	pending := r.pending
	r.pending = 0
	h.mu.Unlock()

	if err := h.store.AddHearts(ctx, sessionID, pending); err != nil {
		h.mu.Lock()
		r.pending += pending
		h.mu.Unlock()
		return err
	}
	return nil
}

func (h *Hub) CloseRoom(sessionID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.ended[sessionID] = true
	delete(h.signal, sessionID)
	r := h.rooms[sessionID]
	if r == nil {
		return
	}
	for c := range r.clients {
		c.closeWith(closeNormal)
	}
	delete(h.rooms, sessionID)
}

func (h *Hub) ViewerCount(sessionID string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	if r := h.rooms[sessionID]; r != nil {
		return len(r.viewers)
	}
	return 0
}

// register adds c to its room and sends it the current viewer count and
// signal state. It reports false when the session's room is already closed.
func (h *Hub) register(ctx context.Context, c *Client) bool {
	h.mu.Lock()
	if h.ended[c.sessionID] {
		h.mu.Unlock()
		return false
	}
	r := h.rooms[c.sessionID]
	h.mu.Unlock()

	if r == nil {
		var total int64
		if session, err := h.store.GetSession(ctx, c.sessionID); err == nil {
			total = session.HeartCount
		}
		h.mu.Lock()
		if h.ended[c.sessionID] {
			h.mu.Unlock()
			return false
		}
		if r = h.rooms[c.sessionID]; r == nil {
			r = &room{
				clients: map[*Client]bool{},
				viewers: map[string]int{},
				bursts:  map[string]int{},
				limits:  map[string]*heartWindow{},
				total:   total,
			}
			h.rooms[c.sessionID] = r
		}
		h.mu.Unlock()
	}

	h.mu.Lock()
	newPeak := 0
	if c.role == domain.RoleCustomer {
		r.viewers[c.userID]++
		if r.viewers[c.userID] == 1 {
			// Existing clients learn the new count; c receives it below.
			h.sendViewers(r)
			if len(r.viewers) > r.peak {
				r.peak = len(r.viewers)
				newPeak = r.peak
			}
		}
	}
	r.clients[c] = true
	if data, err := encode(domain.LiveEventViewers, viewersPayload{Count: len(r.viewers)}); err == nil {
		c.SendMessage(data)
	}
	signal := h.signal[c.sessionID]
	if signal == nil {
		signal, _ = encode(domain.LiveEventSignal, domain.LiveSignalEvent{Online: false})
	}
	c.SendMessage(signal)
	h.mu.Unlock()

	if newPeak > 0 {
		if err := h.store.UpdatePeakViewers(ctx, c.sessionID, newPeak); err != nil {
			h.logger.Warn("update live peak viewers failed", "session_id", c.sessionID, "error", err)
		}
	}
	return true
}

func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.rooms[c.sessionID]
	if r == nil || !r.clients[c] {
		return
	}
	delete(r.clients, c)
	c.closeWith(closeNormal)
	if c.role == domain.RoleCustomer {
		r.viewers[c.userID]--
		if r.viewers[c.userID] <= 0 {
			delete(r.viewers, c.userID)
			h.sendViewers(r)
		}
	}
}

// acceptHearts counts at most heartsPerSecond hearts per customer per second;
// hearts beyond the limit, and frames outside 1..maxHeartsPerFrame, are dropped silently.
func (h *Hub) acceptHearts(c *Client, n int) {
	if c.role != domain.RoleCustomer || n < 1 || n > maxHeartsPerFrame {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.rooms[c.sessionID]
	if r == nil || h.ended[c.sessionID] {
		return
	}
	now := h.now()
	w := r.limits[c.userID]
	if w == nil || now.Sub(w.start) >= time.Second {
		w = &heartWindow{start: now}
		r.limits[c.userID] = w
	}
	allowed := heartsPerSecond - w.count
	if n < allowed {
		allowed = n
	}
	if allowed <= 0 {
		return
	}
	w.count += allowed
	r.total += int64(allowed)
	r.pending += int64(allowed)
	r.bursts[c.userID] += allowed
}

// flushBursts announces the hearts accepted since the previous call.
func (h *Hub) flushBursts() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, r := range h.rooms {
		if len(r.bursts) == 0 {
			continue
		}
		payload := heartsPayload{Total: r.total, Bursts: make([]heartBurst, 0, len(r.bursts))}
		for userID, count := range r.bursts {
			payload.Bursts = append(payload.Bursts, heartBurst{UserID: userID, Count: count})
		}
		sort.Slice(payload.Bursts, func(i, j int) bool { return payload.Bursts[i].Count > payload.Bursts[j].Count })
		if len(payload.Bursts) > maxBursts {
			payload.Bursts = payload.Bursts[:maxBursts]
		}
		r.bursts = map[string]int{}
		if data, err := encode(domain.LiveEventHearts, payload); err == nil {
			h.sendAll(r, data)
		}
	}
}

// persistHearts stores the hearts of every room; failures are retried on the
// next call.
func (h *Hub) persistHearts(ctx context.Context) {
	h.mu.Lock()
	ids := make([]string, 0, len(h.rooms))
	for id := range h.rooms {
		ids = append(ids, id)
	}
	h.mu.Unlock()
	for _, id := range ids {
		if err := h.FlushHearts(ctx, id); err != nil {
			h.logger.Warn("persist live hearts failed", "session_id", id, "error", err)
		}
	}
}

// sendViewers must be called with h.mu held.
func (h *Hub) sendViewers(r *room) {
	if data, err := encode(domain.LiveEventViewers, viewersPayload{Count: len(r.viewers)}); err == nil {
		h.sendAll(r, data)
	}
}

// sendAll must be called with h.mu held.
func (h *Hub) sendAll(r *room, data []byte) {
	for c := range r.clients {
		c.SendMessage(data)
	}
}

type viewersPayload struct {
	Count int `json:"count"`
}

type heartBurst struct {
	UserID string `json:"userId"`
	Count  int    `json:"count"`
}

type heartsPayload struct {
	Total  int64        `json:"total"`
	Bursts []heartBurst `json:"bursts"`
}

func encode(event string, payload any) ([]byte, error) {
	return json.Marshal(struct {
		Type    string `json:"type"`
		Payload any    `json:"payload,omitempty"`
	}{Type: event, Payload: payload})
}
