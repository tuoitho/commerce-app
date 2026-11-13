package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	liveuc "commerce-backend/internal/usecase/live"
)

const (
	liveTestSession  = "11111111-1111-1111-1111-111111111111"
	liveTestAdmin    = "22222222-2222-2222-2222-222222222222"
	liveTestCustomer = "33333333-3333-3333-3333-333333333333"
	liveTestProduct  = "aaaaaaaa-0000-0000-0000-00000000000a"
	liveTestVariant  = "aaaaaaaa-0000-0000-0000-0000000000a1"
	liveTestVariant2 = "aaaaaaaa-0000-0000-0000-0000000000a2"
)

var liveSnapshotPath = filepath.Join("..", "..", "..", "..", ".dream", "specs", "livestream-shopping", "contract-snapshots.json")

// fakeLiveRepo is an in-memory domain.LiveRepository for handler tests.
type fakeLiveRepo struct {
	session  *domain.LiveSession
	products []domain.LiveCatalogProduct
	variants []domain.LiveCatalogVariant
	comments []domain.LiveComment
}

func newLiveFixtureRepo() *fakeLiveRepo {
	quota := 10
	pinned := liveTestProduct
	return &fakeLiveRepo{
		session: &domain.LiveSession{
			ID: liveTestSession, Title: "Flash sale iPhone", Status: domain.LiveStatusLive, CreatedBy: liveTestAdmin,
			PinnedProductID: &pinned, HeartCount: 128, PeakViewers: 9,
			StartedAt: time.Date(2026, 11, 13, 3, 0, 0, 0, time.UTC),
		},
		products: []domain.LiveCatalogProduct{{ProductID: liveTestProduct, Name: "iPhone 16 Pro", Brand: "Apple", ImageURL: "https://example.com/a.jpg", Active: true}},
		variants: []domain.LiveCatalogVariant{
			{VariantID: liveTestVariant, ProductID: liveTestProduct, Active: true, StockQuantity: 5, RegularPriceVND: "28990000", HasLivePrice: true, LivePriceVND: "25990000", Quota: &quota, Sold: 3, LiveActive: true, OptionLabel: "256GB / Titan Đen"},
			{VariantID: liveTestVariant2, ProductID: liveTestProduct, Active: true, StockQuantity: 2, RegularPriceVND: "32990000", OptionLabel: "512GB / Titan Đen"},
		},
		comments: []domain.LiveComment{{ID: "44444444-4444-4444-4444-444444444444", SessionID: liveTestSession, AuthorName: "Lan", AuthorRole: "customer", Content: "Còn màu titan không shop?", CreatedAt: time.Date(2026, 11, 13, 3, 5, 0, 0, time.UTC)}},
	}
}

func (f *fakeLiveRepo) GetSession(_ context.Context, id string) (*domain.LiveSession, error) {
	if f.session == nil || f.session.ID != id {
		return nil, domain.ErrLivestreamNotFound
	}
	s := *f.session
	return &s, nil
}

func (f *fakeLiveRepo) GetCurrentSession(_ context.Context) (*domain.LiveSession, error) {
	if f.session == nil || !f.session.IsLive() {
		return nil, domain.ErrLivestreamNotFound
	}
	s := *f.session
	return &s, nil
}

func (f *fakeLiveRepo) ValidationData(context.Context, string, []string, []string) (*domain.LiveValidationData, error) {
	return &domain.LiveValidationData{
		Products: map[string]domain.LiveValidationProduct{liveTestProduct: {ID: liveTestProduct, Active: true}},
		Variants: map[string]domain.LiveValidationVariant{
			liveTestVariant:  {ID: liveTestVariant, ProductID: liveTestProduct, Active: true, RegularPriceVND: "28990000"},
			liveTestVariant2: {ID: liveTestVariant2, ProductID: liveTestProduct, Active: true, RegularPriceVND: "32990000"},
		},
		Sold: map[string]int{liveTestVariant: 3},
	}, nil
}

func (f *fakeLiveRepo) CreateSession(_ context.Context, title, createdBy string, _ []domain.LiveProductInput) (*domain.LiveSession, error) {
	if f.session != nil && f.session.IsLive() {
		return nil, domain.ErrLivestreamAlreadyActive
	}
	fixture := newLiveFixtureRepo()
	*f = *fixture
	f.session.Title, f.session.CreatedBy, f.session.HeartCount, f.session.PeakViewers = title, createdBy, 0, 0
	f.comments = nil
	s := *f.session
	return &s, nil
}

