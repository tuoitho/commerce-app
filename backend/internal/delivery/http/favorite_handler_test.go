package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	favoriteuc "commerce-backend/internal/usecase/favorite"
)

const (
	favTestUser1   = "11111111-1111-1111-1111-111111111111"
	favTestUser2   = "55555555-5555-5555-5555-555555555555"
	favProductID1  = "22222222-2222-2222-2222-222222222222"
	favProductID2  = "33333333-3333-3333-3333-333333333333"
	favCategoryID1 = "44444444-4444-4444-4444-444444444444"
)

type httpFavoriteRepo struct {
	lastUser      string
	lastProductID string
	err           error
	items         []domain.FavoriteProduct
	itemsByUser   map[string][]domain.FavoriteProduct
}

func (r *httpFavoriteRepo) List(_ context.Context, userID string) ([]domain.FavoriteProduct, error) {
	r.lastUser = userID
	if r.err != nil {
		return nil, r.err
	}
	if r.itemsByUser != nil {
		return r.itemsByUser[userID], nil
	}
	return r.items, nil
}

func (r *httpFavoriteRepo) Add(_ context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
	r.lastUser = userID
	r.lastProductID = productID
	if r.err != nil {
		return nil, r.err
	}
	if r.itemsByUser != nil {
		return r.itemsByUser[userID], nil
	}
	return r.items, nil
}

func (r *httpFavoriteRepo) Remove(_ context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
	r.lastUser = userID
	r.lastProductID = productID
	if r.err != nil {
		return nil, r.err
	}
	if r.itemsByUser != nil {
		return r.itemsByUser[userID], nil
	}
	return r.items, nil
}

func newFavoriteTestRouter(repo *httpFavoriteRepo) (*gin.Engine, *jwt.Manager, string) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	token, _ := manager.GenerateAccessToken(favTestUser1, domain.RoleCustomer, 15*time.Minute)
	router := gin.New()
	uc := favoriteuc.New(favoriteuc.Dependencies{Favorite: repo})
	NewRouter(router, Dependencies{
		Favorite: uc,
		JWT:      manager,
	})
	return router, manager, token
}

func favRequest(router *gin.Engine, token, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func testFavoriteProductActive() domain.FavoriteProduct {
	minP := domain.MoneyVND("1500000")
	maxP := domain.MoneyVND("2500000")
	inStock := true
	return domain.FavoriteProduct{
		ID:              favProductID1,
		Name:            "Bàn phím cơ test",
		Model:           "KB-01",
		Brand:           "Keychron",
		Category:        domain.Category{ID: favCategoryID1, Name: "Bàn phím"},
		PrimaryImageURL: "https://example.com/keyboard.jpg",
		Availability:    domain.FavoriteActive,
		MinPriceVND:     &minP,
		MaxPriceVND:     &maxP,
		InStock:         &inStock,
		FavoritedAt:     time.Now().UTC(),
	}
}

func TestFavoriteHTTP_AuthRequired(t *testing.T) {
	repo := &httpFavoriteRepo{items: []domain.FavoriteProduct{testFavoriteProductActive()}}
	router, _, validToken := newFavoriteTestRouter(repo)

	routes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/favorites"},
		{http.MethodPut, "/api/v1/favorites/" + favProductID1},
		{http.MethodDelete, "/api/v1/favorites/" + favProductID1},
	}

	for _, rt := range routes {
		t.Run("missing token "+rt.method+" "+rt.path, func(t *testing.T) {
			w := favRequest(router, "", rt.method, rt.path, "")
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 Unauthorized, got %d: %s", w.Code, w.Body.String())
			}
			var body ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("failed to parse envelope: %v", err)
			}
			if body.Success || body.Error == nil || body.Error.Code != "unauthorized" {
				t.Fatalf("expected unauthorized error envelope, got: %+v", body)
			}
		})

		t.Run("invalid token "+rt.method+" "+rt.path, func(t *testing.T) {
			w := favRequest(router, "invalid.token.structure", rt.method, rt.path, "")
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 Unauthorized, got %d: %s", w.Code, w.Body.String())
			}
			var body ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("failed to parse envelope: %v", err)
			}
			if body.Success || body.Error == nil || body.Error.Code != "invalid_token" {
				t.Fatalf("expected invalid_token error envelope, got: %+v", body)
			}
		})
	}

	// Verify that with valid token, GET returns 200
	w := favRequest(router, validToken, http.MethodGet, "/api/v1/favorites", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK with valid token, got %d: %s", w.Code, w.Body.String())
	}
}

