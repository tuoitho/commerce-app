package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	cartuc "commerce-backend/internal/usecase/cart"
)

const cartTestUser = "11111111-1111-1111-1111-111111111111"
const otherCartUser = "55555555-5555-5555-5555-555555555555"

type httpCartRepo struct {
	user string
	err  error
	cart *domain.Cart
}

func (r *httpCartRepo) result() *domain.Cart {
	if r.cart != nil {
		return r.cart
	}
	return testCart()
}

func (r *httpCartRepo) Get(_ context.Context, user string) (*domain.Cart, error) {
	r.user = user
	return r.result(), r.err
}
func (r *httpCartRepo) AddVariant(_ context.Context, user, _ string) (*domain.Cart, error) {
	r.user = user
	return r.result(), r.err
}
func (r *httpCartRepo) SetQuantity(_ context.Context, user, _ string, _ int64) (*domain.Cart, error) {
	r.user = user
	return r.result(), r.err
}
func (r *httpCartRepo) SetSelected(_ context.Context, user, _ string, _ bool) (*domain.Cart, error) {
	r.user = user
	return r.result(), r.err
}
func (r *httpCartRepo) SetAllSelected(_ context.Context, user string, _ bool) (*domain.Cart, error) {
	r.user = user
	return r.result(), r.err
}
func (r *httpCartRepo) Remove(_ context.Context, user, _ string) (*domain.Cart, error) {
	r.user = user
	return r.result(), r.err
}

func newCartTestRouter(repo *httpCartRepo) (*gin.Engine, string) {
	manager := jwt.NewManager(testSecret, "commerce-backend")
	token := cartToken(manager, cartTestUser)
	router := gin.New()
	NewRouter(router, Dependencies{
		Cart: cartuc.New(cartuc.Dependencies{Cart: repo}),
		JWT:  manager,
	})
	return router, token
}

func cartToken(manager *jwt.Manager, userID string) string {
	token, _ := manager.GenerateAccessToken(userID, 15*60*1e9)
	return token
}

