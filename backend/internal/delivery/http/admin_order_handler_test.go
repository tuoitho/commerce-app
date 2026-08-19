package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	orderuc "commerce-backend/internal/usecase/order"
)

type fakeAdminOrderRepo struct {
	adminListOrders   []domain.Order
	adminListErr      error
	lastAdminStatuses []string

	adminGetOrderByID *domain.Order
	adminGetByIDErr   error
	lastAdminGetID    string

	transitionOrder *domain.Order
	transitionErr   error
	lastTransID     string
	lastTransAction domain.OrderAdminAction
}

func (f *fakeAdminOrderRepo) Create(_ context.Context, _ string, _ string, _ []domain.OrderLineInput, _ domain.MoneyVND) (*domain.Order, error) {
	return nil, nil
}

func (f *fakeAdminOrderRepo) GetByID(_ context.Context, _, _ string) (*domain.Order, error) {
	return nil, nil
}

func (f *fakeAdminOrderRepo) ListByUser(_ context.Context, _ string, _ domain.OrderStatusBucket) ([]domain.Order, error) {
	return nil, nil
}

func (f *fakeAdminOrderRepo) StatsByUser(_ context.Context, _ string) (domain.OrderStats, error) {
	return domain.OrderStats{}, nil
}

func (f *fakeAdminOrderRepo) Cancel(_ context.Context, _, _ string) (*domain.Order, error) {
	return nil, nil
}

func (f *fakeAdminOrderRepo) UndoCancelRequest(_ context.Context, _, _ string) (*domain.Order, error) {
	return nil, nil
}

func (f *fakeAdminOrderRepo) AutoConfirmDue(_ context.Context, _ time.Time) error {
	return nil
}

func (f *fakeAdminOrderRepo) ListByAdmin(_ context.Context, statuses []string) ([]domain.Order, error) {
	f.lastAdminStatuses = statuses
	if f.adminListErr != nil {
		return nil, f.adminListErr
	}
	return f.adminListOrders, nil
}

func (f *fakeAdminOrderRepo) GetByAdminID(_ context.Context, orderID string) (*domain.Order, error) {
	f.lastAdminGetID = orderID
	if f.adminGetByIDErr != nil {
		return nil, f.adminGetByIDErr
	}
	return f.adminGetOrderByID, nil
}

func (f *fakeAdminOrderRepo) AdminTransition(_ context.Context, orderID string, action domain.OrderAdminAction) (*domain.Order, error) {
	f.lastTransID = orderID
	f.lastTransAction = action
	if f.transitionErr != nil {
		return nil, f.transitionErr
	}
	return f.transitionOrder, nil
}

func setupAdminOrderTestRouter(repo *fakeAdminOrderRepo) (*gin.Engine, *jwt.Manager, *orderuc.UseCase) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	uc := orderuc.New(orderuc.Dependencies{
		Order:               repo,
		ShippingFeeVND:      "30000",
		OrderConfirmTimeout: 30 * time.Minute,
	})
	r := gin.New()
	NewRouter(r, Dependencies{
		Order: uc,
		JWT:   manager,
	})
	return r, manager, uc
}