func (f *fakeLiveRepo) ReplaceProducts(_ context.Context, id string, _ []domain.LiveProductInput) error {
	if f.session == nil || f.session.ID != id {
		return domain.ErrLivestreamNotFound
	}
	if !f.session.IsLive() {
		return domain.ErrLivestreamEnded
	}
	return nil
}

func (f *fakeLiveRepo) SetPinnedProduct(_ context.Context, _ string, productID *string) error {
	f.session.PinnedProductID = productID
	return nil
}

func (f *fakeLiveRepo) EndSession(_ context.Context, id, reason string) (*domain.LiveSession, error) {
	if f.session == nil || f.session.ID != id {
		return nil, domain.ErrLivestreamNotFound
	}
	if !f.session.IsLive() {
		return nil, domain.ErrLivestreamEnded
	}
	ended := f.session.StartedAt.Add(45 * time.Minute)
	f.session.Status, f.session.EndedAt, f.session.EndReason = domain.LiveStatusEnded, &ended, &reason
	f.variants[0].LiveActive = false
	s := *f.session
	return &s, nil
}

func (f *fakeLiveRepo) ListCatalog(context.Context, string) ([]domain.LiveCatalogProduct, []domain.LiveCatalogVariant, error) {
	return f.products, f.variants, nil
}

func (f *fakeLiveRepo) ListRecentComments(_ context.Context, _ string, includeHidden bool, _ int) ([]domain.LiveComment, error) {
	var out []domain.LiveComment
	for _, c := range f.comments {
		if includeHidden || !c.Hidden {
			out = append(out, c)
		}
	}
	return out, nil
}

func (f *fakeLiveRepo) CountComments(context.Context, string) (int64, error) {
	return int64(len(f.comments)), nil
}

func (f *fakeLiveRepo) InsertComment(_ context.Context, sessionID, userID, content string) (*domain.LiveComment, error) {
	role, name := "customer", "Lan"
	if userID == liveTestAdmin {
		role, name = "admin", domain.LiveShopAuthorName
	}
	c := domain.LiveComment{ID: "44444444-4444-4444-4444-44444444444" + string(rune('0'+len(f.comments))), SessionID: sessionID, UserID: userID, AuthorName: name, AuthorRole: role, Content: content, CreatedAt: time.Date(2026, 11, 13, 3, 20, 0, 0, time.UTC)}
	f.comments = append(f.comments, c)
	return &c, nil
}

func (f *fakeLiveRepo) HideComment(_ context.Context, id string) (*domain.LiveComment, error) {
	for i := range f.comments {
		if f.comments[i].ID == id {
			f.comments[i].Hidden = true
			c := f.comments[i]
			return &c, nil
		}
	}
	return nil, domain.ErrLiveCommentNotFound
}

func (f *fakeLiveRepo) LastCommentAt(_ context.Context, _, userID string) (*time.Time, error) {
	var last *time.Time
	for _, c := range f.comments {
		if c.UserID == userID {
			at := c.CreatedAt
			last = &at
		}
	}
	return last, nil
}

func (f *fakeLiveRepo) TouchSignal(context.Context, string, time.Time) error { return nil }

func (f *fakeLiveRepo) AddHearts(_ context.Context, _ string, delta int64) error {
	f.session.HeartCount += delta
	return nil
}

func (f *fakeLiveRepo) UpdatePeakViewers(_ context.Context, _ string, viewers int) error {
	if viewers > f.session.PeakViewers {
		f.session.PeakViewers = viewers
	}
	return nil
}

type fakeLiveMedia struct{ pingErr error }

func (m fakeLiveMedia) Ping(context.Context) error                       { return m.pingErr }
func (m fakeLiveMedia) PathOnline(context.Context, string) (bool, error) { return true, nil }

type liveTestEnv struct {
	router   *gin.Engine
	manager  *jwt.Manager
	repo     *fakeLiveRepo
	admin    string
	customer string
}

func setupLiveTestRouter(t *testing.T, repo *fakeLiveRepo, media domain.MediaServer) *liveTestEnv {
	t.Helper()
	return setupLiveTestRouterFull(t, repo, media, nil)
}

