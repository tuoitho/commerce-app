package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	returnuc "commerce-backend/internal/usecase/returns"
)

type fakeReturnUsecaseRepo struct {
	createFn        func(ctx context.Context, input domain.CreateReturnInput) (*domain.ReturnRequest, error)
	cancelFn        func(ctx context.Context, userID, orderID, returnID string) (*domain.ReturnRequest, error)
	getLatestFn     func(ctx context.Context, orderID string) (*domain.ReturnRequest, error)
	listLatestFn    func(ctx context.Context, orderIDs []string) (map[string]*domain.ReturnRequest, error)
	listAdminFn     func(ctx context.Context, status string, page, limit int) ([]domain.ReturnRequest, int, error)
	getAdminFn      func(ctx context.Context, returnID string) (*domain.ReturnRequest, error)
	approveAdminFn  func(ctx context.Context, returnID string) (*domain.ReturnRequest, error)
	rejectAdminFn   func(ctx context.Context, returnID, rejectReason string) (*domain.ReturnRequest, error)
	receiveAdminFn  func(ctx context.Context, returnID string, mappings []domain.ReceiveItemMapping) (*domain.ReturnRequest, error)
	refundAdminFn   func(ctx context.Context, returnID, adminUserID string) (*domain.ReturnRequest, error)
	searchVariantFn func(ctx context.Context, query string, page, limit int) ([]domain.VariantOptionInfo, int, error)
	isRefundedFn    func(ctx context.Context, orderItemID string) (bool, error)
}

func (f *fakeReturnUsecaseRepo) CreateReturnRequest(ctx context.Context, input domain.CreateReturnInput) (*domain.ReturnRequest, error) {
	if f.createFn != nil {
		return f.createFn(ctx, input)
	}
	return nil, nil
}
func (f *fakeReturnUsecaseRepo) CancelReturnRequest(ctx context.Context, userID, orderID, returnID string) (*domain.ReturnRequest, error) {
	if f.cancelFn != nil {
		return f.cancelFn(ctx, userID, orderID, returnID)
	}
	return nil, nil
}
func (f *fakeReturnUsecaseRepo) GetLatestByOrderID(ctx context.Context, orderID string) (*domain.ReturnRequest, error) {
	if f.getLatestFn != nil {
		return f.getLatestFn(ctx, orderID)
	}
	return nil, nil
}
func (f *fakeReturnUsecaseRepo) ListLatestByOrderIDs(ctx context.Context, orderIDs []string) (map[string]*domain.ReturnRequest, error) {
	if f.listLatestFn != nil {
		return f.listLatestFn(ctx, orderIDs)
	}
	return nil, nil
}
func (f *fakeReturnUsecaseRepo) ListAdmin(ctx context.Context, status string, page, limit int) ([]domain.ReturnRequest, int, error) {
	if f.listAdminFn != nil {
		return f.listAdminFn(ctx, status, page, limit)
	}
	return nil, 0, nil
}
func (f *fakeReturnUsecaseRepo) GetAdminByID(ctx context.Context, returnID string) (*domain.ReturnRequest, error) {
	if f.getAdminFn != nil {
		return f.getAdminFn(ctx, returnID)
	}
	return nil, nil
}
func (f *fakeReturnUsecaseRepo) ApproveAdmin(ctx context.Context, returnID string) (*domain.ReturnRequest, error) {
	if f.approveAdminFn != nil {
		return f.approveAdminFn(ctx, returnID)
	}
	return nil, nil
}
func (f *fakeReturnUsecaseRepo) RejectAdmin(ctx context.Context, returnID, rejectReason string) (*domain.ReturnRequest, error) {
	if f.rejectAdminFn != nil {
		return f.rejectAdminFn(ctx, returnID, rejectReason)
	}
	return nil, nil
}
func (f *fakeReturnUsecaseRepo) ReceiveAdmin(ctx context.Context, returnID string, mappings []domain.ReceiveItemMapping) (*domain.ReturnRequest, error) {
	if f.receiveAdminFn != nil {
		return f.receiveAdminFn(ctx, returnID, mappings)
	}
	return nil, nil
}
func (f *fakeReturnUsecaseRepo) RefundAdmin(ctx context.Context, returnID, adminUserID string) (*domain.ReturnRequest, error) {
	if f.refundAdminFn != nil {
		return f.refundAdminFn(ctx, returnID, adminUserID)
	}
	return nil, nil
}
func (f *fakeReturnUsecaseRepo) SearchVariantOptionsAdmin(ctx context.Context, query string, page, limit int) ([]domain.VariantOptionInfo, int, error) {
	if f.searchVariantFn != nil {
		return f.searchVariantFn(ctx, query, page, limit)
	}
	return nil, 0, nil
}
func (f *fakeReturnUsecaseRepo) IsOrderItemRefunded(ctx context.Context, orderItemID string) (bool, error) {
	if f.isRefundedFn != nil {
		return f.isRefundedFn(ctx, orderItemID)
	}
	return false, nil
}
func (f *fakeReturnUsecaseRepo) ListRefundedOrderItemIDs(ctx context.Context, orderItemIDs []string) (map[string]bool, error) {
	res := make(map[string]bool)
	for _, id := range orderItemIDs {
		if f.isRefundedFn != nil {
			if ref, _ := f.isRefundedFn(ctx, id); ref {
				res[id] = true
			}
		}
	}
	return res, nil
}

