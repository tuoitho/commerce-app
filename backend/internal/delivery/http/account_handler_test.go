package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
	accountuc "commerce-backend/internal/usecase/account"
	authuc "commerce-backend/internal/usecase/auth"
	"commerce-backend/internal/usecase/auth/fakerepos"
)

var accountSnapshotPath = filepath.Join("..", "..", "..", "..", ".dream", "specs", "customer-account", "contract-snapshots.json")

type fakeHTTPAccountRepo struct {
	users    *fakerepos.Users
	sessions *fakerepos.Sessions
}

func (f *fakeHTTPAccountRepo) GetByID(ctx context.Context, userID string) (*domain.User, error) {
	u, err := f.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	cp := *u
	return &cp, nil
}

func (f *fakeHTTPAccountRepo) UpdateProfile(ctx context.Context, userID string, displayName, phone *string) (*domain.User, error) {
	u, err := f.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	u.DisplayName = displayName
	u.Phone = phone
	u.UpdatedAt = time.Now().UTC()
	cp := *u
	return &cp, nil
}

func (f *fakeHTTPAccountRepo) UpdateAvatar(ctx context.Context, userID string, avatarKey *string) (*domain.User, *string, error) {
	u, err := f.users.GetByID(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	prev := u.AvatarKey
	u.AvatarKey = avatarKey
	u.UpdatedAt = time.Now().UTC()
	cp := *u
	return &cp, prev, nil
}

func (f *fakeHTTPAccountRepo) ChangePasswordAndRotateSession(ctx context.Context, userID, passwordHash, newTokenHash string, expiresAt time.Time) (*domain.User, error) {
	u, err := f.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	u.PasswordHash = passwordHash
	u.UpdatedAt = time.Now().UTC()
	if err := f.sessions.RevokeRefreshTokensByUserID(ctx, userID); err != nil {
		return nil, err
	}
	if _, err := f.sessions.CreateRefreshToken(ctx, userID, newTokenHash, expiresAt); err != nil {
		return nil, err
	}
	cp := *u
	return &cp, nil
}

type fakeHTTPAvatarStore struct {
	objects map[string][]byte
	types   map[string]string
}

func newFakeHTTPAvatarStore() *fakeHTTPAvatarStore {
	return &fakeHTTPAvatarStore{
		objects: map[string][]byte{},
		types:   map[string]string{},
	}
}

func (s *fakeHTTPAvatarStore) PutObject(_ context.Context, key string, reader io.Reader, _ int64, contentType string) error {
	b, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	s.objects[key] = b
	s.types[key] = contentType
	return nil
}

func (s *fakeHTTPAvatarStore) StatObject(_ context.Context, key string) (*domain.ChatObjectInfo, error) {
	b, ok := s.objects[key]
	if !ok {
		return nil, errors.New("NoSuchKey")
	}
	return &domain.ChatObjectInfo{Key: key, Size: int64(len(b)), ContentType: s.types[key]}, nil
}

func (s *fakeHTTPAvatarStore) GetObject(_ context.Context, key string) (io.ReadCloser, error) {
	b, ok := s.objects[key]
	if !ok {
		return nil, errors.New("NoSuchKey")
	}
	return io.NopCloser(bytes.NewReader(b)), nil
}

func (s *fakeHTTPAvatarStore) RemoveObject(_ context.Context, key string) error {
	delete(s.objects, key)
	delete(s.types, key)
	return nil
}

func newAccountTestSetup(t *testing.T) (*gin.Engine, *fakeHTTPAccountRepo, *fakeHTTPAvatarStore, *bytes.Buffer) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	users := fakerepos.NewUsers()
	sessions := fakerepos.NewSessions(users)
	accRepo := &fakeHTTPAccountRepo{users: users, sessions: sessions}
	avatarStore := newFakeHTTPAvatarStore()
	manager := jwt.NewManager(testSecret, "commerce-backend")

	var logBuf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	authUC := authuc.New(authuc.Dependencies{
		Repos:                authuc.Repositories{Users: users, Sessions: sessions},
		JWT:                  manager,
		AccessTTL:            15 * time.Minute,
		RefreshTTL:           24 * time.Hour,
		HashPassword:         security.HashPassword,
		CheckPassword:        security.CheckPassword,
		GenerateRefreshToken: security.GenerateRefreshToken,
	})
	accountUC := accountuc.New(accountuc.Dependencies{
		Repo:                 accRepo,
		Store:                avatarStore,
		JWT:                  manager,
		AccessTTL:            15 * time.Minute,
		RefreshTTL:           24 * time.Hour,
		HashPassword:         security.HashPassword,
		CheckPassword:        security.CheckPassword,
		GenerateRefreshToken: security.GenerateRefreshToken,
		Logger:               logger,
	})

	router := gin.New()
	NewRouter(router, Dependencies{
		UseCase:      authUC,
		Account:      accountUC,
		JWT:          manager,
		RefreshTTL:   24 * time.Hour,
		CookieSecure: false,
		Logger:       logger,
	})
	return router, accRepo, avatarStore, &logBuf
}