func setupLiveTestRouterWithLogger(t *testing.T, repo *fakeLiveRepo, logger *slog.Logger) *liveTestEnv {
	t.Helper()
	return setupLiveTestRouterFull(t, repo, fakeLiveMedia{}, logger)
}

func setupLiveTestRouterFull(t *testing.T, repo *fakeLiveRepo, media domain.MediaServer, logger *slog.Logger) *liveTestEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	uc := liveuc.New(liveuc.Dependencies{
		Repo:            repo,
		Media:           media,
		Clock:           func() time.Time { return time.Date(2026, 11, 13, 3, 20, 0, 0, time.UTC) },
		WebRTCPublicURL: "http://localhost:8889",
		HLSPublicURL:    "http://localhost:8888",
	})
	r := gin.New()
	NewRouter(r, Dependencies{Live: uc, JWT: manager, RefreshTTL: time.Hour, Logger: logger})
	admin, err := manager.GenerateAccessToken(liveTestAdmin, domain.RoleAdmin, 15*time.Minute)
	require.NoError(t, err)
	customer, err := manager.GenerateAccessToken(liveTestCustomer, domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)
	return &liveTestEnv{router: r, manager: manager, repo: repo, admin: admin, customer: customer}
}

func (e *liveTestEnv) do(t *testing.T, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)
	return w
}

func decodeLiveEnvelope(t *testing.T, w *httptest.ResponseRecorder) (ResponseEnvelope, map[string]any) {
	t.Helper()
	var env ResponseEnvelope
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &env))
	var raw map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &raw))
	return env, raw
}

func snapshotLive(t *testing.T, key, contract, endpoint string, body any, w *httptest.ResponseRecorder) {
	t.Helper()
	assertOrRecordContractSnapshot(t, liveSnapshotPath, "livestream-shopping", key, contract, endpoint, body, w)
}

func TestLivePublic_Current(t *testing.T) {
	t.Run("null when nothing is live", func(t *testing.T) {
		env := setupLiveTestRouter(t, &fakeLiveRepo{}, fakeLiveMedia{})
		w := env.do(t, http.MethodGet, "/api/v1/live/current", "", nil)
		require.Equal(t, http.StatusOK, w.Code)
		resp, _ := decodeLiveEnvelope(t, w)
		assert.True(t, resp.Success)
		assert.Nil(t, resp.Data)
		snapshotLive(t, "live_current_null_200", "API-LIVE-PUBLIC@1", "GET /api/v1/live/current", nil, w)
	})

	t.Run("summary of the live session without auth", func(t *testing.T) {
		env := setupLiveTestRouter(t, newLiveFixtureRepo(), fakeLiveMedia{})
		w := env.do(t, http.MethodGet, "/api/v1/live/current", "", nil)
		require.Equal(t, http.StatusOK, w.Code)
		_, raw := decodeLiveEnvelope(t, w)
		data := raw["data"].(map[string]any)
		assert.Equal(t, liveTestSession, data["id"])
		assert.Equal(t, "Flash sale iPhone", data["title"])
		snapshotLive(t, "live_current_200", "API-LIVE-PUBLIC@1", "GET /api/v1/live/current", nil, w)
	})
}

