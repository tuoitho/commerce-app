package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	cataloguc "commerce-backend/internal/usecase/catalog"
	catalogfakerepos "commerce-backend/internal/usecase/catalog/fakerepos"
)

func liveCart() *domain.Cart {
	cart := testCart()
	live := domain.MoneyVND("25990000")
	line := domain.MoneyVND("51980000")
	cart.Items[0].UnitPriceVND, cart.Items[0].LineTotalVND, cart.Items[0].IsLivePrice = &live, &line, true
	cart.SelectedTotalVND = line
	return cart
}

func TestCartHTTP_LivePriceFlag(t *testing.T) {
	repo := &httpCartRepo{cart: liveCart()}
	router, token := newCartTestRouter(repo)

	w := cartRequest(router, token, http.MethodGet, "/api/v1/cart", "")
	require.Equal(t, http.StatusOK, w.Code)
	var body struct {
		Data struct {
			Items []map[string]any `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, true, body.Data.Items[0]["isLivePrice"])
	assert.Equal(t, "25990000", body.Data.Items[0]["unitPriceVnd"])
	snapshotLive(t, "cart_live_200", "TYPE-LIVE@1", "GET /api/v1/cart", nil, w)

	addBody := map[string]string{"variantId": "22222222-2222-2222-2222-222222222222"}
	w = cartRequest(router, token, http.MethodPost, "/api/v1/cart/items", `{"variantId":"22222222-2222-2222-2222-222222222222"}`)
	require.Equal(t, http.StatusOK, w.Code)
	snapshotLive(t, "cart_add_item_200", "TYPE-LIVE@1", "POST /api/v1/cart/items", addBody, w)

	repo.cart = testCart()
	w = cartRequest(router, token, http.MethodGet, "/api/v1/cart", "")
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, false, body.Data.Items[0]["isLivePrice"])
}

func newLivePricingCatalogRouter(t *testing.T, variants []domain.ProductVariant) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	catalog := catalogfakerepos.NewCatalog()
	catalog.AddCategory(domain.Category{ID: catElectronics, Name: "Apple"})
	catalog.AddProductWithActiveState(domain.Product{
		ID:           productPhone,
		Name:         "iPhone 16 Pro",
		Model:        "A3083",
		Brand:        "Apple",
		Category:     domain.Category{ID: catElectronics, Name: "Apple"},
		MinPriceVND:  "28990000",
		MaxPriceVND:  "32990000",
		ImageURLs:    []string{"https://example.com/iphone.jpg"},
		OptionGroups: []domain.OptionGroup{{ID: "group-storage", Label: "Dung lượng", Position: 1, Values: []domain.OptionValue{{ID: optionStorage, Label: "256GB"}}}},
		Variants:     variants,
	}, true)
	router := gin.New()
	NewRouter(router, Dependencies{
		Catalog: cataloguc.New(cataloguc.Dependencies{Catalog: catalog}),
		JWT:     jwt.NewManager(testSecret, "commerce-backend"),
	})
	return router
}

func TestCatalog_ProductDetailLivePrice(t *testing.T) {
	live := domain.MoneyVND("25990000")
	remaining := 7
	router := newLivePricingCatalogRouter(t, []domain.ProductVariant{
		{ID: variantPhone, OptionValueIDs: map[string]string{"group-storage": optionStorage}, PriceVND: "28990000", StockQuantity: 5, Active: true, LivePriceVND: &live, LiveRemaining: &remaining},
	})

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/products/"+productPhone, nil))
	require.Equal(t, http.StatusOK, w.Code)
	var body struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	variant := body.Data["variants"].([]any)[0].(map[string]any)
	assert.Equal(t, "28990000", variant["priceVnd"], "priceVnd stays the regular price")
	assert.Equal(t, "25990000", variant["livePriceVnd"])
	assert.EqualValues(t, 7, variant["liveRemaining"])
	assert.Equal(t, "28990000", body.Data["minPriceVnd"])
	snapshotLive(t, "product_detail_live_200", "TYPE-LIVE@1", "GET /api/v1/products/:id", nil, w)
}

func TestCatalog_ProductDetailWithoutLivePriceHasNullFields(t *testing.T) {
	router := newLivePricingCatalogRouter(t, []domain.ProductVariant{
		{ID: variantPhone, OptionValueIDs: map[string]string{"group-storage": optionStorage}, PriceVND: "28990000", StockQuantity: 5, Active: true},
	})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/products/"+productPhone, nil))
	require.Equal(t, http.StatusOK, w.Code)
	var body struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	variant := body.Data["variants"].([]any)[0].(map[string]any)
	assert.Contains(t, variant, "livePriceVnd")
	assert.Nil(t, variant["livePriceVnd"])
	assert.Nil(t, variant["liveRemaining"])
}

func TestAdminCatalog_ProductDetailHasNoLiveFields(t *testing.T) {
	live := domain.MoneyVND("25990000")
	variants := []domain.ProductVariant{{ID: variantPhone, PriceVND: "28990000", StockQuantity: 5, Active: true, LivePriceVND: &live}}
	response := toDetailResponse(domain.Product{ID: productPhone, Variants: variants})
	raw, err := json.Marshal(response)
	require.NoError(t, err)
	assert.NotContains(t, string(raw), "livePriceVnd", "admin product responses keep their shape")
}

func TestOrderHTTP_LiveQuotaExceeded(t *testing.T) {
	repo := &fakeOrderUsecaseRepo{createErr: &domain.LiveQuotaExceededError{ProductName: "iPhone 16 Pro", Remaining: 2}}
	router, token := newOrderTestRouter(repo)
	body := map[string]any{
		"addressId": "22222222-2222-2222-2222-222222222222",
		"lines": []map[string]any{{
			"variantId":    "33333333-3333-3333-3333-333333333333",
			"quantity":     3,
			"productName":  "iPhone 16 Pro",
			"unitPriceVnd": "25990000",
		}},
	}
	raw, err := json.Marshal(body)
	require.NoError(t, err)

	w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders", string(raw))
	require.Equal(t, http.StatusConflict, w.Code)
	var resp ResponseEnvelope
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "live_quota_exceeded", resp.Error.Code)
	assert.Equal(t, "Chỉ còn 2 suất giá live cho iPhone 16 Pro. Vui lòng giảm số lượng.", resp.Error.Message)
	assert.Empty(t, resp.Error.Fields)
	snapshotLive(t, "order_create_live_quota_exceeded_409", "API-LIVE-PUBLIC@1", "POST /api/v1/orders", body, w)
}
