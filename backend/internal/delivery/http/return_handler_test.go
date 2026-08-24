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
	returnsuc "commerce-backend/internal/usecase/returns"
)

const returnTestOrderID = "22222222-2222-2222-2222-222222222222"
const returnTestRequestID = "44444444-4444-4444-4444-444444444444"
const returnTestItemID = "33333333-3333-3333-3333-333333333333"

type fakeReturnsRepo struct {
	createdRequest *domain.ReturnRequest
	createErr      error
	lastCreateOrd  string

	listByOrderReqs []domain.ReturnRequest
	listByOrderErr  error
	lastListOrderID string

	cancelledRequest *domain.ReturnRequest
	cancelErr        error
	lastCancelReqID  string

	adminListReqs     []domain.ReturnRequest
	adminListErr      error
	lastAdminStatuses []string

	adminGetRequest *domain.ReturnRequest
	adminGetErr     error
	lastAdminGetID  string

	approveErr error
	rejectErr  error
	receiveErr error
	refundErr  error

	actionResult *domain.ReturnRequest
}

func (f *fakeReturnsRepo) Create(_ context.Context, _ string, orderID string, _ string, _ string, _ []domain.ReturnItemInput) (*domain.ReturnRequest, error) {
	f.lastCreateOrd = orderID
	if f.createErr != nil {
		return nil, f.createErr
	}
	return f.createdRequest, nil
}

func (f *fakeReturnsRepo) ListByOrder(_ context.Context, _, orderID string) ([]domain.ReturnRequest, error) {
	f.lastListOrderID = orderID
	if f.listByOrderErr != nil {
		return nil, f.listByOrderErr
	}
	return f.listByOrderReqs, nil
}

func (f *fakeReturnsRepo) CancelByCustomer(_ context.Context, _, requestID string) (*domain.ReturnRequest, error) {
	f.lastCancelReqID = requestID
	if f.cancelErr != nil {
		return nil, f.cancelErr
	}
	return f.cancelledRequest, nil
}

func (f *fakeReturnsRepo) ListByAdmin(_ context.Context, statuses []string) ([]domain.ReturnRequest, error) {
	f.lastAdminStatuses = statuses
	if f.adminListErr != nil {
		return nil, f.adminListErr
	}
	return f.adminListReqs, nil
}

func (f *fakeReturnsRepo) GetByAdminID(_ context.Context, requestID string) (*domain.ReturnRequest, error) {
	f.lastAdminGetID = requestID
	if f.adminGetErr != nil {
		return nil, f.adminGetErr
	}
	return f.adminGetRequest, nil
}

func (f *fakeReturnsRepo) Approve(_ context.Context, _ string) (*domain.ReturnRequest, error) {
	if f.approveErr != nil {
		return nil, f.approveErr
	}
	return f.actionResult, nil
}

func (f *fakeReturnsRepo) Reject(_ context.Context, _, reason string) (*domain.ReturnRequest, error) {
	if f.rejectErr != nil {
		return nil, f.rejectErr
	}
	return f.actionResult, nil
}

func (f *fakeReturnsRepo) MarkReceived(_ context.Context, _ string) (*domain.ReturnRequest, error) {
	if f.receiveErr != nil {
		return nil, f.receiveErr
	}
	return f.actionResult, nil
}

func (f *fakeReturnsRepo) MarkRefunded(_ context.Context, _ string, amountVND domain.MoneyVND, adminUserID string) (*domain.ReturnRequest, error) {
	if f.refundErr != nil {
		return nil, f.refundErr
	}
	if f.actionResult != nil && amountVND != "" {
		f.actionResult.RefundAmountVND = amountVND
		f.actionResult.Status = domain.ReturnStatusRefunded
	}
	return f.actionResult, nil
}

func setupReturnTestRouter(repo *fakeReturnsRepo) (*gin.Engine, string) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	customerToken, _ := manager.GenerateAccessToken(orderTestUser, domain.RoleCustomer, 15*time.Minute)

	uc := returnsuc.New(returnsuc.Dependencies{Returns: repo})

	router := gin.New()
	NewRouter(router, Dependencies{
		Returns: uc,
		JWT:     manager,
	})
	return router, "Bearer " + customerToken
}