func sampleAdminOrder(id string, status domain.OrderStatus, buyerEmail string) domain.Order {
	now := time.Now().UTC()
	return domain.Order{
		ID:             id,
		UserID:         "11111111-1111-1111-1111-111111111111",
		BuyerEmail:     buyerEmail,
		Status:         status,
		PaymentMethod:  domain.PaymentMethodCOD,
		SubtotalVND:    "100000",
		ShippingFeeVND: "30000",
		TotalVND:       "130000",
		ShippingInfo: domain.ShippingInfo{
			RecipientName: "Nguyen Van A",
			Phone:         "0987654321",
			ProvinceName:  "Hà Nội",
			WardName:      "Ba Đình",
			DetailAddress: "1 Tràng Tiền",
		},
		Items: []domain.OrderItem{
			{
				ID:           "item-1",
				OrderID:      id,
				VariantID:    "33333333-3333-3333-3333-333333333333",
				ProductID:    "44444444-4444-4444-4444-444444444444",
				BrandName:    "Apple",
				ProductName:  "iPhone 15",
				UnitPriceVND: "100000",
				Quantity:     1,
				LineTotalVND: "100000",
			},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
}

func TestAdminOrder_AuthGuards(t *testing.T) {
	repo := &fakeAdminOrderRepo{}
	router, manager, _ := setupAdminOrderTestRouter(repo)
	validOrderID := "22222222-2222-2222-2222-222222222222"

	endpoints := []struct {
		method string
		url    string
	}{
		{http.MethodGet, "/api/v1/admin/orders"},
		{http.MethodGet, "/api/v1/admin/orders/" + validOrderID},
		{http.MethodPost, "/api/v1/admin/orders/" + validOrderID + "/confirm-preparing"},
		{http.MethodPost, "/api/v1/admin/orders/" + validOrderID + "/ship"},
		{http.MethodPost, "/api/v1/admin/orders/" + validOrderID + "/deliver"},
		{http.MethodPost, "/api/v1/admin/orders/" + validOrderID + "/cancel/approve"},
		{http.MethodPost, "/api/v1/admin/orders/" + validOrderID + "/cancel/decline"},
	}

	for _, ep := range endpoints {
		t.Run("NoAuth_"+ep.method+"_"+ep.url, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.url, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 Unauthorized, got %d for %s %s", w.Code, ep.method, ep.url)
			}
		})

		t.Run("CustomerForbidden_"+ep.method+"_"+ep.url, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.url, nil)
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

func TestAdminOrder_List_SuccessAndPagination(t *testing.T) {
	repo := &fakeAdminOrderRepo{}
	router, manager, _ := setupAdminOrderTestRouter(repo)
	token := adminBearerToken(t, manager)

	// Create 25 orders to test pagination (default limit 20)
	orders := make([]domain.Order, 25)
	for i := 0; i < 25; i++ {
		orders[i] = sampleAdminOrder(
			"aaaaaaaa-aaaa-aaaa-aaaa-"+strconv.FormatInt(int64(100000000000+i), 10),
			domain.OrderStatusConfirmed,
			"buyer"+strconv.Itoa(i)+"@example.com",
		)
	}
	repo.adminListOrders = orders

	t.Run("default page 1 limit 20", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/orders", nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
		}

		var env struct {
			Success bool                 `json:"success"`
			Message string               `json:"message"`
			Data    []adminOrderResponse `json:"data"`
			Meta    ResponseMeta         `json:"meta"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}

		if !env.Success {
			t.Fatalf("expected success=true")
		}
		if len(env.Data) != 20 {
			t.Fatalf("expected 20 orders on page 1, got %d", len(env.Data))
		}
		if env.Data[0].BuyerEmail != "buyer0@example.com" {
			t.Errorf("expected buyerEmail buyer0@example.com, got %s", env.Data[0].BuyerEmail)
		}
		if env.Meta.Pagination == nil {
			t.Fatalf("expected pagination metadata")
		}
		p := env.Meta.Pagination
		if p.Page != 1 || p.Limit != 20 || p.Total != 25 || p.TotalPages != 2 || !p.HasNext || p.HasPrev {
			t.Errorf("unexpected pagination meta: %+v", p)
		}
	})

	t.Run("page 2 limit 20", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/orders?page=2&limit=20", nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", w.Code)
		}

		var env struct {
			Data []adminOrderResponse `json:"data"`
			Meta ResponseMeta         `json:"meta"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if len(env.Data) != 5 {
			t.Fatalf("expected 5 orders on page 2, got %d", len(env.Data))
		}
		p := env.Meta.Pagination
		if p.Page != 2 || p.TotalPages != 2 || p.HasNext || !p.HasPrev {
			t.Errorf("unexpected pagination meta on page 2: %+v", p)
		}
	})

	t.Run("status filtering", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/orders?status=confirmed", nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", w.Code)
		}
		if len(repo.lastAdminStatuses) != 1 || repo.lastAdminStatuses[0] != "confirmed" {
			t.Errorf("expected statuses ['confirmed'], got %+v", repo.lastAdminStatuses)
		}
	})

	t.Run("empty list", func(t *testing.T) {
		repo.adminListOrders = []domain.Order{}
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/orders", nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", w.Code)
		}

		var env struct {
			Data []adminOrderResponse `json:"data"`
			Meta ResponseMeta         `json:"meta"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if len(env.Data) != 0 {
			t.Fatalf("expected 0 orders, got %d", len(env.Data))
		}
		if env.Meta.Pagination.Total != 0 || env.Meta.Pagination.TotalPages != 0 {
			t.Errorf("unexpected pagination for empty list: %+v", env.Meta.Pagination)
		}
	})
}

func TestAdminOrder_List_ValidationErrors(t *testing.T) {
	repo := &fakeAdminOrderRepo{}
	router, manager, _ := setupAdminOrderTestRouter(repo)
	token := adminBearerToken(t, manager)

	tests := []struct {
		name          string
		query         string
		expectedField string
	}{
		{"invalid page 0", "?page=0", "page"},
		{"invalid page negative", "?page=-1", "page"},
		{"invalid page non-number", "?page=abc", "page"},
		{"empty page", "?page=", "page"},
		{"invalid limit 0", "?limit=0", "limit"},
		{"limit > 100", "?limit=101", "limit"},
		{"invalid limit non-number", "?limit=xyz", "limit"},
		{"empty limit", "?limit=", "limit"},
		{"invalid status", "?status=unknown_status", "status"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/orders"+tt.query, nil)
			req.Header.Set("Authorization", token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 Bad Request, got %d. Body: %s", w.Code, w.Body.String())
			}

			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}
			if env.Error == nil || env.Error.Code != "validation_error" {
				t.Fatalf("expected error.code 'validation_error', got %+v", env.Error)
			}
			if env.Error.Fields[tt.expectedField] == "" {
				t.Fatalf("expected validation error on field %q, got fields: %+v", tt.expectedField, env.Error.Fields)
			}
		})
	}
}

func TestAdminOrder_GetByID(t *testing.T) {
	validOrderID := "22222222-2222-2222-2222-222222222222"
	order := sampleAdminOrder(validOrderID, domain.OrderStatusConfirmed, "buyer@example.com")

	t.Run("success returns order with buyerEmail", func(t *testing.T) {
		repo := &fakeAdminOrderRepo{adminGetOrderByID: &order}
		router, manager, _ := setupAdminOrderTestRouter(repo)
		token := adminBearerToken(t, manager)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/orders/"+validOrderID, nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
		}

		var env struct {
			Success bool               `json:"success"`
			Message string             `json:"message"`
			Data    adminOrderResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if !env.Success {
			t.Errorf("expected success true")
		}
		if env.Data.ID != validOrderID {
			t.Errorf("expected ID %s, got %s", validOrderID, env.Data.ID)
		}
		if env.Data.BuyerEmail != "buyer@example.com" {
			t.Errorf("expected buyerEmail buyer@example.com, got %s", env.Data.BuyerEmail)
		}
		if len(env.Data.Items) != 1 {
			t.Errorf("expected 1 item, got %d", len(env.Data.Items))
		}
	})

	t.Run("not found returns 404 with Vietnamese message", func(t *testing.T) {
		repo := &fakeAdminOrderRepo{adminGetByIDErr: domain.ErrOrderNotFound}
		router, manager, _ := setupAdminOrderTestRouter(repo)
		token := adminBearerToken(t, manager)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/orders/"+validOrderID, nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d. Body: %s", w.Code, w.Body.String())
		}

		var env ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if env.Error == nil || env.Error.Code != "order_not_found" {
			t.Errorf("expected order_not_found, got %+v", env.Error)
		}
		if env.Message != "Không tìm thấy đơn hàng" {
			t.Errorf("expected 'Không tìm thấy đơn hàng', got %q", env.Message)
		}
	})

	t.Run("invalid UUID returns 404", func(t *testing.T) {
		repo := &fakeAdminOrderRepo{}
		router, manager, _ := setupAdminOrderTestRouter(repo)
		token := adminBearerToken(t, manager)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/orders/invalid-uuid", nil)
		req.Header.Set("Authorization", token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d. Body: %s", w.Code, w.Body.String())
		}
	})
}

func TestAdminOrder_Transitions(t *testing.T) {
	validOrderID := "22222222-2222-2222-2222-222222222222"

	tests := []struct {
		name           string
		actionPath     string
		expectedAction domain.OrderAdminAction
		resultingState domain.OrderStatus
	}{
		{
			name:           "ConfirmPreparing",
			actionPath:     "/confirm-preparing",
			expectedAction: domain.OrderAdminActionConfirmPreparing,
			resultingState: domain.OrderStatusPreparing,
		},
		{
			name:           "Ship",
			actionPath:     "/ship",
			expectedAction: domain.OrderAdminActionShip,
			resultingState: domain.OrderStatusShipped,
		},
		{
			name:           "Deliver",
			actionPath:     "/deliver",
			expectedAction: domain.OrderAdminActionDeliver,
			resultingState: domain.OrderStatusDelivered,
		},
		{
			name:           "ApproveCancel",
			actionPath:     "/cancel/approve",
			expectedAction: domain.OrderAdminActionApproveCancel,
			resultingState: domain.OrderStatusCancelled,
		},
		{
			name:           "DeclineCancel",
			actionPath:     "/cancel/decline",
			expectedAction: domain.OrderAdminActionDeclineCancel,
			resultingState: domain.OrderStatusPreparing,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name+"_Success", func(t *testing.T) {
			resOrder := sampleAdminOrder(validOrderID, tt.resultingState, "buyer@example.com")
			repo := &fakeAdminOrderRepo{transitionOrder: &resOrder}
			router, manager, _ := setupAdminOrderTestRouter(repo)
			token := adminBearerToken(t, manager)

			req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/orders/"+validOrderID+tt.actionPath, bytes.NewBuffer(nil))
			req.Header.Set("Authorization", token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
			}

			if repo.lastTransID != validOrderID {
				t.Errorf("expected trans order ID %s, got %s", validOrderID, repo.lastTransID)
			}
			if repo.lastTransAction != tt.expectedAction {
				t.Errorf("expected action %s, got %s", tt.expectedAction, repo.lastTransAction)
			}

			var env struct {
				Success bool               `json:"success"`
				Message string             `json:"message"`
				Data    adminOrderResponse `json:"data"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}
			if !env.Success {
				t.Errorf("expected success true")
			}
			if env.Data.Status != string(tt.resultingState) {
				t.Errorf("expected status %s, got %s", tt.resultingState, env.Data.Status)
			}
			if env.Data.BuyerEmail != "buyer@example.com" {
				t.Errorf("expected buyerEmail buyer@example.com, got %s", env.Data.BuyerEmail)
			}
		})

		t.Run(tt.name+"_ActionNotAllowed_409", func(t *testing.T) {
			repo := &fakeAdminOrderRepo{transitionErr: domain.ErrOrderActionNotAllowed}
			router, manager, _ := setupAdminOrderTestRouter(repo)
			token := adminBearerToken(t, manager)

			req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/orders/"+validOrderID+tt.actionPath, nil)
			req.Header.Set("Authorization", token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusConflict {
				t.Fatalf("expected 409 Conflict, got %d. Body: %s", w.Code, w.Body.String())
			}

			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}
			if env.Error == nil || env.Error.Code != "order_action_not_allowed" {
				t.Errorf("expected code 'order_action_not_allowed', got %+v", env.Error)
			}
			if env.Message != "Không thể thực hiện thao tác này trên đơn hàng ở trạng thái hiện tại" {
				t.Errorf("expected Vietnamese error message, got %q", env.Message)
			}
		})

		t.Run(tt.name+"_NotFound_404", func(t *testing.T) {
			repo := &fakeAdminOrderRepo{transitionErr: domain.ErrOrderNotFound}
			router, manager, _ := setupAdminOrderTestRouter(repo)
			token := adminBearerToken(t, manager)

			req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/orders/"+validOrderID+tt.actionPath, nil)
			req.Header.Set("Authorization", token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusNotFound {
				t.Fatalf("expected 404 Not Found, got %d. Body: %s", w.Code, w.Body.String())
			}

			var env ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}
			if env.Error == nil || env.Error.Code != "order_not_found" {
				t.Errorf("expected code 'order_not_found', got %+v", env.Error)
			}
			if env.Message != "Không tìm thấy đơn hàng" {
				t.Errorf("expected 'Không tìm thấy đơn hàng', got %q", env.Message)
			}
		})

		t.Run(tt.name+"_InvalidUUID_404", func(t *testing.T) {
			repo := &fakeAdminOrderRepo{}
			router, manager, _ := setupAdminOrderTestRouter(repo)
			token := adminBearerToken(t, manager)

			req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/orders/invalid-uuid"+tt.actionPath, nil)
			req.Header.Set("Authorization", token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusNotFound {
				t.Fatalf("expected 404 Not Found for invalid uuid, got %d. Body: %s", w.Code, w.Body.String())
			}
		})
	}
}
