package http

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	favoriteuc "commerce-backend/internal/usecase/favorite"
)

type fakeHttpFavoriteRepo struct {
	favorites     map[string]map[string]domain.FavoriteProductSummary
	eligibleProds map[string]bool
	err           error
}

func newFakeHttpFavoriteRepo() *fakeHttpFavoriteRepo {
	return &fakeHttpFavoriteRepo{
		favorites:     make(map[string]map[string]domain.FavoriteProductSummary),
		eligibleProds: make(map[string]bool),
	}
}

func (f *fakeHttpFavoriteRepo) AddFavorite(ctx context.Context, userID, productID string) error {
	if f.err != nil {
		return f.err
	}
	if !f.eligibleProds[productID] {
		return domain.ErrProductNotFound
	}
	if f.favorites[userID] == nil {
		f.favorites[userID] = make(map[string]domain.FavoriteProductSummary)
	}
	if _, ok := f.favorites[userID][productID]; !ok {
		f.favorites[userID][productID] = domain.FavoriteProductSummary{
			ID:              productID,
			Name:            "Product " + productID,
			Model:           "Model-1",
			Brand:           "Brand-1",
			Category:        domain.Category{ID: "cat-1", Name: "Category 1"},
			MinPriceVND:     "100000",
			MaxPriceVND:     "200000",
			Price:           "100000",
			Currency:        "VND",
			PrimaryImageURL: "https://example.com/img.jpg",
			InStock:         true,
			Active:          true,
			FavoritedAt:     time.Now().UTC(),
		}
	}
	return nil
}

func (f *fakeHttpFavoriteRepo) RemoveFavorite(ctx context.Context, userID, productID string) error {
	if f.err != nil {
		return f.err
	}
	if f.favorites[userID] != nil {
		delete(f.favorites[userID], productID)
	}
	return nil
}

func (f *fakeHttpFavoriteRepo) GetFavoriteProductIDs(ctx context.Context, userID string, productIDs []string) ([]string, error) {
	if f.err != nil {
		return nil, f.err
	}
	userFavs := f.favorites[userID]
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

func (f *fakeHttpFavoriteRepo) ListFavorites(ctx context.Context, userID string, page, limit int) (domain.PaginatedFavorites, error) {
	if f.err != nil {
		return domain.PaginatedFavorites{}, f.err
	}
	userFavs := f.favorites[userID]
	all := make([]domain.FavoriteProductSummary, 0, len(userFavs))
	for _, v := range userFavs {
		all = append(all, v)
	}

	sort.Slice(all, func(i, j int) bool {
		if all[i].FavoritedAt.Equal(all[j].FavoritedAt) {
			return all[i].ID < all[j].ID
		}
		return all[i].FavoritedAt.After(all[j].FavoritedAt)
	})

	total := len(all)
	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	offset := (page - 1) * limit
	var items []domain.FavoriteProductSummary
	if offset < total {
		end := offset + limit
		if end > total {
			end = total
		}
		items = all[offset:end]
	} else {
		items = []domain.FavoriteProductSummary{}
	}

	return domain.PaginatedFavorites{
		Items: items,
		Pagination: domain.FavoritePagination{
			Page:       page,
			Limit:      limit,
			Total:      total,
			TotalPages: totalPages,
			HasNext:    page < totalPages,
			HasPrev:    page > 1,
		},
	}, nil
}

func setupFavoriteTestRouter(repo *fakeHttpFavoriteRepo) (*gin.Engine, *jwt.Manager) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	uc := favoriteuc.New(favoriteuc.Dependencies{Favorites: repo})

	r := gin.New()
	NewRouter(r, Dependencies{
		Favorites:    uc,
		JWT:          manager,
		RefreshTTL:   7 * 24 * time.Hour,
		CookieSecure: false,
	})
	return r, manager
}

