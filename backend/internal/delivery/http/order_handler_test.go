package http

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/config"
	"commerce-backend/internal/domain"
	"commerce-backend/internal/payment/momo"
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
func (f *fakeReviewRepoForHandler) GetPublicReviewsByProductID(ctx context.Context, productID string, viewerUserID *string, page, limit int) (*domain.ProductReviewsResult, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) GetUserReviews(ctx context.Context, userID string, ratingFilter int16, page, limit int) (*domain.UserReviewsResult, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) GetAdminReviews(ctx context.Context, ratingFilter int16, hasReplyFilter string, page, limit int) (*domain.AdminReviewsResult, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) UpdateAdminReply(ctx context.Context, reviewID string, reply *string) (*domain.Review, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) SetReviewVote(ctx context.Context, reviewID, userID string, vote *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
	return nil, nil
}
func (f *fakeReviewRepoForHandler) SetReviewReplyVote(ctx context.Context, replyID, userID string, vote *domain.HelpfulnessVote) (*domain.HelpfulnessState, error) {
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

type fakeHTTPMomoOrderRepo struct {
	*fakeOrderUsecaseRepo
	createMethodErr  error
	createMethodRes  *domain.Order
	lastMethod       string
	failedMarkedIDs  []string
	resetPendingRes  *domain.Order
	resetPendingErr  error
	callbackRes      *domain.Order
	callbackJustPaid bool
	callbackErr      error
}

func (f *fakeHTTPMomoOrderRepo) CreateWithPaymentMethod(ctx context.Context, userID, addressID string, lines []domain.OrderLineInput, shippingFeeVND domain.MoneyVND, paymentMethod string) (*domain.Order, error) {
	f.lastMethod = paymentMethod
	if f.createMethodErr != nil {
		return nil, f.createMethodErr
	}
	if f.createMethodRes != nil {
		return f.createMethodRes, nil
	}
	return f.Create(ctx, userID, addressID, lines, shippingFeeVND)
}

func (f *fakeHTTPMomoOrderRepo) SetPaymentFailed(_ context.Context, orderID string) error {
	f.failedMarkedIDs = append(f.failedMarkedIDs, orderID)
	if f.createMethodRes != nil && f.createMethodRes.ID == orderID {
		f.createMethodRes.PaymentStatus = domain.PaymentStatusFailed
	}
	return nil
}

func (f *fakeHTTPMomoOrderRepo) ResetPaymentPending(_ context.Context, _, _ string) (*domain.Order, error) {
	if f.resetPendingErr != nil {
		return nil, f.resetPendingErr
	}
	return f.resetPendingRes, nil
}

func (f *fakeHTTPMomoOrderRepo) ApplyMomoCallback(_ context.Context, _, _, _, _ string, _ int) (*domain.Order, bool, error) {
	return f.callbackRes, f.callbackJustPaid, f.callbackErr
}

func (f *fakeHTTPMomoOrderRepo) AutoCancelExpiredMomoOrders(_ context.Context, _ time.Time) ([]domain.AutoConfirmedOrder, error) {
	return nil, nil
}

func signMomoCallbackForHTTPTest(secret, accessKey, partnerCode, orderID, requestID, amount, orderInfo, orderType, transID string, resultCode int, message, payType, responseTime, extraData string) string {
	raw := fmt.Sprintf(
		"accessKey=%s&amount=%s&extraData=%s&message=%s&orderId=%s&orderInfo=%s&orderType=%s&partnerCode=%s&payType=%s&requestId=%s&responseTime=%s&resultCode=%d&transId=%s",
		accessKey, amount, extraData, message, orderID, orderInfo, orderType, partnerCode, payType, requestID, responseTime, resultCode, transID,
	)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(raw))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestOrderHTTP_MomoContractAndFlows(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const (
		validOrderID = "44444444-4444-4444-4444-444444444444"
		paidOrderID  = "55555555-5555-5555-5555-555555555555"
		addrID       = "22222222-2222-2222-2222-222222222222"
		variantID    = "33333333-3333-3333-3333-333333333333"
		productID    = "66666666-6666-6666-6666-666666666666"
		itemID1      = "77777777-7777-7777-7777-777777777771"
		itemID2      = "77777777-7777-7777-7777-777777777772"
		accessKey    = "F8BBA842ECF85"
		secretKey    = "K951B6PE1waDMi640xX08PD3vg6EkVlz"
		partnerCode  = "MOMO"
	)

	snapshotPath := filepath.Join("..", "..", "..", "..", ".dream", "specs", "momo-payment", "contract-snapshots.json")
	fixedNow := time.Date(2026, 11, 16, 10, 0, 0, 0, time.UTC)
	confirmedTime := fixedNow.Add(2 * time.Minute)
	transID := "4088812345"

	makeOrder := func(id string, status domain.OrderStatus, payStatus domain.PaymentStatus, paid bool) domain.Order {
		o := domain.Order{
			ID:             id,
			UserID:         orderTestUser,
			Status:         status,
			PaymentMethod:  domain.PaymentMethodMomo,
			PaymentStatus:  payStatus,
			SubtotalVND:    "3190000",
			ShippingFeeVND: "0",
			TotalVND:       "3190000",
			ShippingInfo: domain.ShippingInfo{
				RecipientName: "Nguyen Van A",
				Phone:         "0987654321",
				ProvinceName:  "Hà Nội",
				WardName:      "Phúc Xá",
				DetailAddress: "123 Cầu Giấy",
			},
			Items: []domain.OrderItem{
				{
					ID:           itemID1,
					OrderID:      id,
					VariantID:    variantID,
					ProductID:    productID,
					BrandName:    "Apple",
					ProductName:  "iPhone 15 Pro",
					Model:        "A3101",
					ImageURL:     "/media/iphone.jpg",
					Options:      []domain.CartOption{{GroupLabel: "Màu sắc", ValueLabel: "Titan"}},
					UnitPriceVND: "3190000",
					Quantity:     1,
					LineTotalVND: "3190000",
				},
			},
			CreatedAt: fixedNow,
			UpdatedAt: fixedNow,
		}
		if paid {
			o.Items[0].ID = itemID2
			o.PaymentTransactionID = &transID
			o.PaidAt = &confirmedTime
			o.ConfirmedAt = &confirmedTime
			o.UpdatedAt = confirmedTime
		}
		return o
	}

	buildRouter := func(repo *fakeHTTPMomoOrderRepo, gwResp string, gwStatus int) (*gin.Engine, string, *httptest.Server) {
		gwSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(gwStatus)
			_, _ = w.Write([]byte(gwResp))
		}))
		cfg := &config.Config{
			MomoPartnerCode: partnerCode,
			MomoAccessKey:   accessKey,
			MomoSecretKey:   secretKey,
			MomoEndpoint:    gwSrv.URL,
			MomoRedirectURL: "http://localhost:15173/momo-return",
			MomoIPNURL:      "http://localhost:18080/api/v1/payments/momo/ipn",
			MomoRequestType: "payWithMethod",
			MomoPartnerName: "Test",
			MomoStoreID:     "MomoTestStore",
		}
		momoClient := momo.NewClient(cfg, nil)
		manager := jwt.NewManager(testSecret, "commerce-backend")
		token, _ := manager.GenerateAccessToken(orderTestUser, domain.RoleCustomer, 15*time.Minute)
		uc := orderuc.New(orderuc.Dependencies{
			Order:               repo,
			Return:              &fakeReturnUsecaseRepo{},
			Review:              &fakeReviewRepoForHandler{},
			MomoGateway:         momoClient,
			ShippingFeeVND:      "0",
			OrderConfirmTimeout: 30 * time.Minute,
			Now:                 func() time.Time { return fixedNow.Add(5 * time.Minute) },
		})
		r := gin.New()
		NewRouter(r, Dependencies{
			Order: uc,
			JWT:   manager,
		})
		return r, token, gwSrv
	}

	createReqObj := map[string]any{
		"addressId":     addrID,
		"paymentMethod": "momo",
		"lines": []map[string]any{
			{
				"variantId":    variantID,
				"quantity":     1,
				"productName":  "iPhone 15 Pro",
				"unitPriceVnd": "3190000",
			},
		},
	}
	createReqBytes, _ := json.Marshal(createReqObj)

	t.Run("unauthenticated_401", func(t *testing.T) {
		repo := &fakeHTTPMomoOrderRepo{fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{}}
		r, _, srv := buildRouter(repo, `{}`, http.StatusOK)
		defer srv.Close()

		w := execOrderRequest(r, "", http.MethodPost, "/api/v1/orders", string(createReqBytes))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "unauthenticated_401", "API-ORDER-MOMO@1", "POST /api/v1/orders", nil, w)
	})

	t.Run("invalid paymentMethod returns 400 validation_error", func(t *testing.T) {
		repo := &fakeHTTPMomoOrderRepo{fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{}}
		r, token, srv := buildRouter(repo, `{}`, http.StatusOK)
		defer srv.Close()

		badReq := fmt.Sprintf(`{"addressId":%q,"paymentMethod":"crypto","lines":[{"variantId":%q,"quantity":1,"productName":"Phone","unitPriceVnd":"3190000"}]}`, addrID, variantID)
		w := execOrderRequest(r, token, http.MethodPost, "/api/v1/orders", badReq)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		var env ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &env)
		if env.Error == nil || env.Error.Code != "validation_error" || env.Error.Fields["paymentMethod"] == "" {
			t.Fatalf("expected validation_error with fields.paymentMethod, got %+v", env.Error)
		}
	})

	t.Run("create_order_momo_201", func(t *testing.T) {
		pendingOrder := makeOrder(validOrderID, domain.OrderStatusPendingConfirmation, domain.PaymentStatusPending, false)
		repo := &fakeHTTPMomoOrderRepo{
			fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{},
			createMethodRes:      &pendingOrder,
		}
		r, token, srv := buildRouter(repo, `{"resultCode":0,"message":"Successful.","payUrl":"https://test-payment.momo.vn/v2/gateway/pay?t=123"}`, http.StatusOK)
		defer srv.Close()

		w := execOrderRequest(r, token, http.MethodPost, "/api/v1/orders", string(createReqBytes))
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "create_order_momo_201", "API-ORDER-MOMO@1", "POST /api/v1/orders", createReqObj, w)
	})

	t.Run("create_order_momo_gateway_failed_201", func(t *testing.T) {
		pendingOrder := makeOrder(validOrderID, domain.OrderStatusPendingConfirmation, domain.PaymentStatusPending, false)
		repo := &fakeHTTPMomoOrderRepo{
			fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{},
			createMethodRes:      &pendingOrder,
		}
		r, token, srv := buildRouter(repo, `{"resultCode":1005,"message":"Rejected"}`, http.StatusBadGateway)
		defer srv.Close()

		w := execOrderRequest(r, token, http.MethodPost, "/api/v1/orders", string(createReqBytes))
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 on gateway fallback, got %d: %s", w.Code, w.Body.String())
		}
		var env struct {
			Data orderResponse `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &env)
		if env.Data.PaymentStatus != "failed" || env.Data.PayURL != "" {
			t.Fatalf("expected failed status without payUrl, got %+v", env.Data)
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "create_order_momo_gateway_failed_201", "API-ORDER-MOMO@1", "POST /api/v1/orders", createReqObj, w)
	})

	t.Run("create_order_momo_limit_409", func(t *testing.T) {
		repo := &fakeHTTPMomoOrderRepo{
			fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{},
			createMethodErr:      domain.ErrMomoAmountOutOfRange,
		}
		r, token, srv := buildRouter(repo, `{}`, http.StatusOK)
		defer srv.Close()

		w := execOrderRequest(r, token, http.MethodPost, "/api/v1/orders", string(createReqBytes))
		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d: %s", w.Code, w.Body.String())
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "create_order_momo_limit_409", "API-ORDER-MOMO@1", "POST /api/v1/orders", createReqObj, w)
	})

	t.Run("retry_momo_200 and errors", func(t *testing.T) {
		failedOrder := makeOrder(validOrderID, domain.OrderStatusPendingConfirmation, domain.PaymentStatusFailed, false)
		pendingReset := makeOrder(validOrderID, domain.OrderStatusPendingConfirmation, domain.PaymentStatusPending, false)
		repo := &fakeHTTPMomoOrderRepo{
			fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{getByIDOrder: &failedOrder},
			resetPendingRes:      &pendingReset,
		}
		r, token, srv := buildRouter(repo, `{"resultCode":0,"message":"Successful.","payUrl":"https://test-payment.momo.vn/v2/gateway/pay?t=retry"}`, http.StatusOK)
		defer srv.Close()

		w := execOrderRequest(r, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/momo/retry", "")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "retry_momo_200", "API-ORDER-MOMO@1", "POST /api/v1/orders/:id/momo/retry", nil, w)

		// 409 not allowed
		paidOrder := makeOrder(validOrderID, domain.OrderStatusConfirmed, domain.PaymentStatusPaid, true)
		repo.getByIDOrder = &paidOrder
		w409 := execOrderRequest(r, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/momo/retry", "")
		if w409.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d: %s", w409.Code, w409.Body.String())
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "retry_momo_not_allowed_409", "API-ORDER-MOMO@1", "POST /api/v1/orders/:id/momo/retry", nil, w409)

		// 404 not found
		repo.getByIDOrder = nil
		repo.getByIDErr = domain.ErrOrderNotFound
		w404 := execOrderRequest(r, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/momo/retry", "")
		if w404.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w404.Code)
		}

		// 502 gateway error
		repo.getByIDErr = nil
		repo.getByIDOrder = &failedOrder
		r502, token502, srv502 := buildRouter(repo, `{"resultCode":1005}`, http.StatusBadGateway)
		defer srv502.Close()
		w502 := execOrderRequest(r502, token502, http.MethodPost, "/api/v1/orders/"+validOrderID+"/momo/retry", "")
		if w502.Code != http.StatusBadGateway {
			t.Fatalf("expected 502, got %d: %s", w502.Code, w502.Body.String())
		}
	})

	t.Run("momo_return_paid_200, momo_return_failed_200, momo_return_invalid_sig_400, momo_ipn_204", func(t *testing.T) {
		momoOrderID := validOrderID + "_1763281800000"
		paidSig := signMomoCallbackForHTTPTest(secretKey, accessKey, partnerCode, momoOrderID, momoOrderID, "3190000", "Thanh toan don hang", "momo_wallet", transID, 0, "Thành công.", "qr", "1763281800000", "")
		paidReqObj := map[string]any{
			"partnerCode":  partnerCode,
			"orderId":      momoOrderID,
			"requestId":    momoOrderID,
			"amount":       "3190000",
			"orderInfo":    "Thanh toan don hang",
			"orderType":    "momo_wallet",
			"transId":      transID,
			"resultCode":   0,
			"message":      "Thành công.",
			"payType":      "qr",
			"responseTime": "1763281800000",
			"extraData":    "",
			"signature":    paidSig,
		}
		paidReqBytes, _ := json.Marshal(paidReqObj)

		paidOrder := makeOrder(validOrderID, domain.OrderStatusConfirmed, domain.PaymentStatusPaid, true)
		repo := &fakeHTTPMomoOrderRepo{
			fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{},
			callbackRes:          &paidOrder,
			callbackJustPaid:     true,
		}
		r, token, srv := buildRouter(repo, `{}`, http.StatusOK)
		defer srv.Close()

		wPaid := execOrderRequest(r, token, http.MethodPost, "/api/v1/payments/momo/return", string(paidReqBytes))
		if wPaid.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", wPaid.Code, wPaid.Body.String())
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "momo_return_paid_200", "API-ORDER-MOMO@1", "POST /api/v1/payments/momo/return", paidReqObj, wPaid)

		// Failed return
		failSig := signMomoCallbackForHTTPTest(secretKey, accessKey, partnerCode, momoOrderID, momoOrderID, "3190000", "Thanh toan don hang", "momo_wallet", "0", 1006, "Giao dịch bị từ chối.", "qr", "1763281800000", "")
		failReqObj := map[string]any{
			"partnerCode":  partnerCode,
			"orderId":      momoOrderID,
			"requestId":    momoOrderID,
			"amount":       "3190000",
			"orderInfo":    "Thanh toan don hang",
			"orderType":    "momo_wallet",
			"transId":      "0",
			"resultCode":   1006,
			"message":      "Giao dịch bị từ chối.",
			"payType":      "qr",
			"responseTime": "1763281800000",
			"extraData":    "",
			"signature":    failSig,
		}
		failReqBytes, _ := json.Marshal(failReqObj)
		failedOrder := makeOrder(validOrderID, domain.OrderStatusPendingConfirmation, domain.PaymentStatusFailed, false)
		repo.callbackRes = &failedOrder
		repo.callbackJustPaid = false

		wFail := execOrderRequest(r, token, http.MethodPost, "/api/v1/payments/momo/return", string(failReqBytes))
		if wFail.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", wFail.Code, wFail.Body.String())
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "momo_return_failed_200", "API-ORDER-MOMO@1", "POST /api/v1/payments/momo/return", failReqObj, wFail)

		// Invalid signature -> 400
		badSigObj := map[string]any{
			"partnerCode":  partnerCode,
			"orderId":      momoOrderID,
			"requestId":    momoOrderID,
			"amount":       "3190000",
			"orderInfo":    "Thanh toan don hang",
			"orderType":    "momo_wallet",
			"transId":      transID,
			"resultCode":   0,
			"message":      "Thành công.",
			"payType":      "qr",
			"responseTime": "1763281800000",
			"extraData":    "",
			"signature":    "0000invalid",
		}
		badSigBytes, _ := json.Marshal(badSigObj)
		wBad := execOrderRequest(r, token, http.MethodPost, "/api/v1/payments/momo/return", string(badSigBytes))
		if wBad.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", wBad.Code, wBad.Body.String())
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "momo_return_invalid_sig_400", "API-ORDER-MOMO@1", "POST /api/v1/payments/momo/return", nil, wBad)

		// IPN numeric JSON types without auth -> 204
		ipnReqObj := map[string]any{
			"partnerCode":  partnerCode,
			"orderId":      momoOrderID,
			"requestId":    momoOrderID,
			"amount":       3190000,
			"orderInfo":    "Thanh toan don hang",
			"orderType":    "momo_wallet",
			"transId":      4088812345,
			"resultCode":   0,
			"message":      "Thành công.",
			"payType":      "qr",
			"responseTime": 1763281800000,
			"extraData":    "",
			"signature":    paidSig,
		}
		ipnReqBytes, _ := json.Marshal(ipnReqObj)
		repo.callbackRes = &paidOrder
		repo.callbackJustPaid = true

		wIPN := execOrderRequest(r, "", http.MethodPost, "/api/v1/payments/momo/ipn", string(ipnReqBytes))
		if wIPN.Code != http.StatusNoContent || wIPN.Body.Len() != 0 {
			t.Fatalf("expected 204 empty body, got %d body=%q", wIPN.Code, wIPN.Body.String())
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "momo_ipn_204", "API-ORDER-MOMO@1", "POST /api/v1/payments/momo/ipn", ipnReqObj, wIPN)
	})

	t.Run("get_order_momo_pending_200, get_order_momo_paid_200, list_orders_200", func(t *testing.T) {
		pendingOrder := makeOrder(validOrderID, domain.OrderStatusPendingConfirmation, domain.PaymentStatusPending, false)
		paidOrder := makeOrder(paidOrderID, domain.OrderStatusConfirmed, domain.PaymentStatusPaid, true)

		repo := &fakeHTTPMomoOrderRepo{
			fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{
				getByIDOrder: &pendingOrder,
				listOrders:   []domain.Order{pendingOrder, paidOrder},
			},
		}
		r, token, srv := buildRouter(repo, `{}`, http.StatusOK)
		defer srv.Close()

		wGetPending := execOrderRequest(r, token, http.MethodGet, "/api/v1/orders/"+validOrderID, "")
		if wGetPending.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", wGetPending.Code)
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "get_order_momo_pending_200", "TYPE-ORDER-PAYMENT@1", "GET /api/v1/orders/:id", nil, wGetPending)

		repo.getByIDOrder = &paidOrder
		wGetPaid := execOrderRequest(r, token, http.MethodGet, "/api/v1/orders/"+paidOrderID, "")
		if wGetPaid.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", wGetPaid.Code)
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "get_order_momo_paid_200", "TYPE-ORDER-PAYMENT@1", "GET /api/v1/orders/:id", nil, wGetPaid)

		wList := execOrderRequest(r, token, http.MethodGet, "/api/v1/orders", "")
		if wList.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", wList.Code)
		}
		assertOrRecordContractSnapshot(t, snapshotPath, "momo-payment", "list_orders_200", "TYPE-ORDER-PAYMENT@1", "GET /api/v1/orders", nil, wList)
	})
}

type fakeHTTPCheckoutFulfillmentRepo struct {
	*fakeHTTPMomoOrderRepo
	quoteRes        *domain.CheckoutQuote
	quoteErr        error
	lastQuoteIn     domain.CheckoutQuoteInput
	checkoutRes     *domain.Order
	checkoutErr     error
	lastCheckoutIn  domain.CreateCheckoutOrderInput
	buyAgainRes     *domain.BuyAgainResult
	buyAgainErr     error
	lastBuyOrderID  string
}

func (f *fakeHTTPCheckoutFulfillmentRepo) QuoteCheckout(_ context.Context, input domain.CheckoutQuoteInput) (*domain.CheckoutQuote, error) {
	f.lastQuoteIn = input
	if f.quoteErr != nil {
		return nil, f.quoteErr
	}
	return f.quoteRes, nil
}

func (f *fakeHTTPCheckoutFulfillmentRepo) CreateCheckoutOrder(_ context.Context, input domain.CreateCheckoutOrderInput) (*domain.Order, error) {
	f.lastCheckoutIn = input
	if f.checkoutErr != nil {
		return nil, f.checkoutErr
	}
	return f.checkoutRes, nil
}

func (f *fakeHTTPCheckoutFulfillmentRepo) ShipOrder(_ context.Context, _, _, _ string) (*domain.Order, error) {
	return nil, nil
}

func (f *fakeHTTPCheckoutFulfillmentRepo) BuyAgain(_ context.Context, _, orderID string) (*domain.BuyAgainResult, error) {
	f.lastBuyOrderID = orderID
	if f.buyAgainErr != nil {
		return nil, f.buyAgainErr
	}
	return f.buyAgainRes, nil
}

func newCheckoutFulfillmentRouter(repo *fakeHTTPCheckoutFulfillmentRepo) (*gin.Engine, string) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	token, _ := manager.GenerateAccessToken(orderTestUser, domain.RoleCustomer, 15*time.Minute)
	uc := orderuc.New(orderuc.Dependencies{
		Order:               repo,
		Return:              &fakeReturnUsecaseRepo{},
		Review:              &fakeReviewRepoForHandler{},
		ShippingFeeVND:      "0",
		Shipping:            domain.DefaultShippingConfig(),
		OrderConfirmTimeout: 30 * time.Minute,
	})
	router := gin.New()
	NewRouter(router, Dependencies{
		Order: uc,
		JWT:   manager,
	})
	return router, token
}

func TestOrderHTTP_CheckoutQuoteCreateBuyAgainAndSnapshots(t *testing.T) {
	const (
		validOrderID = "44444444-4444-4444-4444-444444444444"
		addrID       = "22222222-2222-2222-2222-222222222222"
		variantID    = "33333333-3333-3333-3333-333333333333"
		variantID2   = "33333333-3333-3333-3333-333333333334"
		productID    = "66666666-6666-6666-6666-666666666666"
		itemID1      = "77777777-7777-7777-7777-777777777771"
	)
	createdAt := time.Date(2026, 11, 18, 10, 0, 0, 0, time.UTC)
	confirmedAt := createdAt.Add(15 * time.Minute)
	preparingAt := createdAt.Add(30 * time.Minute)
	shippedAt := createdAt.Add(time.Hour)
	voucherCode := "AURA10"
	voucherType := domain.VoucherTypePercent
	carrier := "Ahamove 2h"
	trackingCode := "AHA-20261118"

	// 1. Auth guards
	t.Run("auth required for checkout/quote and buy-again", func(t *testing.T) {
		repo := &fakeHTTPCheckoutFulfillmentRepo{fakeHTTPMomoOrderRepo: &fakeHTTPMomoOrderRepo{fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{}}}
		router, _ := newCheckoutFulfillmentRouter(repo)

		wQuote := execOrderRequest(router, "", http.MethodPost, "/api/v1/checkout/quote", `{"addressId":"`+addrID+`"}`)
		if wQuote.Code != http.StatusUnauthorized {
			t.Fatalf("POST /checkout/quote expected 401, got %d", wQuote.Code)
		}
		wBuy := execOrderRequest(router, "", http.MethodPost, "/api/v1/orders/"+validOrderID+"/buy-again", "")
		if wBuy.Code != http.StatusUnauthorized {
			t.Fatalf("POST /orders/:id/buy-again expected 401, got %d", wBuy.Code)
		}
	})

	// 2. POST /api/v1/checkout/quote success (with voucher and without voucher) & errors
	t.Run("checkout quote endpoints and error mappings", func(t *testing.T) {
		repo := &fakeHTTPCheckoutFulfillmentRepo{
			fakeHTTPMomoOrderRepo: &fakeHTTPMomoOrderRepo{fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{}},
			quoteRes: &domain.CheckoutQuote{
				SubtotalVND:              "28990000",
				DeliveryMethod:           domain.DeliveryMethodExpress2H,
				ExpressAvailable:         true,
				StandardShippingFeeVND:   "0",
				ExpressShippingFeeVND:    "60000",
				FreeShippingThresholdVND: "5000000",
				ShippingFeeVND:           "60000",
				VoucherCode:              &voucherCode,
				VoucherType:              &voucherType,
				DiscountVND:              "1000000",
				TotalVND:                 "28050000",
			},
		}
		router, token := newCheckoutFulfillmentRouter(repo)

		quoteReq := map[string]any{
			"addressId":      addrID,
			"deliveryMethod": "express_2h",
			"voucherCode":    "AURA10",
		}
		quoteReqBytes, _ := json.Marshal(quoteReq)
		w := execOrderRequest(router, token, http.MethodPost, "/api/v1/checkout/quote", string(quoteReqBytes))
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "checkout_quote_200", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "POST /api/v1/checkout/quote", quoteReq, w)

		// Without voucher -> explicit null voucherCode & voucherType
		repo.quoteRes = &domain.CheckoutQuote{
			SubtotalVND:              "28990000",
			DeliveryMethod:           domain.DeliveryMethodStandard,
			ExpressAvailable:         true,
			StandardShippingFeeVND:   "0",
			ExpressShippingFeeVND:    "60000",
			FreeShippingThresholdVND: "5000000",
			ShippingFeeVND:           "0",
			VoucherCode:              nil,
			VoucherType:              nil,
			DiscountVND:              "0",
			TotalVND:                 "28990000",
		}
		noVoucherReq := map[string]any{
			"addressId":      addrID,
			"deliveryMethod": "standard",
		}
		noVoucherBytes, _ := json.Marshal(noVoucherReq)
		wNoV := execOrderRequest(router, token, http.MethodPost, "/api/v1/checkout/quote", string(noVoucherBytes))
		if wNoV.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", wNoV.Code, wNoV.Body.String())
		}
		if !strings.Contains(wNoV.Body.String(), `"voucherCode":null`) || !strings.Contains(wNoV.Body.String(), `"voucherType":null`) {
			t.Fatalf("expected explicit null voucherCode and voucherType, got %s", wNoV.Body.String())
		}
		assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "checkout_quote_no_voucher_200", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "POST /api/v1/checkout/quote", noVoucherReq, wNoV)

		// Error snapshots & all voucher/shipping/flashsale domain error mappings
		errorCases := []struct {
			name        string
			err         error
			status      int
			code        string
			snapshotKey string
		}{
			{"express_unavailable", domain.ErrExpressDeliveryUnavailable, http.StatusConflict, "express_delivery_unavailable", "checkout_quote_express_unavailable_409"},
			{"voucher_min_order", &domain.VoucherMinOrderError{MinOrderVND: "10000000"}, http.StatusConflict, "voucher_min_order_not_met", "checkout_quote_voucher_min_order_409"},
			{"voucher_expired", domain.ErrVoucherExpired, http.StatusConflict, "voucher_expired", "checkout_quote_voucher_expired_409"},
			{"voucher_not_found", domain.ErrVoucherNotFound, http.StatusNotFound, "voucher_not_found", "checkout_quote_voucher_not_found_404"},
			{"voucher_inactive", domain.ErrVoucherInactive, http.StatusConflict, "voucher_inactive", ""},
			{"voucher_not_started", domain.ErrVoucherNotStarted, http.StatusConflict, "voucher_not_started", ""},
			{"voucher_exhausted", domain.ErrVoucherExhausted, http.StatusConflict, "voucher_exhausted", ""},
			{"voucher_user_limit", domain.ErrVoucherUserLimitReached, http.StatusConflict, "voucher_user_limit_reached", ""},
			{"flash_sale_quota", &domain.FlashSaleQuotaExceededError{ProductName: "iPhone 16 Pro", Remaining: 2}, http.StatusConflict, "flash_sale_quota_exceeded", ""},
		}
		for _, tc := range errorCases {
			repo.quoteErr = tc.err
			wErr := execOrderRequest(router, token, http.MethodPost, "/api/v1/checkout/quote", string(quoteReqBytes))
			assertErrorEnvelope(t, wErr, tc.status, tc.code, "")
			if tc.snapshotKey != "" {
				assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, tc.snapshotKey, "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "POST /api/v1/checkout/quote", quoteReq, wErr)
			}
		}
	})

	// 3. POST /api/v1/orders (with deliveryMethod & voucherCode) + GET /api/v1/orders/:id (with timeline & tracking)
	t.Run("checkout order create and detail timeline snapshots", func(t *testing.T) {
		checkoutOrder := domain.Order{
			ID:             validOrderID,
			UserID:         orderTestUser,
			Status:         domain.OrderStatusPendingConfirmation,
			PaymentMethod:  domain.PaymentMethodCOD,
			PaymentStatus:  domain.PaymentStatusPending,
			SubtotalVND:    "28990000",
			ShippingFeeVND: "60000",
			DiscountVND:    "1000000",
			TotalVND:       "28050000",
			VoucherCode:    &voucherCode,
			VoucherType:    &voucherType,
			DeliveryMethod: domain.DeliveryMethodExpress2H,
			ShippingInfo: domain.ShippingInfo{
				RecipientName: "Nguyen Van A",
				Phone:         "0987654321",
				ProvinceName:  "Thành phố Hà Nội",
				WardName:      "Phường Phúc Xá",
				DetailAddress: "123 Cầu Giấy",
			},
			Items: []domain.OrderItem{
				{
					ID:           itemID1,
					OrderID:      validOrderID,
					VariantID:    variantID,
					ProductID:    productID,
					BrandName:    "Apple",
					ProductName:  "iPhone 16 Pro",
					Model:        "A3294",
					ImageURL:     "/media/products/550e8400-e29b-41d4-a716-446655440000.webp",
					Options:      []domain.CartOption{{GroupLabel: "Dung lượng", ValueLabel: "256GB"}},
					UnitPriceVND: "28990000",
					Quantity:     1,
					LineTotalVND: "28990000",
				},
			},
			Timeline: []domain.OrderTimelineEvent{
				{
					ID:        "evt-1",
					Status:    domain.OrderStatusPendingConfirmation,
					ActorType: domain.OrderActorCustomer,
					Note:      "Đơn hàng được tạo",
					CreatedAt: createdAt,
				},
			},
			CreatedAt: createdAt,
			UpdatedAt: createdAt,
		}

		detailedOrder := checkoutOrder
		detailedOrder.Status = domain.OrderStatusShipped
		detailedOrder.Carrier = &carrier
		detailedOrder.TrackingCode = &trackingCode
		detailedOrder.ConfirmedAt = &confirmedAt
		detailedOrder.PreparingAt = &preparingAt
		detailedOrder.ShippedAt = &shippedAt
		detailedOrder.UpdatedAt = shippedAt
		detailedOrder.Timeline = []domain.OrderTimelineEvent{
			checkoutOrder.Timeline[0],
			{
				ID:        "evt-2",
				Status:    domain.OrderStatusConfirmed,
				ActorType: domain.OrderActorSystem,
				Note:      "Đơn hàng đã được xác nhận",
				CreatedAt: confirmedAt,
			},
			{
				ID:        "evt-3",
				Status:    domain.OrderStatusPreparing,
				ActorType: domain.OrderActorAdmin,
				Note:      "Đơn hàng đang được chuẩn bị",
				CreatedAt: preparingAt,
			},
			{
				ID:        "evt-4",
				Status:    domain.OrderStatusShipped,
				ActorType: domain.OrderActorAdmin,
				Note:      "Đã bàn giao vận chuyển (Ahamove 2h - AHA-20261118)",
				CreatedAt: shippedAt,
			},
		}

		repo := &fakeHTTPCheckoutFulfillmentRepo{
			fakeHTTPMomoOrderRepo: &fakeHTTPMomoOrderRepo{
				fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{
					getByIDOrder: &detailedOrder,
				},
			},
			checkoutRes: &checkoutOrder,
		}
		router, token := newCheckoutFulfillmentRouter(repo)

		createReq := map[string]any{
			"addressId":      addrID,
			"deliveryMethod": "express_2h",
			"voucherCode":    "AURA10",
			"paymentMethod":  "cod",
			"lines": []map[string]any{
				{
					"variantId":    variantID,
					"quantity":     1,
					"productName":  "iPhone 16 Pro",
					"unitPriceVnd": "28990000",
				},
			},
		}
		createReqBytes, _ := json.Marshal(createReq)
		wCreate := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders", string(createReqBytes))
		if wCreate.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", wCreate.Code, wCreate.Body.String())
		}
		if repo.lastCheckoutIn.DeliveryMethod != domain.DeliveryMethodExpress2H || repo.lastCheckoutIn.VoucherCode != "AURA10" {
			t.Fatalf("expected express_2h and AURA10 passed to repo, got %+v", repo.lastCheckoutIn)
		}
		assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "checkout_order_create_201", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "POST /api/v1/orders", createReq, wCreate)

		wDetail := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders/"+validOrderID, "")
		if wDetail.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", wDetail.Code, wDetail.Body.String())
		}
		assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "order_detail_timeline_200", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "GET /api/v1/orders/:id", nil, wDetail)
	})

	// 4. POST /api/v1/orders/:id/buy-again
	t.Run("buy again 200 and 409 snapshots", func(t *testing.T) {
		unitPrice := domain.MoneyVND("25990000")
		lineTotal := domain.MoneyVND("51980000")
		repo := &fakeHTTPCheckoutFulfillmentRepo{
			fakeHTTPMomoOrderRepo: &fakeHTTPMomoOrderRepo{fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{}},
			buyAgainRes: &domain.BuyAgainResult{
				Cart: &domain.Cart{
					Items: []domain.CartItem{
						{
							ID:               "cart-item-1",
							VariantID:        variantID,
							ProductID:        productID,
							BrandName:        "Apple",
							ProductName:      "iPhone 16 Pro",
							Model:            "A3294",
							ImageURL:         "/media/products/550e8400-e29b-41d4-a716-446655440000.webp",
							Options:          []domain.CartOption{{GroupLabel: "Dung lượng", ValueLabel: "256GB"}},
							UnitPriceVND:     &unitPrice,
							LineTotalVND:     &lineTotal,
							StockQuantity:    2,
							Quantity:         2,
							Selected:         true,
							Availability:     domain.CartAvailable,
							IsLivePrice:      false,
							IsFlashSalePrice: true,
						},
					},
					TotalUnits:        2,
					SelectedLineCount: 1,
					SelectedTotalVND:  "51980000",
					ShippingFeeVND:    "0",
				},
				AddedCount: 1,
				AdjustedItems: []domain.BuyAgainAdjustedItem{
					{
						VariantID:         variantID,
						ProductName:       "iPhone 16 Pro",
						RequestedQuantity: 3,
						AddedQuantity:     2,
					},
				},
				SkippedItems: []domain.BuyAgainSkippedItem{
					{
						VariantID:   variantID2,
						ProductName: "Samsung Galaxy S25",
						Reason:      domain.BuyAgainSkipOutOfStock,
					},
				},
			},
		}
		router, token := newCheckoutFulfillmentRouter(repo)

		wOK := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/buy-again", "")
		if wOK.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", wOK.Code, wOK.Body.String())
		}
		assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "order_buy_again_200", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "POST /api/v1/orders/:id/buy-again", nil, wOK)

		repo.buyAgainErr = domain.ErrBuyAgainAllUnavailable
		wAllUnavail := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/buy-again", "")
		assertErrorEnvelope(t, wAllUnavail, http.StatusConflict, "buy_again_all_unavailable", "")
		assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "order_buy_again_all_unavailable_409", "API-VOUCHERS-CHECKOUT-FULFILLMENT@1", "POST /api/v1/orders/:id/buy-again", nil, wAllUnavail)

		repo.buyAgainErr = domain.ErrOrderActionNotAllowed
		wNotAllowed := execOrderRequest(router, token, http.MethodPost, "/api/v1/orders/"+validOrderID+"/buy-again", "")
		assertErrorEnvelope(t, wNotAllowed, http.StatusConflict, "order_action_not_allowed", "")
	})
}

