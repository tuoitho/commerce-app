package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/delivery/livews"
	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	liveuc "commerce-backend/internal/usecase/live"
)

type liveWSEnv struct {
	server   *httptest.Server
	hub      *livews.Hub
	uc       *liveuc.UseCase
	admin    string
	customer string
	manager  *jwt.Manager
}

func setupLiveWSServer(t *testing.T, repo *fakeLiveRepo) *liveWSEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	hub := livews.NewHub(repo, nil)
	uc := liveuc.New(liveuc.Dependencies{
		Repo:            repo,
		Media:           fakeLiveMedia{},
		Broadcaster:     hub,
		Clock:           func() time.Time { return time.Date(2026, 11, 13, 3, 20, 0, 0, time.UTC) },
		WebRTCPublicURL: "http://localhost:8889",
		HLSPublicURL:    "http://localhost:8888",
	})
	r := gin.New()
	NewRouter(r, Dependencies{Live: uc, LiveHub: hub, JWT: manager, RefreshTTL: time.Hour})
	server := httptest.NewServer(r)
	ctx, cancel := context.WithCancel(context.Background())
	go hub.Run(ctx)
	t.Cleanup(func() {
		cancel()
		server.Close()
		hub.Close()
	})
	admin, err := manager.GenerateAccessToken(liveTestAdmin, domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)
	customer, err := manager.GenerateAccessToken(liveTestCustomer, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)
	return &liveWSEnv{server: server, hub: hub, uc: uc, admin: admin, customer: customer, manager: manager}
}

func (e *liveWSEnv) dial(t *testing.T, sessionID, token string) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(e.server.URL, "http") + "/api/v1/live/sessions/" + sessionID + "/ws?token=" + token
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

func (e *liveWSEnv) rest(t *testing.T, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var raw []byte
	if body != nil {
		var err error
		raw, err = json.Marshal(body)
		require.NoError(t, err)
	}
	req, err := http.NewRequest(method, e.server.URL+path, bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	w := httptest.NewRecorder()
	w.Code = resp.StatusCode
	_, _ = w.Body.ReadFrom(resp.Body)
	return w
}

type liveFrame struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
	raw     []byte
}

// readUntil reads frames until one of type typ arrives.
func readUntil(t *testing.T, conn *websocket.Conn, typ string) liveFrame {
	t.Helper()
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(3*time.Second)))
	for {
		_, data, err := conn.ReadMessage()
		require.NoError(t, err, "waiting for %s", typ)
		var f liveFrame
		require.NoError(t, json.Unmarshal(data, &f))
		f.raw = data
		if f.Type == typ {
			return f
		}
	}
}

func expectClose(t *testing.T, conn *websocket.Conn, code int) {
	t.Helper()
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(3*time.Second)))
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			var closeErr *websocket.CloseError
			require.ErrorAs(t, err, &closeErr)
			assert.Equal(t, code, closeErr.Code)
			return
		}
	}
}

func snapshotFrame(t *testing.T, key string, f liveFrame) {
	t.Helper()
	w := httptest.NewRecorder()
	w.Code = http.StatusOK
	w.Body = bytes.NewBuffer(f.raw)
	assertOrRecordContractSnapshot(t, liveSnapshotPath, "livestream-shopping", key, "WS-LIVE-ROOM@1", "WS /api/v1/live/sessions/:id/ws", nil, w)
}

func TestLiveWS_RejectsBadTokenAndUnknownSession(t *testing.T) {
	env := setupLiveWSServer(t, newLiveFixtureRepo())
	expectClose(t, env.dial(t, liveTestSession, "garbage"), 4001)
	expectClose(t, env.dial(t, "99999999-0000-0000-0000-000000000000", env.customer), 4004)
	expectClose(t, env.dial(t, "not-a-uuid", env.customer), 4004)
}