func TestLivePublic_Session(t *testing.T) {
	env := setupLiveTestRouter(t, newLiveFixtureRepo(), fakeLiveMedia{})
	path := "/api/v1/live/sessions/" + liveTestSession

	t.Run("401 without a token", func(t *testing.T) {
		w := env.do(t, http.MethodGet, path, "", nil)
		require.Equal(t, http.StatusUnauthorized, w.Code)
		snapshotLive(t, "unauthenticated_401", "API-LIVE-PUBLIC@1", "GET /api/v1/live/sessions/:id", nil, w)
	})

	t.Run("200 with the viewer projection", func(t *testing.T) {
		w := env.do(t, http.MethodGet, path, env.customer, nil)
		require.Equal(t, http.StatusOK, w.Code)
		_, raw := decodeLiveEnvelope(t, w)
		data := raw["data"].(map[string]any)
		assert.Equal(t, "live", data["status"])
		assert.Equal(t, liveTestProduct, data["pinnedProductId"])
		media := data["media"].(map[string]any)
		assert.Equal(t, "http://localhost:8889/live/"+liveTestSession+"/whep", media["whepUrl"])
		assert.NotContains(t, media, "whipUrl")
		product := data["products"].([]any)[0].(map[string]any)
		assert.Equal(t, "25990000", product["minPriceVnd"])
		assert.Equal(t, true, product["hasLivePrice"])
		price := product["livePrices"].([]any)[0].(map[string]any)
		assert.EqualValues(t, 7, price["remaining"])
		snapshotLive(t, "live_session_200", "API-LIVE-PUBLIC@1", "GET /api/v1/live/sessions/:id", nil, w)
	})

	t.Run("404 for unknown or malformed ids", func(t *testing.T) {
		w := env.do(t, http.MethodGet, "/api/v1/live/sessions/99999999-0000-0000-0000-000000000000", env.customer, nil)
		require.Equal(t, http.StatusNotFound, w.Code)
		resp, _ := decodeLiveEnvelope(t, w)
		assert.Equal(t, "livestream_not_found", resp.Error.Code)
		assert.Equal(t, "Không tìm thấy phiên live", resp.Error.Message)
		snapshotLive(t, "live_session_404", "API-LIVE-PUBLIC@1", "GET /api/v1/live/sessions/:id", nil, w)

		w = env.do(t, http.MethodGet, "/api/v1/live/sessions/not-a-uuid", env.customer, nil)
		require.Equal(t, http.StatusNotFound, w.Code)
	})
}

