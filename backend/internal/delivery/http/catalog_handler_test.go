package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
	authuc "commerce-backend/internal/usecase/auth"
	fakerepos "commerce-backend/internal/usecase/auth/fakerepos"
	cataloguc "commerce-backend/internal/usecase/catalog"
	catalogfakerepos "commerce-backend/internal/usecase/catalog/fakerepos"
)

const (
	catElectronics  = "11111111-1111-1111-1111-111111111111"
	catBooks        = "22222222-2222-2222-2222-222222222222"
	productMouse    = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	productKeyboard = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	productBook     = "cccccccc-cccc-cccc-cccc-cccccccccccc"
	productPhone    = "dddddddd-dddd-dddd-dddd-dddddddddddd"
	variantPhone    = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
	optionStorage   = "ffffffff-ffff-ffff-ffff-ffffffffffff"
)

func newCatalogTestRouter(t *testing.T) *gin.Engine {
	return newCatalogTestRouterWithPhone(t, false)
}

func newCatalogTestRouterWithPhone(t *testing.T, includePhone bool) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	users := fakerepos.NewUsers()
	sessions := fakerepos.NewSessions(users)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	authUC := authuc.New(authuc.Dependencies{
		Repos:                authuc.Repositories{Users: users, Sessions: sessions},
		JWT:                  manager,
		AccessTTL:            15 * time.Minute,
		RefreshTTL:           24 * time.Hour,
		HashPassword:         security.HashPassword,
		CheckPassword:        security.CheckPassword,
		GenerateRefreshToken: func() (security.RefreshTokenPair, error) { return security.GenerateRefreshToken() },
	})

	catalog := catalogfakerepos.NewCatalog()
	catalog.AddCategory(domain.Category{ID: catElectronics, Name: "Electronics"})
	catalog.AddCategory(domain.Category{ID: catBooks, Name: "Books"})
	catalog.AddProduct(domain.Product{
		ID:            productMouse,
		Name:          "Wireless Mouse",
		Description:   "A mouse without wires.",
		Category:      domain.Category{ID: catElectronics, Name: "Electronics"},
		Price:         "24.99",
		Currency:      "USD",
		ImageURLs:     []string{"https://example.com/mouse.jpg"},
		StockQuantity: 10,
	})
	catalog.AddProduct(domain.Product{
		ID:            productKeyboard,
		Name:          "Wireless Keyboard",
		Description:   "Types without wires.",
		Category:      domain.Category{ID: catElectronics, Name: "Electronics"},
		Price:         "59.90",
		Currency:      "USD",
		ImageURLs:     []string{"https://example.com/keyboard.jpg"},
		StockQuantity: 0,
	})
	catalog.AddProduct(domain.Product{
		ID:            productBook,
		Name:          "Go Programming",
		Description:   "A book about Go.",
		Category:      domain.Category{ID: catBooks, Name: "Books"},
		Price:         "39.00",
		Currency:      "USD",
		ImageURLs:     []string{"https://example.com/go.jpg"},
		StockQuantity: 3,
	})
	if includePhone {
		catalog.AddProductWithActiveState(domain.Product{
			ID:           productPhone,
			Name:         "Phone Pro",
			Model:        "P-1",
			Brand:        "Apple",
			Category:     domain.Category{ID: catElectronics, Name: "Apple"},
			Featured:     true,
			MinPriceVND:  "10000000000000000000000000000000000001",
			MaxPriceVND:  "10000000000000000000000000000000000099",
			Description:  "A featured phone.",
			ImageURLs:    []string{"https://example.com/phone.jpg"},
			OptionGroups: []domain.OptionGroup{{ID: "group-storage", Label: "Storage", Position: 1, Values: []domain.OptionValue{{ID: optionStorage, Label: "256 GB"}}}},
			Variants:     []domain.ProductVariant{{ID: variantPhone, OptionValueIDs: map[string]string{"group-storage": optionStorage}, PriceVND: "10000000000000000000000000000000000001", StockQuantity: 2, Active: true}},
		}, true)
	}

	router := gin.New()
	NewRouter(router, Dependencies{
		UseCase:      authUC,
		Catalog:      cataloguc.New(cataloguc.Dependencies{Catalog: catalog}),
		JWT:          manager,
		RefreshTTL:   24 * time.Hour,
		CookieSecure: false,
	})
	return router
}