func sampleReturnRequest(id string, status domain.ReturnRequestStatus) domain.ReturnRequest {
	now := time.Now().UTC()
	request := domain.ReturnRequest{
		ID:         id,
		OrderID:    returnTestOrderID,
		UserID:     orderTestUser,
		Status:     status,
		ReasonCode: domain.ReturnReasonDefective,
		Items: []domain.ReturnRequestItem{
			{
				ID:           returnTestItemID + "-ret",
				RequestID:    id,
				OrderItemID:  returnTestItemID,
				ProductName:  "iPhone 15",
				ImageURL:     "",
				UnitPriceVND: "500000",
				Quantity:     1,
			},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	switch status {
	case domain.ReturnStatusRefunded:
		amount := "520000"
		request.RefundAmountVND = domain.MoneyVND(amount)
		request.RefundedAt = &now
	case domain.ReturnStatusRejected:
		request.RejectReason = "Hàng đã qua sử dụng"
		request.RejectedAt = &now
	}
	return request
}

func validCreateReturnBody() string {
	return `{"items":[{"orderItemId":"` + returnTestItemID + `","quantity":1}],"reasonCode":"defective","description":""}`
}

func TestReturnCustomer_AuthRequired(t *testing.T) {
	repo := &fakeReturnsRepo{}
	router, _ := setupReturnTestRouter(repo)
	orderPath := "/api/v1/orders/" + returnTestOrderID + "/return-requests"

	endpoints := []struct {
		method string
		url    string
		body   string
	}{
		{http.MethodPost, orderPath, validCreateReturnBody()},
		{http.MethodGet, orderPath, ""},
		{http.MethodPost, orderPath + "/" + returnTestRequestID + "/cancel", ""},
	}

	for _, ep := range endpoints {
		req := httptest.NewRequest(ep.method, ep.url, strings.NewReader(ep.body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 for %s %s without token, got %d", ep.method, ep.url, w.Code)
		}
		var env ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal error envelope: %v", err)
		}
		if env.Error == nil || env.Error.Code != "unauthorized" {
			t.Errorf("expected unauthorized code for %s %s, got %+v", ep.method, ep.url, env.Error)
		}
	}
}

func TestReturnCustomer_Create_Success(t *testing.T) {
	created := sampleReturnRequest(returnTestRequestID, domain.ReturnStatusPendingApproval)
	repo := &fakeReturnsRepo{createdRequest: &created}
	router, token := setupReturnTestRouter(repo)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+returnTestOrderID+"/return-requests", strings.NewReader(validCreateReturnBody()))
	req.Header.Set("Authorization", token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Success bool                  `json:"success"`
		Message string                `json:"message"`
		Data    returnRequestResponse `json:"data"`
		Error   *errorBodyDetail      `json:"error"`
		Meta    ResponseMeta          `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if !env.Success || env.Error != nil {
		t.Fatalf("expected success envelope without error, got %+v", env)
	}
	if env.Message != "Tạo yêu cầu trả hàng thành công" {
		t.Errorf("expected VN create message, got %q", env.Message)
	}
	if repo.lastCreateOrd != returnTestOrderID {
		t.Errorf("expected order id forwarded, got %s", repo.lastCreateOrd)
	}
	if env.Data.Status != string(domain.ReturnStatusPendingApproval) {
		t.Errorf("expected pending_approval status, got %s", env.Data.Status)
	}
	if env.Data.OrderID != returnTestOrderID {
		t.Errorf("expected orderId %s, got %s", returnTestOrderID, env.Data.OrderID)
	}
	if len(env.Data.Items) != 1 || env.Data.Items[0].OrderItemID != returnTestItemID || env.Data.Items[0].Quantity != 1 {
		t.Errorf("unexpected items in response: %+v", env.Data.Items)
	}
	if env.Data.RefundAmountVND != nil {
		t.Errorf("refundAmountVnd must be absent when not refunded")
	}
}

func TestReturnCustomer_Create_ValidationErrors(t *testing.T) {
	tests := []struct {
		name          string
		body          string
		expectedField string
	}{
		{"missing items and reasonCode", `{}`, "items"},
		{"empty items", `{"items":[],"reasonCode":"defective"}`, "items"},
		{"invalid reasonCode", `{"items":[{"orderItemId":"` + returnTestItemID + `","quantity":1}],"reasonCode":"because"}`, "reasonCode"},
		{"zero quantity", `{"items":[{"orderItemId":"` + returnTestItemID + `","quantity":0}],"reasonCode":"defective"}`, "items"},
		{"duplicate item lines", `{"items":[{"orderItemId":"` + returnTestItemID + `","quantity":1},{"orderItemId":"` + returnTestItemID + `","quantity":1}],"reasonCode":"defective"}`, "items"},
		{"description too long", `{"items":[{"orderItemId":"` + returnTestItemID + `","quantity":1}],"reasonCode":"defective","description":"` + strings.Repeat("a", 501) + `"}`, "description"},
	}

	repo := &fakeReturnsRepo{}
	router, token := setupReturnTestRouter(repo)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+returnTestOrderID+"/return-requests", strings.NewReader(tt.body))
			req.Header.Set("Authorization", token)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d. Body: %s", w.Code, w.Body.String())
			}
			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}
			if env.Error == nil || env.Error.Code != "validation_error" {
				t.Fatalf("expected validation_error, got %+v", env.Error)
			}
			if tt.expectedField != "" && env.Error.Fields[tt.expectedField] == "" {
				t.Fatalf("expected validation error on field %q, got fields: %+v", tt.expectedField, env.Error.Fields)
			}
		})
	}
}

func TestReturnCustomer_Create_BusinessErrors(t *testing.T) {
	tests := []struct {
		name            string
		createErr       error
		expectedStatus  int
		expectedCode    string
		expectedMessage string
	}{
		{name: "window expired", createErr: domain.ErrReturnWindowExpired, expectedStatus: http.StatusConflict, expectedCode: "return_window_expired", expectedMessage: "Đã quá 7 ngày kể từ khi nhận hàng, không thể yêu cầu trả hàng"},
		{name: "open request exists", createErr: domain.ErrReturnRequestExists, expectedStatus: http.StatusConflict, expectedCode: "return_request_exists", expectedMessage: "Đơn hàng đang có một yêu cầu trả hàng đang mở"},
		{name: "item limit exceeded", createErr: domain.ErrReturnItemLimitExceeded, expectedStatus: http.StatusConflict, expectedCode: "return_item_limit_exceeded", expectedMessage: "Số lượng trả vượt quá số lượng có thể trả của mặt hàng"},
		{name: "order not allowed", createErr: domain.ErrReturnNotAllowed, expectedStatus: http.StatusConflict, expectedCode: "return_not_allowed", expectedMessage: "Đơn hàng không thể yêu cầu trả hàng ở trạng thái hiện tại"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeReturnsRepo{createErr: tt.createErr}
			router, token := setupReturnTestRouter(repo)

			req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+returnTestOrderID+"/return-requests", strings.NewReader(validCreateReturnBody()))
			req.Header.Set("Authorization", token)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tt.expectedStatus {
				t.Fatalf("expected %d, got %d. Body: %s", tt.expectedStatus, w.Code, w.Body.String())
			}
			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}
			if env.Error == nil || env.Error.Code != tt.expectedCode {
				t.Fatalf("expected %s, got %+v", tt.expectedCode, env.Error)
			}
			if env.Error.Message != tt.expectedMessage {
				t.Errorf("expected Vietnamese message %q, got %q", tt.expectedMessage, env.Error.Message)
			}
			if env.Error.Fields != nil {
				t.Errorf("business errors must not carry fields, got %+v", env.Error.Fields)
			}
			if env.Data != nil {
				t.Errorf("expected data null on error envelope")
			}
		})
	}
}

func TestReturnCustomer_OwnerScope(t *testing.T) {
	t.Run("create foreign order returns 404 order_not_found", func(t *testing.T) {
		repo := &fakeReturnsRepo{createErr: domain.ErrOrderNotFound}
		router, token := setupReturnTestRouter(repo)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+returnTestOrderID+"/return-requests", strings.NewReader(validCreateReturnBody()))
		req.Header.Set("Authorization", token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
		var env ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatal(err)
		}
		if env.Error == nil || env.Error.Code != "order_not_found" {
			t.Fatalf("expected order_not_found, got %+v", env.Error)
		}
	})

	t.Run("list foreign order returns 404 order_not_found", func(t *testing.T) {
		repo := &fakeReturnsRepo{listByOrderErr: domain.ErrOrderNotFound}
		router, token := setupReturnTestRouter(repo)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/orders/"+returnTestOrderID+"/return-requests", nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
		var env ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatal(err)
		}
		if env.Error == nil || env.Error.Code != "order_not_found" {
			t.Fatalf("expected order_not_found, got %+v", env.Error)
		}
	})

	t.Run("cancel foreign request returns 404 return_request_not_found", func(t *testing.T) {
		repo := &fakeReturnsRepo{cancelErr: domain.ErrReturnNotFound}
		router, token := setupReturnTestRouter(repo)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+returnTestOrderID+"/return-requests/"+returnTestRequestID+"/cancel", nil)
		req.Header.Set("Authorization", token)
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
}

func TestReturnCustomer_Cancel(t *testing.T) {
	t.Run("success returns cancelled with timestamp", func(t *testing.T) {
		cancelledAt := time.Now().UTC()
		cancelled := sampleReturnRequest(returnTestRequestID, domain.ReturnStatusCancelled)
		cancelled.CancelledAt = &cancelledAt
		repo := &fakeReturnsRepo{cancelledRequest: &cancelled}
		router, token := setupReturnTestRouter(repo)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+returnTestOrderID+"/return-requests/"+returnTestRequestID+"/cancel", nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
		}
		var env struct {
			Success bool                  `json:"success"`
			Data    returnRequestResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if !env.Success {
			t.Fatal("expected success true")
		}
		if repo.lastCancelReqID != returnTestRequestID {
			t.Errorf("expected request id forwarded, got %s", repo.lastCancelReqID)
		}
		if env.Data.Status != string(domain.ReturnStatusCancelled) {
			t.Errorf("expected cancelled status, got %s", env.Data.Status)
		}
		if env.Data.CancelledAt == nil {
			t.Errorf("expected non-null cancelledAt")
		}
	})

	t.Run("cancel approved request conflicts", func(t *testing.T) {
		repo := &fakeReturnsRepo{cancelErr: domain.ErrReturnActionNotAllowed}
		router, token := setupReturnTestRouter(repo)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+returnTestOrderID+"/return-requests/"+returnTestRequestID+"/cancel", nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d", w.Code)
		}
		var env ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatal(err)
		}
		if env.Error == nil || env.Error.Code != "return_action_not_allowed" {
			t.Fatalf("expected return_action_not_allowed, got %+v", env.Error)
		}
		if env.Message != "Không thể thực hiện thao tác này trên yêu cầu trả hàng ở trạng thái hiện tại" {
			t.Errorf("expected Vietnamese message, got %q", env.Message)
		}
		if env.Data != nil {
			t.Errorf("expected data null on error envelope")
		}
	})
}

func TestReturnCustomer_ListByOrder(t *testing.T) {
	now := time.Now().UTC()
	refunded := sampleReturnRequest("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", domain.ReturnStatusRefunded)
	rejected := sampleReturnRequest("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", domain.ReturnStatusRejected)
	refunded.CreatedAt = now.Add(-time.Hour)
	rejected.CreatedAt = now

	repo := &fakeReturnsRepo{listByOrderReqs: []domain.ReturnRequest{rejected, refunded}}
	router, token := setupReturnTestRouter(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/orders/"+returnTestOrderID+"/return-requests", nil)
	req.Header.Set("Authorization", token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Success bool                    `json:"success"`
		Data    []returnRequestResponse `json:"data"`
		Error   *errorBodyDetail        `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if !env.Success || env.Error != nil {
		t.Fatalf("expected success envelope, got %+v", env)
	}
	if len(env.Data) != 2 {
		t.Fatalf("expected 2 requests, got %d", len(env.Data))
	}
	if !env.Data[0].CreatedAt.After(env.Data[1].CreatedAt) {
		t.Errorf("expected newest first ordering")
	}
	if env.Data[0].Status != string(domain.ReturnStatusRejected) || env.Data[1].Status != string(domain.ReturnStatusRefunded) {
		t.Fatalf("expected rejected first then refunded, got %s, %s", env.Data[0].Status, env.Data[1].Status)
	}
	if env.Data[0].RejectReason == "" {
		t.Errorf("expected non-empty rejectReason on rejected element")
	}
	if env.Data[1].RefundAmountVND == nil || *env.Data[1].RefundAmountVND != "520000" {
		t.Errorf("expected refundAmountVnd 520000 on refunded element, got %+v", env.Data[1].RefundAmountVND)
	}
}
