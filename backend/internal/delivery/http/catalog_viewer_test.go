package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	cataloguc "commerce-backend/internal/usecase/catalog"
	catalogfakerepos "commerce-backend/internal/usecase/catalog/fakerepos"
	favoriteuc "commerce-backend/internal/usecase/favorite"
)

const (
	viewerCatID = "11111111-1111-1111-1111-111111111111"
	viewerProd1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	viewerProd2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
)

type trackingFavoriteRepo struct {
	favorites  map[string]map[string]time.Time
	batchCalls int32
	batchErr   error
}

func newTrackingFavoriteRepo() *trackingFavoriteRepo {
	return &trackingFavoriteRepo{
		favorites: make(map[string]map[string]time.Time),
	}
}

func (r *trackingFavoriteRepo) AddFavorite(ctx context.Context, userID, productID string) error {
	if r.favorites[userID] == nil {
		r.favorites[userID] = make(map[string]time.Time)
	}
	r.favorites[userID][productID] = time.Now().UTC()
	return nil
}

func (r *trackingFavoriteRepo) RemoveFavorite(ctx context.Context, userID, productID string) error {
	if r.favorites[userID] != nil {
		delete(r.favorites[userID], productID)
	}
	return nil
}

func (r *trackingFavoriteRepo) GetFavoriteProductIDs(ctx context.Context, userID string, productIDs []string) ([]string, error) {
	atomic.AddInt32(&r.batchCalls, 1)
	if r.batchErr != nil {
		return nil, r.batchErr
	}
	userFavs := r.favorites[userID]
	if userFavs == nil {
		return []string{}, nil
	}
	var out []string
	for _, pid := range productIDs {
		if _, ok := userFavs[pid]; ok {
			out = append(out, pid)
		}
	}
	return out, nil
}

func (r *trackingFavoriteRepo) ListFavorites(ctx context.Context, userID string, page, limit int) (domain.PaginatedFavorites, error) {
	return domain.PaginatedFavorites{}, nil
}

func setupCatalogViewerRouter(catalogRepo *catalogfakerepos.Catalog, favRepo *trackingFavoriteRepo) (*gin.Engine, *jwt.Manager) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	catUC := cataloguc.New(cataloguc.Dependencies{Catalog: catalogRepo})
	favUC := favoriteuc.New(favoriteuc.Dependencies{Favorites: favRepo})

	r := gin.New()
	NewRouter(r, Dependencies{
		Catalog:      catUC,
		Favorites:    favUC,
		JWT:          manager,
		RefreshTTL:   24 * time.Hour,
		CookieSecure: false,
	})
	return r, manager
}

func seedViewerCatalog() *catalogfakerepos.Catalog {
	catalog := catalogfakerepos.NewCatalog()
	catalog.AddCategory(domain.Category{ID: viewerCatID, Name: "Electronics"})
	catalog.AddProductWithActiveState(domain.Product{
		ID:            viewerProd1,
		Name:          "Product 1",
		Model:         "M1",
		Brand:         "BrandA",
		Description:   "Description 1",
		Category:      domain.Category{ID: viewerCatID, Name: "Electronics"},
		Price:         "100000",
		Currency:      "VND",
		MinPriceVND:   "100000",
		MaxPriceVND:   "100000",
		StockQuantity: 5,
		ImageURLs:     []string{"https://example.com/p1.jpg"},
		Featured:      true,
		Active:        true,
		Variants: []domain.ProductVariant{
			{ID: "v-1", PriceVND: "100000", StockQuantity: 5, Active: true},
		},
	}, true)
	catalog.AddProductWithActiveState(domain.Product{
		ID:            viewerProd2,
		Name:          "Product 2",
		Model:         "M2",
		Brand:         "BrandB",
		Description:   "Description 2",
		Category:      domain.Category{ID: viewerCatID, Name: "Electronics"},
		Price:         "200000",
		Currency:      "VND",
		MinPriceVND:   "200000",
		MaxPriceVND:   "200000",
		StockQuantity: 0,
		ImageURLs:     []string{"https://example.com/p2.jpg"},
		Featured:      false,
		Active:        true,
		Variants: []domain.ProductVariant{
			{ID: "v-2", PriceVND: "200000", StockQuantity: 0, Active: true},
		},
	}, true)
	return catalog
}

