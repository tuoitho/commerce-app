package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	returnsuc "commerce-backend/internal/usecase/returns"
)

func setupAdminReturnTestRouter(repo *fakeReturnsRepo) (*gin.Engine, string, string) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	adminToken, _ := manager.GenerateAccessToken("admin-user-id", domain.RoleAdmin, 15*time.Minute)
	customerToken, _ := manager.GenerateAccessToken(orderTestUser, domain.RoleCustomer, 15*time.Minute)

	uc := returnsuc.New(returnsuc.Dependencies{Returns: repo})

	router := gin.New()
	NewRouter(router, Dependencies{
		Returns: uc,
		JWT:     manager,
	})
	return router, "Bearer " + adminToken, "Bearer " + customerToken
}

func sampleAdminReturnRequest(id string, status domain.ReturnRequestStatus) domain.ReturnRequest {
	now := time.Now().UTC()
	request := sampleReturnRequest(id, status)
	request.BuyerEmail = "buyer@example.com"
	request.OrderTotalVND = "1000000"
	request.ShippingFeeVND = "20000"
	request.SuggestedRefundVND = "520000"
	request.CreatedAt = now
	return request
}

func adminReturnActionRequest(t *testing.T, router *gin.Engine, token, requestID, action, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/return-requests/"+requestID+"/"+action, strings.NewReader(body))
	req.Header.Set("Authorization", token)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestAdminReturn_AuthGuards(t *testing.T) {
	repo := &fakeReturnsRepo{}
	router, _, customerToken := setupAdminReturnTestRouter(repo)

	endpoints := []struct {
		method string
		url    string
		body   string
	}{
		{http.MethodGet, "/api/v1/admin/return-requests", ""},
		{http.MethodGet, "/api/v1/admin/return-requests/" + returnTestRequestID, ""},
		{http.MethodPost, "/api/v1/admin/return-requests/" + returnTestRequestID + "/approve", ""},
		{http.MethodPost, "/api/v1/admin/return-requests/" + returnTestRequestID + "/reject", `{"reason":"Lý do"}`},
		{http.MethodPost, "/api/v1/admin/return-requests/" + returnTestRequestID + "/receive", ""},
		{http.MethodPost, "/api/v1/admin/return-requests/" + returnTestRequestID + "/refund", `{"amount":"520000"}`},
	}

	for _, ep := range endpoints {
		t.Run("NoAuth_"+ep.method+"_"+ep.url, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.url, strings.NewReader(ep.body))
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d for %s %s", w.Code, ep.method, ep.url)
			}
		})

		t.Run("CustomerForbidden_"+ep.method+"_"+ep.url, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.url, strings.NewReader(ep.body))
			req.Header.Set("Authorization", customerToken)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			if w.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d for %s %s", w.Code, ep.method, ep.url)
			}
			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatal(err)
			}
			if env.Error == nil || env.Error.Code != "forbidden" {
				t.Errorf("expected forbidden code, got %+v", env.Error)
			}
			if env.Message != "Bạn không có quyền thực hiện thao tác này" {
				t.Errorf("expected Vietnamese forbidden message, got %q", env.Message)
			}
		})
	}
}

func TestAdminReturn_List_PaginationAndFilter(t *testing.T) {
	repo := &fakeReturnsRepo{}
	router, adminToken, _ := setupAdminReturnTestRouter(repo)

	requests := make([]domain.ReturnRequest, 25)
	for i := range requests {
		requests[i] = sampleAdminReturnRequest(
			"aaaaaaaa-aaaa-aaaa-aaaa-"+strconv.FormatInt(int64(100000000000+i), 10),
			domain.ReturnStatusPendingApproval,
		)
	}
	repo.adminListReqs = requests

	t.Run("default page 1 limit 20 with meta", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/return-requests", nil)
		req.Header.Set("Authorization", adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
		}
		var env struct {
			Success bool                         `json:"success"`
			Data    []adminReturnRequestResponse `json:"data"`
			Meta    ResponseMeta                 `json:"meta"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if !env.Success {
			t.Fatal("expected success true")
		}
		if len(env.Data) != 20 {
			t.Fatalf("expected 20 items on page 1, got %d", len(env.Data))
		}
		first := env.Data[0]
		if first.BuyerEmail == "" || first.SuggestedVND == "" || first.OrderTotalVND == "" || first.ShippingFeeVND == "" {
			t.Errorf("expected admin fields present (buyerEmail, suggestedRefundVnd, orderTotalVnd, shippingFeeVnd), got %+v", first)
		}
		p := env.Meta.Pagination
		if p == nil || p.Page != 1 || p.Limit != 20 || p.Total != 25 || p.TotalPages != 2 || !p.HasNext || p.HasPrev {
			t.Errorf("unexpected pagination meta: %+v", p)
		}
	})

	t.Run("page 2 limit default", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/return-requests?page=2&limit=20", nil)
		req.Header.Set("Authorization", adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var env struct {
			Data []adminReturnRequestResponse `json:"data"`
			Meta ResponseMeta                 `json:"meta"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatal(err)
		}
		if len(env.Data) != 5 {
			t.Fatalf("expected 5 items on page 2, got %d", len(env.Data))
		}
		p := env.Meta.Pagination
		if p.Page != 2 || p.TotalPages != 2 || p.HasNext || !p.HasPrev {
			t.Errorf("unexpected pagination on page 2: %+v", p)
		}
	})

	t.Run("valid status filter forwarded", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/return-requests?status=pending_approval", nil)
		req.Header.Set("Authorization", adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if len(repo.lastAdminStatuses) != 1 || repo.lastAdminStatuses[0] != "pending_approval" {
			t.Errorf("expected filter ['pending_approval'], got %+v", repo.lastAdminStatuses)
		}
	})

	t.Run("empty status means all", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/return-requests?status=", nil)
		req.Header.Set("Authorization", adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if len(repo.lastAdminStatuses) != 0 {
			t.Errorf("expected no filter, got %+v", repo.lastAdminStatuses)
		}
	})
}

