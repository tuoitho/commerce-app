package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	orderuc "commerce-backend/internal/usecase/order"
)

const orderTestUser = "11111111-1111-1111-1111-111111111111"

type fakeOrderUsecaseRepo struct {
	createdOrder *domain.Order
	createErr    error
	lastUserID   string
	lastAddrID   string
	lastLines    []domain.OrderLineInput
	lastShipping domain.MoneyVND

	getByIDOrder *domain.Order
	getByIDErr   error
	lastGetID    string

	listOrders     []domain.Order
	listErr        error
	lastListBucket domain.OrderStatusBucket

	stats         domain.OrderStats
	statsErr      error
	lastStatsUser string

	cancelOrder  *domain.Order
	cancelErr    error
	lastCancelID string

	undoOrder  *domain.Order
	undoErr    error
	lastUndoID string
}

func (f *fakeOrderUsecaseRepo) Create(_ context.Context, userID string, addressID string, lines []domain.OrderLineInput, shippingFeeVND domain.MoneyVND) (*domain.Order, error) {
	f.lastUserID = userID
	f.lastAddrID = addressID
	f.lastLines = lines
	f.lastShipping = shippingFeeVND
	if f.createErr != nil {
		return nil, f.createErr
	}
	return f.createdOrder, nil
}

func (f *fakeOrderUsecaseRepo) GetByID(_ context.Context, userID, orderID string) (*domain.Order, error) {
	f.lastUserID = userID
	f.lastGetID = orderID
	if f.getByIDErr != nil {
		return nil, f.getByIDErr
	}
	return f.getByIDOrder, nil
}

func (f *fakeOrderUsecaseRepo) ListByUser(_ context.Context, userID string, bucket domain.OrderStatusBucket) ([]domain.Order, error) {
	f.lastUserID = userID
	f.lastListBucket = bucket
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.listOrders, nil
}

func (f *fakeOrderUsecaseRepo) StatsByUser(_ context.Context, userID string) (domain.OrderStats, error) {
	f.lastStatsUser = userID
	if f.statsErr != nil {
		return domain.OrderStats{}, f.statsErr
	}
	return f.stats, nil
}

func (f *fakeOrderUsecaseRepo) Cancel(_ context.Context, userID, orderID string) (*domain.Order, error) {
	f.lastUserID = userID
	f.lastCancelID = orderID
	if f.cancelErr != nil {
		return nil, f.cancelErr
	}
	return f.cancelOrder, nil
}

func (f *fakeOrderUsecaseRepo) UndoCancelRequest(_ context.Context, userID, orderID string) (*domain.Order, error) {
	f.lastUserID = userID
	f.lastUndoID = orderID
	if f.undoErr != nil {
		return nil, f.undoErr
	}
	return f.undoOrder, nil
}

func (f *fakeOrderUsecaseRepo) AutoConfirmDue(_ context.Context, _ time.Time) error {
	return nil
}

func (f *fakeOrderUsecaseRepo) ListByAdmin(_ context.Context, statuses []string) ([]domain.Order, error) {
	return nil, errors.New("unimplemented")
}

func (f *fakeOrderUsecaseRepo) GetByAdminID(_ context.Context, orderID string) (*domain.Order, error) {
	return nil, errors.New("unimplemented")
}

func (f *fakeOrderUsecaseRepo) AdminTransition(_ context.Context, orderID string, action domain.OrderAdminAction) (*domain.Order, error) {
	return nil, errors.New("unimplemented")
}


type fakeReviewRepoForHandler struct {
	listByItemIDsFn func(ctx context.Context, itemIDs []string) (map[string]*domain.Review, error)
}