// CATALOG-VIEWER-001: Anonymous GET /api/v1/products yields viewer.isFavorite false with zero favorite queries
func TestCatalogViewer_001_AnonymousListProducts(t *testing.T) {
	catRepo := seedViewerCatalog()
	favRepo := newTrackingFavoriteRepo()
	router, _ := setupCatalogViewerRouter(catRepo, favRepo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/products", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Data []productSummaryResponse `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if len(resp.Data) != 2 {
		t.Fatalf("expected 2 products, got %d", len(resp.Data))
	}
	for _, p := range resp.Data {
		if p.Viewer.IsFavorite {
			t.Fatalf("expected viewer.isFavorite false for anonymous call on %s", p.ID)
		}
	}
	if calls := atomic.LoadInt32(&favRepo.batchCalls); calls != 0 {
		t.Fatalf("expected 0 batch favorite calls, got %d", calls)
	}
}

// CATALOG-VIEWER-002: Customer token sets viewer.isFavorite based on one batch query
func TestCatalogViewer_002_CustomerListProductsBatchLookup(t *testing.T) {
	catRepo := seedViewerCatalog()
	favRepo := newTrackingFavoriteRepo()
	router, manager := setupCatalogViewerRouter(catRepo, favRepo)

	customerID := "11111111-1111-1111-1111-111111111111"
	_ = favRepo.AddFavorite(context.Background(), customerID, viewerProd1)

	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/products", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var resp struct {
		Data []productSummaryResponse `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if len(resp.Data) != 2 {
		t.Fatalf("expected 2 products, got %d", len(resp.Data))
	}
	for _, p := range resp.Data {
		if p.ID == viewerProd1 && !p.Viewer.IsFavorite {
			t.Fatalf("expected viewerProd1 viewer.isFavorite = true")
		}
		if p.ID == viewerProd2 && p.Viewer.IsFavorite {
			t.Fatalf("expected viewerProd2 viewer.isFavorite = false")
		}
	}
	if calls := atomic.LoadInt32(&favRepo.batchCalls); calls != 1 {
		t.Fatalf("expected exactly 1 batch lookup call, got %d", calls)
	}
}

// CATALOG-VIEWER-003: Featured products viewer state
func TestCatalogViewer_003_CustomerFeaturedProducts(t *testing.T) {
	catRepo := seedViewerCatalog()
	favRepo := newTrackingFavoriteRepo()
	router, manager := setupCatalogViewerRouter(catRepo, favRepo)

	customerID := "11111111-1111-1111-1111-111111111111"
	_ = favRepo.AddFavorite(context.Background(), customerID, viewerProd1)

	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/products/featured", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Data []productSummaryResponse `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if len(resp.Data) != 1 || resp.Data[0].ID != viewerProd1 {
		t.Fatalf("expected 1 featured product viewerProd1, got %+v", resp.Data)
	}
	if !resp.Data[0].Viewer.IsFavorite {
		t.Fatalf("expected featured product viewer.isFavorite = true")
	}
}

// CATALOG-VIEWER-004: Product detail viewer state
func TestCatalogViewer_004_CustomerProductDetail(t *testing.T) {
	catRepo := seedViewerCatalog()
	favRepo := newTrackingFavoriteRepo()
	router, manager := setupCatalogViewerRouter(catRepo, favRepo)

	customerID := "11111111-1111-1111-1111-111111111111"
	_ = favRepo.AddFavorite(context.Background(), customerID, viewerProd1)

	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/products/"+viewerProd1, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Data productDetailResponse `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.Data.ID != viewerProd1 || !resp.Data.Viewer.IsFavorite {
		t.Fatalf("expected viewerProd1 with viewer.isFavorite = true, got %+v", resp.Data)
	}
	if resp.Data.Name != "Product 1" || resp.Data.Price != "100000" {
		t.Fatalf("intrinsic fields changed: %+v", resp.Data)
	}
}

// CATALOG-VIEWER-005 & 013: Invalid or expired bearer token returns 401 invalid_token on all catalog endpoints
func TestCatalogViewer_005_013_InvalidOrExpiredToken(t *testing.T) {
	catRepo := seedViewerCatalog()
	favRepo := newTrackingFavoriteRepo()
	router, _ := setupCatalogViewerRouter(catRepo, favRepo)

	endpoints := []string{
		"/api/v1/products",
		"/api/v1/products/featured",
		"/api/v1/products/" + viewerProd1,
	}

	for _, ep := range endpoints {
		t.Run("invalid_token_"+ep, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, ep, nil)
			req.Header.Set("Authorization", "Bearer invalid.jwt.token")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401 for %s", w.Code, ep)
			}

			var resp ResponseEnvelope
			_ = json.Unmarshal(w.Body.Bytes(), &resp)
			if resp.Error == nil || resp.Error.Code != "invalid_token" {
				t.Fatalf("expected code invalid_token, got %+v", resp.Error)
			}
			if resp.Error.Message != "Phiên đăng nhập không hợp lệ hoặc đã hết hạn" {
				t.Fatalf("unexpected message: %q", resp.Error.Message)
			}
			if len(resp.Error.Fields) != 0 {
				t.Fatalf("fields should be absent")
			}
		})
	}
}