func TestAdminReturn_List_ValidationErrors(t *testing.T) {
	repo := &fakeReturnsRepo{}
	router, adminToken, _ := setupAdminReturnTestRouter(repo)

	tests := []struct {
		name          string
		query         string
		expectedField string
	}{
		{"invalid status", "?status=khong_hop_le", "status"},
		{"invalid page", "?page=0", "page"},
		{"invalid limit over cap", "?limit=101", "limit"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/return-requests"+tt.query, nil)
			req.Header.Set("Authorization", adminToken)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d. Body: %s", w.Code, w.Body.String())
			}
			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatal(err)
			}
			if env.Error == nil || env.Error.Code != "validation_error" {
				t.Fatalf("expected validation_error, got %+v", env.Error)
			}
			if env.Error.Fields[tt.expectedField] == "" {
				t.Fatalf("expected validation error on field %q, got fields: %+v", tt.expectedField, env.Error.Fields)
			}
		})
	}
}

func TestAdminReturn_GetByID_AdminFields(t *testing.T) {
	requestID := returnTestRequestID

	t.Run("detail includes buyerEmail and suggestedRefundVnd", func(t *testing.T) {
		detail := sampleAdminReturnRequest(requestID, domain.ReturnStatusPendingApproval)
		repo := &fakeReturnsRepo{adminGetRequest: &detail}
		router, adminToken, _ := setupAdminReturnTestRouter(repo)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/return-requests/"+requestID, nil)
		req.Header.Set("Authorization", adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
		}
		var env struct {
			Data adminReturnRequestResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatal(err)
		}
		if env.Data.BuyerEmail != "buyer@example.com" {
			t.Errorf("expected buyerEmail, got %q", env.Data.BuyerEmail)
		}
		if env.Data.SuggestedVND != "520000" {
			t.Errorf("expected suggestedRefundVnd 520000, got %s", env.Data.SuggestedVND)
		}
		if env.Data.OrderTotalVND != "1000000" || env.Data.ShippingFeeVND != "20000" {
			t.Errorf("unexpected totals: order=%s shipping=%s", env.Data.OrderTotalVND, env.Data.ShippingFeeVND)
		}
		if env.Data.RefundAmountVND != nil {
			t.Errorf("refundAmountVnd must be absent when not refunded")
		}
	})

	t.Run("not found returns 404 Vietnamese message", func(t *testing.T) {
		repo := &fakeReturnsRepo{adminGetErr: domain.ErrReturnNotFound}
		router, adminToken, _ := setupAdminReturnTestRouter(repo)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/return-requests/"+requestID, nil)
		req.Header.Set("Authorization", adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
		var env ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatal(err)
		}
		if env.Error == nil || env.Error.Code != "return_request_not_found" {
			t.Fatalf("expected return_request_not_found, got %+v", env.Error)
		}
		if env.Message != "Không tìm thấy yêu cầu trả hàng" {
			t.Errorf("expected Vietnamese message, got %q", env.Message)
		}
	})

	t.Run("invalid uuid returns 404", func(t *testing.T) {
		repo := &fakeReturnsRepo{}
		router, adminToken, _ := setupAdminReturnTestRouter(repo)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/return-requests/not-a-uuid", nil)
		req.Header.Set("Authorization", adminToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
	})
}

func TestAdminReturn_Transitions(t *testing.T) {
	requestID := returnTestRequestID

	t.Run("approve success envelope", func(t *testing.T) {
		approved := sampleAdminReturnRequest(requestID, domain.ReturnStatusApproved)
		now := time.Now().UTC()
		approved.ApprovedAt = &now
		repo := &fakeReturnsRepo{actionResult: &approved}
		router, adminToken, _ := setupAdminReturnTestRouter(repo)

		w := adminReturnActionRequest(t, router, adminToken, requestID, "approve", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
		}
		var env struct {
			Success bool                        `json:"success"`
			Data    *adminReturnRequestResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatal(err)
		}
		if !env.Success || env.Data == nil {
			t.Fatalf("expected success data envelope, got %+v", env)
		}
		if env.Data.Status != string(domain.ReturnStatusApproved) {
			t.Errorf("expected approved status, got %s", env.Data.Status)
		}
		if env.Data.ApprovedAt == nil {
			t.Errorf("expected non-null approvedAt")
		}
	})

	t.Run("reject requires reason", func(t *testing.T) {
		for _, body := range []string{`{"reason":""}`, `{}`, ``} {
			repo := &fakeReturnsRepo{}
			router, adminToken, _ := setupAdminReturnTestRouter(repo)

			w := adminReturnActionRequest(t, router, adminToken, requestID, "reject", body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for reject body %q, got %d. Body: %s", body, w.Code, w.Body.String())
			}
			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatal(err)
			}
			if env.Error == nil || env.Error.Code != "validation_error" || env.Error.Fields["reason"] == "" {
				t.Fatalf("expected validation_error on reason, got %+v", env.Error)
			}
		}
	})

	t.Run("wrong state returns 409 return_action_not_allowed", func(t *testing.T) {
		actions := []struct {
			action string
			body   string
			err    error
		}{
			{"approve", "", domain.ErrReturnActionNotAllowed},
			{"reject", `{"reason":"Lý do"}`, domain.ErrReturnActionNotAllowed},
			{"receive", "", domain.ErrReturnActionNotAllowed},
			{"refund", `{"amount":"520000"}`, domain.ErrReturnActionNotAllowed},
		}
		for _, tt := range actions {
			repo := &fakeReturnsRepo{
				approveErr: domain.ErrReturnNotFound,
				rejectErr:  domain.ErrReturnNotFound,
				receiveErr: domain.ErrReturnNotFound,
				refundErr:  domain.ErrReturnNotFound,
			}
			switch tt.action {
			case "approve":
				repo.approveErr = tt.err
			case "reject":
				repo.rejectErr = tt.err
			case "receive":
				repo.receiveErr = tt.err
			case "refund":
				repo.refundErr = tt.err
			}
			router, adminToken, _ := setupAdminReturnTestRouter(repo)

			w := adminReturnActionRequest(t, router, adminToken, requestID, tt.action, tt.body)
			if w.Code != http.StatusConflict {
				t.Fatalf("%s: expected 409, got %d. Body: %s", tt.action, w.Code, w.Body.String())
			}
			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatal(err)
			}
			if env.Error == nil || env.Error.Code != "return_action_not_allowed" {
				t.Fatalf("%s: expected return_action_not_allowed, got %+v", tt.action, env.Error)
			}
			if env.Data != nil {
				t.Errorf("%s: expected data null on error envelope", tt.action)
			}
		}
	})
}