func (f *fakeReviewRepoForHandler) CreateReview(ctx context.Context, input domain.CreateReviewInput) (*domain.Review, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) UpdateReview(ctx context.Context, input domain.UpdateReviewInput) (*domain.Review, []string, error) {
	return nil, nil, nil
}
func (f *fakeReviewRepoForHandler) GetReviewByID(ctx context.Context, reviewID string) (*domain.Review, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) GetReviewByOrderItemID(ctx context.Context, orderItemID string) (*domain.Review, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) ListReviewsByOrderItemIDs(ctx context.Context, orderItemIDs []string) (map[string]*domain.Review, error) {
	if f.listByItemIDsFn != nil {
		return f.listByItemIDsFn(ctx, orderItemIDs)
	}
	return make(map[string]*domain.Review), nil
}
func (f *fakeReviewRepoForHandler) GetReviewMediaByID(ctx context.Context, mediaID string) (*domain.ReviewMedia, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) GetPublicReviewsByProductID(ctx context.Context, productID string, page, limit int) (*domain.ProductReviewsResult, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) GetUserReviews(ctx context.Context, userID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error) {
	return nil, nil
}

func newOrderTestRouter(orderRepo *fakeOrderUsecaseRepo) (*gin.Engine, string) {
	return newOrderTestRouterWithReview(orderRepo, nil)
}

func newOrderTestRouterWithReview(orderRepo *fakeOrderUsecaseRepo, reviewRepo domain.ReviewRepository) (*gin.Engine, string) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	token, _ := manager.GenerateAccessToken(orderTestUser, domain.RoleCustomer, 15*time.Minute)

	uc := orderuc.New(orderuc.Dependencies{
		Order:               orderRepo,
		Review:              reviewRepo,
		ShippingFeeVND:      "30000",
		OrderConfirmTimeout: 30 * time.Minute,
	})

	router := gin.New()
	NewRouter(router, Dependencies{
		Order: uc,
		JWT:   manager,
	})
	return router, token
}

func execOrderRequest(router *gin.Engine, token, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestOrderHTTP_AuthRequired(t *testing.T) {
	repo := &fakeOrderUsecaseRepo{}
	router, _ := newOrderTestRouter(repo)

	w := execOrderRequest(router, "", http.MethodPost, "/api/v1/orders", `{"addressId":"22222222-2222-2222-2222-222222222222","lines":[]}`)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("POST /api/v1/orders without token: expected 401, got %d", w.Code)
	}
}

func TestOrderHTTP_Create_InvalidBody(t *testing.T) {
	repo := &fakeOrderUsecaseRepo{}
	router, token := newOrderTestRouter(repo)

	w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders", `invalid-json`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("POST /api/v1/orders with invalid json: expected 400, got %d", w.Code)
	}

	var resp ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if resp.Error == nil || resp.Error.Code != "validation_error" {
		t.Errorf("expected error code validation_error, got %+v", resp.Error)
	}
}

