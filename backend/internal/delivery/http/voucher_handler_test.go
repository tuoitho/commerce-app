package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	voucheruc "commerce-backend/internal/usecase/voucher"
)

const (
	vchTestID1 = "dddddddd-dddd-dddd-dddd-ddddddddddd1"
	vchTestID2 = "dddddddd-dddd-dddd-dddd-ddddddddddd2"
)

type httpVoucherRepo struct {
	vouchers map[string]*domain.Voucher
	order    []string
	now      time.Time
	seq      int
}

func newHTTPVoucherRepo(now time.Time) *httpVoucherRepo {
	return &httpVoucherRepo{
		vouchers: map[string]*domain.Voucher{},
		now:      now,
	}
}

func (r *httpVoucherRepo) ListAdmin(_ context.Context, filter domain.VoucherListFilter) ([]domain.Voucher, int64, error) {
	out := make([]domain.Voucher, 0, len(r.order))
	for _, id := range r.order {
		v, ok := r.vouchers[id]
		if !ok {
			continue
		}
		if filter.Query != "" {
			q := strings.ToLower(filter.Query)
			if !strings.Contains(strings.ToLower(v.Code), q) && !strings.Contains(strings.ToLower(v.Title), q) {
				continue
			}
		}
		eff := domain.DeriveVoucherEffectiveStatus(v.Active, v.StartsAt, v.EndsAt, r.now, v.UsageLimit, v.UsedCount)
		if filter.Status != "" && string(eff) != filter.Status {
			continue
		}
		cp := *v
		cp.EffectiveStatus = eff
		out = append(out, cp)
	}
	total := int64(len(out))
	if filter.Offset >= len(out) {
		return []domain.Voucher{}, total, nil
	}
	end := filter.Offset + filter.Limit
	if end > len(out) {
		end = len(out)
	}
	return out[filter.Offset:end], total, nil
}

func (r *httpVoucherRepo) GetAdminByID(_ context.Context, id string) (*domain.Voucher, error) {
	v, ok := r.vouchers[id]
	if !ok {
		return nil, domain.ErrVoucherNotFound
	}
	cp := *v
	cp.EffectiveStatus = domain.DeriveVoucherEffectiveStatus(v.Active, v.StartsAt, v.EndsAt, r.now, v.UsageLimit, v.UsedCount)
	return &cp, nil
}

func (r *httpVoucherRepo) Create(_ context.Context, input domain.SaveVoucherInput) (*domain.Voucher, error) {
	code := domain.NormalizeVoucherCode(input.Code)
	for _, existing := range r.vouchers {
		if existing.Code == code {
			return nil, domain.ErrVoucherCodeInUse
		}
	}
	r.seq++
	id := vchTestID1
	if r.seq > 1 {
		id = vchTestID2
	}
	v := &domain.Voucher{
		ID:              id,
		Code:            code,
		Title:           input.Title,
		Description:     input.Description,
		VoucherType:     input.VoucherType,
		DiscountValue:   input.DiscountValue,
		MaxDiscountVND:  input.MaxDiscountVND,
		MinOrderVND:     input.MinOrderVND,
		UsageLimit:      input.UsageLimit,
		UsedCount:       0,
		PerUserLimit:    input.PerUserLimit,
		StartsAt:        input.StartsAt.UTC(),
		EndsAt:          input.EndsAt.UTC(),
		Active:          input.Active,
		EffectiveStatus: domain.DeriveVoucherEffectiveStatus(input.Active, input.StartsAt, input.EndsAt, r.now, input.UsageLimit, 0),
		CreatedAt:       r.now,
		UpdatedAt:       r.now,
	}
	r.vouchers[id] = v
	r.order = append(r.order, id)
	cp := *v
	return &cp, nil
}