// FAVORITES-API-001: Missing Authorization header returns 401 unauthorized
func TestFavoritesAPI_001_MissingAuth(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, _ := setupFavoriteTestRouter(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/favorites", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}

	var resp ResponseEnvelope
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Success {
		t.Fatalf("expected success = false")
	}
	if resp.Error == nil || resp.Error.Code != "unauthorized" {
		t.Fatalf("expected code unauthorized, got %+v", resp.Error)
	}
	if resp.Error.Message != "Vui lòng đăng nhập để sử dụng danh sách yêu thích" {
		t.Fatalf("unexpected message: %q", resp.Error.Message)
	}
	if len(resp.Error.Fields) != 0 {
		t.Fatalf("fields must be absent, got %+v", resp.Error.Fields)
	}
}

// FAVORITES-API-002: Admin access token returns 403 forbidden
func TestFavoritesAPI_002_AdminTokenForbidden(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	token, _ := manager.GenerateAccessToken("admin-user-id", domain.RoleAdmin, 15*time.Minute)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/favorites", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", w.Code)
	}

	var resp ResponseEnvelope
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error == nil || resp.Error.Code != "forbidden" {
		t.Fatalf("expected code forbidden, got %+v", resp.Error)
	}
	if resp.Error.Message != "Bạn không có quyền sử dụng danh sách yêu thích" {
		t.Fatalf("unexpected message: %q", resp.Error.Message)
	}
}

