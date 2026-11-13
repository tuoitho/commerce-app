package livews

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

const (
	roomA = "11111111-1111-1111-1111-111111111111"
	roomB = "22222222-2222-2222-2222-222222222222"
	userA = "aaaaaaaa-0000-0000-0000-000000000001"
	userB = "aaaaaaaa-0000-0000-0000-000000000002"
	admin = "aaaaaaaa-0000-0000-0000-0000000000ad"
)

type fakeStore struct {
	mu       sync.Mutex
	hearts   map[string]int64
	peaks    map[string]int
	sessions map[string]*domain.LiveSession
	failAdd  bool
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		hearts: map[string]int64{},
		peaks:  map[string]int{},
		sessions: map[string]*domain.LiveSession{
			roomA: {ID: roomA, Status: domain.LiveStatusLive, HeartCount: 100},
			roomB: {ID: roomB, Status: domain.LiveStatusLive},
		},
	}
}

func (s *fakeStore) GetSession(_ context.Context, id string) (*domain.LiveSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[id]
	if !ok {
		return nil, domain.ErrLivestreamNotFound
	}
	copy := *session
	return &copy, nil
}

func (s *fakeStore) AddHearts(_ context.Context, id string, delta int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failAdd {
		return errors.New("db down")
	}
	s.hearts[id] += delta
	return nil
}

func (s *fakeStore) UpdatePeakViewers(_ context.Context, id string, viewers int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if viewers > s.peaks[id] {
		s.peaks[id] = viewers
	}
	return nil
}

func (s *fakeStore) heartsOf(id string) int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.hearts[id]
}

func (s *fakeStore) peakOf(id string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.peaks[id]
}

type testClock struct{ now time.Time }

func (c *testClock) Now() time.Time { return c.now }

func newTestHub(store *fakeStore) (*Hub, *testClock) {
	clock := &testClock{now: time.Date(2026, 11, 13, 10, 0, 0, 0, time.UTC)}
	hub := NewHub(store, nil)
	hub.now = clock.Now
	return hub, clock
}

func joinTest(t *testing.T, hub *Hub, sessionID, userID, role string) *Client {
	t.Helper()
	c := newClient(hub, nil, sessionID, userID, role)
	require.True(t, hub.register(context.Background(), c))
	return c
}

type frame struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

func drain(c *Client) []frame {
	var frames []frame
	for {
		select {
		case raw, ok := <-c.send:
			if !ok {
				return frames
			}
			var f frame
			_ = json.Unmarshal(raw, &f)
			frames = append(frames, f)
		default:
			return frames
		}
	}
}

func lastOfType(frames []frame, typ string) (frame, bool) {
	for i := len(frames) - 1; i >= 0; i-- {
		if frames[i].Type == typ {
			return frames[i], true
		}
	}
	return frame{}, false
}

func TestHub_ViewerCountsDistinctCustomersOnly(t *testing.T) {
	store := newFakeStore()
	hub, _ := newTestHub(store)

	a1 := joinTest(t, hub, roomA, userA, domain.RoleCustomer)
	joinTest(t, hub, roomA, userA, domain.RoleCustomer)
	joinTest(t, hub, roomA, admin, domain.RoleAdmin)
	b := joinTest(t, hub, roomA, userB, domain.RoleCustomer)
	assert.Equal(t, 2, hub.ViewerCount(roomA))
	assert.Equal(t, 2, store.peakOf(roomA))

	f, ok := lastOfType(drain(a1), domain.LiveEventViewers)
	require.True(t, ok)
	assert.JSONEq(t, `{"count":2}`, string(f.Payload))

	hub.unregister(b)
	assert.Equal(t, 1, hub.ViewerCount(roomA))
	assert.Equal(t, 2, store.peakOf(roomA), "peak never decreases")
	assert.Equal(t, 0, hub.ViewerCount(roomB))
}

func TestHub_NewClientReceivesViewersAndLastSignal(t *testing.T) {
	hub, _ := newTestHub(newFakeStore())
	hub.Broadcast(roomA, domain.LiveEventSignal, map[string]bool{"online": true})

	c := joinTest(t, hub, roomA, userA, domain.RoleCustomer)
	frames := drain(c)
	require.Len(t, frames, 2)
	assert.Equal(t, domain.LiveEventViewers, frames[0].Type)
	assert.Equal(t, domain.LiveEventSignal, frames[1].Type)
	assert.JSONEq(t, `{"online":true}`, string(frames[1].Payload))

	other := joinTest(t, hub, roomB, userB, domain.RoleCustomer)
	f, _ := lastOfType(drain(other), domain.LiveEventSignal)
	assert.JSONEq(t, `{"online":false}`, string(f.Payload), "rooms without a signal report offline")
}

func TestHub_BroadcastStaysInItsRoom(t *testing.T) {
	hub, _ := newTestHub(newFakeStore())
	a := joinTest(t, hub, roomA, userA, domain.RoleCustomer)
	b := joinTest(t, hub, roomB, userB, domain.RoleCustomer)
	drain(a)
	drain(b)

	hub.Broadcast(roomA, domain.LiveEventComment, map[string]string{"content": "hi"})
	assert.Len(t, drain(a), 1)
	assert.Empty(t, drain(b))
}