func cartRequest(router *gin.Engine, token, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func testCart() *domain.Cart {
	price := domain.MoneyVND("1200000")
	line := domain.MoneyVND("2400000")
	return &domain.Cart{Items: []domain.CartItem{{
		ID: "33333333-3333-3333-3333-333333333333", VariantID: "22222222-2222-2222-2222-222222222222",
		ProductID: "44444444-4444-4444-4444-444444444444", BrandName: "Brand", ProductName: "Phone",
		Model: "X", ImageURL: "/phone.jpg", Options: []domain.CartOption{{GroupLabel: "Color", ValueLabel: "Black"}},
		UnitPriceVND: &price, LineTotalVND: &line, StockQuantity: 5, Quantity: 2, Selected: true, Availability: domain.CartAvailable,
	}}, TotalUnits: 2, SelectedLineCount: 1, SelectedTotalVND: "2400000"}
}

func TestCartHTTP_AllRoutesReturnFullCart(t *testing.T) {
	paths := []struct{ method, path, body string }{
		{http.MethodGet, "/api/v1/cart", ""},
		{http.MethodPost, "/api/v1/cart/items", `{"variantId":"22222222-2222-2222-2222-222222222222"}`},
		{http.MethodPut, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333", `{"quantity":2}`},
		{http.MethodPatch, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333/selection", `{"selected":true}`},
		{http.MethodPut, "/api/v1/cart/selection", `{"selected":true}`},
		{http.MethodDelete, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333", ""},
	}
	repo := &httpCartRepo{}
	router, token := newCartTestRouter(repo)
	for _, route := range paths {
		w := cartRequest(router, token, route.method, route.path, route.body)
		if w.Code != http.StatusOK {
			t.Fatalf("%s %s: status=%d body=%s", route.method, route.path, w.Code, w.Body.String())
		}
		var body struct {
			Success bool         `json:"success"`
			Message string       `json:"message"`
			Data    cartResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || len(body.Data.Items) != 1 || body.Data.SelectedTotalVND != "2400000" {
			t.Fatalf("bad cart response: %s", w.Body.String())
		}
		if !body.Success {
			t.Fatalf("expected success: true, got false")
		}
		item := body.Data.Items[0]
		if item.BrandName != "Brand" || item.Options[0].GroupLabel != "Color" || item.UnitPriceVND == nil || *item.UnitPriceVND != "1200000" || item.LineTotalVND == nil || *item.LineTotalVND != "2400000" || item.Availability != string(domain.CartAvailable) || body.Data.TotalUnits != 2 || body.Data.SelectedLineCount != 1 {
			t.Fatalf("incomplete cart wire response: %+v", body.Data)
		}
	}
	if repo.user != cartTestUser {
		t.Fatalf("repository user=%q, want caller %q", repo.user, cartTestUser)
	}
}

func TestCartQuantityAndStockUseNumericJSONAtMaxInt64(t *testing.T) {
	cart := &domain.Cart{Items: []domain.CartItem{{ID: "item", StockQuantity: 9223372036854775807, Quantity: 9223372036854775807}}, SelectedTotalVND: "0"}
	body, err := json.Marshal(toCartResponse(cart))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), `"stockQuantity":9223372036854775807`) || !strings.Contains(string(body), `"quantity":9223372036854775807`) {
		t.Fatalf("expected numeric int64 fields: %s", body)
	}
}

func TestCartHTTP_NullPricesAndDecimalMoney(t *testing.T) {
	cart := testCart()
	cart.Items[0].Availability = domain.CartUnavailable
	cart.Items[0].UnitPriceVND = nil
	cart.Items[0].LineTotalVND = nil
	repo := &httpCartRepo{cart: cart}
	router, token := newCartTestRouter(repo)
	w := cartRequest(router, token, http.MethodGet, "/api/v1/cart", "")
	if !strings.Contains(w.Body.String(), `"unitPriceVnd":null`) || !strings.Contains(w.Body.String(), `"lineTotalVnd":null`) || !strings.Contains(w.Body.String(), `"availability":"unavailable"`) {
		t.Fatal(w.Body.String())
	}
}

func TestCartHTTP_MapsEveryAvailabilityValue(t *testing.T) {
	for _, availability := range []domain.CartAvailability{domain.CartAvailable, domain.CartInsufficientStock, domain.CartOutOfStock, domain.CartUnavailable} {
		cart := testCart()
		cart.Items[0].Availability = availability
		if availability == domain.CartOutOfStock || availability == domain.CartUnavailable {
			cart.Items[0].UnitPriceVND = nil
			cart.Items[0].LineTotalVND = nil
		}
		router, token := newCartTestRouter(&httpCartRepo{cart: cart})
		w := cartRequest(router, token, http.MethodGet, "/api/v1/cart", "")
		var body struct {
			Data cartResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || len(body.Data.Items) != 1 || body.Data.Items[0].Availability != string(availability) {
			t.Fatalf("availability=%s body=%s", availability, w.Body.String())
		}
		if (body.Data.Items[0].UnitPriceVND == nil) != (availability == domain.CartOutOfStock || availability == domain.CartUnavailable) {
			t.Fatalf("availability=%s price=%v", availability, body.Data.Items[0].UnitPriceVND)
		}
	}
}

func TestCartHTTP_ValidationAuthIsolationAndStableErrors(t *testing.T) {
	repo := &httpCartRepo{err: domain.ErrVariantUnavailable}
	router, token := newCartTestRouter(repo)
	checks := []struct{ name, token, method, path, body, code, errCode string }{
		{"missing token", "", http.MethodGet, "/api/v1/cart", "", "unauthorized", ""},
		{"invalid token", "bad", http.MethodGet, "/api/v1/cart", "", "invalid_token", ""},
		{"malformed json", token, http.MethodPost, "/api/v1/cart/items", "{", "validation_error", ""},
		{"bad uuid", token, http.MethodPut, "/api/v1/cart/items/nope", `{"quantity":1}`, "validation_error", ""},
		{"bad quantity", token, http.MethodPut, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333", `{"quantity":0}`, "validation_error", ""},
		{"fractional quantity", token, http.MethodPut, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333", `{"quantity":2.5}`, "validation_error", ""},
		{"quantity overflow", token, http.MethodPut, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333", `{"quantity":9223372036854775808}`, "validation_error", ""},
		{"unavailable", token, http.MethodPost, "/api/v1/cart/items", `{"variantId":"22222222-2222-2222-2222-222222222222"}`, "variant_unavailable", ""},
	}
	for _, tc := range checks {
		w := cartRequest(router, tc.token, tc.method, tc.path, tc.body)
		var body ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		wantStatus := http.StatusBadRequest
		if tc.errCode == "" && (tc.name == "missing token" || tc.name == "invalid token") {
			wantStatus = http.StatusUnauthorized
		}
		if tc.name == "unavailable" {
			wantStatus = http.StatusConflict
		}
		if w.Code != wantStatus || body.Error.Code != tc.code {
			t.Fatalf("%s: status=%d code=%s body=%s", tc.name, w.Code, body.Error.Code, w.Body.String())
		}
	}
}

func TestCartHTTP_StableRouteErrors(t *testing.T) {
	cases := []struct {
		name, method, path, body string
		err                      error
		status                   int
		code                     string
	}{
		{"cart item not found", http.MethodDelete, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333", "", domain.ErrCartItemNotFound, http.StatusNotFound, "cart_item_not_found"},
		{"variant not found", http.MethodPost, "/api/v1/cart/items", `{"variantId":"22222222-2222-2222-2222-222222222222"}`, domain.ErrVariantNotFound, http.StatusNotFound, "variant_not_found"},
		{"out of stock", http.MethodPost, "/api/v1/cart/items", `{"variantId":"22222222-2222-2222-2222-222222222222"}`, domain.ErrOutOfStock, http.StatusConflict, "out_of_stock"},
		{"stock limit", http.MethodPut, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333", `{"quantity":3}`, domain.ErrStockLimit, http.StatusConflict, "stock_limit"},
		{"cart item unavailable", http.MethodPut, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333", `{"quantity":1}`, domain.ErrCartItemUnavailable, http.StatusConflict, "cart_item_unavailable"},
	}
	manager := jwt.NewManager(testSecret, "commerce-backend")
	for _, tc := range cases {
		repo := &httpCartRepo{err: tc.err}
		router := gin.New()
		NewRouter(router, Dependencies{Cart: cartuc.New(cartuc.Dependencies{Cart: repo}), JWT: manager})
		w := cartRequest(router, cartToken(manager, cartTestUser), tc.method, tc.path, tc.body)
		var body ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || w.Code != tc.status || body.Error.Code != tc.code {
			t.Fatalf("%s: status=%d code=%s body=%s", tc.name, w.Code, body.Error.Code, w.Body.String())
		}
	}
}

func TestCartHTTP_RejectsMalformedBodiesAcrossMutations(t *testing.T) {
	cases := []struct{ method, path, body string }{
		{http.MethodPost, "/api/v1/cart/items", `{"variantId":`},
		{http.MethodPut, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333", `{"quantity":`},
		{http.MethodPatch, "/api/v1/cart/items/33333333-3333-3333-3333-333333333333/selection", `{"selected":`},
		{http.MethodPut, "/api/v1/cart/selection", `{"selected":`},
	}
	router, token := newCartTestRouter(&httpCartRepo{})
	for _, tc := range cases {
		w := cartRequest(router, token, tc.method, tc.path, tc.body)
		var body ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || w.Code != http.StatusBadRequest || body.Error.Code != "validation_error" {
			t.Fatalf("%s %s: status=%d code=%s body=%s", tc.method, tc.path, w.Code, body.Error.Code, w.Body.String())
		}
	}
}

func TestCartHTTP_RejectsInvalidUUIDsAcrossItemRoutes(t *testing.T) {
	cases := []struct{ method, path, body string }{
		{http.MethodPost, "/api/v1/cart/items", `{"variantId":"not-a-uuid"}`},
		{http.MethodPut, "/api/v1/cart/items/not-a-uuid", `{"quantity":1}`},
		{http.MethodPatch, "/api/v1/cart/items/not-a-uuid/selection", `{"selected":true}`},
		{http.MethodDelete, "/api/v1/cart/items/not-a-uuid", ""},
	}
	router, token := newCartTestRouter(&httpCartRepo{})
	for _, tc := range cases {
		w := cartRequest(router, token, tc.method, tc.path, tc.body)
		var body ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || w.Code != http.StatusBadRequest || body.Error.Code != "validation_error" {
			t.Fatalf("%s %s: status=%d code=%s body=%s", tc.method, tc.path, w.Code, body.Error.Code, w.Body.String())
		}
	}
}

func TestCartHTTP_OwnershipUsesDistinctCallerTokens(t *testing.T) {
	repo := &httpCartRepo{}
	manager := jwt.NewManager(testSecret, "commerce-backend")
	router := gin.New()
	NewRouter(router, Dependencies{Cart: cartuc.New(cartuc.Dependencies{Cart: repo}), JWT: manager})
	if w := cartRequest(router, cartToken(manager, cartTestUser), http.MethodGet, "/api/v1/cart", ""); w.Code != http.StatusOK || repo.user != cartTestUser {
		t.Fatalf("first caller: status=%d user=%q", w.Code, repo.user)
	}
	if w := cartRequest(router, cartToken(manager, otherCartUser), http.MethodGet, "/api/v1/cart", ""); w.Code != http.StatusOK || repo.user != otherCartUser {
		t.Fatalf("second caller: status=%d user=%q", w.Code, repo.user)
	}
}
