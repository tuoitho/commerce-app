package http

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

func TestMediaMTXAuth(t *testing.T) {
	repo := newLiveFixtureRepo()
	env := setupLiveTestRouter(t, repo, fakeLiveMedia{})
	expired, err := env.manager.GenerateAccessToken(liveTestCustomer, domain.RoleCustomer, -time.Minute)
	require.NoError(t, err)
	path := "live/" + liveTestSession

	post := func(t *testing.T, body map[string]any) *httptest.ResponseRecorder {
		t.Helper()
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		req := httptest.NewRequest(http.MethodPost, "/internal/mediamtx/auth", bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		env.router.ServeHTTP(w, req)
		return w
	}

	cases := []struct {
		name string
		body map[string]any
		want int
	}{
		{"admin publishes", map[string]any{"token": env.admin, "action": "publish", "path": path, "protocol": "webrtc"}, http.StatusOK},
		{"customer cannot publish", map[string]any{"token": env.customer, "action": "publish", "path": path}, http.StatusUnauthorized},
		{"customer reads with bearer token", map[string]any{"token": env.customer, "action": "read", "path": path, "protocol": "webrtc"}, http.StatusOK},
		{"native HLS reads with token query", map[string]any{"token": "", "query": "token=" + env.customer, "action": "read", "path": path, "protocol": "hls"}, http.StatusOK},
		{"missing token", map[string]any{"action": "read", "path": path}, http.StatusUnauthorized},
		{"expired token", map[string]any{"token": expired, "action": "read", "path": path}, http.StatusUnauthorized},
		{"garbage token", map[string]any{"token": "garbage", "action": "read", "path": path}, http.StatusUnauthorized},
		{"unknown session path", map[string]any{"token": env.customer, "action": "read", "path": "live/99999999-0000-0000-0000-000000000000"}, http.StatusUnauthorized},
		{"other action", map[string]any{"token": env.admin, "action": "playback", "path": path}, http.StatusUnauthorized},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := post(t, tc.body)
			assert.Equal(t, tc.want, w.Code)
			assert.Empty(t, w.Body.String(), "MediaMTX only reads the status code")
		})
	}

	t.Run("ended session is refused", func(t *testing.T) {
		ended := newLiveFixtureRepo()
		ended.session.Status = domain.LiveStatusEnded
		endedEnv := setupLiveTestRouter(t, ended, fakeLiveMedia{})
		raw, _ := json.Marshal(map[string]any{"token": endedEnv.customer, "action": "read", "path": path})
		req := httptest.NewRequest(http.MethodPost, "/internal/mediamtx/auth", bytes.NewReader(raw))
		w := httptest.NewRecorder()
		endedEnv.router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("malformed body is refused", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/internal/mediamtx/auth", strings.NewReader("{"))
		w := httptest.NewRecorder()
		env.router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestMediaMTXAuth_NeverLogsTokens(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	repo := newLiveFixtureRepo()
	env := setupLiveTestRouterWithLogger(t, repo, logger)
	for _, body := range []map[string]any{
		{"token": env.customer, "action": "publish", "path": "live/" + liveTestSession},
		{"token": "", "query": "token=" + env.customer, "action": "read", "path": "live/" + liveTestSession},
	} {
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/internal/mediamtx/auth", bytes.NewReader(raw))
		env.router.ServeHTTP(httptest.NewRecorder(), req)
	}
	assert.NotContains(t, logs.String(), env.customer)
}
