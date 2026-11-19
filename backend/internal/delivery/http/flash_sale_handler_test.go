package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	cartuc "commerce-backend/internal/usecase/cart"
	flashsaleuc "commerce-backend/internal/usecase/flashsale"
)

const (
	fsTestAdminID   = "0f1e2d3c-4b5a-4968-8776-655443322110"
	fsTestProductID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
	fsTestVariant1  = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1"
	fsTestVariant2  = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"
	fsTestID1       = "cccccccc-cccc-cccc-cccc-ccccccccccc1"
	fsTestID2       = "cccccccc-cccc-cccc-cccc-ccccccccccc2"
)

type httpFlashSaleRepo struct {
	variants  map[string]domain.FlashSaleValidationVariant
	campaigns map[string]*domain.AdminFlashSaleDetail
	order     []string
	now       time.Time
	seq       int
}

func newHTTPFlashSaleRepo(now time.Time) *httpFlashSaleRepo {
	return &httpFlashSaleRepo{
		now: now,
		variants: map[string]domain.FlashSaleValidationVariant{
			fsTestVariant1: {
				ID:              fsTestVariant1,
				ProductID:       fsTestProductID,
				VariantActive:   true,
				ProductActive:   true,
				RegularPriceVND: "28990000",
			},
			fsTestVariant2: {
				ID:              fsTestVariant2,
				ProductID:       fsTestProductID,
				VariantActive:   true,
				ProductActive:   true,
				RegularPriceVND: "34990000",
			},
		},
		campaigns: map[string]*domain.AdminFlashSaleDetail{},
	}
}

func (r *httpFlashSaleRepo) GetCurrentPublic(_ context.Context) (*domain.FlashSaleCampaignPublic, error) {
	for _, id := range r.order {
		c, ok := r.campaigns[id]
		if !ok {
			continue
		}
		if domain.DeriveFlashSaleStatus(c.Active, c.StartsAt, c.EndsAt, r.now) == domain.FlashSaleStatusRunning {
			items := make([]domain.FlashSalePublicItem, 0, len(c.Items))
			for _, it := range c.Items {
				if !it.VariantActive {
					continue
				}
				items = append(items, domain.FlashSalePublicItem{
					ProductID:       it.ProductID,
					VariantID:       it.VariantID,
					ProductName:     it.ProductName,
					Brand:           it.Brand,
					Model:           it.Model,
					ImageURL:        it.ImageURL,
					OptionLabel:     it.OptionLabel,
					RegularPriceVND: it.RegularPriceVND,
					FlashPriceVND:   it.FlashPriceVND,
					DiscountPercent: domain.ComputeDiscountPercent(it.RegularPriceVND, it.FlashPriceVND),
					Quota:           it.Quota,
					SoldQuantity:    it.SoldQuantity,
					InStock:         true,
				})
			}
			return &domain.FlashSaleCampaignPublic{
				ID:       c.ID,
				Name:     c.Name,
				StartsAt: c.StartsAt,
				EndsAt:   c.EndsAt,
				Items:    items,
			}, nil
		}
	}
	return nil, nil
}

func (r *httpFlashSaleRepo) ListAdmin(_ context.Context, filter domain.FlashSaleListFilter) ([]domain.AdminFlashSaleSummary, int64, error) {
	all := make([]domain.AdminFlashSaleSummary, 0, len(r.campaigns))
	for _, c := range r.campaigns {
		status := domain.DeriveFlashSaleStatus(c.Active, c.StartsAt, c.EndsAt, r.now)
		if filter.Status != "" && string(status) != filter.Status {
			continue
		}
		var totalQuota, totalSold int
		for _, it := range c.Items {
			totalQuota += it.Quota
			totalSold += it.SoldQuantity
		}
		all = append(all, domain.AdminFlashSaleSummary{
			ID:           c.ID,
			Name:         c.Name,
			StartsAt:     c.StartsAt,
			EndsAt:       c.EndsAt,
			Active:       c.Active,
			Status:       status,
			VariantCount: len(c.Items),
			TotalQuota:   totalQuota,
			TotalSold:    totalSold,
			CreatedAt:    c.CreatedAt,
			UpdatedAt:    c.UpdatedAt,
		})
	}
	sort.Slice(all, func(i, j int) bool {
		return all[i].StartsAt.After(all[j].StartsAt)
	})
	total := int64(len(all))
	if filter.Offset >= len(all) {
		return []domain.AdminFlashSaleSummary{}, total, nil
	}
	end := filter.Offset + filter.Limit
	if end > len(all) {
		end = len(all)
	}
	return all[filter.Offset:end], total, nil
}