func TestOrderHTTP_Create_Success(t *testing.T) {
	now := time.Now().UTC()
	created := &domain.Order{
		ID:             "order-99999",
		UserID:         orderTestUser,
		Status:         domain.OrderStatusPendingConfirmation,
		PaymentMethod:  domain.PaymentMethodCOD,
		SubtotalVND:    "20000000",
		ShippingFeeVND: "30000",
		TotalVND:       "20030000",
		ShippingInfo: domain.ShippingInfo{
			RecipientName: "Nguyen Van A",
			Phone:         "0987654321",
			ProvinceName:  "Thành phố Hà Nội",
			WardName:      "Phường Ba Đình",
			DetailAddress: "Số 1 Tràng Tiền",
		},
		Items: []domain.OrderItem{
			{
				ID:           "item-1",
				OrderID:      "order-99999",
				VariantID:    "33333333-3333-3333-3333-333333333333",
				ProductID:    "44444444-4444-4444-4444-444444444444",
				BrandName:    "Apple",
				ProductName:  "iPhone 15",
				Model:        "128GB",
				ImageURL:     "https://example.com/img.jpg",
				Options:      []domain.CartOption{{GroupLabel: "Màu sắc", ValueLabel: "Đen"}},
				UnitPriceVND: "20000000",
				Quantity:     1,
				LineTotalVND: "20000000",
			},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	repo := &fakeOrderUsecaseRepo{createdOrder: created}
	router, token := newOrderTestRouter(repo)

	reqBody := `{
		"addressId": "22222222-2222-2222-2222-222222222222",
		"lines": [
			{
				"variantId": "33333333-3333-3333-3333-333333333333",
				"quantity": 1,
				"productName": "iPhone 15",
				"unitPriceVnd": "20000000"
			}
		]
	}`

	w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders", reqBody)
	if w.Code != http.StatusCreated {
		t.Fatalf("POST /api/v1/orders: expected 201, got %d, body: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Success bool          `json:"success"`
		Message string        `json:"message"`
		Data    orderResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if !resp.Success {
		t.Errorf("expected success to be true")
	}
	if resp.Data.ID != "order-99999" {
		t.Errorf("expected order ID %s, got %s", "order-99999", resp.Data.ID)
	}
	if resp.Data.Status != "pending_confirmation" {
		t.Errorf("expected status pending_confirmation, got %s", resp.Data.Status)
	}
	if resp.Data.PaymentMethod != "cod" {
		t.Errorf("expected payment method cod, got %s", resp.Data.PaymentMethod)
	}
	if resp.Data.SubtotalVND != "20000000" || resp.Data.ShippingFeeVND != "30000" || resp.Data.TotalVND != "20030000" {
		t.Errorf("unexpected amounts: subtotal=%s, shipping=%s, total=%s", resp.Data.SubtotalVND, resp.Data.ShippingFeeVND, resp.Data.TotalVND)
	}
	if len(resp.Data.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Data.Items))
	}
	item := resp.Data.Items[0]
	if item.VariantID != "33333333-3333-3333-3333-333333333333" || item.Quantity != 1 || item.UnitPriceVND != "20000000" || item.LineTotalVND != "20000000" {
		t.Errorf("unexpected item fields: %+v", item)
	}
	if resp.Data.CancellableUntil == nil {
		t.Errorf("expected cancellableUntil to be set for pending_confirmation")
	}
}

func TestOrderHTTP_Create_Errors(t *testing.T) {
	testCases := []struct {
		name           string
		repoErr        error
		expectedStatus int
		expectedCode   string
		expectedMsg    string
	}{
		{
			name:           "CartEmpty",
			repoErr:        domain.ErrCartEmpty,
			expectedStatus: http.StatusConflict,
			expectedCode:   "cart_empty",
			expectedMsg:    "Không có sản phẩm nào để đặt hàng",
		},
		{
			name:           "AddressNotFound",
			repoErr:        domain.ErrAddressNotFound,
			expectedStatus: http.StatusNotFound,
			expectedCode:   "address_not_found",
			expectedMsg:    "Không tìm thấy địa chỉ",
		},
		{
			name:           "OutOfStock",
			repoErr:        domain.ErrOutOfStock,
			expectedStatus: http.StatusConflict,
			expectedCode:   "out_of_stock",
			expectedMsg:    "Phân loại sản phẩm đã hết hàng",
		},
		{
			name:           "StockLimit",
			repoErr:        domain.ErrStockLimit,
			expectedStatus: http.StatusConflict,
			expectedCode:   "stock_limit",
			expectedMsg:    "Số lượng vượt quá tồn kho",
		},
		{
			name:           "ProductChanged",
			repoErr:        domain.NewProductChangedError([]string{"iPhone 15"}),
			expectedStatus: http.StatusConflict,
			expectedCode:   "product_changed",
			expectedMsg:    "Sản phẩm iPhone 15 vừa được cập nhật. Vui lòng tải lại để xem thông tin mới nhất.",
		},
	}

	reqBody := `{
		"addressId": "22222222-2222-2222-2222-222222222222",
		"lines": [
			{
				"variantId": "33333333-3333-3333-3333-333333333333",
				"quantity": 1,
				"productName": "iPhone 15",
				"unitPriceVnd": "20000000"
			}
		]
	}`

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeOrderUsecaseRepo{createErr: tc.repoErr}
			router, token := newOrderTestRouter(repo)

			w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders", reqBody)
			if w.Code != tc.expectedStatus {
				t.Fatalf("expected status %d, got %d, body: %s", tc.expectedStatus, w.Code, w.Body.String())
			}

			var resp ResponseEnvelope
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to unmarshal: %v", err)
			}
			if resp.Error == nil || resp.Error.Code != tc.expectedCode {
				t.Errorf("expected error code %s, got %+v", tc.expectedCode, resp.Error)
			}
			if resp.Message != tc.expectedMsg {
				t.Errorf("expected message %q, got %q", tc.expectedMsg, resp.Message)
			}
		})
	}
}

