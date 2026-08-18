package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	cataloguc "commerce-backend/internal/usecase/catalog"
	"commerce-backend/internal/usecase/catalog/fakerepos"
)

func setupAdminCatalogTestRouter() (*gin.Engine, *jwt.Manager, *fakerepos.Catalog, *cataloguc.UseCase) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	repo := fakerepos.NewCatalog()
	repo.AddCategory(domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"})
	repo.AddCategory(domain.Category{ID: "22222222-2222-2222-2222-222222222222", Name: "Máy tính"})

	uc := cataloguc.New(cataloguc.Dependencies{Catalog: repo})
	r := gin.New()

	NewRouter(r, Dependencies{
		Catalog:      uc,
		JWT:          manager,
		RefreshTTL:   7 * 24 * time.Hour,
		CookieSecure: false,
	})

	return r, manager, repo, uc
}

func adminBearerToken(t *testing.T, manager *jwt.Manager) string {
	t.Helper()
	token, err := manager.GenerateAccessToken("admin-user-id", domain.RoleAdmin, 15*time.Minute)
	if err != nil {
		t.Fatalf("generate admin token: %v", err)
	}
	return "Bearer " + token
}

func customerBearerToken(t *testing.T, manager *jwt.Manager) string {
	t.Helper()
	token, err := manager.GenerateAccessToken("customer-user-id", domain.RoleCustomer, 15*time.Minute)
	if err != nil {
		t.Fatalf("generate customer token: %v", err)
	}
	return "Bearer " + token
}

func TestAdminCatalog_AuthGuards(t *testing.T) {
	router, manager, repo, _ := setupAdminCatalogTestRouter()
	prodID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.AddProduct(domain.Product{
		ID:       prodID,
		Name:     "Test Phone",
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Active:   true,
	})

	endpoints := []struct {
		method string
		url    string
		body   string
	}{
		{http.MethodGet, "/api/v1/admin/products", ""},
		{http.MethodGet, "/api/v1/admin/products/" + prodID, ""},
		{http.MethodPost, "/api/v1/admin/products", `{"name":"New","categoryId":"11111111-1111-1111-1111-111111111111","price":"100"}`},
		{http.MethodPut, "/api/v1/admin/products/" + prodID, `{"name":"Update","categoryId":"11111111-1111-1111-1111-111111111111","price":"100"}`},
		{http.MethodDelete, "/api/v1/admin/products/" + prodID, ""},
	}

	for _, ep := range endpoints {
		t.Run("NoAuth_"+ep.method+"_"+ep.url, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.url, bytes.NewBufferString(ep.body))
			if ep.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 Unauthorized, got %d for %s %s", w.Code, ep.method, ep.url)
			}
		})

		t.Run("CustomerForbidden_"+ep.method+"_"+ep.url, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.url, bytes.NewBufferString(ep.body))
			if ep.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			req.Header.Set("Authorization", customerBearerToken(t, manager))
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusForbidden {
				t.Fatalf("expected 403 Forbidden, got %d for %s %s", w.Code, ep.method, ep.url)
			}
			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatalf("unmarshal error envelope: %v", err)
			}
			if env.Error == nil || env.Error.Code != "forbidden" {
				t.Errorf("expected error.code 'forbidden', got %+v", env.Error)
			}
			if env.Error.Message != "Bạn không có quyền thực hiện thao tác này" {
				t.Errorf("expected Vietnamese forbidden message, got %q", env.Error.Message)
			}
		})
	}
}