func decodeProducts(t *testing.T, w *httptest.ResponseRecorder) []productSummaryResponse {
	t.Helper()
	var body struct {
		Success bool                     `json:"success"`
		Data    []productSummaryResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body.Data
}

func assertErrorEnvelope(t *testing.T, w *httptest.ResponseRecorder, status int, code string, field string) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status = %d, want %d, body = %s", w.Code, status, w.Body.String())
	}
	var eb ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &eb); err != nil {
		t.Fatal(err)
	}
	if eb.Success {
		t.Fatalf("expected success = false, got true")
	}
	if eb.Error == nil || eb.Error.Code != code {
		t.Fatalf("code = %v, want %q", eb.Error, code)
	}
	if field != "" && (eb.Error.Fields == nil || eb.Error.Fields[field] == "") {
		t.Fatalf("expected field %q in error, got %+v", field, eb.Error)
	}
}

func TestCatalog_ListProductsWithoutAuth(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	products := decodeProducts(t, w)
	if len(products) != 3 {
		t.Fatalf("len = %d", len(products))
	}
	if products[0].Name != "Go Programming" || products[1].Name != "Wireless Keyboard" || products[2].Name != "Wireless Mouse" {
		t.Fatalf("unexpected stable order: %q, %q, %q", products[0].Name, products[1].Name, products[2].Name)
	}
	first := products[2]
	if first.Price != "24.99" || first.Currency != "USD" || !first.InStock || first.PrimaryImageURL != "https://example.com/mouse.jpg" {
		t.Fatalf("unexpected summary: %+v", first)
	}
	if first.Category.ID != catElectronics || first.Category.Name != "Electronics" {
		t.Fatalf("unexpected category: %+v", first.Category)
	}
}

func TestCatalog_ListProductsNameSearch(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?q=WIRELESS", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	products := decodeProducts(t, w)
	if len(products) != 2 {
		t.Fatalf("len = %d, body = %s", len(products), w.Body.String())
	}
}

func TestCatalog_ListProductsBlankQuery(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?q=%20%20", nil)
	products := decodeProducts(t, w)
	if len(products) != 3 {
		t.Fatalf("blank query should return all, got %d", len(products))
	}
}

func TestCatalog_ListProductsFilterByCategory(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?category_id="+catBooks, nil)
	products := decodeProducts(t, w)
	if len(products) != 1 || products[0].ID != productBook {
		t.Fatalf("unexpected products: %+v", products)
	}
}

func TestCatalog_ListProductsPriceRange(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?min_price=30&max_price=60", nil)
	products := decodeProducts(t, w)
	ids := map[string]bool{}
	for _, p := range products {
		ids[p.ID] = true
	}
	if !ids[productKeyboard] || !ids[productBook] || ids[productMouse] {
		t.Fatalf("unexpected price-filtered products: %v", ids)
	}
}

func TestCatalog_ListProductsStockFilters(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?in_stock=true", nil)
	products := decodeProducts(t, w)
	if len(products) != 2 {
		t.Fatalf("in_stock=true len = %d", len(products))
	}
	for _, p := range products {
		if !p.InStock {
			t.Fatalf("expected only in-stock products, got %+v", p)
		}
	}
	w2, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?in_stock=false", nil)
	out := decodeProducts(t, w2)
	if len(out) != 1 || out[0].ID != productKeyboard {
		t.Fatalf("in_stock=false unexpected: %+v", out)
	}
}

func TestCatalog_ListProductsCombinedCriteria(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?q=wireless&category_id="+catElectronics+"&in_stock=true&min_price=20", nil)
	products := decodeProducts(t, w)
	if len(products) != 1 || products[0].ID != productMouse {
		t.Fatalf("unexpected combined results: %+v", products)
	}
}

func TestCatalog_ListProductsNoMatch(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?q=nope", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if products := decodeProducts(t, w); len(products) != 0 {
		t.Fatalf("expected empty array, got %d", len(products))
	}
}

