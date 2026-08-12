package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/usecase/auth"
	fakerepos "commerce-backend/internal/usecase/auth/fakerepos"
	catalogfakerepos "commerce-backend/internal/usecase/catalog/fakerepos"
	cataloguc "commerce-backend/internal/usecase/catalog"
)

const testSecret = "a-secret-that-is-at-least-thirty-two-characters"

func newTestRouter(t *testing.T) (*gin.Engine, *fakerepos.Users) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	users := fakerepos.NewUsers()
	sessions := fakerepos.NewSessions(users)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	uc := auth.New(auth.Dependencies{
		Repos:        auth.Repositories{Users: users, Sessions: sessions},
		JWT:          manager,
		AccessTTL:    15 * time.Minute,
		RefreshTTL:   24 * time.Hour,
		HashPassword: security.HashPassword,
		CheckPassword: security.CheckPassword,
		GenerateRefreshToken: func() (security.RefreshTokenPair, error) {
			return security.GenerateRefreshToken()
		},
	})
	router := gin.New()
	NewRouter(router, Dependencies{
		UseCase:      uc,
		Catalog:      cataloguc.New(cataloguc.Dependencies{Catalog: catalogfakerepos.NewCatalog()}),
		JWT:          manager,
		RefreshTTL:   24 * time.Hour,
		CookieSecure: false,
	})
	return router, users
}

func doRequest(t *testing.T, router *gin.Engine, method, path string, body interface{}, cookies ...*http.Cookie) (*httptest.ResponseRecorder, []*http.Cookie) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w, w.Result().Cookies()
}

func refreshCookie(cookies []*http.Cookie) *http.Cookie {
	for _, c := range cookies {
		if c.Name == refreshCookieName {
			return c
		}
	}
	return nil
}

func TestRegisterHandler_Success(t *testing.T) {
	router, _ := newTestRouter(t)
	w, cookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp sessionResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.User.Email != "user@example.com" || resp.AccessToken == "" {
		t.Fatal("missing user or access token")
	}
	if strings.Contains(w.Body.String(), "refreshToken") {
		t.Fatal("refresh token must not be in response body")
	}
	ck := refreshCookie(cookies)
	if ck == nil {
		t.Fatal("expected refresh cookie")
	}
	if !ck.HttpOnly {
		t.Fatal("refresh cookie must be HttpOnly")
	}
}

func TestRegisterHandler_InvalidEmail(t *testing.T) {
	router, _ := newTestRouter(t)
	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "nope", "password": "password123",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	var eb errorBody
	if err := json.Unmarshal(w.Body.Bytes(), &eb); err != nil {
		t.Fatal(err)
	}
	if eb.Error.Code != "validation_error" || eb.Error.Fields["email"] == "" {
		t.Fatalf("unexpected error body: %+v", eb.Error)
	}
}

func TestRegisterHandler_DuplicateEmail(t *testing.T) {
	router, _ := newTestRouter(t)
	body := map[string]string{"email": "dup@example.com", "password": "password123"}
	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", body)
	if w.Code != http.StatusCreated {
		t.Fatalf("first register status = %d", w.Code)
	}
	w2, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", body)
	if w2.Code != http.StatusConflict {
		t.Fatalf("duplicate register status = %d, body = %s", w2.Code, w2.Body.String())
	}
}

func TestLoginHandler_Success(t *testing.T) {
	router, _ := newTestRouter(t)
	doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	w, cookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if refreshCookie(cookies) == nil {
		t.Fatal("expected refresh cookie")
	}
}

func TestLoginHandler_UnknownEmail(t *testing.T) {
	router, _ := newTestRouter(t)
	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email": "nobody@example.com", "password": "password123",
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestLoginHandler_WrongPassword(t *testing.T) {
	router, _ := newTestRouter(t)
	doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email": "user@example.com", "password": "wrongpass1",
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestRefreshHandler_Success(t *testing.T) {
	router, _ := newTestRouter(t)
	_, cookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	old := refreshCookie(cookies)
	w, newCookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/refresh", nil, old)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if refreshCookie(newCookies) == nil {
		t.Fatal("expected new refresh cookie")
	}
}

func TestRefreshHandler_InvalidToken(t *testing.T) {
	router, _ := newTestRouter(t)
	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/refresh", nil, &http.Cookie{Name: refreshCookieName, Value: "garbage"})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestRefreshHandler_MissingCookie(t *testing.T) {
	router, _ := newTestRouter(t)
	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/refresh", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestLogoutHandler_Revokes(t *testing.T) {
	router, _ := newTestRouter(t)
	_, cookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	old := refreshCookie(cookies)
	w, newCookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/logout", nil, old)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d", w.Code)
	}
	w2, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/refresh", nil, old)
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout status = %d", w2.Code)
	}
	if ck := refreshCookie(newCookies); ck == nil || ck.MaxAge >= 0 {
		t.Fatal("expected cleared refresh cookie")
	}
}

func TestMeHandler_WithValidToken(t *testing.T) {
	router, users := newTestRouter(t)
	registerBody := map[string]string{"email": "user@example.com", "password": "password123"}
	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", registerBody)
	var resp sessionResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	id := users.ByID("1").ID
	if resp.User.ID != id {
		t.Fatalf("user id = %q, want %q", resp.User.ID, id)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+resp.AccessToken)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req)
	if w2.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w2.Code, w2.Body.String())
	}
	if !strings.Contains(w2.Body.String(), "user@example.com") {
		t.Fatalf("body = %s", w2.Body.String())
	}
}

func TestMeHandler_NoToken(t *testing.T) {
	router, _ := newTestRouter(t)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestMeHandler_InvalidToken(t *testing.T) {
	router, _ := newTestRouter(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer not-a-jwt")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
	var eb errorBody
	if err := json.Unmarshal(w.Body.Bytes(), &eb); err != nil {
		t.Fatal(err)
	}
	if eb.Error.Code == "" {
		t.Fatal("expected error body")
	}
}

func TestLogoutHandler_NoCookie(t *testing.T) {
	router, _ := newTestRouter(t)
	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/logout", nil)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestSessionResponseNeverLeaksSecrets(t *testing.T) {
	router, _ := newTestRouter(t)
	doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	w, cookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "password") {
		t.Fatal("body leaked password material")
	}
	if strings.Contains(w.Body.String(), "refreshToken") {
		t.Fatal("body leaked raw refresh token")
	}
	if ck := refreshCookie(cookies); ck == nil || ck.Value == "" {
		t.Fatal("refresh token should be delivered via httpOnly cookie only")
	}
}

func TestRegisterHandler_ShortPassword(t *testing.T) {
	router, _ := newTestRouter(t)
	w, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "user@example.com", "password": "short",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	var eb errorBody
	if err := json.Unmarshal(w.Body.Bytes(), &eb); err != nil {
		t.Fatal(err)
	}
	if eb.Error.Fields["password"] == "" {
		t.Fatalf("unexpected error body: %+v", eb.Error)
	}
}