func TestOrderHTTP_GetByID(t *testing.T) {
	validOrderID := "22222222-2222-2222-2222-222222222222"
	now := time.Now().UTC()

	t.Run("auth required", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{}
		router, _ := newOrderTestRouter(repo)

		w := execOrderRequest(router, "", http.MethodGet, "/api/v1/orders/"+validOrderID, "")
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", w.Code)
		}
	})

	t.Run("order not found returns 404 with Vietnamese message", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{getByIDErr: domain.ErrOrderNotFound}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders/"+validOrderID, "")
		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if resp.Error == nil || resp.Error.Code != "order_not_found" {
			t.Errorf("expected error code order_not_found, got %+v", resp.Error)
		}
		if resp.Message != "Không tìm thấy đơn hàng" {
			t.Errorf("expected message 'Không tìm thấy đơn hàng', got %q", resp.Message)
		}
	})

	t.Run("success returns Order envelope", func(t *testing.T) {
		order := &domain.Order{
			ID:             validOrderID,
			UserID:         orderTestUser,
			Status:         domain.OrderStatusPendingConfirmation,
			PaymentMethod:  domain.PaymentMethodCOD,
			SubtotalVND:    "100000",
			ShippingFeeVND: "30000",
			TotalVND:       "130000",
			ShippingInfo: domain.ShippingInfo{
				RecipientName: "Nguyen Van B",
				Phone:         "0987654321",
				ProvinceName:  "Hà Nội",
				WardName:      "Ba Đình",
				DetailAddress: "Số 2 Tràng Thi",
			},
			Items: []domain.OrderItem{
				{
					ID:           "item-1",
					OrderID:      validOrderID,
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

		repo := &fakeOrderUsecaseRepo{getByIDOrder: order}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders/"+validOrderID, "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool          `json:"success"`
			Message string        `json:"message"`
			Data    orderResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if !resp.Success {
			t.Errorf("expected success true")
		}
		if resp.Data.ID != validOrderID {
			t.Errorf("expected ID %s, got %s", validOrderID, resp.Data.ID)
		}
		if resp.Data.Status != "pending_confirmation" {
			t.Errorf("expected status pending_confirmation, got %s", resp.Data.Status)
		}
		if resp.Data.SubtotalVND != "100000" || resp.Data.ShippingFeeVND != "30000" || resp.Data.TotalVND != "130000" {
			t.Errorf("unexpected amounts: %+v", resp.Data)
		}
		if resp.Data.RecipientName != "Nguyen Van B" || resp.Data.DetailAddress != "Số 2 Tràng Thi" {
			t.Errorf("unexpected shipping info: %+v", resp.Data)
		}
		if len(resp.Data.Items) != 1 {
			t.Fatalf("expected 1 item, got %d", len(resp.Data.Items))
		}
		if resp.Data.CancellableUntil == nil {
			t.Errorf("expected CancellableUntil to be populated for pending_confirmation")
		}
	})

	t.Run("success returns Order with review states on items", func(t *testing.T) {
		reviewID := "55555555-5555-5555-5555-555555555555"
		order := &domain.Order{
			ID:             validOrderID,
			UserID:         orderTestUser,
			Status:         domain.OrderStatusDelivered,
			PaymentMethod:  domain.PaymentMethodCOD,
			SubtotalVND:    "200000",
			ShippingFeeVND: "0",
			TotalVND:       "200000",
			Items: []domain.OrderItem{
				{
					ID:           "item-reviewed",
					OrderID:      validOrderID,
					VariantID:    "33333333-3333-3333-3333-333333333333",
					ProductID:    "44444444-4444-4444-4444-444444444444",
					BrandName:    "Apple",
					ProductName:  "iPhone 15",
					UnitPriceVND: "100000",
					Quantity:     1,
					LineTotalVND: "100000",
					ReviewStatus: domain.ReviewStatusReviewed,
					Review: &domain.Review{
						ID:          reviewID,
						OrderItemID: "item-reviewed",
						Rating:      5,
						Comment:     "Tuyệt vời",
						CanEdit:     true,
						Edited:      false,
					},
				},
				{
					ID:           "item-eligible",
					OrderID:      validOrderID,
					VariantID:    "33333333-3333-3333-3333-333333333334",
					ProductID:    "44444444-4444-4444-4444-444444444444",
					BrandName:    "Apple",
					ProductName:  "iPhone 15",
					UnitPriceVND: "100000",
					Quantity:     1,
					LineTotalVND: "100000",
					ReviewStatus: domain.ReviewStatusEligible,
				},
			},
			CreatedAt: now,
			UpdatedAt: now,
		}

		reviewRepo := &fakeReviewRepoForHandler{
			listByItemIDsFn: func(ctx context.Context, itemIDs []string) (map[string]*domain.Review, error) {
				return map[string]*domain.Review{
					"item-reviewed": {
						ID:          reviewID,
						OrderItemID: "item-reviewed",
						Rating:      5,
						Comment:     "Tuyệt vời",
						CanEdit:     true,
						Edited:      false,
					},
				}, nil
			},
		}

		repo := &fakeOrderUsecaseRepo{getByIDOrder: order}
		router, token := newOrderTestRouterWithReview(repo, reviewRepo)

		w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders/"+validOrderID, "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool          `json:"success"`
			Data    orderResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if len(resp.Data.Items) != 2 {
			t.Fatalf("expected 2 items, got %d", len(resp.Data.Items))
		}
		if resp.Data.Items[0].ReviewStatus != "reviewed" || resp.Data.Items[0].Review == nil || resp.Data.Items[0].Review.ID != reviewID {
			t.Errorf("unexpected item[0] review state: %+v", resp.Data.Items[0])
		}
		if resp.Data.Items[1].ReviewStatus != "eligible" || resp.Data.Items[1].Review != nil {
			t.Errorf("unexpected item[1] review state: %+v", resp.Data.Items[1])
		}
	})
}

func TestOrderHTTP_List(t *testing.T) {
	validOrderID := "22222222-2222-2222-2222-222222222222"
	now := time.Now().UTC()

	t.Run("auth required", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{}
		router, _ := newOrderTestRouter(repo)

		w := execOrderRequest(router, "", http.MethodGet, "/api/v1/orders", "")
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", w.Code)
		}
	})

	t.Run("default status is all", func(t *testing.T) {
		orders := []domain.Order{
			{
				ID:             validOrderID,
				UserID:         orderTestUser,
				Status:         domain.OrderStatusConfirmed,
				PaymentMethod:  domain.PaymentMethodCOD,
				SubtotalVND:    "100000",
				ShippingFeeVND: "0",
				TotalVND:       "100000",
				CreatedAt:      now,
				UpdatedAt:      now,
			},
		}

		repo := &fakeOrderUsecaseRepo{listOrders: orders}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}
		if repo.lastListBucket != domain.OrderStatusBucketAll {
			t.Errorf("expected bucket %s, got %s", domain.OrderStatusBucketAll, repo.lastListBucket)
		}

		var resp struct {
			Success bool            `json:"success"`
			Data    []orderResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if !resp.Success || len(resp.Data) != 1 {
			t.Fatalf("expected 1 order, got %d", len(resp.Data))
		}
		if resp.Data[0].ID != validOrderID {
			t.Errorf("expected ID %s, got %s", validOrderID, resp.Data[0].ID)
		}
	})

	t.Run("filtered by status bucket", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{listOrders: []domain.Order{}}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders?status=pickup", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}
		if repo.lastListBucket != domain.OrderStatusBucketPickup {
			t.Errorf("expected bucket %s, got %s", domain.OrderStatusBucketPickup, repo.lastListBucket)
		}
	})

	t.Run("filtered by reviewable status bucket", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{listOrders: []domain.Order{}}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders?status=reviewable", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}
		if repo.lastListBucket != domain.OrderStatusBucketReviewable {
			t.Errorf("expected bucket %s, got %s", domain.OrderStatusBucketReviewable, repo.lastListBucket)
		}
	})

	t.Run("invalid status bucket returns 400 validation_error", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders?status=unknown_status", "")
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if resp.Error == nil || resp.Error.Code != "validation_error" {
			t.Errorf("expected validation_error, got %+v", resp.Error)
		}
	})
}