func TestCatalog_ListProductsInvalidCategory(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?category_id=not-a-uuid", nil)
	assertErrorEnvelope(t, w, http.StatusBadRequest, "invalid_filter", "category_id")
}

func TestCatalog_ListProductsInvalidPrice(t *testing.T) {
	router := newCatalogTestRouter(t)
	for _, value := range []string{"1.0", "+1", "01", "1,000", "-5"} {
		w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?min_price="+value, nil)
		assertErrorEnvelope(t, w, http.StatusBadRequest, "invalid_filter", "min_price")
	}
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?min_price=-5", nil)
	assertErrorEnvelope(t, w, http.StatusBadRequest, "invalid_filter", "min_price")
	w2, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?max_price=abc", nil)
	assertErrorEnvelope(t, w2, http.StatusBadRequest, "invalid_filter", "max_price")
}

func TestCatalog_ListProductsEmptyPrice(t *testing.T) {
	router := newCatalogTestRouter(t)
	for _, test := range []struct {
		query string
		field string
	}{
		{query: "min_price=", field: "min_price"},
		{query: "max_price=", field: "max_price"},
		{query: "min_price=&max_price=", field: "min_price"},
	} {
		w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?"+test.query, nil)
		assertErrorEnvelope(t, w, http.StatusBadRequest, "invalid_filter", test.field)
	}
}

func TestCatalog_ListProductsReversedRange(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?min_price=50&max_price=10", nil)
	assertErrorEnvelope(t, w, http.StatusBadRequest, "invalid_filter", "min_price")
	var eb ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &eb); err != nil {
		t.Fatal(err)
	}
	if eb.Error.Fields["max_price"] == "" {
		t.Fatalf("expected max_price field too: %+v", eb.Error)
	}
}

func TestCatalog_ListProductsInvalidStock(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?in_stock=maybe", nil)
	assertErrorEnvelope(t, w, http.StatusBadRequest, "invalid_filter", "in_stock")
}

func TestCatalog_ListProductsRepeatedCategoriesAndVNDContract(t *testing.T) {
	router := newCatalogTestRouterWithPhone(t, true)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?category_id="+catBooks+"&category_id="+catElectronics+"&min_price=10000000000000000000000000000000000000", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	products := decodeProducts(t, w)
	if len(products) != 1 || products[0].ID != productPhone {
		t.Fatalf("unexpected products: %+v", products)
	}
	if products[0].Model != "P-1" || products[0].Brand != "Apple" || products[0].MinPriceVND != "10000000000000000000000000000000000001" || products[0].MaxPriceVND != "10000000000000000000000000000000000099" {
		t.Fatalf("unexpected VND summary: %+v", products[0])
	}
}