func (r *httpFlashSaleRepo) GetAdminByID(_ context.Context, id string) (*domain.AdminFlashSaleDetail, error) {
	c, ok := r.campaigns[id]
	if !ok {
		return nil, domain.ErrFlashSaleNotFound
	}
	cp := *c
	cp.Items = append([]domain.AdminFlashSaleItem(nil), c.Items...)
	return &cp, nil
}

func (r *httpFlashSaleRepo) ValidationData(_ context.Context, flashSaleID string, variantIDs []string) (*domain.FlashSaleValidationData, error) {
	data := &domain.FlashSaleValidationData{
		Variants: map[string]domain.FlashSaleValidationVariant{},
		Sold:     map[string]int{},
	}
	for _, vid := range variantIDs {
		if v, ok := r.variants[vid]; ok {
			data.Variants[vid] = v
		}
	}
	if flashSaleID != "" {
		c, ok := r.campaigns[flashSaleID]
		if !ok {
			return nil, domain.ErrFlashSaleNotFound
		}
		for _, it := range c.Items {
			data.Sold[it.VariantID] = it.SoldQuantity
		}
	}
	return data, nil
}

func (r *httpFlashSaleRepo) hasOverlap(excludeID string, startsAt, endsAt time.Time) bool {
	for id, c := range r.campaigns {
		if id == excludeID || !c.Active {
			continue
		}
		if startsAt.Before(c.EndsAt) && c.StartsAt.Before(endsAt) {
			return true
		}
	}
	return false
}

func (r *httpFlashSaleRepo) Create(_ context.Context, input domain.SaveFlashSaleInput, resolvedProductIDs map[string]string) (*domain.AdminFlashSaleDetail, error) {
	if input.Active && r.hasOverlap("", input.StartsAt, input.EndsAt) {
		return nil, domain.ErrFlashSaleTimeOverlap
	}
	r.seq++
	id := fsTestID1
	if r.seq > 1 {
		id = fsTestID2
	}
	items := make([]domain.AdminFlashSaleItem, 0, len(input.Items))
	for i, it := range input.Items {
		v := r.variants[it.VariantID]
		optionLabel := "256GB / Titan Tự Nhiên"
		if it.VariantID == fsTestVariant2 {
			optionLabel = "512GB / Titan Đen"
		}
		items = append(items, domain.AdminFlashSaleItem{
			ProductID:       resolvedProductIDs[it.VariantID],
			VariantID:       it.VariantID,
			ProductName:     "iPhone 16 Pro",
			Brand:           "Apple",
			Model:           "A3294",
			ImageURL:        "/media/products/550e8400-e29b-41d4-a716-446655440000.webp",
			OptionLabel:     optionLabel,
			VariantActive:   v.VariantActive && v.ProductActive,
			RegularPriceVND: v.RegularPriceVND,
			FlashPriceVND:   it.FlashPriceVND,
			Quota:           it.Quota,
			SoldQuantity:    0,
			Position:        i,
		})
	}
	detail := &domain.AdminFlashSaleDetail{
		ID:        id,
		Name:      input.Name,
		StartsAt:  input.StartsAt.UTC(),
		EndsAt:    input.EndsAt.UTC(),
		Active:    input.Active,
		Status:    domain.DeriveFlashSaleStatus(input.Active, input.StartsAt, input.EndsAt, r.now),
		CreatedAt: r.now,
		UpdatedAt: r.now,
		Items:     items,
	}
	r.campaigns[id] = detail
	r.order = append(r.order, id)
	return r.GetAdminByID(context.Background(), id)
}