func (r *httpVoucherRepo) Update(_ context.Context, id string, input domain.SaveVoucherInput) (*domain.Voucher, error) {
	cur, ok := r.vouchers[id]
	if !ok {
		return nil, domain.ErrVoucherNotFound
	}
	code := domain.NormalizeVoucherCode(input.Code)
	for otherID, other := range r.vouchers {
		if otherID != id && other.Code == code {
			return nil, domain.ErrVoucherCodeInUse
		}
	}
	if cur.UsedCount > 0 {
		if cur.Code != code || cur.VoucherType != input.VoucherType {
			return nil, domain.ErrVoucherImmutableFields
		}
		if input.UsageLimit != nil && *input.UsageLimit < cur.UsedCount {
			return nil, domain.ErrVoucherUsageLimitTooLow
		}
	}
	cur.Code = code
	cur.Title = input.Title
	cur.Description = input.Description
	cur.VoucherType = input.VoucherType
	cur.DiscountValue = input.DiscountValue
	cur.MaxDiscountVND = input.MaxDiscountVND
	cur.MinOrderVND = input.MinOrderVND
	cur.UsageLimit = input.UsageLimit
	cur.PerUserLimit = input.PerUserLimit
	cur.StartsAt = input.StartsAt.UTC()
	cur.EndsAt = input.EndsAt.UTC()
	cur.Active = input.Active
	cur.UpdatedAt = r.now.Add(5 * time.Minute)
	cur.EffectiveStatus = domain.DeriveVoucherEffectiveStatus(cur.Active, cur.StartsAt, cur.EndsAt, r.now, cur.UsageLimit, cur.UsedCount)
	cp := *cur
	return &cp, nil
}

func (r *httpVoucherRepo) Delete(_ context.Context, id string) error {
	cur, ok := r.vouchers[id]
	if !ok {
		return domain.ErrVoucherNotFound
	}
	if cur.UsedCount > 0 {
		return domain.ErrVoucherInUse
	}
	delete(r.vouchers, id)
	return nil
}

func (r *httpVoucherRepo) ListAvailableForUser(_ context.Context, _ string, now time.Time) ([]domain.AvailableVoucher, error) {
	out := make([]domain.AvailableVoucher, 0, len(r.vouchers))
	for _, id := range r.order {
		v, ok := r.vouchers[id]
		if !ok {
			continue
		}
		if domain.DeriveVoucherEffectiveStatus(v.Active, v.StartsAt, v.EndsAt, now, v.UsageLimit, v.UsedCount) != domain.VoucherStatusActive {
			continue
		}
		out = append(out, domain.AvailableVoucher{
			ID:                v.ID,
			Code:              v.Code,
			Title:             v.Title,
			Description:       v.Description,
			VoucherType:       v.VoucherType,
			DiscountValue:     v.DiscountValue,
			MaxDiscountVND:    v.MaxDiscountVND,
			MinOrderVND:       v.MinOrderVND,
			UsageLimit:        v.UsageLimit,
			UsedCount:         v.UsedCount,
			PerUserLimit:      v.PerUserLimit,
			UserRemainingUses: v.PerUserLimit,
			StartsAt:          v.StartsAt,
			EndsAt:            v.EndsAt,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].EndsAt.Before(out[j].EndsAt)
	})
	return out, nil
}

func setupVoucherRouter(t *testing.T, now time.Time) (*gin.Engine, *jwt.Manager, *httpVoucherRepo) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	repo := newHTTPVoucherRepo(now)
	router := gin.New()
	NewRouter(router, Dependencies{
		Voucher: voucheruc.New(voucheruc.Dependencies{
			Repo:  repo,
			Clock: func() time.Time { return now },
		}),
		JWT: manager,
	})
	return router, manager, repo
}