func TestFavoriteHTTP_AllRoutesReturnFullList(t *testing.T) {
	sample := testFavoriteProductActive()
	repo := &httpFavoriteRepo{items: []domain.FavoriteProduct{sample}}
	router, _, token := newFavoriteTestRouter(repo)

	tests := []struct {
		method          string
		path            string
		expectedMessage string
	}{
		{http.MethodGet, "/api/v1/favorites", ""},
		{http.MethodPut, "/api/v1/favorites/" + favProductID1, "Đã thêm sản phẩm vào danh sách yêu thích"},
		{http.MethodDelete, "/api/v1/favorites/" + favProductID1, "Đã xóa sản phẩm khỏi danh sách yêu thích"},
	}

	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			w := favRequest(router, token, tt.method, tt.path, "")
			if w.Code != http.StatusOK {
				t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
			}

			var body struct {
				Success bool                      `json:"success"`
				Message string                    `json:"message"`
				Data    []favoriteProductResponse `json:"data"`
				Error   any                       `json:"error"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("failed to parse response: %v, raw: %s", err, w.Body.String())
			}

			if !body.Success {
				t.Fatal("expected success: true")
			}
			if body.Error != nil {
				t.Fatalf("expected error: nil, got %v", body.Error)
			}
			if tt.expectedMessage != "" && body.Message != tt.expectedMessage {
				t.Errorf("expected message %q, got %q", tt.expectedMessage, body.Message)
			}
			if len(body.Data) != 1 {
				t.Fatalf("expected 1 item, got %d", len(body.Data))
			}

			item := body.Data[0]
			if item.ID != favProductID1 || item.Name != "Bàn phím cơ test" || item.Model != "KB-01" ||
				item.Brand != "Keychron" || item.Category.ID != favCategoryID1 || item.Category.Name != "Bàn phím" ||
				item.PrimaryImageURL != "https://example.com/keyboard.jpg" || item.Availability != "active" {
				t.Fatalf("unexpected item data: %+v", item)
			}
			if item.MinPriceVND == nil || *item.MinPriceVND != "1500000" {
				t.Errorf("expected minPriceVnd 1500000, got %v", item.MinPriceVND)
			}
			if item.MaxPriceVND == nil || *item.MaxPriceVND != "2500000" {
				t.Errorf("expected maxPriceVnd 2500000, got %v", item.MaxPriceVND)
			}
			if item.InStock == nil || *item.InStock != true {
				t.Errorf("expected inStock true, got %v", item.InStock)
			}
		})
	}
}

func TestFavoriteHTTP_EmptyListSerializesToArray(t *testing.T) {
	repo := &httpFavoriteRepo{items: []domain.FavoriteProduct{}}
	router, _, token := newFavoriteTestRouter(repo)

	w := favRequest(router, token, http.MethodGet, "/api/v1/favorites", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}

	rawJSON := w.Body.String()
	if !strings.Contains(rawJSON, `"data":[]`) {
		t.Fatalf("expected '\"data\":[]' in empty response JSON, got: %s", rawJSON)
	}
}

func TestFavoriteHTTP_NullabilityContract(t *testing.T) {
	minP := domain.MoneyVND("100000")
	maxP := domain.MoneyVND("200000")
	inStockTrue := true
	inStockFalse := false

	t.Run("active and in stock", func(t *testing.T) {
		repo := &httpFavoriteRepo{
			items: []domain.FavoriteProduct{{
				ID:           favProductID1,
				Name:         "Active InStock",
				Availability: domain.FavoriteActive,
				MinPriceVND:  &minP,
				MaxPriceVND:  &maxP,
				InStock:      &inStockTrue,
			}},
		}
		router, _, token := newFavoriteTestRouter(repo)
		w := favRequest(router, token, http.MethodGet, "/api/v1/favorites", "")
		raw := w.Body.String()
		if !strings.Contains(raw, `"minPriceVnd":"100000"`) || !strings.Contains(raw, `"maxPriceVnd":"200000"`) || !strings.Contains(raw, `"inStock":true`) {
			t.Fatalf("expected non-null values for active: %s", raw)
		}
	})

	t.Run("active and out of stock", func(t *testing.T) {
		repo := &httpFavoriteRepo{
			items: []domain.FavoriteProduct{{
				ID:           favProductID1,
				Name:         "Active OutOfStock",
				Availability: domain.FavoriteActive,
				MinPriceVND:  &minP,
				MaxPriceVND:  &maxP,
				InStock:      &inStockFalse,
			}},
		}
		router, _, token := newFavoriteTestRouter(repo)
		w := favRequest(router, token, http.MethodGet, "/api/v1/favorites", "")
		raw := w.Body.String()
		if !strings.Contains(raw, `"minPriceVnd":"100000"`) || !strings.Contains(raw, `"maxPriceVnd":"200000"`) || !strings.Contains(raw, `"inStock":false`) {
			t.Fatalf("expected inStock:false for active out of stock: %s", raw)
		}
	})

	t.Run("unavailable product has null price and stock", func(t *testing.T) {
		repo := &httpFavoriteRepo{
			items: []domain.FavoriteProduct{{
				ID:           favProductID1,
				Name:         "Unavailable Product",
				Availability: domain.FavoriteUnavailable,
				MinPriceVND:  nil,
				MaxPriceVND:  nil,
				InStock:      nil,
			}},
		}
		router, _, token := newFavoriteTestRouter(repo)
		w := favRequest(router, token, http.MethodGet, "/api/v1/favorites", "")
		raw := w.Body.String()
		if !strings.Contains(raw, `"minPriceVnd":null`) || !strings.Contains(raw, `"maxPriceVnd":null`) || !strings.Contains(raw, `"inStock":null`) || !strings.Contains(raw, `"availability":"unavailable"`) {
			t.Fatalf("expected null price/stock and availability unavailable: %s", raw)
		}
	})

	t.Run("deleted product has null price and stock", func(t *testing.T) {
		repo := &httpFavoriteRepo{
			items: []domain.FavoriteProduct{{
				ID:           favProductID1,
				Name:         "Deleted Product",
				Availability: domain.FavoriteDeleted,
				MinPriceVND:  nil,
				MaxPriceVND:  nil,
				InStock:      nil,
			}},
		}
		router, _, token := newFavoriteTestRouter(repo)
		w := favRequest(router, token, http.MethodGet, "/api/v1/favorites", "")
		raw := w.Body.String()
		if !strings.Contains(raw, `"minPriceVnd":null`) || !strings.Contains(raw, `"maxPriceVnd":null`) || !strings.Contains(raw, `"inStock":null`) || !strings.Contains(raw, `"availability":"deleted"`) {
			t.Fatalf("expected null price/stock and availability deleted: %s", raw)
		}
	})
}

func TestFavoriteHTTP_ValidationErrors(t *testing.T) {
	repo := &httpFavoriteRepo{}
	router, _, token := newFavoriteTestRouter(repo)

	cases := []struct {
		name   string
		method string
		path   string
	}{
		{"PUT with non-uuid productId", http.MethodPut, "/api/v1/favorites/not-a-valid-uuid"},
		{"DELETE with non-uuid productId", http.MethodDelete, "/api/v1/favorites/not-a-valid-uuid"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := favRequest(router, token, tc.method, tc.path, "")
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 Bad Request, got %d: %s", w.Code, w.Body.String())
			}

			var body ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("failed to unmarshal: %v", err)
			}
			if body.Success || body.Error == nil || body.Error.Code != "validation_error" {
				t.Fatalf("expected validation_error code, got: %+v", body.Error)
			}
			if body.Error.Fields == nil || body.Error.Fields["productId"] == "" {
				t.Fatalf("expected fields.productId in validation error, got: %+v", body.Error.Fields)
			}
		})
	}
}

func TestFavoriteHTTP_ProductNotFound(t *testing.T) {
	repo := &httpFavoriteRepo{err: domain.ErrProductNotFound}
	router, _, token := newFavoriteTestRouter(repo)

	w := favRequest(router, token, http.MethodPut, "/api/v1/favorites/"+favProductID1, "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found, got %d: %s", w.Code, w.Body.String())
	}

	var body ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if body.Success || body.Error == nil || body.Error.Code != "product_not_found" {
		t.Fatalf("expected product_not_found code, got: %+v", body.Error)
	}
	if body.Error.Message != "Không tìm thấy sản phẩm" {
		t.Errorf("expected Vietnamese message 'Không tìm thấy sản phẩm', got %q", body.Error.Message)
	}
}

func TestFavoriteHTTP_OwnershipIsolation(t *testing.T) {
	item1 := testFavoriteProductActive()
	item1.Name = "User 1 Product"
	item2 := testFavoriteProductActive()
	item2.ID = favProductID2
	item2.Name = "User 2 Product"

	repo := &httpFavoriteRepo{
		itemsByUser: map[string][]domain.FavoriteProduct{
			favTestUser1: {item1},
			favTestUser2: {item2},
		},
	}
	router, manager, token1 := newFavoriteTestRouter(repo)
	token2, _ := manager.GenerateAccessToken(favTestUser2, domain.RoleCustomer, 15*time.Minute)

	// User 1 requests favorites
	w1 := favRequest(router, token1, http.MethodGet, "/api/v1/favorites", "")
	if w1.Code != http.StatusOK {
		t.Fatalf("user 1 status=%d body=%s", w1.Code, w1.Body.String())
	}
	var body1 struct {
		Data []favoriteProductResponse `json:"data"`
	}
	if err := json.Unmarshal(w1.Body.Bytes(), &body1); err != nil || len(body1.Data) != 1 || body1.Data[0].Name != "User 1 Product" {
		t.Fatalf("user 1 got unexpected data: %s", w1.Body.String())
	}

	// User 2 requests favorites
	w2 := favRequest(router, token2, http.MethodGet, "/api/v1/favorites", "")
	if w2.Code != http.StatusOK {
		t.Fatalf("user 2 status=%d body=%s", w2.Code, w2.Body.String())
	}
	var body2 struct {
		Data []favoriteProductResponse `json:"data"`
	}
	if err := json.Unmarshal(w2.Body.Bytes(), &body2); err != nil || len(body2.Data) != 1 || body2.Data[0].Name != "User 2 Product" {
		t.Fatalf("user 2 got unexpected data: %s", w2.Body.String())
	}
}