func TestLiveWS_RoomEvents(t *testing.T) {
	env := setupLiveWSServer(t, newLiveFixtureRepo())
	viewer := env.dial(t, liveTestSession, env.customer)
	viewers := readUntil(t, viewer, domain.LiveEventViewers)
	assert.JSONEq(t, `{"count":1}`, string(viewers.Payload))
	snapshotFrame(t, "ws_live_viewers", viewers)

	signal := readUntil(t, viewer, domain.LiveEventSignal)
	assert.JSONEq(t, `{"online":false}`, string(signal.Payload))
	snapshotFrame(t, "ws_live_signal", signal)

	shop := env.dial(t, liveTestSession, env.admin)
	readUntil(t, shop, domain.LiveEventSignal)
	assert.Equal(t, 1, env.hub.ViewerCount(liveTestSession), "the admin is not a viewer")

	require.NoError(t, viewer.WriteJSON(map[string]any{"type": "live:heart", "payload": map[string]int{"count": 15}}))
	hearts := readUntil(t, shop, domain.LiveEventHearts)
	var heartsPayload struct {
		Total  int64 `json:"total"`
		Bursts []struct {
			UserID string `json:"userId"`
			Count  int    `json:"count"`
		} `json:"bursts"`
	}
	require.NoError(t, json.Unmarshal(hearts.Payload, &heartsPayload))
	assert.EqualValues(t, 138, heartsPayload.Total, "128 stored + 10 allowed per second")
	require.Len(t, heartsPayload.Bursts, 1)
	assert.Equal(t, liveTestCustomer, heartsPayload.Bursts[0].UserID)
	snapshotFrame(t, "ws_live_hearts", hearts)

	w := env.rest(t, http.MethodPut, "/api/v1/admin/live/sessions/"+liveTestSession+"/pin", env.admin, map[string]any{"productId": liveTestProduct})
	require.Equal(t, http.StatusOK, w.Code)
	products := readUntil(t, viewer, domain.LiveEventProducts)
	assert.Contains(t, string(products.Payload), `"pinnedProductId":"`+liveTestProduct+`"`)
	snapshotFrame(t, "ws_live_products", products)

	w = env.rest(t, http.MethodPost, "/api/v1/admin/live/sessions/"+liveTestSession+"/end", env.admin, nil)
	require.Equal(t, http.StatusOK, w.Code)
	var ended struct {
		Data domain.AdminLiveSession `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &ended))
	assert.EqualValues(t, 138, ended.Data.Summary.HeartCount, "pending hearts are stored before the summary")

	endedFrame := readUntil(t, viewer, domain.LiveEventEnded)
	assert.Contains(t, string(endedFrame.Payload), `"reason":"admin"`)
	snapshotFrame(t, "ws_live_ended", endedFrame)
	expectClose(t, viewer, websocket.CloseNormalClosure)

	late := env.dial(t, liveTestSession, env.customer)
	readUntil(t, late, domain.LiveEventEnded)
	expectClose(t, late, websocket.CloseNormalClosure)
}

func TestLiveWS_CommentEvents(t *testing.T) {
	env := setupLiveWSServer(t, newLiveFixtureRepo())
	viewer := env.dial(t, liveTestSession, env.customer)
	readUntil(t, viewer, domain.LiveEventSignal)

	w := env.rest(t, http.MethodPost, "/api/v1/admin/live/sessions/"+liveTestSession+"/comments", env.admin, map[string]any{"content": "Chào cả nhà"})
	require.Equal(t, http.StatusCreated, w.Code)
	comment := readUntil(t, viewer, domain.LiveEventComment)
	assert.Contains(t, string(comment.Payload), `"authorName":"Chủ shop"`)
	snapshotFrame(t, "ws_live_comment", comment)

	w = env.rest(t, http.MethodPost, "/api/v1/admin/live/comments/44444444-4444-4444-4444-444444444444/hide", env.admin, nil)
	require.Equal(t, http.StatusOK, w.Code)
	hidden := readUntil(t, viewer, domain.LiveEventCommentHidden)
	assert.JSONEq(t, `{"commentId":"44444444-4444-4444-4444-444444444444"}`, string(hidden.Payload))
	snapshotFrame(t, "ws_live_comment_hidden", hidden)
}