func TestHub_HeartsAreLimitedPerUserPerSecond(t *testing.T) {
	store := newFakeStore()
	hub, clock := newTestHub(store)
	a := joinTest(t, hub, roomA, userA, domain.RoleCustomer)
	b := joinTest(t, hub, roomA, userB, domain.RoleCustomer)
	drain(a)
	drain(b)

	hub.acceptHearts(a, 15)
	hub.acceptHearts(a, 5)
	hub.acceptHearts(b, 3)
	hub.flushBursts()

	f, ok := lastOfType(drain(b), domain.LiveEventHearts)
	require.True(t, ok)
	var payload struct {
		Total  int64 `json:"total"`
		Bursts []struct {
			UserID string `json:"userId"`
			Count  int    `json:"count"`
		} `json:"bursts"`
	}
	require.NoError(t, json.Unmarshal(f.Payload, &payload))
	assert.EqualValues(t, 113, payload.Total, "100 stored + 10 capped + 3")
	counts := map[string]int{}
	for _, burst := range payload.Bursts {
		counts[burst.UserID] = burst.Count
	}
	assert.Equal(t, map[string]int{userA: 10, userB: 3}, counts)

	clock.now = clock.now.Add(time.Second)
	hub.acceptHearts(a, 4)
	hub.flushBursts()
	f, _ = lastOfType(drain(b), domain.LiveEventHearts)
	require.NoError(t, json.Unmarshal(f.Payload, &payload))
	assert.EqualValues(t, 117, payload.Total, "a new second resets the limit")

	hub.flushBursts()
	_, ok = lastOfType(drain(b), domain.LiveEventHearts)
	assert.False(t, ok, "no event without new hearts")
}

func TestHub_AdminHeartsAreIgnored(t *testing.T) {
	store := newFakeStore()
	hub, _ := newTestHub(store)
	ad := joinTest(t, hub, roomA, admin, domain.RoleAdmin)
	hub.acceptHearts(ad, 5)
	require.NoError(t, hub.FlushHearts(context.Background(), roomA))
	assert.Zero(t, store.heartsOf(roomA))
}

func TestHub_FlushHeartsPersistsPendingAndRetriesOnFailure(t *testing.T) {
	store := newFakeStore()
	hub, _ := newTestHub(store)
	a := joinTest(t, hub, roomA, userA, domain.RoleCustomer)
	hub.acceptHearts(a, 7)

	store.failAdd = true
	require.Error(t, hub.FlushHearts(context.Background(), roomA))
	hub.persistHearts(context.Background())
	assert.Zero(t, store.heartsOf(roomA))

	store.failAdd = false
	hub.persistHearts(context.Background())
	assert.EqualValues(t, 7, store.heartsOf(roomA))
	require.NoError(t, hub.FlushHearts(context.Background(), roomA))
	assert.EqualValues(t, 7, store.heartsOf(roomA), "nothing is stored twice")
}

func TestHub_CloseRoomDisconnectsAndStopsCountingHearts(t *testing.T) {
	store := newFakeStore()
	hub, _ := newTestHub(store)
	a := joinTest(t, hub, roomA, userA, domain.RoleCustomer)

	hub.CloseRoom(roomA)
	_, open := <-drainUntilClosed(a)
	assert.False(t, open, "client send channel is closed")
	assert.Equal(t, 0, hub.ViewerCount(roomA))

	hub.acceptHearts(a, 5)
	require.NoError(t, hub.FlushHearts(context.Background(), roomA))
	assert.Zero(t, store.heartsOf(roomA))
	assert.False(t, hub.register(context.Background(), newClient(hub, nil, roomA, userB, domain.RoleCustomer)), "a closed room accepts no one")
}

func drainUntilClosed(c *Client) <-chan []byte {
	for {
		select {
		case _, ok := <-c.send:
			if !ok {
				return c.send
			}
		default:
			return c.send
		}
	}
}

func TestHub_ShutdownAsksClientsToReconnect(t *testing.T) {
	hub, _ := newTestHub(newFakeStore())
	c := joinTest(t, hub, roomA, userA, domain.RoleCustomer)
	hub.Close()
	assert.Equal(t, websocket.CloseServiceRestart, c.closeCode, "a restart must not look like the session ending")

	hub2, _ := newTestHub(newFakeStore())
	c2 := joinTest(t, hub2, roomA, userA, domain.RoleCustomer)
	hub2.CloseRoom(roomA)
	assert.Equal(t, websocket.CloseNormalClosure, c2.closeCode, "an ended session closes normally")
}

func TestHub_HeartFramesOutsideOneToFiftyAreIgnored(t *testing.T) {
	store := newFakeStore()
	hub, _ := newTestHub(store)
	a := joinTest(t, hub, roomA, userA, domain.RoleCustomer)
	hub.acceptHearts(a, 51)
	hub.acceptHearts(a, 0)
	hub.acceptHearts(a, -3)
	require.NoError(t, hub.FlushHearts(context.Background(), roomA))
	assert.Zero(t, store.heartsOf(roomA))

	hub.acceptHearts(a, 50)
	require.NoError(t, hub.FlushHearts(context.Background(), roomA))
	assert.EqualValues(t, 10, store.heartsOf(roomA), "a valid frame is still limited to 10 per second")
}