func TestOrderHTTP_Stats(t *testing.T) {
	t.Run("auth required", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{}
		router, _ := newOrderTestRouter(repo)

		w := execOrderRequest(router, "", http.MethodGet, "/api/v1/orders/stats", "")
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", w.Code)
		}
	})

	t.Run("success returns OrderStats", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{
			stats: domain.OrderStats{
				PendingConfirmation: 1,
				AwaitingPickup:      2,
				AwaitingDelivery:    3,
				AwaitingReview:      4,
			},
		}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders/stats", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool               `json:"success"`
			Data    orderStatsResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if !resp.Success {
			t.Errorf("expected success true")
		}
		if resp.Data.PendingConfirmation != 1 || resp.Data.AwaitingPickup != 2 || resp.Data.AwaitingDelivery != 3 || resp.Data.AwaitingReview != 4 {
			t.Errorf("unexpected stats response: %+v", resp.Data)
		}
	})

	t.Run("route ordering ensures stats is not treated as :id", func(t *testing.T) {
		// If GET /orders/stats matched GET /orders/:id with id="stats",
		// it would call GetByID instead of StatsByUser.
		repo := &fakeOrderUsecaseRepo{
			stats: domain.OrderStats{
				PendingConfirmation: 5,
			},
		}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders/stats", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}
		if repo.lastGetID == "stats" {
			t.Errorf("route conflict: /orders/stats was handled by GetByID with id='stats'!")
		}
		if repo.lastStatsUser != orderTestUser {
			t.Errorf("expected StatsByUser to be called with %s", orderTestUser)
		}
	})
}