// CATALOG-VIEWER-006: Valid admin token yields viewer.isFavorite false with zero favorite lookup queries
func TestCatalogViewer_006_AdminTokenYieldsFalseWithoutLookup(t *testing.T) {
	catRepo := seedViewerCatalog()
	favRepo := newTrackingFavoriteRepo()
	router, manager := setupCatalogViewerRouter(catRepo, favRepo)

	adminToken, _ := manager.GenerateAccessToken("admin-user-id", domain.RoleAdmin, 15*time.Minute)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/products", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var resp struct {
		Data []productSummaryResponse `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	for _, p := range resp.Data {
		if p.Viewer.IsFavorite {
			t.Fatalf("expected viewer.isFavorite = false for admin on %s", p.ID)
		}
	}
	if calls := atomic.LoadInt32(&favRepo.batchCalls); calls != 0 {
		t.Fatalf("expected 0 batch favorite calls for admin, got %d", calls)
	}
}

// CATALOG-VIEWER-007, 009, 010: Anonymous responses preserve intrinsic catalog behavior and add viewer
func TestCatalogViewer_007_009_010_AnonymousPreservesIntrinsic(t *testing.T) {
	catRepo := seedViewerCatalog()
	favRepo := newTrackingFavoriteRepo()
	router, _ := setupCatalogViewerRouter(catRepo, favRepo)

	// List
	req := httptest.NewRequest(http.MethodGet, "/api/v1/products", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}

	// Featured
	reqF := httptest.NewRequest(http.MethodGet, "/api/v1/products/featured", nil)
	wF := httptest.NewRecorder()
	router.ServeHTTP(wF, reqF)
	if wF.Code != http.StatusOK {
		t.Fatalf("status = %d", wF.Code)
	}

	// Detail
	reqD := httptest.NewRequest(http.MethodGet, "/api/v1/products/"+viewerProd1, nil)
	wD := httptest.NewRecorder()
	router.ServeHTTP(wD, reqD)
	if wD.Code != http.StatusOK {
		t.Fatalf("status = %d", wD.Code)
	}

	var detailResp struct {
		Data productDetailResponse `json:"data"`
	}
	_ = json.Unmarshal(wD.Body.Bytes(), &detailResp)
	if detailResp.Data.Viewer.IsFavorite {
		t.Fatalf("expected detail viewer.isFavorite = false")
	}
	if detailResp.Data.Name != "Product 1" {
		t.Fatalf("unexpected name: %s", detailResp.Data.Name)
	}
}

// CATALOG-VIEWER-012: Batch lookup failure returns 500 internal "Đã xảy ra lỗi hệ thống"
func TestCatalogViewer_012_BatchLookupFailureReturns500(t *testing.T) {
	catRepo := seedViewerCatalog()
	favRepo := newTrackingFavoriteRepo()
	favRepo.batchErr = errors.New("db timeout: select * from product_favorites")
	router, manager := setupCatalogViewerRouter(catRepo, favRepo)

	customerID := "11111111-1111-1111-1111-111111111111"
	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	endpoints := []string{
		"/api/v1/products",
		"/api/v1/products/featured",
		"/api/v1/products/" + viewerProd1,
	}

	for _, ep := range endpoints {
		t.Run("500_on_"+ep, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, ep, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusInternalServerError {
				t.Fatalf("status = %d, want 500 for %s", w.Code, ep)
			}
			var resp ResponseEnvelope
			_ = json.Unmarshal(w.Body.Bytes(), &resp)
			if resp.Error == nil || resp.Error.Code != "internal" {
				t.Fatalf("expected internal code, got %+v", resp.Error)
			}
			if resp.Error.Message != "Đã xảy ra lỗi hệ thống" {
				t.Fatalf("expected message 'Đã xảy ra lỗi hệ thống', got %q", resp.Error.Message)
			}
		})
	}
}