const returnTestCustomer = "11111111-1111-1111-1111-111111111111"
const returnTestAdmin = "22222222-2222-2222-2222-222222222222"

func newReturnTestRouter(repo *fakeReturnUsecaseRepo) (*gin.Engine, string, string) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	customerToken, _ := manager.GenerateAccessToken(returnTestCustomer, domain.RoleCustomer, 15*time.Minute)
	adminToken, _ := manager.GenerateAccessToken(returnTestAdmin, domain.RoleAdmin, 15*time.Minute)

	uc := returnuc.New(returnuc.Dependencies{Return: repo})

	router := gin.New()
	NewRouter(router, Dependencies{
		Return: uc,
		JWT:    manager,
	})
	return router, customerToken, adminToken
}

func TestReturnHandler_CustomerCreate(t *testing.T) {
	orderID := uuid.NewString()
	itemID := uuid.NewString()
	returnID := uuid.NewString()

	t.Run("success create return request", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{
			createFn: func(ctx context.Context, input domain.CreateReturnInput) (*domain.ReturnRequest, error) {
				return &domain.ReturnRequest{
					ID:                returnID,
					OrderID:           input.OrderID,
					UserID:            input.UserID,
					Status:            domain.ReturnStatusPendingApproval,
					ReasonCode:        input.ReasonCode,
					Description:       input.Description,
					ExpectedRefundVND: "150000",
					Items: []domain.ReturnRequestItem{
						{
							ID:           uuid.NewString(),
							OrderItemID:  itemID,
							VariantID:    uuid.NewString(),
							ProductName:  "Test Product",
							Quantity:     1,
							UnitPriceVND: "150000",
							LineTotalVND: "150000",
						},
					},
					CreatedAt: time.Now().UTC(),
					UpdatedAt: time.Now().UTC(),
				}, nil
			},
		}

		router, token, _ := newReturnTestRouter(repo)
		reqBody := `{"orderItemIds":["` + itemID + `"],"reasonCode":"defective","description":"máy bị trầy"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+orderID+"/returns", bytes.NewBufferString(reqBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected status 201, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if resp["success"] != true {
			t.Errorf("expected success: true, got %v", resp["success"])
		}
		data := resp["data"].(map[string]interface{})
		if data["id"] != returnID {
			t.Errorf("expected id %s, got %v", returnID, data["id"])
		}
		if data["status"] != "pending_approval" {
			t.Errorf("expected status pending_approval, got %v", data["status"])
		}
	})

	t.Run("reject unknown fields in create body", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{}
		router, token, _ := newReturnTestRouter(repo)

		reqBody := `{"orderItemIds":["` + itemID + `"],"reasonCode":"defective","extraField":"hacker"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+orderID+"/returns", bytes.NewBufferString(reqBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400 for unknown fields, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("error open return request already exists", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{
			createFn: func(ctx context.Context, input domain.CreateReturnInput) (*domain.ReturnRequest, error) {
				return nil, domain.ErrReturnRequestOpen
			},
		}

		router, token, _ := newReturnTestRouter(repo)
		reqBody := `{"orderItemIds":["` + itemID + `"],"reasonCode":"defective"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+orderID+"/returns", bytes.NewBufferString(reqBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected status 409, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestReturnHandler_CustomerCancel(t *testing.T) {
	orderID := uuid.NewString()
	returnID := uuid.NewString()

	t.Run("success cancel", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{
			cancelFn: func(ctx context.Context, userID, oID, rID string) (*domain.ReturnRequest, error) {
				return &domain.ReturnRequest{
					ID:        rID,
					OrderID:   oID,
					Status:    domain.ReturnStatusCancelled,
					CreatedAt: time.Now().UTC(),
					UpdatedAt: time.Now().UTC(),
				}, nil
			},
		}

		router, token, _ := newReturnTestRouter(repo)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/orders/"+orderID+"/returns/"+returnID+"/cancel", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestReturnHandler_AdminEndpoints(t *testing.T) {
	returnID := uuid.NewString()
	orderID := uuid.NewString()
	variantID := uuid.NewString()
	itemID := uuid.NewString()

	t.Run("admin list returns paginated", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{
			listAdminFn: func(ctx context.Context, status string, page, limit int) ([]domain.ReturnRequest, int, error) {
				return []domain.ReturnRequest{
					{
						ID:                returnID,
						OrderID:           orderID,
						UserID:            orderTestUser,
						BuyerEmail:        "buyer@example.com",
						Status:            domain.ReturnStatusPendingApproval,
						ReasonCode:        domain.ReturnReasonDefective,
						ExpectedRefundVND: "200000",
						CreatedAt:         time.Now().UTC(),
					},
				}, 1, nil
			},
		}

		router, _, adminToken := newReturnTestRouter(repo)
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/returns?page=1&limit=10", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("admin variant options search", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{
			searchVariantFn: func(ctx context.Context, query string, page, limit int) ([]domain.VariantOptionInfo, int, error) {
				return []domain.VariantOptionInfo{
					{
						VariantID:     variantID,
						ProductID:     uuid.NewString(),
						ProductName:   "Sample Product",
						StockQuantity: 10,
						ProductActive: true,
						VariantActive: true,
					},
				}, 1, nil
			},
		}

		router, _, adminToken := newReturnTestRouter(repo)
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/returns/variant-options?q=Sample", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("admin approve", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{
			approveAdminFn: func(ctx context.Context, retID string) (*domain.ReturnRequest, error) {
				return &domain.ReturnRequest{
					ID:        retID,
					Status:    domain.ReturnStatusApproved,
					CreatedAt: time.Now().UTC(),
					UpdatedAt: time.Now().UTC(),
				}, nil
			},
		}

		router, _, adminToken := newReturnTestRouter(repo)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/returns/"+returnID+"/approve", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("admin reject", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{
			rejectAdminFn: func(ctx context.Context, retID, rejectReason string) (*domain.ReturnRequest, error) {
				return &domain.ReturnRequest{
					ID:           retID,
					Status:       domain.ReturnStatusRejected,
					RejectReason: rejectReason,
					CreatedAt:    time.Now().UTC(),
					UpdatedAt:    time.Now().UTC(),
				}, nil
			},
		}

		router, _, adminToken := newReturnTestRouter(repo)
		reqBody := `{"rejectReason":"Hàng không đúng tem niêm phong"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/returns/"+returnID+"/reject", bytes.NewBufferString(reqBody))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("admin receive", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{
			receiveAdminFn: func(ctx context.Context, retID string, mappings []domain.ReceiveItemMapping) (*domain.ReturnRequest, error) {
				return &domain.ReturnRequest{
					ID:        retID,
					Status:    domain.ReturnStatusReceived,
					CreatedAt: time.Now().UTC(),
					UpdatedAt: time.Now().UTC(),
				}, nil
			},
		}

		router, _, adminToken := newReturnTestRouter(repo)
		reqBody := `{"items":[{"orderItemId":"` + itemID + `","receivedVariantId":"` + variantID + `"}]}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/returns/"+returnID+"/receive", bytes.NewBufferString(reqBody))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("admin refund", func(t *testing.T) {
		repo := &fakeReturnUsecaseRepo{
			refundAdminFn: func(ctx context.Context, retID, adminUserID string) (*domain.ReturnRequest, error) {
				refundAmt := domain.MoneyVND("200000")
				return &domain.ReturnRequest{
					ID:               retID,
					Status:           domain.ReturnStatusRefunded,
					RefundAmountVND:  &refundAmt,
					RefundedByUserID: &adminUserID,
					CreatedAt:        time.Now().UTC(),
					UpdatedAt:        time.Now().UTC(),
				}, nil
			},
		}

		router, _, adminToken := newReturnTestRouter(repo)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/returns/"+returnID+"/refund", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})
}