func TestOrderHTTP_Cancel(t *testing.T) {
	validOrderID := "22222222-2222-2222-2222-222222222222"
	now := time.Now().UTC()

	t.Run("auth required", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{}
		router, _ := newOrderTestRouter(repo)

		w := execOrderRequest(router, "", http.MethodPost, "/api/v1/orders/"+validOrderID+"/cancel", "")
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", w.Code)
		}
	})

	t.Run("order not found returns 404", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{cancelErr: domain.ErrOrderNotFound}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/cancel", "")
		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if resp.Error == nil || resp.Error.Code != "order_not_found" {
			t.Errorf("expected order_not_found, got %+v", resp.Error)
		}
	})

	t.Run("cancel pending_confirmation returns 200 with cancelled order", func(t *testing.T) {
		cancelled := &domain.Order{
			ID:             validOrderID,
			UserID:         orderTestUser,
			Status:         domain.OrderStatusCancelled,
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
					VariantID:    "33333333-3333-3333-3333-333333333333",
					ProductID:    "44444444-4444-4444-4444-444444444444",
					BrandName:    "Apple",
					ProductName:  "iPhone 15",
					UnitPriceVND: "100000",
					Quantity:     1,
					LineTotalVND: "100000",
				},
			},
			CreatedAt:   now,
			UpdatedAt:   now,
			CancelledAt: &now,
		}

		repo := &fakeOrderUsecaseRepo{cancelOrder: cancelled}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/cancel", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool          `json:"success"`
			Message string        `json:"message"`
			Data    orderResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if !resp.Success {
			t.Errorf("expected success true")
		}
		if resp.Data.Status != "cancelled" {
			t.Errorf("expected status cancelled, got %s", resp.Data.Status)
		}
		if resp.Data.CancelledAt == nil {
			t.Errorf("expected CancelledAt to be set")
		}
	})

	t.Run("cancel preparing returns 200 with cancel_requested order", func(t *testing.T) {
		cancelRequested := &domain.Order{
			ID:             validOrderID,
			UserID:         orderTestUser,
			Status:         domain.OrderStatusCancelRequested,
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
			Items:     []domain.OrderItem{},
			CreatedAt: now,
			UpdatedAt: now,
		}

		repo := &fakeOrderUsecaseRepo{cancelOrder: cancelRequested}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/cancel", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool          `json:"success"`
			Message string        `json:"message"`
			Data    orderResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if !resp.Success {
			t.Errorf("expected success true")
		}
		if resp.Data.Status != "cancel_requested" {
			t.Errorf("expected status cancel_requested, got %s", resp.Data.Status)
		}
	})

	t.Run("cancel not cancellable returns 409", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{cancelErr: domain.ErrOrderNotCancellable}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/cancel", "")
		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if resp.Error == nil || resp.Error.Code != "order_not_cancellable" {
			t.Errorf("expected error code order_not_cancellable, got %+v", resp.Error)
		}
		if resp.Message != "Đơn hàng không thể hủy được nữa" {
			t.Errorf("expected Vietnamese message, got %q", resp.Message)
		}
	})
}