func (r *httpFlashSaleRepo) Update(_ context.Context, id string, input domain.SaveFlashSaleInput, resolvedProductIDs map[string]string) (*domain.AdminFlashSaleDetail, error) {
	cur, ok := r.campaigns[id]
	if !ok {
		return nil, domain.ErrFlashSaleNotFound
	}
	if input.Active && r.hasOverlap(id, input.StartsAt, input.EndsAt) {
		return nil, domain.ErrFlashSaleTimeOverlap
	}
	soldByVariant := map[string]int{}
	for _, it := range cur.Items {
		soldByVariant[it.VariantID] = it.SoldQuantity
	}
	items := make([]domain.AdminFlashSaleItem, 0, len(input.Items))
	for i, it := range input.Items {
		v := r.variants[it.VariantID]
		optionLabel := "256GB / Titan Tự Nhiên"
		if it.VariantID == fsTestVariant2 {
			optionLabel = "512GB / Titan Đen"
		}
		items = append(items, domain.AdminFlashSaleItem{
			ProductID:       resolvedProductIDs[it.VariantID],
			VariantID:       it.VariantID,
			ProductName:     "iPhone 16 Pro",
			Brand:           "Apple",
			Model:           "A3294",
			ImageURL:        "/media/products/550e8400-e29b-41d4-a716-446655440000.webp",
			OptionLabel:     optionLabel,
			VariantActive:   v.VariantActive && v.ProductActive,
			RegularPriceVND: v.RegularPriceVND,
			FlashPriceVND:   it.FlashPriceVND,
			Quota:           it.Quota,
			SoldQuantity:    soldByVariant[it.VariantID],
			Position:        i,
		})
	}
	cur.Name = input.Name
	cur.StartsAt = input.StartsAt.UTC()
	cur.EndsAt = input.EndsAt.UTC()
	cur.Active = input.Active
	cur.Status = domain.DeriveFlashSaleStatus(input.Active, input.StartsAt, input.EndsAt, r.now)
	cur.UpdatedAt = r.now.Add(5 * time.Minute)
	cur.Items = items
	return r.GetAdminByID(context.Background(), id)
}

func (r *httpFlashSaleRepo) Delete(_ context.Context, id string) error {
	c, ok := r.campaigns[id]
	if !ok {
		return domain.ErrFlashSaleNotFound
	}
	for _, it := range c.Items {
		if it.SoldQuantity > 0 {
			return domain.ErrFlashSaleHasOrders
		}
	}
	delete(r.campaigns, id)
	return nil
}

func setupFlashSaleRouter(t *testing.T, now time.Time) (*gin.Engine, *jwt.Manager, *httpFlashSaleRepo, *httpCartRepo) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	repo := newHTTPFlashSaleRepo(now)
	cartRepo := &httpCartRepo{}
	router := gin.New()
	NewRouter(router, Dependencies{
		FlashSale: flashsaleuc.New(flashsaleuc.Dependencies{
			Repo:  repo,
			Clock: func() time.Time { return now },
		}),
		Cart: cartuc.New(cartuc.Dependencies{Cart: cartRepo}),
		JWT:  manager,
	})
	return router, manager, repo, cartRepo
}