func TestVoucherHandler_EndpointsAndSnapshots(t *testing.T) {
	now := time.Date(2026, 11, 18, 10, 0, 0, 0, time.UTC)
	router, manager, repo := setupVoucherRouter(t, now)
	adminToken := adminBearerToken(t, manager)
	customerForbiddenToken := customerBearerToken(t, manager)
	custUUIDToken, err := manager.GenerateAccessToken("11111111-1111-1111-1111-111111111111", domain.RoleCustomer, 15*time.Minute)
	require.NoError(t, err)
	customerToken := "Bearer " + custUUIDToken

	// 1. Auth guards
	wUnauthAvail := httptest.NewRecorder()
	router.ServeHTTP(wUnauthAvail, httptest.NewRequest(http.MethodGet, "/api/v1/vouchers/available", nil))
	require.Equal(t, http.StatusUnauthorized, wUnauthAvail.Code)

	wUnauthAdmin := httptest.NewRecorder()
	router.ServeHTTP(wUnauthAdmin, httptest.NewRequest(http.MethodGet, "/api/v1/admin/vouchers", nil))
	require.Equal(t, http.StatusUnauthorized, wUnauthAdmin.Code)

	reqForbidden := httptest.NewRequest(http.MethodGet, "/api/v1/admin/vouchers", nil)
	reqForbidden.Header.Set("Authorization", customerForbiddenToken)
	wForbidden := httptest.NewRecorder()
	router.ServeHTTP(wForbidden, reqForbidden)
	require.Equal(t, http.StatusForbidden, wForbidden.Code)

	// 2. POST /api/v1/admin/vouchers validation error -> 400 validation_error
	badPayload := map[string]any{
		"code":           "x",
		"title":          "",
		"description":    "",
		"voucherType":    "fixed_amount",
		"discountValue":  "0",
		"maxDiscountVnd": "100000",
		"minOrderVnd":    "0",
		"usageLimit":     0,
		"perUserLimit":   0,
		"startsAt":       "2026-11-18T12:00:00Z",
		"endsAt":         "2026-11-18T10:00:00Z",
		"active":         true,
	}
	badRaw, _ := json.Marshal(badPayload)
	reqBad := httptest.NewRequest(http.MethodPost, "/api/v1/admin/vouchers", bytes.NewReader(badRaw))
	reqBad.Header.Set("Authorization", adminToken)
	reqBad.Header.Set("Content-Type", "application/json")
	wBad := httptest.NewRecorder()
	router.ServeHTTP(wBad, reqBad)
	assertErrorEnvelope(t, wBad, http.StatusBadRequest, "validation_error", "code")
	assertErrorEnvelope(t, wBad, http.StatusBadRequest, "validation_error", "maxDiscountVnd")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_create_validation_400", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "POST /api/v1/admin/vouchers", badPayload, wBad)

	// 3. POST /api/v1/admin/vouchers -> 201 Created (with all non-null optional fields so assertRequestMatchesRecorded accepts any non-null/null frontend input)
	createPayload1 := map[string]any{
		"code":           "aura10",
		"title":          "Giảm 10% tối đa 1 triệu",
		"description":    "Áp dụng toàn bộ điện thoại chính hãng",
		"voucherType":    "percent",
		"discountValue":  "10",
		"maxDiscountVnd": "1000000",
		"minOrderVnd":    "5000000",
		"usageLimit":     100,
		"perUserLimit":   2,
		"startsAt":       "2026-11-01T00:00:00Z",
		"endsAt":         "2026-12-31T23:59:59Z",
		"active":         true,
	}
	createRaw1, _ := json.Marshal(createPayload1)
	reqCreate1 := httptest.NewRequest(http.MethodPost, "/api/v1/admin/vouchers", bytes.NewReader(createRaw1))
	reqCreate1.Header.Set("Authorization", adminToken)
	reqCreate1.Header.Set("Content-Type", "application/json")
	wCreate1 := httptest.NewRecorder()
	router.ServeHTTP(wCreate1, reqCreate1)
	require.Equal(t, http.StatusCreated, wCreate1.Code, wCreate1.Body.String())
	assert.Contains(t, wCreate1.Body.String(), `"code":"AURA10"`)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_create_201", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "POST /api/v1/admin/vouchers", createPayload1, wCreate1)

	// Create second voucher with explicit null maxDiscountVnd and usageLimit
	createPayload2 := map[string]any{
		"code":           "AURA500K",
		"title":          "Giảm 500K đơn từ 10 triệu",
		"description":    "Giảm tiền mặt trực tiếp",
		"voucherType":    "fixed_amount",
		"discountValue":  "500000",
		"maxDiscountVnd": nil,
		"minOrderVnd":    "10000000",
		"usageLimit":     nil,
		"perUserLimit":   1,
		"startsAt":       "2026-11-01T00:00:00Z",
		"endsAt":         "2026-12-15T23:59:59Z",
		"active":         true,
	}
	createRaw2, _ := json.Marshal(createPayload2)
	reqCreate2 := httptest.NewRequest(http.MethodPost, "/api/v1/admin/vouchers", bytes.NewReader(createRaw2))
	reqCreate2.Header.Set("Authorization", adminToken)
	reqCreate2.Header.Set("Content-Type", "application/json")
	wCreate2 := httptest.NewRecorder()
	router.ServeHTTP(wCreate2, reqCreate2)
	require.Equal(t, http.StatusCreated, wCreate2.Code, wCreate2.Body.String())
	assert.Contains(t, wCreate2.Body.String(), `"maxDiscountVnd":null`)
	assert.Contains(t, wCreate2.Body.String(), `"usageLimit":null`)

	// 4. Duplicate code -> 409 voucher_code_in_use
	reqDup := httptest.NewRequest(http.MethodPost, "/api/v1/admin/vouchers", bytes.NewReader(createRaw1))
	reqDup.Header.Set("Authorization", adminToken)
	reqDup.Header.Set("Content-Type", "application/json")
	wDup := httptest.NewRecorder()
	router.ServeHTTP(wDup, reqDup)
	assertErrorEnvelope(t, wDup, http.StatusConflict, "voucher_code_in_use", "")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_create_duplicate_409", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "POST /api/v1/admin/vouchers", createPayload1, wDup)

	// 5. GET /api/v1/admin/vouchers -> 200 paginated
	reqList := httptest.NewRequest(http.MethodGet, "/api/v1/admin/vouchers?q=AURA&status=active&page=1&limit=20", nil)
	reqList.Header.Set("Authorization", adminToken)
	wList := httptest.NewRecorder()
	router.ServeHTTP(wList, reqList)
	require.Equal(t, http.StatusOK, wList.Code, wList.Body.String())
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_vouchers_list_200", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "GET /api/v1/admin/vouchers", nil, wList)

	// Invalid status filter -> 400 invalid_filter
	reqBadFilter := httptest.NewRequest(http.MethodGet, "/api/v1/admin/vouchers?status=unknown", nil)
	reqBadFilter.Header.Set("Authorization", adminToken)
	wBadFilter := httptest.NewRecorder()
	router.ServeHTTP(wBadFilter, reqBadFilter)
	assertErrorEnvelope(t, wBadFilter, http.StatusBadRequest, "invalid_filter", "status")

	// 6. GET /api/v1/admin/vouchers/:id -> 200 & 404
	reqGet := httptest.NewRequest(http.MethodGet, "/api/v1/admin/vouchers/"+vchTestID1, nil)
	reqGet.Header.Set("Authorization", adminToken)
	wGet := httptest.NewRecorder()
	router.ServeHTTP(wGet, reqGet)
	require.Equal(t, http.StatusOK, wGet.Code, wGet.Body.String())
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_detail_200", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "GET /api/v1/admin/vouchers/:id", nil, wGet)

	reqMissing := httptest.NewRequest(http.MethodGet, "/api/v1/admin/vouchers/99999999-9999-9999-9999-999999999999", nil)
	reqMissing.Header.Set("Authorization", adminToken)
	wMissing := httptest.NewRecorder()
	router.ServeHTTP(wMissing, reqMissing)
	assertErrorEnvelope(t, wMissing, http.StatusNotFound, "voucher_not_found", "")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_not_found_404", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "GET /api/v1/admin/vouchers/:id", nil, wMissing)

	// 7. Customer GET /api/v1/vouchers/available -> 200
	reqAvail := httptest.NewRequest(http.MethodGet, "/api/v1/vouchers/available", nil)
	reqAvail.Header.Set("Authorization", customerToken)
	wAvail := httptest.NewRecorder()
	router.ServeHTTP(wAvail, reqAvail)
	require.Equal(t, http.StatusOK, wAvail.Code, wAvail.Body.String())
	assert.Contains(t, wAvail.Body.String(), `"maxDiscountVnd":null`)
	assert.Contains(t, wAvail.Body.String(), `"usageLimit":null`)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "vouchers_available_200", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "GET /api/v1/vouchers/available", nil, wAvail)

	// 8. PUT /api/v1/admin/vouchers/:id -> 200, plus 409 immutable & limit too low
	updatePayload := map[string]any{
		"code":           "AURA10",
		"title":          "Giảm 10% tối đa 1.5 triệu",
		"description":    "Đã cập nhật trần giảm",
		"voucherType":    "percent",
		"discountValue":  "10",
		"maxDiscountVnd": "1500000",
		"minOrderVnd":    "5000000",
		"usageLimit":     150,
		"perUserLimit":   2,
		"startsAt":       "2026-11-01T00:00:00Z",
		"endsAt":         "2026-12-31T23:59:59Z",
		"active":         true,
	}
	updateRaw, _ := json.Marshal(updatePayload)
	reqUpdate := httptest.NewRequest(http.MethodPut, "/api/v1/admin/vouchers/"+vchTestID1, bytes.NewReader(updateRaw))
	reqUpdate.Header.Set("Authorization", adminToken)
	reqUpdate.Header.Set("Content-Type", "application/json")
	wUpdate := httptest.NewRecorder()
	router.ServeHTTP(wUpdate, reqUpdate)
	require.Equal(t, http.StatusOK, wUpdate.Code, wUpdate.Body.String())
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_update_200", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "PUT /api/v1/admin/vouchers/:id", updatePayload, wUpdate)

	// Simulate usedCount = 5 on vchTestID1
	repo.vouchers[vchTestID1].UsedCount = 5

	immutablePayload := map[string]any{
		"code":           "NEWCODE",
		"title":          "Giảm 10%",
		"description":    "",
		"voucherType":    "percent",
		"discountValue":  "10",
		"maxDiscountVnd": "1500000",
		"minOrderVnd":    "5000000",
		"usageLimit":     150,
		"perUserLimit":   2,
		"startsAt":       "2026-11-01T00:00:00Z",
		"endsAt":         "2026-12-31T23:59:59Z",
		"active":         true,
	}
	immRaw, _ := json.Marshal(immutablePayload)
	reqImm := httptest.NewRequest(http.MethodPut, "/api/v1/admin/vouchers/"+vchTestID1, bytes.NewReader(immRaw))
	reqImm.Header.Set("Authorization", adminToken)
	reqImm.Header.Set("Content-Type", "application/json")
	wImm := httptest.NewRecorder()
	router.ServeHTTP(wImm, reqImm)
	assertErrorEnvelope(t, wImm, http.StatusConflict, "voucher_immutable_fields", "")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_update_immutable_409", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "PUT /api/v1/admin/vouchers/:id", immutablePayload, wImm)

	lowLimitPayload := map[string]any{
		"code":           "AURA10",
		"title":          "Giảm 10%",
		"description":    "",
		"voucherType":    "percent",
		"discountValue":  "10",
		"maxDiscountVnd": "1500000",
		"minOrderVnd":    "5000000",
		"usageLimit":     3,
		"perUserLimit":   2,
		"startsAt":       "2026-11-01T00:00:00Z",
		"endsAt":         "2026-12-31T23:59:59Z",
		"active":         true,
	}
	lowRaw, _ := json.Marshal(lowLimitPayload)
	reqLow := httptest.NewRequest(http.MethodPut, "/api/v1/admin/vouchers/"+vchTestID1, bytes.NewReader(lowRaw))
	reqLow.Header.Set("Authorization", adminToken)
	reqLow.Header.Set("Content-Type", "application/json")
	wLow := httptest.NewRecorder()
	router.ServeHTTP(wLow, reqLow)
	assertErrorEnvelope(t, wLow, http.StatusConflict, "voucher_usage_limit_too_low", "")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_update_limit_low_409", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "PUT /api/v1/admin/vouchers/:id", lowLimitPayload, wLow)

	// 9. DELETE /api/v1/admin/vouchers/:id -> 409 voucher_in_use & 204 No Content
	reqDelInUse := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/vouchers/"+vchTestID1, nil)
	reqDelInUse.Header.Set("Authorization", adminToken)
	wDelInUse := httptest.NewRecorder()
	router.ServeHTTP(wDelInUse, reqDelInUse)
	assertErrorEnvelope(t, wDelInUse, http.StatusConflict, "voucher_in_use", "")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_delete_in_use_409", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "DELETE /api/v1/admin/vouchers/:id", nil, wDelInUse)

	reqDelOK := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/vouchers/"+vchTestID2, nil)
	reqDelOK.Header.Set("Authorization", adminToken)
	wDelOK := httptest.NewRecorder()
	router.ServeHTTP(wDelOK, reqDelOK)
	require.Equal(t, http.StatusNoContent, wDelOK.Code)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_voucher_delete_204", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "DELETE /api/v1/admin/vouchers/:id", nil, wDelOK)
}