func TestCatalog_ListProductsPagination(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?page=1&limit=2", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp struct {
		Success bool                     `json:"success"`
		Data    []productSummaryResponse `json:"data"`
		Meta    ResponseMeta             `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if !resp.Success || len(resp.Data) != 2 {
		t.Fatalf("expected 2 items, got %d", len(resp.Data))
	}
	if resp.Meta.Pagination == nil {
		t.Fatalf("expected pagination meta, got nil")
	}
	p := resp.Meta.Pagination
	if p.Page != 1 || p.Limit != 2 || p.Total != 3 || p.TotalPages != 2 || !p.HasNext || p.HasPrev {
		t.Fatalf("unexpected pagination meta: %+v", p)
	}

	w2, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?page=2&limit=2", nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("status = %d", w2.Code)
	}
	if err := json.Unmarshal(w2.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Data) != 1 {
		t.Fatalf("expected 1 item on page 2, got %d", len(resp.Data))
	}
	if resp.Meta.Pagination.HasNext || !resp.Meta.Pagination.HasPrev {
		t.Fatalf("unexpected page 2 pagination flags: %+v", resp.Meta.Pagination)
	}
}

func TestCatalog_ListProductsInvalidPagination(t *testing.T) {
	router := newCatalogTestRouter(t)
	w1, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?page=0", nil)
	assertErrorEnvelope(t, w1, http.StatusBadRequest, "invalid_filter", "page")

	w2, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?page=abc", nil)
	assertErrorEnvelope(t, w2, http.StatusBadRequest, "invalid_filter", "page")

	w3, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?limit=-1", nil)
	assertErrorEnvelope(t, w3, http.StatusBadRequest, "invalid_filter", "limit")

	w4, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?limit=200", nil)
	assertErrorEnvelope(t, w4, http.StatusBadRequest, "invalid_filter", "limit")
}

func TestCatalog_ListFeaturedWithoutAuth(t *testing.T) {
	router := newCatalogTestRouterWithPhone(t, true)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products/featured", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	products := decodeProducts(t, w)
	if len(products) != 1 || products[0].ID != productPhone {
		t.Fatalf("unexpected featured products: %+v", products)
	}
	if products[0].Brand != "Apple" {
		t.Fatalf("unexpected brand: %q", products[0].Brand)
	}
}

func TestCatalog_GetProductDetailVariants(t *testing.T) {
	router := newCatalogTestRouterWithPhone(t, true)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products/"+productPhone, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var env struct {
		Data productDetailResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	detail := env.Data
	if !detail.Featured || detail.Model != "P-1" || detail.Brand != "Apple" || detail.MinPriceVND == "" || len(detail.OptionGroups) != 1 || len(detail.Variants) != 1 {
		t.Fatalf("unexpected phone detail: %+v", detail)
	}
	if detail.Variants[0].ID != variantPhone || detail.Variants[0].PriceVND != "10000000000000000000000000000000000001" || detail.Variants[0].OptionValueIDs["group-storage"] != optionStorage {
		t.Fatalf("unexpected variant: %+v", detail.Variants[0])
	}
}

func TestCatalog_ListCategories(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/categories", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var body struct {
		Data []categoryResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data) != 2 {
		t.Fatalf("len = %d", len(body.Data))
	}
	if body.Data[0].Name != "Books" || body.Data[1].Name != "Electronics" {
		t.Fatalf("unexpected order: %+v", body.Data)
	}
}

func TestCatalog_GetProductDetail(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products/"+productMouse, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var env struct {
		Data productDetailResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	detail := env.Data
	if detail.Name != "Wireless Mouse" || detail.Description == "" || detail.Price != "24.99" || detail.Currency != "USD" {
		t.Fatalf("unexpected detail: %+v", detail)
	}
	if len(detail.ImageURLs) != 1 || detail.StockQuantity != 10 || !detail.InStock {
		t.Fatalf("unexpected detail: %+v", detail)
	}
	if detail.CreatedAt.IsZero() || detail.UpdatedAt.IsZero() {
		t.Fatal("expected timestamps")
	}
}

func TestCatalog_GetProductOutOfStock(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products/"+productKeyboard, nil)
	var env struct {
		Data productDetailResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	detail := env.Data
	if detail.StockQuantity != 0 || detail.InStock {
		t.Fatalf("expected out-of-stock detail: %+v", detail)
	}
}

func TestCatalogStockQuantityUsesNumericJSONAtMaxInt64(t *testing.T) {
	response := toVariantResponses([]domain.ProductVariant{{ID: "variant", PriceVND: "100", StockQuantity: 9223372036854775807}})
	body, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != `[{"id":"variant","optionValueIds":{},"priceVnd":"100","stockQuantity":9223372036854775807,"active":false}]` {
		t.Fatalf("unexpected numeric stock wire: %s", body)
	}
}

func TestCatalog_GetProductMalformedID(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products/junk", nil)
	assertErrorEnvelope(t, w, http.StatusBadRequest, "invalid_product_id", "")
}

func TestCatalog_GetProductNotFound(t *testing.T) {
	router := newCatalogTestRouter(t)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/products/99999999-9999-9999-9999-999999999999", nil)
	assertErrorEnvelope(t, w, http.StatusNotFound, "product_not_found", "")
}

func TestCatalog_BrandAsStringAndCategoryAsTaxonomy(t *testing.T) {
	router := newCatalogTestRouterWithPhone(t, true)

	// Summary endpoint
	w1, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?q=Phone", nil)
	if w1.Code != http.StatusOK {
		t.Fatalf("summary status = %d", w1.Code)
	}
	var summaryRaw struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w1.Body.Bytes(), &summaryRaw); err != nil {
		t.Fatal(err)
	}
	if len(summaryRaw.Data) != 1 {
		t.Fatalf("expected 1 summary product, got %d", len(summaryRaw.Data))
	}
	summaryBrand, ok := summaryRaw.Data[0]["brand"].(string)
	if !ok || summaryBrand != "Apple" {
		t.Fatalf("summary brand expected string 'Apple', got %v (%T)", summaryRaw.Data[0]["brand"], summaryRaw.Data[0]["brand"])
	}
	summaryCat, ok := summaryRaw.Data[0]["category"].(map[string]any)
	if !ok || summaryCat["id"] != catElectronics || summaryCat["name"] != "Apple" {
		t.Fatalf("summary category expected {id, name}, got %v", summaryRaw.Data[0]["category"])
	}

	// Detail endpoint
	w2, _ := doRequest(t, router, http.MethodGet, "/api/v1/products/"+productPhone, nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("detail status = %d", w2.Code)
	}
	var detailRaw struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w2.Body.Bytes(), &detailRaw); err != nil {
		t.Fatal(err)
	}
	detailBrand, ok := detailRaw.Data["brand"].(string)
	if !ok || detailBrand != "Apple" {
		t.Fatalf("detail brand expected string 'Apple', got %v (%T)", detailRaw.Data["brand"], detailRaw.Data["brand"])
	}
	detailCat, ok := detailRaw.Data["category"].(map[string]any)
	if !ok || detailCat["id"] != catElectronics || detailCat["name"] != "Apple" {
		t.Fatalf("detail category expected {id, name}, got %v", detailRaw.Data["category"])
	}
}

func TestCatalog_ListBrands(t *testing.T) {
	router := newCatalogTestRouterWithPhone(t, true)
	w, _ := doRequest(t, router, http.MethodGet, "/api/v1/brands", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body struct {
		Success bool     `json:"success"`
		Data    []string `json:"data"`
		Meta    struct {
			Timestamp string `json:"timestamp"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !body.Success {
		t.Fatal("expected success = true")
	}
	if len(body.Data) != 1 || body.Data[0] != "Apple" {
		t.Fatalf("expected ['Apple'], got %v", body.Data)
	}
	if body.Meta.Timestamp == "" {
		t.Fatal("expected timestamp in meta")
	}
}