func TestLiveAdmin_Guards(t *testing.T) {
	env := setupLiveTestRouter(t, newLiveFixtureRepo(), fakeLiveMedia{})
	w := env.do(t, http.MethodGet, "/api/v1/admin/live/sessions/current", "", nil)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	w = env.do(t, http.MethodPost, "/api/v1/admin/live/sessions", env.customer, map[string]any{"title": "x"})
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestLiveAdmin_Create(t *testing.T) {
	createBody := map[string]any{
		"title": "Flash sale iPhone",
		"products": []map[string]any{{
			"productId": liveTestProduct,
			"variants":  []map[string]any{{"variantId": liveTestVariant, "livePriceVnd": "25990000", "quota": 10}},
		}},
	}

	t.Run("201 starts a session", func(t *testing.T) {
		env := setupLiveTestRouter(t, &fakeLiveRepo{}, fakeLiveMedia{})
		w := env.do(t, http.MethodPost, "/api/v1/admin/live/sessions", env.admin, createBody)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		resp, raw := decodeLiveEnvelope(t, w)
		assert.Equal(t, "Đã bắt đầu phiên live", resp.Message)
		data := raw["data"].(map[string]any)
		assert.Equal(t, "http://localhost:8889/live/"+liveTestSession+"/whip", data["media"].(map[string]any)["whipUrl"])
		assert.Contains(t, data, "summary")
		snapshotLive(t, "admin_live_create_201", "API-LIVE-ADMIN@1", "POST /api/v1/admin/live/sessions", createBody, w)
	})

	t.Run("409 while another session is live", func(t *testing.T) {
		env := setupLiveTestRouter(t, newLiveFixtureRepo(), fakeLiveMedia{})
		w := env.do(t, http.MethodPost, "/api/v1/admin/live/sessions", env.admin, createBody)
		require.Equal(t, http.StatusConflict, w.Code)
		resp, _ := decodeLiveEnvelope(t, w)
		assert.Equal(t, "livestream_already_active", resp.Error.Code)
		assert.Equal(t, "Đang có một phiên live khác diễn ra", resp.Error.Message)
	})

	t.Run("503 when the media server is down", func(t *testing.T) {
		env := setupLiveTestRouter(t, &fakeLiveRepo{}, fakeLiveMedia{pingErr: errors.New("dial tcp: refused")})
		w := env.do(t, http.MethodPost, "/api/v1/admin/live/sessions", env.admin, createBody)
		require.Equal(t, http.StatusServiceUnavailable, w.Code)
		resp, _ := decodeLiveEnvelope(t, w)
		assert.Equal(t, "media_server_unavailable", resp.Error.Code)
		assert.Equal(t, "Không kết nối được máy chủ phát video", resp.Error.Message)
	})

	t.Run("400 with field errors", func(t *testing.T) {
		env := setupLiveTestRouter(t, &fakeLiveRepo{}, fakeLiveMedia{})
		w := env.do(t, http.MethodPost, "/api/v1/admin/live/sessions", env.admin, map[string]any{
			"title": "",
			"products": []map[string]any{{
				"productId": liveTestProduct,
				"variants":  []map[string]any{{"variantId": liveTestVariant, "livePriceVnd": "28990000"}},
			}},
		})
		require.Equal(t, http.StatusBadRequest, w.Code)
		resp, _ := decodeLiveEnvelope(t, w)
		assert.Equal(t, "validation_error", resp.Error.Code)
		assert.Equal(t, "Tiêu đề phải từ 1 đến 120 ký tự", resp.Error.Fields["title"])
		assert.Equal(t, "Giá live phải nhỏ hơn giá thường", resp.Error.Fields["products[0].variants[0].livePriceVnd"])
	})
}

func TestLiveAdmin_ManageSession(t *testing.T) {
	env := setupLiveTestRouter(t, newLiveFixtureRepo(), fakeLiveMedia{})
	base := "/api/v1/admin/live/sessions/" + liveTestSession

	w := env.do(t, http.MethodGet, "/api/v1/admin/live/sessions/current", env.admin, nil)
	require.Equal(t, http.StatusOK, w.Code)
	snapshotLive(t, "admin_live_current_200", "API-LIVE-ADMIN@1", "GET /api/v1/admin/live/sessions/current", nil, w)

	w = env.do(t, http.MethodPut, base+"/products", env.admin, map[string]any{"products": []map[string]any{{
		"productId": liveTestProduct,
		"variants":  []map[string]any{{"variantId": liveTestVariant, "livePriceVnd": "25990000", "quota": 2}},
	}}})
	require.Equal(t, http.StatusBadRequest, w.Code)
	resp, _ := decodeLiveEnvelope(t, w)
	assert.Equal(t, "Số suất không được nhỏ hơn số đã bán (3)", resp.Error.Fields["products[0].variants[0].quota"])

	w = env.do(t, http.MethodPut, base+"/pin", env.admin, map[string]any{"productId": "99999999-0000-0000-0000-000000000000"})
	require.Equal(t, http.StatusBadRequest, w.Code)
	resp, _ = decodeLiveEnvelope(t, w)
	assert.Equal(t, "Sản phẩm không thuộc giỏ hàng live", resp.Error.Fields["productId"])

	w = env.do(t, http.MethodPut, base+"/pin", env.admin, map[string]any{"productId": nil})
	require.Equal(t, http.StatusOK, w.Code)
	_, raw := decodeLiveEnvelope(t, w)
	assert.Nil(t, raw["data"].(map[string]any)["pinnedProductId"])

	w = env.do(t, http.MethodPost, base+"/end", env.admin, nil)
	require.Equal(t, http.StatusOK, w.Code)
	_, raw = decodeLiveEnvelope(t, w)
	data := raw["data"].(map[string]any)
	assert.Equal(t, "ended", data["status"])
	assert.Nil(t, data["media"])
	summary := data["summary"].(map[string]any)
	assert.EqualValues(t, 2700, summary["durationSeconds"])
	assert.Equal(t, "admin", summary["endReason"])
	sold := data["products"].([]any)[0].(map[string]any)["livePrices"].([]any)[0].(map[string]any)
	assert.EqualValues(t, 3, sold["sold"])
	assert.Equal(t, false, sold["active"])

	w = env.do(t, http.MethodPost, base+"/end", env.admin, nil)
	require.Equal(t, http.StatusConflict, w.Code)
	resp, _ = decodeLiveEnvelope(t, w)
	assert.Equal(t, "livestream_ended", resp.Error.Code)

	w = env.do(t, http.MethodPut, base+"/products", env.admin, map[string]any{"products": []any{}})
	require.Equal(t, http.StatusConflict, w.Code)

	w = env.do(t, http.MethodGet, "/api/v1/live/sessions/"+liveTestSession, env.customer, nil)
	require.Equal(t, http.StatusOK, w.Code)
	_, raw = decodeLiveEnvelope(t, w)
	data = raw["data"].(map[string]any)
	assert.Empty(t, data["products"])
	assert.Empty(t, data["comments"])
	assert.Nil(t, data["media"])
}

func TestLiveComments(t *testing.T) {
	env := setupLiveTestRouter(t, newLiveFixtureRepo(), fakeLiveMedia{})
	path := "/api/v1/live/sessions/" + liveTestSession + "/comments"
	body := map[string]any{"content": "Còn size M không shop?"}

	w := env.do(t, http.MethodPost, path, "", body)
	require.Equal(t, http.StatusUnauthorized, w.Code)
	w = env.do(t, http.MethodPost, path, env.admin, body)
	require.Equal(t, http.StatusForbidden, w.Code, "admins comment through the admin endpoint")

	w = env.do(t, http.MethodPost, path, env.customer, map[string]any{"content": "  "})
	require.Equal(t, http.StatusBadRequest, w.Code)
	resp, _ := decodeLiveEnvelope(t, w)
	assert.Equal(t, "Bình luận phải từ 1 đến 200 ký tự", resp.Error.Fields["content"])

	w = env.do(t, http.MethodPost, path, env.customer, body)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	resp, raw := decodeLiveEnvelope(t, w)
	assert.Equal(t, "Đã gửi bình luận", resp.Message)
	data := raw["data"].(map[string]any)
	assert.Equal(t, "Còn size M không shop?", data["content"])
	assert.Equal(t, "customer", data["authorRole"])
	assert.NotContains(t, data, "userId")
	snapshotLive(t, "live_comment_create_201", "API-LIVE-PUBLIC@1", "POST /api/v1/live/sessions/:id/comments", body, w)

	w = env.do(t, http.MethodPost, path, env.customer, body)
	require.Equal(t, http.StatusTooManyRequests, w.Code)
	resp, _ = decodeLiveEnvelope(t, w)
	assert.Equal(t, "rate_limited", resp.Error.Code)
	assert.Equal(t, "Bạn bình luận quá nhanh, vui lòng thử lại sau giây lát", resp.Error.Message)
	snapshotLive(t, "live_comment_rate_limited_429", "API-LIVE-PUBLIC@1", "POST /api/v1/live/sessions/:id/comments", body, w)

	adminPath := "/api/v1/admin/live/sessions/" + liveTestSession + "/comments"
	for i := 0; i < 2; i++ {
		w = env.do(t, http.MethodPost, adminPath, env.admin, map[string]any{"content": "Còn đủ size nhé"})
		require.Equal(t, http.StatusCreated, w.Code)
		_, raw = decodeLiveEnvelope(t, w)
		assert.Equal(t, domain.LiveShopAuthorName, raw["data"].(map[string]any)["authorName"])
	}

	hidePath := "/api/v1/admin/live/comments/44444444-4444-4444-4444-444444444444/hide"
	w = env.do(t, http.MethodPost, hidePath, env.admin, nil)
	require.Equal(t, http.StatusOK, w.Code)
	_, raw = decodeLiveEnvelope(t, w)
	assert.Equal(t, true, raw["data"].(map[string]any)["hidden"])
	w = env.do(t, http.MethodPost, hidePath, env.admin, nil)
	require.Equal(t, http.StatusOK, w.Code, "hiding twice succeeds")

	w = env.do(t, http.MethodPost, "/api/v1/admin/live/comments/99999999-0000-0000-0000-000000000000/hide", env.admin, nil)
	require.Equal(t, http.StatusNotFound, w.Code)
	resp, _ = decodeLiveEnvelope(t, w)
	assert.Equal(t, "livestream_comment_not_found", resp.Error.Code)

	w = env.do(t, http.MethodGet, "/api/v1/live/sessions/"+liveTestSession, env.customer, nil)
	_, raw = decodeLiveEnvelope(t, w)
	for _, c := range raw["data"].(map[string]any)["comments"].([]any) {
		assert.NotEqual(t, "44444444-4444-4444-4444-444444444444", c.(map[string]any)["id"], "hidden comments are not served to viewers")
	}

	w = env.do(t, http.MethodPost, "/api/v1/admin/live/sessions/"+liveTestSession+"/end", env.admin, nil)
	require.Equal(t, http.StatusOK, w.Code)
	w = env.do(t, http.MethodPost, adminPath, env.admin, map[string]any{"content": "bye"})
	require.Equal(t, http.StatusConflict, w.Code)
	resp, _ = decodeLiveEnvelope(t, w)
	assert.Equal(t, "livestream_ended", resp.Error.Code)
}