func TestAdminCatalog_ListProducts_SuccessAndPagination(t *testing.T) {
	router, manager, repo, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	// Add a product with NO variants
	repo.AddProduct(domain.Product{
		ID:            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		Name:          "Xiaomi 14 Pro",
		Model:         "23116PN5BC",
		Brand:         "Xiaomi",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Price:         "15000000",
		Currency:      "VND",
		StockQuantity: 30,
		Active:        true,
		ImageURLs:     []string{"https://example.com/xiaomi14.jpg"},
	})

	// Add a soft-deleted product (should not appear)
	repo.AddProductWithActiveState(domain.Product{
		ID:       "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
		Name:     "Old Deleted Phone",
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Active:   false,
	}, false)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/products", nil)
	req.Header.Set("Authorization", token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Success bool                     `json:"success"`
		Message string                   `json:"message"`
		Data    []productSummaryResponse `json:"data"`
		Meta    ResponseMeta             `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if !env.Success {
		t.Fatalf("expected success=true")
	}
	if len(env.Data) != 1 {
		t.Fatalf("expected 1 product (excluding soft deleted), got %d", len(env.Data))
	}
	p := env.Data[0]
	if p.Name != "Xiaomi 14 Pro" || p.Brand != "Xiaomi" || p.Category.Name != "Điện thoại" {
		t.Errorf("unexpected product data: %+v", p)
	}
	if env.Meta.Pagination == nil {
		t.Fatalf("expected pagination metadata in admin product list")
	}
	if env.Meta.Pagination.Total != 1 || env.Meta.Pagination.Page != 1 {
		t.Errorf("unexpected pagination meta: %+v", env.Meta.Pagination)
	}
}

func TestAdminCatalog_ListProducts_SearchQuery(t *testing.T) {
	router, manager, repo, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	repo.AddProduct(domain.Product{
		ID:       "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		Name:     "iPhone 15 Pro",
		Model:    "A3102",
		Brand:    "Apple",
		Category: domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Active:   true,
	})
	repo.AddProduct(domain.Product{
		ID:       "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
		Name:     "MacBook Pro 16",
		Model:    "M3 Max",
		Brand:    "Apple",
		Category: domain.Category{ID: "22222222-2222-2222-2222-222222222222", Name: "Máy tính"},
		Active:   true,
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/products?q=MacBook", nil)
	req.Header.Set("Authorization", token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var env struct {
		Data []productSummaryResponse `json:"data"`
		Meta ResponseMeta             `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(env.Data) != 1 || env.Data[0].Name != "MacBook Pro 16" {
		t.Fatalf("expected MacBook Pro 16, got: %+v", env.Data)
	}
}

func TestAdminCatalog_ListProducts_InvalidPagination(t *testing.T) {
	router, manager, _, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/products?page=0", nil)
	req.Header.Set("Authorization", token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for page=0, got %d", w.Code)
	}
	var env ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env.Error == nil || env.Error.Fields["page"] == "" {
		t.Fatalf("expected error field 'page', got: %+v", env.Error)
	}
}

func TestAdminCatalog_GetProduct_Success(t *testing.T) {
	router, manager, repo, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	id := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.AddProduct(domain.Product{
		ID:            id,
		Name:          "Galaxy S24",
		Model:         "SM-S921B",
		Brand:         "Samsung",
		Description:   "Samsung Flagship",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Price:         "21990000",
		Currency:      "VND",
		StockQuantity: 40,
		Active:        true,
		ImageURLs:     []string{"https://example.com/s24.jpg"},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/products/"+id, nil)
	req.Header.Set("Authorization", token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Success bool                  `json:"success"`
		Data    productDetailResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !env.Success || env.Data.ID != id || env.Data.Name != "Galaxy S24" || env.Data.Brand != "Samsung" {
		t.Errorf("unexpected product detail: %+v", env.Data)
	}
}

func TestAdminCatalog_GetProduct_NotFound(t *testing.T) {
	router, manager, _, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/products/99999999-9999-9999-9999-999999999999", nil)
	req.Header.Set("Authorization", token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestAdminCatalog_CreateProduct_Success(t *testing.T) {
	router, manager, _, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	payload := `{
		"name": "iPad Pro M4",
		"model": "A2836",
		"brand": "Apple",
		"description": "Ultra thin tablet",
		"categoryId": "22222222-2222-2222-2222-222222222222",
		"price": "28990000",
		"currency": "VND",
		"stockQuantity": 15,
		"featured": true,
		"imageUrls": ["https://example.com/ipad1.jpg", "https://example.com/ipad2.jpg"]
	}`

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/products", bytes.NewBufferString(payload))
	req.Header.Set("Authorization", token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201 Created, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Success bool                  `json:"success"`
		Message string                `json:"message"`
		Data    productDetailResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !env.Success || env.Data.ID == "" || env.Data.Name != "iPad Pro M4" || env.Data.Brand != "Apple" {
		t.Errorf("unexpected created detail: %+v", env.Data)
	}
	if len(env.Data.ImageURLs) != 2 {
		t.Errorf("expected 2 image URLs, got %d", len(env.Data.ImageURLs))
	}
}

func TestAdminCatalog_CreateProduct_ValidationErrors(t *testing.T) {
	router, manager, _, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	// Missing name, invalid categoryId, invalid price
	payload := `{
		"name": "",
		"categoryId": "invalid-uuid",
		"price": "-1000",
		"stockQuantity": -5
	}`

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/products", bytes.NewBufferString(payload))
	req.Header.Set("Authorization", token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env.Error == nil || env.Error.Code != "validation_error" {
		t.Fatalf("expected error.code 'validation_error', got %+v", env.Error)
	}
	if env.Error.Fields["name"] == "" || env.Error.Fields["categoryId"] == "" || env.Error.Fields["price"] == "" || env.Error.Fields["stockQuantity"] == "" {
		t.Fatalf("expected validation errors on fields, got: %+v", env.Error.Fields)
	}
}

func TestAdminCatalog_UpdateProduct_Success(t *testing.T) {
	router, manager, repo, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	id := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.AddProduct(domain.Product{
		ID:            id,
		Name:          "Old Product",
		Model:         "V1",
		Brand:         "OldBrand",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Price:         "100000",
		Currency:      "VND",
		StockQuantity: 5,
		Active:        true,
	})

	payload := `{
		"name": "Updated Product",
		"model": "V2",
		"brand": "NewBrand",
		"description": "Updated desc",
		"categoryId": "22222222-2222-2222-2222-222222222222",
		"price": "250000",
		"currency": "VND",
		"stockQuantity": 12,
		"featured": false,
		"imageUrls": ["https://example.com/new.jpg"]
	}`

	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/products/"+id, bytes.NewBufferString(payload))
	req.Header.Set("Authorization", token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Success bool                  `json:"success"`
		Data    productDetailResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env.Data.Name != "Updated Product" || env.Data.Brand != "NewBrand" || env.Data.Category.ID != "22222222-2222-2222-2222-222222222222" {
		t.Errorf("unexpected updated data: %+v", env.Data)
	}
}

func TestAdminCatalog_UpdateProduct_NotFound(t *testing.T) {
	router, manager, _, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	payload := `{
		"name": "Updated Product",
		"categoryId": "11111111-1111-1111-1111-111111111111",
		"price": "250000"
	}`

	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/products/99999999-9999-9999-9999-999999999999", bytes.NewBufferString(payload))
	req.Header.Set("Authorization", token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404 Not Found, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestAdminCatalog_DeleteProduct_SoftDelete_Returns204(t *testing.T) {
	router, manager, repo, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	id := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.AddProduct(domain.Product{
		ID:            id,
		Name:          "Product To Delete",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Price:         "100000",
		StockQuantity: 10,
		Active:        true,
	})

	// DELETE request
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/products/"+id, nil)
	req.Header.Set("Authorization", token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected status 204 No Content, got %d. Body: %s", w.Code, w.Body.String())
	}
	if w.Body.Len() > 0 {
		t.Errorf("expected empty body for 204 No Content, got %q", w.Body.String())
	}

	// Verify subsequent GET returns 404
	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/products/"+id, nil)
	getReq.Header.Set("Authorization", token)
	wGet := httptest.NewRecorder()
	router.ServeHTTP(wGet, getReq)

	if wGet.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for soft-deleted product, got %d", wGet.Code)
	}

	// Verify list endpoint does NOT return deleted product
	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/products", nil)
	listReq.Header.Set("Authorization", token)
	wList := httptest.NewRecorder()
	router.ServeHTTP(wList, listReq)

	var env struct {
		Data []productSummaryResponse `json:"data"`
	}
	if err := json.Unmarshal(wList.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(env.Data) != 0 {
		t.Fatalf("expected 0 products in list, got %d", len(env.Data))
	}
}

func TestAdminCatalog_DeleteProduct_NotFound(t *testing.T) {
	router, manager, _, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/products/99999999-9999-9999-9999-999999999999", nil)
	req.Header.Set("Authorization", token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404 Not Found, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestAdminCatalog_CreateProduct_WithVariants_Success(t *testing.T) {
	router, manager, _, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	payload := `{
		"name": "iPhone 15 Pro",
		"model": "A3102",
		"brand": "Apple",
		"description": "Titanium smartphone",
		"categoryId": "11111111-1111-1111-1111-111111111111",
		"hasVariants": true,
		"optionGroups": [
			{
				"id": "group-color",
				"label": "Màu sắc",
				"position": 0,
				"values": [
					{"id": "val-color-natural", "label": "Titan Tự Nhiên"},
					{"id": "val-color-blue", "label": "Titan Xanh"}
				]
			},
			{
				"id": "group-storage",
				"label": "Dung lượng",
				"position": 1,
				"values": [
					{"id": "val-storage-128", "label": "128GB"},
					{"id": "val-storage-256", "label": "256GB"}
				]
			}
		],
		"variants": [
			{
				"id": "var-1",
				"optionValueIds": {"group-color": "val-color-natural", "group-storage": "val-storage-128"},
				"priceVnd": "24990000",
				"stockQuantity": 10,
				"active": true
			},
			{
				"id": "var-2",
				"optionValueIds": {"group-color": "val-color-natural", "group-storage": "val-storage-256"},
				"priceVnd": "27990000",
				"stockQuantity": 15,
				"active": true
			},
			{
				"id": "var-3",
				"optionValueIds": {"group-color": "val-color-blue", "group-storage": "val-storage-128"},
				"priceVnd": "24990000",
				"stockQuantity": 5,
				"active": true
			},
			{
				"id": "var-4",
				"optionValueIds": {"group-color": "val-color-blue", "group-storage": "val-storage-256"},
				"priceVnd": "27990000",
				"stockQuantity": 0,
				"active": false
			}
		],
		"featured": true,
		"imageUrls": ["https://example.com/ip15.jpg"]
	}`

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/products", bytes.NewBufferString(payload))
	req.Header.Set("Authorization", token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201 Created, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Success bool                  `json:"success"`
		Message string                `json:"message"`
		Data    productDetailResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if !env.Success {
		t.Fatalf("expected success=true")
	}
	if len(env.Data.OptionGroups) != 2 {
		t.Fatalf("expected 2 option groups in detail response, got %d", len(env.Data.OptionGroups))
	}
	if len(env.Data.Variants) != 4 {
		t.Fatalf("expected 4 variants in detail response, got %d", len(env.Data.Variants))
	}
	if env.Data.Price != "24990000" {
		t.Errorf("expected computed min price 24990000, got %s", env.Data.Price)
	}
	if env.Data.StockQuantity != 30 {
		t.Errorf("expected computed active stock sum 30, got %d", env.Data.StockQuantity)
	}
}

func TestAdminCatalog_CreateProduct_VariantValidationErrors(t *testing.T) {
	router, manager, _, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	tests := []struct {
		name          string
		payload       string
		expectedField string
		expectedMsg   string
	}{
		{
			name: "hasVariants true with empty option groups",
			payload: `{
				"name": "Invalid Variant Product",
				"categoryId": "11111111-1111-1111-1111-111111111111",
				"hasVariants": true,
				"optionGroups": []
			}`,
			expectedField: "optionGroups",
			expectedMsg:   "Phải có ít nhất một nhóm thuộc tính",
		},
		{
			name: "empty option group label",
			payload: `{
				"name": "Invalid Variant Product",
				"categoryId": "11111111-1111-1111-1111-111111111111",
				"hasVariants": true,
				"optionGroups": [
					{
						"label": "   ",
						"values": [{"label": "128GB"}]
					}
				],
				"variants": [
					{"priceVnd": "10000", "stockQuantity": 5, "active": true}
				]
			}`,
			expectedField: "optionGroups[0].label",
			expectedMsg:   "Tên nhóm thuộc tính không được để trống",
		},
		{
			name: "option group with empty values",
			payload: `{
				"name": "Invalid Variant Product",
				"categoryId": "11111111-1111-1111-1111-111111111111",
				"hasVariants": true,
				"optionGroups": [
					{
						"label": "Dung lượng",
						"values": []
					}
				],
				"variants": [
					{"priceVnd": "10000", "stockQuantity": 5, "active": true}
				]
			}`,
			expectedField: "optionGroups[0].values",
			expectedMsg:   "Nhóm thuộc tính phải có ít nhất một giá trị",
		},
		{
			name: "duplicate option values within group",
			payload: `{
				"name": "Invalid Variant Product",
				"categoryId": "11111111-1111-1111-1111-111111111111",
				"hasVariants": true,
				"optionGroups": [
					{
						"label": "Màu sắc",
						"values": [
							{"label": "Đen"},
							{"label": " đen "}
						]
					}
				],
				"variants": [
					{"priceVnd": "10000", "stockQuantity": 5, "active": true}
				]
			}`,
			expectedField: "optionGroups[0].values",
			expectedMsg:   "Giá trị thuộc tính không được trùng nhau",
		},
		{
			name: "negative variant price",
			payload: `{
				"name": "Invalid Variant Product",
				"categoryId": "11111111-1111-1111-1111-111111111111",
				"hasVariants": true,
				"optionGroups": [
					{
						"label": "Màu sắc",
						"values": [{"label": "Đen"}]
					}
				],
				"variants": [
					{"priceVnd": "-5000", "stockQuantity": 5, "active": true}
				]
			}`,
			expectedField: "variants[0].priceVnd",
			expectedMsg:   "Giá biến thể phải là số không âm",
		},
		{
			name: "negative variant stock",
			payload: `{
				"name": "Invalid Variant Product",
				"categoryId": "11111111-1111-1111-1111-111111111111",
				"hasVariants": true,
				"optionGroups": [
					{
						"label": "Màu sắc",
						"values": [{"label": "Đen"}]
					}
				],
				"variants": [
					{"priceVnd": "50000", "stockQuantity": -3, "active": true}
				]
			}`,
			expectedField: "variants[0].stockQuantity",
			expectedMsg:   "Số lượng tồn kho không được âm",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/products", bytes.NewBufferString(tt.payload))
			req.Header.Set("Authorization", token)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected status 400 Bad Request, got %d. Body: %s", w.Code, w.Body.String())
			}

			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}
			if env.Error == nil || env.Error.Code != "validation_error" {
				t.Fatalf("expected error.code 'validation_error', got %+v", env.Error)
			}
			msg, ok := env.Error.Fields[tt.expectedField]
			if !ok {
				t.Fatalf("expected error field %q, got fields: %+v", tt.expectedField, env.Error.Fields)
			}
			if msg != tt.expectedMsg {
				t.Errorf("expected error message %q, got %q", tt.expectedMsg, msg)
			}
		})
	}
}

func TestAdminCatalog_UpdateProduct_WithVariants_Success(t *testing.T) {
	router, manager, repo, _ := setupAdminCatalogTestRouter()
	token := adminBearerToken(t, manager)

	id := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.AddProduct(domain.Product{
		ID:            id,
		Name:          "Initial Simple Product",
		Category:      domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"},
		Price:         "5000000",
		StockQuantity: 10,
		Active:        true,
	})

	payload := `{
		"name": "Updated Multi-Variant Product",
		"categoryId": "11111111-1111-1111-1111-111111111111",
		"hasVariants": true,
		"optionGroups": [
			{
				"id": "grp-1",
				"label": "Màu sắc",
				"position": 0,
				"values": [{"id": "val-1", "label": "Xanh"}]
			}
		],
		"variants": [
			{
				"id": "var-1",
				"optionValueIds": {"grp-1": "val-1"},
				"priceVnd": "7500000",
				"stockQuantity": 18,
				"active": true
			}
		]
	}`

	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/products/"+id, bytes.NewBufferString(payload))
	req.Header.Set("Authorization", token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Success bool                  `json:"success"`
		Data    productDetailResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if env.Data.Name != "Updated Multi-Variant Product" {
		t.Errorf("expected updated name, got %q", env.Data.Name)
	}
	if len(env.Data.OptionGroups) != 1 || len(env.Data.Variants) != 1 {
		t.Fatalf("expected 1 option group and 1 variant, got groups=%d, variants=%d", len(env.Data.OptionGroups), len(env.Data.Variants))
	}
	if env.Data.Price != "7500000" || env.Data.StockQuantity != 18 {
		t.Errorf("expected price 7500000 and stock 18, got price=%s stock=%d", env.Data.Price, env.Data.StockQuantity)
	}
}