func TestCatalog_ListProducts_BrandFilter(t *testing.T) {
	router := newCatalogTestRouterWithPhone(t, true)

	// Filter with matching brand (case-insensitive "apple" matching "Apple")
	w1, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?brand=apple", nil)
	if w1.Code != http.StatusOK {
		t.Fatalf("status = %d", w1.Code)
	}
	products := decodeProducts(t, w1)
	if len(products) != 1 || products[0].ID != productPhone {
		t.Fatalf("expected only phone for brand=apple, got %+v", products)
	}

	// Filter with multiple brands including non-matching
	w2, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?brand=apple&brand=samsung", nil)
	products2 := decodeProducts(t, w2)
	if len(products2) != 1 || products2[0].ID != productPhone {
		t.Fatalf("expected 1 product for apple OR samsung, got %+v", products2)
	}

	// Filter with empty brand parameter: should be ignored
	w3, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?brand=", nil)
	products3 := decodeProducts(t, w3)
	if len(products3) != 4 {
		t.Fatalf("empty brand parameter should be ignored and return all 4 products, got %d", len(products3))
	}

	// Brand filter combined with pagination
	w4, _ := doRequest(t, router, http.MethodGet, "/api/v1/products?brand=apple&page=1&limit=5", nil)
	var paginatedResp struct {
		Success bool                     `json:"success"`
		Data    []productSummaryResponse `json:"data"`
		Meta    ResponseMeta             `json:"meta"`
	}
	if err := json.Unmarshal(w4.Body.Bytes(), &paginatedResp); err != nil {
		t.Fatal(err)
	}
	if paginatedResp.Meta.Pagination == nil || paginatedResp.Meta.Pagination.Total != 1 {
		t.Fatalf("expected pagination total = 1 after brand filter, got %+v", paginatedResp.Meta.Pagination)
	}
}