func TestFlashSaleHandler_EndpointsAndSnapshots(t *testing.T) {
	now := time.Date(2026, 11, 18, 6, 0, 0, 0, time.UTC)
	router, manager, repo, cartRepo := setupFlashSaleRouter(t, now)
	adminToken := adminBearerToken(t, manager)
	customerToken := customerBearerToken(t, manager)

	// 1. Public GET /api/v1/flash-sales/current when no campaign is running -> 200 with data: null
	wEmpty := httptest.NewRecorder()
	router.ServeHTTP(wEmpty, httptest.NewRequest(http.MethodGet, "/api/v1/flash-sales/current", nil))
	require.Equal(t, http.StatusOK, wEmpty.Code)
	var emptyEnv map[string]any
	require.NoError(t, json.Unmarshal(wEmpty.Body.Bytes(), &emptyEnv))
	assert.Contains(t, emptyEnv, "data")
	assert.Nil(t, emptyEnv["data"])
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "flash_sales_current_null_200", "API-FLASH-SALES@1", "GET /api/v1/flash-sales/current", nil, wEmpty)

	// 2. Admin auth guards
	wUnauth := httptest.NewRecorder()
	router.ServeHTTP(wUnauth, httptest.NewRequest(http.MethodGet, "/api/v1/admin/flash-sales", nil))
	require.Equal(t, http.StatusUnauthorized, wUnauth.Code)

	reqForbidden := httptest.NewRequest(http.MethodGet, "/api/v1/admin/flash-sales", nil)
	reqForbidden.Header.Set("Authorization", customerToken)
	wForbidden := httptest.NewRecorder()
	router.ServeHTTP(wForbidden, reqForbidden)
	require.Equal(t, http.StatusForbidden, wForbidden.Code)

	// 3. POST /api/v1/admin/flash-sales validation error -> 400 validation_error
	badCreatePayload := map[string]any{
		"name":     "",
		"startsAt": "2026-11-18T08:00:00Z",
		"endsAt":   "2026-11-18T05:00:00Z",
		"active":   true,
		"items":    []any{},
	}
	badCreateRaw, _ := json.Marshal(badCreatePayload)
	reqBadCreate := httptest.NewRequest(http.MethodPost, "/api/v1/admin/flash-sales", bytes.NewReader(badCreateRaw))
	reqBadCreate.Header.Set("Authorization", adminToken)
	reqBadCreate.Header.Set("Content-Type", "application/json")
	wBadCreate := httptest.NewRecorder()
	router.ServeHTTP(wBadCreate, reqBadCreate)
	assertErrorEnvelope(t, wBadCreate, http.StatusBadRequest, "validation_error", "name")
	assertErrorEnvelope(t, wBadCreate, http.StatusBadRequest, "validation_error", "endsAt")
	assertErrorEnvelope(t, wBadCreate, http.StatusBadRequest, "validation_error", "items")

	// 4. POST /api/v1/admin/flash-sales -> 201 Created
	createPayload := map[string]any{
		"name":     "Deal Chớp Nhoáng 12H",
		"startsAt": "2026-11-18T05:00:00Z",
		"endsAt":   "2026-11-18T08:00:00Z",
		"active":   true,
		"items": []map[string]any{
			{
				"variantId":     fsTestVariant1,
				"flashPriceVnd": "25990000",
				"quota":         20,
			},
		},
	}
	createRaw, _ := json.Marshal(createPayload)
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/v1/admin/flash-sales", bytes.NewReader(createRaw))
	reqCreate.Header.Set("Authorization", adminToken)
	reqCreate.Header.Set("Content-Type", "application/json")
	wCreate := httptest.NewRecorder()
	router.ServeHTTP(wCreate, reqCreate)
	require.Equal(t, http.StatusCreated, wCreate.Code, wCreate.Body.String())
	assert.Contains(t, wCreate.Body.String(), `"soldQuantity":0`)
	assert.Contains(t, wCreate.Body.String(), `"position":0`)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_flash_sale_create_201", "API-FLASH-SALES@1", "POST /api/v1/admin/flash-sales", createPayload, wCreate)

	// Simulate 12 units sold so snapshots have realistic soldQuantity > 0 too
	repo.campaigns[fsTestID1].Items[0].SoldQuantity = 12

	// 5. Public GET /api/v1/flash-sales/current when running -> 200 with campaign
	wCurrent := httptest.NewRecorder()
	router.ServeHTTP(wCurrent, httptest.NewRequest(http.MethodGet, "/api/v1/flash-sales/current", nil))
	require.Equal(t, http.StatusOK, wCurrent.Code, wCurrent.Body.String())
	var curEnv struct {
		Data domain.FlashSaleCampaignPublic `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wCurrent.Body.Bytes(), &curEnv))
	assert.Equal(t, "Deal Chớp Nhoáng 12H", curEnv.Data.Name)
	require.Len(t, curEnv.Data.Items, 1)
	assert.Equal(t, 10, curEnv.Data.Items[0].DiscountPercent)
	assert.Equal(t, 12, curEnv.Data.Items[0].SoldQuantity)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "flash_sales_current_200", "API-FLASH-SALES@1", "GET /api/v1/flash-sales/current", nil, wCurrent)

	// 6. Overlapping active campaign -> 409 flash_sale_time_overlap
	overlapPayload := map[string]any{
		"name":     "Deal Chồng Lấn",
		"startsAt": "2026-11-18T06:00:00Z",
		"endsAt":   "2026-11-18T09:00:00Z",
		"active":   true,
		"items": []map[string]any{
			{
				"variantId":     fsTestVariant2,
				"flashPriceVnd": "30990000",
				"quota":         10,
			},
		},
	}
	overlapRaw, _ := json.Marshal(overlapPayload)
	reqOverlap := httptest.NewRequest(http.MethodPost, "/api/v1/admin/flash-sales", bytes.NewReader(overlapRaw))
	reqOverlap.Header.Set("Authorization", adminToken)
	reqOverlap.Header.Set("Content-Type", "application/json")
	wOverlap := httptest.NewRecorder()
	router.ServeHTTP(wOverlap, reqOverlap)
	assertErrorEnvelope(t, wOverlap, http.StatusConflict, "flash_sale_time_overlap", "")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_flash_sale_overlap_409", "API-FLASH-SALES@1", "POST /api/v1/admin/flash-sales", overlapPayload, wOverlap)

	// 7. GET /api/v1/admin/flash-sales -> 200 paginated list (all keys always serialized)
	reqList := httptest.NewRequest(http.MethodGet, "/api/v1/admin/flash-sales?status=running&page=1&limit=20", nil)
	reqList.Header.Set("Authorization", adminToken)
	wList := httptest.NewRecorder()
	router.ServeHTTP(wList, reqList)
	require.Equal(t, http.StatusOK, wList.Code, wList.Body.String())
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_flash_sales_list_200", "API-FLASH-SALES@1", "GET /api/v1/admin/flash-sales", nil, wList)

	// Invalid status filter -> 400 invalid_filter
	reqBadFilter := httptest.NewRequest(http.MethodGet, "/api/v1/admin/flash-sales?status=unknown", nil)
	reqBadFilter.Header.Set("Authorization", adminToken)
	wBadFilter := httptest.NewRecorder()
	router.ServeHTTP(wBadFilter, reqBadFilter)
	assertErrorEnvelope(t, wBadFilter, http.StatusBadRequest, "invalid_filter", "status")

	// 8. GET /api/v1/admin/flash-sales/:id -> 200 detail & 404 not found
	reqGet := httptest.NewRequest(http.MethodGet, "/api/v1/admin/flash-sales/"+fsTestID1, nil)
	reqGet.Header.Set("Authorization", adminToken)
	wGet := httptest.NewRecorder()
	router.ServeHTTP(wGet, reqGet)
	require.Equal(t, http.StatusOK, wGet.Code, wGet.Body.String())
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_flash_sale_detail_200", "API-FLASH-SALES@1", "GET /api/v1/admin/flash-sales/:id", nil, wGet)

	reqMissing := httptest.NewRequest(http.MethodGet, "/api/v1/admin/flash-sales/99999999-9999-9999-9999-999999999999", nil)
	reqMissing.Header.Set("Authorization", adminToken)
	wMissing := httptest.NewRecorder()
	router.ServeHTTP(wMissing, reqMissing)
	assertErrorEnvelope(t, wMissing, http.StatusNotFound, "flash_sale_not_found", "")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_flash_sale_not_found_404", "API-FLASH-SALES@1", "GET /api/v1/admin/flash-sales/:id", nil, wMissing)

	// 9. PUT /api/v1/admin/flash-sales/:id -> 200 OK
	updatePayload := map[string]any{
		"name":     "Deal Chớp Nhoáng 12H (Mở rộng)",
		"startsAt": "2026-11-18T05:00:00Z",
		"endsAt":   "2026-11-18T09:00:00Z",
		"active":   true,
		"items": []map[string]any{
			{
				"variantId":     fsTestVariant1,
				"flashPriceVnd": "25490000",
				"quota":         30,
			},
			{
				"variantId":     fsTestVariant2,
				"flashPriceVnd": "31990000",
				"quota":         15,
			},
		},
	}
	updateRaw, _ := json.Marshal(updatePayload)
	reqUpdate := httptest.NewRequest(http.MethodPut, "/api/v1/admin/flash-sales/"+fsTestID1, bytes.NewReader(updateRaw))
	reqUpdate.Header.Set("Authorization", adminToken)
	reqUpdate.Header.Set("Content-Type", "application/json")
	wUpdate := httptest.NewRecorder()
	router.ServeHTTP(wUpdate, reqUpdate)
	require.Equal(t, http.StatusOK, wUpdate.Code, wUpdate.Body.String())
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_flash_sale_update_200", "API-FLASH-SALES@1", "PUT /api/v1/admin/flash-sales/:id", updatePayload, wUpdate)

	// 10. DELETE /api/v1/admin/flash-sales/:id with sold > 0 -> 409 flash_sale_has_orders
	reqDelSold := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/flash-sales/"+fsTestID1, nil)
	reqDelSold.Header.Set("Authorization", adminToken)
	wDelSold := httptest.NewRecorder()
	router.ServeHTTP(wDelSold, reqDelSold)
	assertErrorEnvelope(t, wDelSold, http.StatusConflict, "flash_sale_has_orders", "")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_flash_sale_delete_has_orders_409", "API-FLASH-SALES@1", "DELETE /api/v1/admin/flash-sales/:id", nil, wDelSold)

	// 11. Create a fresh scheduled campaign (0 sold) and DELETE -> 204 No Content
	schedPayload := map[string]any{
		"name":     "Deal Tối 20H",
		"startsAt": "2026-11-18T13:00:00Z",
		"endsAt":   "2026-11-18T15:00:00Z",
		"active":   false,
		"items": []map[string]any{
			{
				"variantId":     fsTestVariant1,
				"flashPriceVnd": "26990000",
				"quota":         10,
			},
		},
	}
	schedRaw, _ := json.Marshal(schedPayload)
	reqSched := httptest.NewRequest(http.MethodPost, "/api/v1/admin/flash-sales", bytes.NewReader(schedRaw))
	reqSched.Header.Set("Authorization", adminToken)
	reqSched.Header.Set("Content-Type", "application/json")
	wSched := httptest.NewRecorder()
	router.ServeHTTP(wSched, reqSched)
	require.Equal(t, http.StatusCreated, wSched.Code)

	reqDel := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/flash-sales/"+fsTestID2, nil)
	reqDel.Header.Set("Authorization", adminToken)
	wDel := httptest.NewRecorder()
	router.ServeHTTP(wDel, reqDel)
	require.Equal(t, http.StatusNoContent, wDel.Code)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_flash_sale_delete_204", "API-FLASH-SALES@1", "DELETE /api/v1/admin/flash-sales/:id", nil, wDel)

	// 12. Cart GET /api/v1/cart with isFlashSalePrice = true
	fsCart := testCart()
	fsUnit := domain.MoneyVND("25990000")
	fsLine := domain.MoneyVND("51980000")
	fsCart.Items[0].UnitPriceVND = &fsUnit
	fsCart.Items[0].LineTotalVND = &fsLine
	fsCart.Items[0].IsLivePrice = false
	fsCart.Items[0].IsFlashSalePrice = true
	fsCart.SelectedTotalVND = fsLine
	cartRepo.cart = fsCart

	reqCart := httptest.NewRequest(http.MethodGet, "/api/v1/cart", nil)
	reqCart.Header.Set("Authorization", "Bearer "+cartToken(manager, cartTestUser))
	wCart := httptest.NewRecorder()
	router.ServeHTTP(wCart, reqCart)
	require.Equal(t, http.StatusOK, wCart.Code)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "cart_flash_sale_200", "API-FLASH-SALES@1", "GET /api/v1/cart", nil, wCart)
}