func doAuthJSON(router *gin.Engine, method, path, token string, body any) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != nil {
		if raw, ok := body.(string); ok {
			reader = strings.NewReader(raw)
		} else {
			b, _ := json.Marshal(body)
			reader = bytes.NewReader(b)
		}
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func makeMultipartAvatarRequest(path, token, filename, contentType string, content []byte) *http.Request {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="avatar"; filename="`+filename+`"`)
	h.Set("Content-Type", contentType)
	part, _ := writer.CreatePart(h)
	_, _ = part.Write(content)
	_ = writer.Close()

	req := httptest.NewRequest(http.MethodPost, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}

func TestAccountHandler_EndpointsAndContractSnapshots(t *testing.T) {
	router, _, _, logBuf := newAccountTestSetup(t)

	// 1. Unauthenticated access rejected with 401
	unauthW := doAuthJSON(router, http.MethodGet, "/api/v1/account/profile", "", nil)
	require.Equal(t, http.StatusUnauthorized, unauthW.Code)
	assertOrRecordContractSnapshot(t, accountSnapshotPath, "customer-account", "unauthenticated_401", "API-ACCOUNT@1", "GET /api/v1/account/profile", nil, unauthW)

	// Register customer + capture two device refresh cookies
	regW, regCookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "khach@example.com", "password": "oldpassword1",
	})
	require.Equal(t, http.StatusCreated, regW.Code)
	var regEnv struct {
		Data sessionResponse `json:"data"`
	}
	require.NoError(t, json.Unmarshal(regW.Body.Bytes(), &regEnv))
	token := regEnv.Data.AccessToken
	device1Cookie := refreshCookie(regCookies)
	require.NotNil(t, device1Cookie)

	_, dev2Cookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email": "khach@example.com", "password": "oldpassword1",
	})
	device2Cookie := refreshCookie(dev2Cookies)
	require.NotNil(t, device2Cookie)

	// 2. PUT /profile -> populate fields + snapshot
	profileBody := map[string]any{"displayName": "Nguyễn Minh Anh", "phone": "0912345678"}
	updW := doAuthJSON(router, http.MethodPut, "/api/v1/account/profile", token, profileBody)
	require.Equal(t, http.StatusOK, updW.Code, updW.Body.String())
	assertOrRecordContractSnapshot(t, accountSnapshotPath, "customer-account", "update_profile_200", "API-ACCOUNT@1", "PUT /api/v1/account/profile", profileBody, updW)

	// Malformed JSON and invalid fields -> 400
	malformedW := doAuthJSON(router, http.MethodPut, "/api/v1/account/profile", token, `{invalid`)
	require.Equal(t, http.StatusBadRequest, malformedW.Code)

	badProfileW := doAuthJSON(router, http.MethodPut, "/api/v1/account/profile", token, map[string]any{
		"displayName": strings.Repeat("a", 81), "phone": "12345",
	})
	require.Equal(t, http.StatusBadRequest, badProfileW.Code)
	assertOrRecordContractSnapshot(t, accountSnapshotPath, "customer-account", "update_profile_validation_400", "API-ACCOUNT@1", "PUT /api/v1/account/profile", nil, badProfileW)

	// 3. POST /avatar + GET/HEAD /media/avatars/:avatarKey
	pngBytes := append([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, bytes.Repeat([]byte{0x42}, 32)...)
	upW := httptest.NewRecorder()
	router.ServeHTTP(upW, makeMultipartAvatarRequest("/api/v1/account/avatar", token, "avatar.png", "image/png", pngBytes))
	require.Equal(t, http.StatusOK, upW.Code, upW.Body.String())
	assertOrRecordContractSnapshot(t, accountSnapshotPath, "customer-account", "upload_avatar_200", "API-ACCOUNT@1", "POST /api/v1/account/avatar", nil, upW)

	var upEnv struct {
		Data domain.UserPublic `json:"data"`
	}
	require.NoError(t, json.Unmarshal(upW.Body.Bytes(), &upEnv))
	require.NotNil(t, upEnv.Data.AvatarURL)
	avatarURL := *upEnv.Data.AvatarURL

	// GET profile returns updated fields + avatarUrl
	getW := doAuthJSON(router, http.MethodGet, "/api/v1/account/profile", token, nil)
	require.Equal(t, http.StatusOK, getW.Code)
	assertOrRecordContractSnapshot(t, accountSnapshotPath, "customer-account", "get_profile_200", "API-ACCOUNT@1", "GET /api/v1/account/profile", nil, getW)

	// Invalid avatar upload -> 400
	badUpW := httptest.NewRecorder()
	router.ServeHTTP(badUpW, makeMultipartAvatarRequest("/api/v1/account/avatar", token, "fake.png", "image/png", []byte("not-an-image")))
	require.Equal(t, http.StatusBadRequest, badUpW.Code)
	assertOrRecordContractSnapshot(t, accountSnapshotPath, "customer-account", "upload_avatar_validation_400", "API-ACCOUNT@1", "POST /api/v1/account/avatar", nil, badUpW)

	// HEAD & GET /media/avatars/:avatarKey -> 200 with strict caching & nosniff headers
	headReq := httptest.NewRequest(http.MethodHead, avatarURL, nil)
	headW := httptest.NewRecorder()
	router.ServeHTTP(headW, headReq)
	require.Equal(t, http.StatusOK, headW.Code)
	assert.Equal(t, "image/png", headW.Header().Get("Content-Type"))
	assert.Equal(t, "nosniff", headW.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "public, max-age=86400, immutable", headW.Header().Get("Cache-Control"))
	assert.Equal(t, "inline", headW.Header().Get("Content-Disposition"))
	assert.Empty(t, headW.Body.Bytes())

	getMediaReq := httptest.NewRequest(http.MethodGet, avatarURL, nil)
	getMediaW := httptest.NewRecorder()
	router.ServeHTTP(getMediaW, getMediaReq)
	require.Equal(t, http.StatusOK, getMediaW.Code)
	assert.Equal(t, pngBytes, getMediaW.Body.Bytes())

	// Path traversal or missing key -> 404 avatar_not_found
	notFoundW := httptest.NewRecorder()
	router.ServeHTTP(notFoundW, httptest.NewRequest(http.MethodGet, "/media/avatars/not-a-valid-key.exe", nil))
	require.Equal(t, http.StatusNotFound, notFoundW.Code)

	// 4. DELETE /avatar -> clears avatarUrl and removes object
	delW := doAuthJSON(router, http.MethodDelete, "/api/v1/account/avatar", token, nil)
	require.Equal(t, http.StatusOK, delW.Code)
	assertOrRecordContractSnapshot(t, accountSnapshotPath, "customer-account", "delete_avatar_200", "API-ACCOUNT@1", "DELETE /api/v1/account/avatar", nil, delW)

	afterDelMediaW := httptest.NewRecorder()
	router.ServeHTTP(afterDelMediaW, httptest.NewRequest(http.MethodGet, avatarURL, nil))
	require.Equal(t, http.StatusNotFound, afterDelMediaW.Code)

	// 5. PUT /password validation error returns HTTP 400 (never 401)
	badPwW := doAuthJSON(router, http.MethodPut, "/api/v1/account/password", token, map[string]string{
		"currentPassword": "wrongpassword", "newPassword": "newpassword1",
	})
	require.Equal(t, http.StatusBadRequest, badPwW.Code)
	assertOrRecordContractSnapshot(t, accountSnapshotPath, "customer-account", "change_password_validation_400", "API-ACCOUNT@1", "PUT /api/v1/account/password", nil, badPwW)

	// 6. PUT /password success rotates refresh tokens, keeps current session alive, and logs no secrets
	pwBody := map[string]string{
		"currentPassword": "oldpassword1", "newPassword": "newpassword123",
	}
	pwW := doAuthJSON(router, http.MethodPut, "/api/v1/account/password", token, pwBody)
	require.Equal(t, http.StatusOK, pwW.Code, pwW.Body.String())
	assertOrRecordContractSnapshot(t, accountSnapshotPath, "customer-account", "change_password_200", "API-ACCOUNT@1", "PUT /api/v1/account/password", pwBody, pwW)

	bodyText := pwW.Body.String()
	assert.NotContains(t, bodyText, "oldpassword1")
	assert.NotContains(t, bodyText, "newpassword123")
	assert.NotContains(t, bodyText, "refreshToken")

	logs := logBuf.String()
	assert.Contains(t, logs, "account password changed")
	assert.Contains(t, logs, "user_id")
	assert.NotContains(t, logs, "oldpassword1")
	assert.NotContains(t, logs, "newpassword123")

	newSessionCookie := refreshCookie(pwW.Result().Cookies())
	require.NotNil(t, newSessionCookie)
	assert.Equal(t, refreshCookiePath, newSessionCookie.Path)
	assert.True(t, newSessionCookie.HttpOnly)

	// Old device cookies must fail /auth/refresh -> 401
	oldRefreshW1, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/refresh", nil, device1Cookie)
	assert.Equal(t, http.StatusUnauthorized, oldRefreshW1.Code)
	oldRefreshW2, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/refresh", nil, device2Cookie)
	assert.Equal(t, http.StatusUnauthorized, oldRefreshW2.Code)

	// Current browser's rotated cookie must succeed /auth/refresh -> 200
	newRefreshW, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/refresh", nil, newSessionCookie)
	assert.Equal(t, http.StatusOK, newRefreshW.Code)
}