// FAVORITES-API-003: 15 favorites -> GET /api/v1/favorites returns 12 newest items ordered by favoritedAt DESC with pagination
func TestFavoritesAPI_003_ListDefaultPaginationAndOrdering(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	customerID := "11111111-1111-1111-1111-111111111111"
	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	// Seed 15 favorites
	baseTime := time.Date(2026, 8, 24, 10, 0, 0, 0, time.UTC)
	for i := 1; i <= 15; i++ {
		pID := fmt.Sprintf("aaaaaaaa-aaaa-aaaa-aaaa-%012d", i)
		repo.eligibleProds[pID] = true
		if repo.favorites[customerID] == nil {
			repo.favorites[customerID] = make(map[string]domain.FavoriteProductSummary)
		}
		repo.favorites[customerID][pID] = domain.FavoriteProductSummary{
			ID:              pID,
			Name:            fmt.Sprintf("Product %d", i),
			Model:           "M1",
			Brand:           "B1",
			Category:        domain.Category{ID: "cat-1", Name: "Cat 1"},
			MinPriceVND:     "100000",
			MaxPriceVND:     "100000",
			Price:           "100000",
			Currency:        "VND",
			PrimaryImageURL: "img.jpg",
			InStock:         true,
			Active:          true,
			FavoritedAt:     baseTime.Add(time.Duration(i) * time.Minute),
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/favorites", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Success bool                             `json:"success"`
		Data    []favoriteProductSummaryResponse `json:"data"`
		Meta    ResponseMeta                     `json:"meta"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if len(resp.Data) != 12 {
		t.Fatalf("expected 12 items, got %d", len(resp.Data))
	}
	// Check newest first (item 15 is newest)
	if resp.Data[0].ID != "aaaaaaaa-aaaa-aaaa-aaaa-000000000015" {
		t.Fatalf("expected first item to be #15, got %s", resp.Data[0].ID)
	}
	for _, item := range resp.Data {
		if !item.Viewer.IsFavorite {
			t.Fatalf("expected viewer.isFavorite = true for item %s", item.ID)
		}
	}

	pag := resp.Meta.Pagination
	if pag == nil || pag.Page != 1 || pag.Limit != 12 || pag.Total != 15 || pag.TotalPages != 2 || !pag.HasNext || pag.HasPrev {
		t.Fatalf("unexpected pagination meta: %+v", pag)
	}
}

// FAVORITES-API-004: GET /api/v1/favorites?page=3&limit=12 returns empty array [] with valid pagination
func TestFavoritesAPI_004_OutOfRangePage(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	customerID := "11111111-1111-1111-1111-111111111111"
	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	for i := 1; i <= 15; i++ {
		pID := fmt.Sprintf("aaaaaaaa-aaaa-aaaa-aaaa-%012d", i)
		repo.eligibleProds[pID] = true
		_ = repo.AddFavorite(context.Background(), customerID, pID)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/favorites?page=3&limit=12", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var resp struct {
		Success bool                             `json:"success"`
		Data    []favoriteProductSummaryResponse `json:"data"`
		Meta    ResponseMeta                     `json:"meta"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if len(resp.Data) != 0 {
		t.Fatalf("expected 0 items, got %d", len(resp.Data))
	}
	pag := resp.Meta.Pagination
	if pag == nil || pag.Page != 3 || pag.Limit != 12 || pag.Total != 15 || pag.TotalPages != 2 || pag.HasNext || !pag.HasPrev {
		t.Fatalf("unexpected pagination meta: %+v", pag)
	}
}

// FAVORITES-API-005 & 006: PUT /api/v1/favorites/:productId adds active product and is idempotent
func TestFavoritesAPI_005_006_AddFavoriteIdempotent(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	customerID := "11111111-1111-1111-1111-111111111111"
	productID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.eligibleProds[productID] = true

	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	// First PUT
	req := httptest.NewRequest(http.MethodPut, "/api/v1/favorites/"+productID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		Success bool                  `json:"success"`
		Message string                `json:"message"`
		Data    favoriteStateResponse `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Message != "Đã thêm sản phẩm vào yêu thích" || resp.Data.ProductID != productID || !resp.Data.IsFavorite {
		t.Fatalf("unexpected response: %+v", resp)
	}

	// Repeated PUT
	req2 := httptest.NewRequest(http.MethodPut, "/api/v1/favorites/"+productID, nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 on repeated PUT", w2.Code)
	}
}

// FAVORITES-API-007: PUT on inactive/nonexistent product returns 404 product_not_found
func TestFavoritesAPI_007_AddInactiveProduct(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	customerID := "11111111-1111-1111-1111-111111111111"
	productID := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	repo.eligibleProds[productID] = false

	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/favorites/"+productID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404, body=%s", w.Code, w.Body.String())
	}
	var resp ResponseEnvelope
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error == nil || resp.Error.Code != "product_not_found" {
		t.Fatalf("expected product_not_found, got %+v", resp.Error)
	}
	if resp.Error.Message != "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh" {
		t.Fatalf("unexpected message: %q", resp.Error.Message)
	}
}

// FAVORITES-API-008: PUT /api/v1/favorites/not-a-uuid returns 400 validation_error with fields.productId
func TestFavoritesAPI_008_AddInvalidUUID(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	token, _ := manager.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/favorites/not-a-uuid", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
	var resp ResponseEnvelope
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error == nil || resp.Error.Code != "validation_error" || resp.Error.Fields["productId"] == "" {
		t.Fatalf("expected validation_error with productId field, got %+v", resp.Error)
	}
}

// FAVORITES-API-009 & 010: DELETE /api/v1/favorites/:productId removes product idempotently
func TestFavoritesAPI_009_010_RemoveFavoriteIdempotent(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	customerID := "11111111-1111-1111-1111-111111111111"
	productID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	repo.eligibleProds[productID] = true
	_ = repo.AddFavorite(context.Background(), customerID, productID)

	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)

	// First DELETE
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/favorites/"+productID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		Success bool                  `json:"success"`
		Message string                `json:"message"`
		Data    favoriteStateResponse `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Message != "Đã bỏ sản phẩm khỏi yêu thích" || resp.Data.ProductID != productID || resp.Data.IsFavorite {
		t.Fatalf("unexpected response: %+v", resp)
	}

	// Repeated DELETE
	req2 := httptest.NewRequest(http.MethodDelete, "/api/v1/favorites/"+productID, nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 on repeated DELETE", w2.Code)
	}
}

// FAVORITES-API-011: Customer isolation
func TestFavoritesAPI_011_CustomerIsolation(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	c1 := "11111111-1111-1111-1111-111111111111"
	c2 := "22222222-2222-2222-2222-222222222222"
	p1 := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

	repo.eligibleProds[p1] = true
	_ = repo.AddFavorite(context.Background(), c1, p1)
	_ = repo.AddFavorite(context.Background(), c2, p1)

	// C1 removes p1
	token1, _ := manager.GenerateAccessToken(c1, domain.RoleCustomer, 15*time.Minute)
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/favorites/"+p1, nil)
	req.Header.Set("Authorization", "Bearer "+token1)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}

	// C2 still has p1
	token2, _ := manager.GenerateAccessToken(c2, domain.RoleCustomer, 15*time.Minute)
	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/favorites", nil)
	req2.Header.Set("Authorization", "Bearer "+token2)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	var resp struct {
		Data []favoriteProductSummaryResponse `json:"data"`
	}
	_ = json.Unmarshal(w2.Body.Bytes(), &resp)
	if len(resp.Data) != 1 || resp.Data[0].ID != p1 {
		t.Fatalf("C2 should still have p1, got %+v", resp.Data)
	}
}

// FAVORITES-API-012: Inactive favorite returned with active=false, inStock=false
func TestFavoritesAPI_012_InactiveFavoriteListProjection(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	customerID := "11111111-1111-1111-1111-111111111111"
	p1 := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

	if repo.favorites[customerID] == nil {
		repo.favorites[customerID] = make(map[string]domain.FavoriteProductSummary)
	}
	repo.favorites[customerID][p1] = domain.FavoriteProductSummary{
		ID:              p1,
		Name:            "Legacy Phone",
		Model:           "LP-1",
		Brand:           "OldBrand",
		Category:        domain.Category{ID: "cat-1", Name: "Phones"},
		MinPriceVND:     "50000",
		MaxPriceVND:     "50000",
		Price:           "50000",
		Currency:        "VND",
		PrimaryImageURL: "img.jpg",
		InStock:         false,
		Active:          false,
		FavoritedAt:     time.Now().UTC(),
	}

	token, _ := manager.GenerateAccessToken(customerID, domain.RoleCustomer, 15*time.Minute)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/favorites", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var resp struct {
		Data []favoriteProductSummaryResponse `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if len(resp.Data) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Data))
	}
	item := resp.Data[0]
	if item.Active || item.InStock || !item.Viewer.IsFavorite || item.Name != "Legacy Phone" {
		t.Fatalf("unexpected item state: %+v", item)
	}
}

// FAVORITES-API-013 & 014: Validation errors on page and limit
func TestFavoritesAPI_013_014_PaginationValidation(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	token, _ := manager.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)

	cases := []struct {
		query      string
		wantFields []string
	}{
		{"?page=0&limit=13", []string{"page", "limit"}},
		{"?page=abc", []string{"page"}},
		{"?page=-1", []string{"page"}},
		{"?limit=abc", []string{"limit"}},
		{"?limit=0", []string{"limit"}},
	}

	for _, tc := range cases {
		t.Run(tc.query, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/favorites"+tc.query, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 for query %s", w.Code, tc.query)
			}
			var resp ResponseEnvelope
			_ = json.Unmarshal(w.Body.Bytes(), &resp)
			if resp.Error == nil || resp.Error.Code != "validation_error" {
				t.Fatalf("expected validation_error, got %+v", resp.Error)
			}
			for _, f := range tc.wantFields {
				if resp.Error.Fields[f] == "" {
					t.Fatalf("expected field error for %s in %+v", f, resp.Error.Fields)
				}
			}
		})
	}
}

// FAVORITES-API-015: DELETE with invalid UUID returns 400 validation_error
func TestFavoritesAPI_015_DeleteInvalidUUID(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	r, manager := setupFavoriteTestRouter(repo)

	token, _ := manager.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/favorites/not-a-uuid", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
	var resp ResponseEnvelope
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error == nil || resp.Error.Code != "validation_error" || resp.Error.Fields["productId"] == "" {
		t.Fatalf("expected validation_error on productId, got %+v", resp.Error)
	}
}

// FAVORITES-API-016: Unexpected repository failure returns 500 internal "Đã xảy ra lỗi hệ thống" without leaking details
func TestFavoritesAPI_016_InternalError(t *testing.T) {
	repo := newFakeHttpFavoriteRepo()
	repo.err = errors.New("database connection failed: postgres://commerce:secret@localhost:5432")
	r, manager := setupFavoriteTestRouter(repo)

	token, _ := manager.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/favorites", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", w.Code)
	}
	var resp ResponseEnvelope
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error == nil || resp.Error.Code != "internal" {
		t.Fatalf("expected internal code, got %+v", resp.Error)
	}
	if resp.Error.Message != "Đã xảy ra lỗi hệ thống" {
		t.Fatalf("expected message 'Đã xảy ra lỗi hệ thống', got %q", resp.Error.Message)
	}
	if len(resp.Error.Fields) != 0 {
		t.Fatalf("fields must be absent on 500 error")
	}
}