func TestOrderHTTP_UndoCancel(t *testing.T) {
	validOrderID := "22222222-2222-2222-2222-222222222222"
	now := time.Now().UTC()

	t.Run("auth required", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{}
		router, _ := newOrderTestRouter(repo)

		w := execOrderRequest(router, "", http.MethodPost, "/api/v1/orders/"+validOrderID+"/cancel/undo", "")
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", w.Code)
		}
	})

	t.Run("order not found returns 404", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{undoErr: domain.ErrOrderNotFound}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/cancel/undo", "")
		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if resp.Error == nil || resp.Error.Code != "order_not_found" {
			t.Errorf("expected order_not_found, got %+v", resp.Error)
		}
	})

	t.Run("undo cancel on cancel_requested returns 200 with preparing order", func(t *testing.T) {
		preparing := &domain.Order{
			ID:             validOrderID,
			UserID:         orderTestUser,
			Status:         domain.OrderStatusPreparing,
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
			Items:     []domain.OrderItem{},
			CreatedAt: now,
			UpdatedAt: now,
		}

		repo := &fakeOrderUsecaseRepo{undoOrder: preparing}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/cancel/undo", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool          `json:"success"`
			Message string        `json:"message"`
			Data    orderResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if !resp.Success {
			t.Errorf("expected success true")
		}
		if resp.Data.Status != "preparing" {
			t.Errorf("expected status preparing, got %s", resp.Data.Status)
		}
		if resp.Message != "Hoàn tác yêu cầu hủy thành công" {
			t.Errorf("expected Vietnamese message, got %q", resp.Message)
		}
	})

	t.Run("undo cancel on non-cancel_requested returns 409", func(t *testing.T) {
		repo := &fakeOrderUsecaseRepo{undoErr: domain.ErrOrderNotCancelRequested}
		router, token := newOrderTestRouter(repo)

		w := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/cancel/undo", "")
		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d, body: %s", w.Code, w.Body.String())
		}

		var resp ResponseEnvelope
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if resp.Error == nil || resp.Error.Code != "order_not_cancel_request" {
			t.Errorf("expected error code order_not_cancel_request, got %+v", resp.Error)
		}
		if resp.Message != "Đơn hàng không có yêu cầu hủy đang chờ" {
			t.Errorf("expected Vietnamese message, got %q", resp.Message)
		}
	})
}