func TestAdminReturn_RefundAmountValidation(t *testing.T) {
	requestID := returnTestRequestID

	for _, amount := range []string{"0", "-100", "abc"} {
		t.Run("amount_"+amount, func(t *testing.T) {
			repo := &fakeReturnsRepo{}
			router, adminToken, _ := setupAdminReturnTestRouter(repo)

			body := `{"amount":"` + amount + `"}`
			w := adminReturnActionRequest(t, router, adminToken, requestID, "refund", body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for amount %q, got %d. Body: %s", amount, w.Code, w.Body.String())
			}
			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatal(err)
			}
			if env.Error == nil || env.Error.Code != "validation_error" {
				t.Fatalf("expected validation_error, got %+v", env.Error)
			}
			if env.Error.Fields["amount"] == "" {
				t.Fatalf("expected validation error on field amount, got fields: %+v", env.Error.Fields)
			}
			if env.Data != nil {
				t.Errorf("expected data null on error envelope")
			}
		})
	}

	t.Run("missing amount field", func(t *testing.T) {
		repo := &fakeReturnsRepo{}
		router, adminToken, _ := setupAdminReturnTestRouter(repo)

		w := adminReturnActionRequest(t, router, adminToken, requestID, "refund", `{}`)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", w.Code)
		}
		var env ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatal(err)
		}
		if env.Error == nil || env.Error.Fields["amount"] == "" {
			t.Fatalf("expected validation error on amount, got %+v", env.Error)
		}
	})
}
