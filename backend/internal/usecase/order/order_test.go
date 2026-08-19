package order_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"commerce-backend/internal/domain"
	orderuc "commerce-backend/internal/usecase/order"
)

type fakeOrderRepo struct {
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

	autoConfirmErr        error
	lastAutoConfirmCutoff time.Time

	adminListOrders   []domain.Order
	adminListErr      error
	lastAdminStatuses []string

	adminGetByIDOrder *domain.Order
	adminGetByIDErr   error
	lastAdminGetID    string

	adminTransitionOrder  *domain.Order
	adminTransitionErr    error
	lastAdminTransitionID string
	lastAdminAction       domain.OrderAdminAction
}

func (f *fakeOrderRepo) Create(_ context.Context, userID string, addressID string, lines []domain.OrderLineInput, shippingFeeVND domain.MoneyVND) (*domain.Order, error) {
	f.lastUserID = userID
	f.lastAddrID = addressID
	f.lastLines = lines
	f.lastShipping = shippingFeeVND
	if f.createErr != nil {
		return nil, f.createErr
	}
	return f.createdOrder, nil
}

func (f *fakeOrderRepo) GetByID(_ context.Context, userID, orderID string) (*domain.Order, error) {
	f.lastUserID = userID
	f.lastGetID = orderID
	if f.getByIDErr != nil {
		return nil, f.getByIDErr
	}
	return f.getByIDOrder, nil
}

func (f *fakeOrderRepo) ListByUser(_ context.Context, userID string, bucket domain.OrderStatusBucket) ([]domain.Order, error) {
	f.lastUserID = userID
	f.lastListBucket = bucket
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.listOrders, nil
}

func (f *fakeOrderRepo) StatsByUser(_ context.Context, userID string) (domain.OrderStats, error) {
	f.lastStatsUser = userID
	if f.statsErr != nil {
		return domain.OrderStats{}, f.statsErr
	}
	return f.stats, nil
}

func (f *fakeOrderRepo) Cancel(_ context.Context, userID, orderID string) (*domain.Order, error) {
	f.lastUserID = userID
	f.lastCancelID = orderID
	if f.cancelErr != nil {
		return nil, f.cancelErr
	}
	return f.cancelOrder, nil
}

func (f *fakeOrderRepo) UndoCancelRequest(_ context.Context, userID, orderID string) (*domain.Order, error) {
	f.lastUserID = userID
	f.lastUndoID = orderID
	if f.undoErr != nil {
		return nil, f.undoErr
	}
	return f.undoOrder, nil
}

func (f *fakeOrderRepo) AutoConfirmDue(_ context.Context, cutoff time.Time) error {
	f.lastAutoConfirmCutoff = cutoff
	return f.autoConfirmErr
}

func (f *fakeOrderRepo) ListByAdmin(_ context.Context, statuses []string) ([]domain.Order, error) {
	f.lastAdminStatuses = statuses
	if f.adminListErr != nil {
		return nil, f.adminListErr
	}
	return f.adminListOrders, nil
}

func (f *fakeOrderRepo) GetByAdminID(_ context.Context, orderID string) (*domain.Order, error) {
	f.lastAdminGetID = orderID
	if f.adminGetByIDErr != nil {
		return nil, f.adminGetByIDErr
	}
	return f.adminGetByIDOrder, nil
}

func (f *fakeOrderRepo) AdminTransition(_ context.Context, orderID string, action domain.OrderAdminAction) (*domain.Order, error) {
	f.lastAdminTransitionID = orderID
	f.lastAdminAction = action
	if f.adminTransitionErr != nil {
		return nil, f.adminTransitionErr
	}
	return f.adminTransitionOrder, nil
}


func TestOrderUseCase_Create_Validation(t *testing.T) {
	fakeRepo := &fakeOrderRepo{}
	uc := orderuc.New(orderuc.Dependencies{
		Order:               fakeRepo,
		ShippingFeeVND:      "30000",
		OrderConfirmTimeout: 30 * time.Minute,
	})
	ctx := context.Background()

	t.Run("empty lines returns ErrCartEmpty", func(t *testing.T) {
		_, err := uc.Create(ctx, "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", nil)
		if !errors.Is(err, domain.ErrCartEmpty) {
			t.Errorf("expected ErrCartEmpty, got %v", err)
		}

		_, err = uc.Create(ctx, "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", []domain.OrderLineInput{})
		if !errors.Is(err, domain.ErrCartEmpty) {
			t.Errorf("expected ErrCartEmpty, got %v", err)
		}
	})

	t.Run("invalid address UUID returns ValidationError", func(t *testing.T) {
		lines := []domain.OrderLineInput{
			{
				VariantID:    "33333333-3333-3333-3333-333333333333",
				Quantity:     1,
				ProductName:  "iPhone 15",
				UnitPriceVND: "20000000",
			},
		}

		_, err := uc.Create(ctx, "11111111-1111-1111-1111-111111111111", "invalid-uuid", lines)
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError, got %v", err)
		}
		if _, ok := valErr.Fields["address_id"]; !ok {
			t.Errorf("expected address_id field error, got %+v", valErr.Fields)
		}
	})

	t.Run("invalid variant UUID in lines returns ValidationError", func(t *testing.T) {
		lines := []domain.OrderLineInput{
			{
				VariantID:    "not-a-uuid",
				Quantity:     1,
				ProductName:  "iPhone 15",
				UnitPriceVND: "20000000",
			},
		}

		_, err := uc.Create(ctx, "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", lines)
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError, got %v", err)
		}
		if _, ok := valErr.Fields["lines"]; !ok {
			t.Errorf("expected lines field error, got %+v", valErr.Fields)
		}
	})

	t.Run("zero or negative quantity in lines returns ValidationError", func(t *testing.T) {
		invalidQuantities := []int64{0, -1, -10}
		for _, q := range invalidQuantities {
			lines := []domain.OrderLineInput{
				{
					VariantID:    "33333333-3333-3333-3333-333333333333",
					Quantity:     q,
					ProductName:  "iPhone 15",
					UnitPriceVND: "20000000",
				},
			}

			_, err := uc.Create(ctx, "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", lines)
			var valErr *domain.ValidationError
			if !errors.As(err, &valErr) {
				t.Fatalf("expected ValidationError for quantity %d, got %v", q, err)
			}
			if _, ok := valErr.Fields["lines"]; !ok {
				t.Errorf("expected lines field error, got %+v", valErr.Fields)
			}
		}
	})
}

func TestOrderUseCase_Create_Success(t *testing.T) {
	now := time.Now().UTC()
	expectedOrder := &domain.Order{
		ID:             "order-12345",
		UserID:         "11111111-1111-1111-1111-111111111111",
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
				VariantID:    "33333333-3333-3333-3333-333333333333",
				ProductID:    "44444444-4444-4444-4444-444444444444",
				BrandName:    "Apple",
				ProductName:  "iPhone 15",
				Model:        "128GB",
				ImageURL:     "https://example.com/img.jpg",
				UnitPriceVND: "20000000",
				Quantity:     1,
				LineTotalVND: "20000000",
			},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	fakeRepo := &fakeOrderRepo{
		createdOrder: expectedOrder,
	}

	timeout := 30 * time.Minute
	uc := orderuc.New(orderuc.Dependencies{
		Order:               fakeRepo,
		ShippingFeeVND:      "30000",
		OrderConfirmTimeout: timeout,
	})
	ctx := context.Background()

	lines := []domain.OrderLineInput{
		{
			VariantID:    "33333333-3333-3333-3333-333333333333",
			Quantity:     1,
			ProductName:  "iPhone 15",
			UnitPriceVND: "20000000",
		},
	}

	order, err := uc.Create(ctx, "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", lines)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if fakeRepo.lastUserID != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("expected userID %s, got %s", "11111111-1111-1111-1111-111111111111", fakeRepo.lastUserID)
	}
	if fakeRepo.lastAddrID != "22222222-2222-2222-2222-222222222222" {
		t.Errorf("expected addressID %s, got %s", "22222222-2222-2222-2222-222222222222", fakeRepo.lastAddrID)
	}
	if fakeRepo.lastShipping != "30000" {
		t.Errorf("expected shipping fee %s, got %s", "30000", fakeRepo.lastShipping)
	}
	if !reflect.DeepEqual(fakeRepo.lastLines, lines) {
		t.Errorf("expected lines %+v, got %+v", lines, fakeRepo.lastLines)
	}

	if order.CancellableUntil == nil {
		t.Fatal("expected CancellableUntil to be set for pending_confirmation status")
	}
	expectedUntil := now.Add(timeout)
	if !order.CancellableUntil.Equal(expectedUntil) {
		t.Errorf("expected CancellableUntil %v, got %v", expectedUntil, *order.CancellableUntil)
	}
}

func TestOrderUseCase_Create_ErrorPropagation(t *testing.T) {
	ctx := context.Background()
	lines := []domain.OrderLineInput{
		{
			VariantID:    "33333333-3333-3333-3333-333333333333",
			Quantity:     1,
			ProductName:  "iPhone 15",
			UnitPriceVND: "20000000",
		},
	}

	testCases := []struct {
		name        string
		repoErr     error
		expectedErr error
	}{
		{
			name:        "ProductChangedError",
			repoErr:     domain.NewProductChangedError([]string{"iPhone 15"}),
			expectedErr: domain.NewProductChangedError([]string{"iPhone 15"}),
		},
		{
			name:        "ErrOutOfStock",
			repoErr:     domain.ErrOutOfStock,
			expectedErr: domain.ErrOutOfStock,
		},
		{
			name:        "ErrStockLimit",
			repoErr:     domain.ErrStockLimit,
			expectedErr: domain.ErrStockLimit,
		},
		{
			name:        "ErrAddressNotFound",
			repoErr:     domain.ErrAddressNotFound,
			expectedErr: domain.ErrAddressNotFound,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			fakeRepo := &fakeOrderRepo{createErr: tc.repoErr}
			uc := orderuc.New(orderuc.Dependencies{
				Order:               fakeRepo,
				ShippingFeeVND:      "0",
				OrderConfirmTimeout: 30 * time.Minute,
			})

			_, err := uc.Create(ctx, "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", lines)
			if !errors.Is(err, tc.expectedErr) {
				var prodErr *domain.ProductChangedError
				if errors.As(err, &prodErr) && errors.As(tc.expectedErr, &prodErr) {
					// both are ProductChangedError
					if !reflect.DeepEqual(prodErr.Products, tc.expectedErr.(*domain.ProductChangedError).Products) {
						t.Errorf("expected product changed products %+v, got %+v", tc.expectedErr.(*domain.ProductChangedError).Products, prodErr.Products)
					}
				} else {
					t.Errorf("expected error %v, got %v", tc.expectedErr, err)
				}
			}
		})
	}
}

func TestOrderUseCase_GetByID(t *testing.T) {
	ctx := context.Background()
	userID := "11111111-1111-1111-1111-111111111111"
	validOrderID := "22222222-2222-2222-2222-222222222222"
	now := time.Now().UTC()
	timeout := 30 * time.Minute

	t.Run("invalid or empty order ID returns ErrOrderNotFound", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			ShippingFeeVND:      "0",
			OrderConfirmTimeout: timeout,
		})

		invalidIDs := []string{"", "   ", "not-a-uuid", "123"}
		for _, id := range invalidIDs {
			_, err := uc.GetByID(ctx, userID, id)
			if !errors.Is(err, domain.ErrOrderNotFound) {
				t.Errorf("expected ErrOrderNotFound for id %q, got %v", id, err)
			}
		}
	})

	t.Run("repo returns ErrOrderNotFound when order not found or not owned", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{getByIDErr: domain.ErrOrderNotFound}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			ShippingFeeVND:      "0",
			OrderConfirmTimeout: timeout,
		})

		_, err := uc.GetByID(ctx, userID, validOrderID)
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
	})

	t.Run("order with pending_confirmation status populates CancellableUntil", func(t *testing.T) {
		repoOrder := &domain.Order{
			ID:          validOrderID,
			UserID:      userID,
			Status:      domain.OrderStatusPendingConfirmation,
			CreatedAt:   now,
			SubtotalVND: "100000",
			TotalVND:    "100000",
		}
		fakeRepo := &fakeOrderRepo{getByIDOrder: repoOrder}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			ShippingFeeVND:      "0",
			OrderConfirmTimeout: timeout,
		})

		order, err := uc.GetByID(ctx, userID, validOrderID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if order.CancellableUntil == nil {
			t.Fatal("expected CancellableUntil to be populated for pending_confirmation")
		}
		expectedUntil := now.Add(timeout)
		if !order.CancellableUntil.Equal(expectedUntil) {
			t.Errorf("expected CancellableUntil %v, got %v", expectedUntil, *order.CancellableUntil)
		}
	})

	t.Run("order with other status does not populate CancellableUntil", func(t *testing.T) {
		statuses := []domain.OrderStatus{
			domain.OrderStatusConfirmed,
			domain.OrderStatusPreparing,
			domain.OrderStatusCancelRequested,
			domain.OrderStatusShipped,
			domain.OrderStatusDelivered,
			domain.OrderStatusCancelled,
			domain.OrderStatusReturned,
		}

		for _, status := range statuses {
			repoOrder := &domain.Order{
				ID:          validOrderID,
				UserID:      userID,
				Status:      status,
				CreatedAt:   now,
				SubtotalVND: "100000",
				TotalVND:    "100000",
			}
			fakeRepo := &fakeOrderRepo{getByIDOrder: repoOrder}
			uc := orderuc.New(orderuc.Dependencies{
				Order:               fakeRepo,
				ShippingFeeVND:      "0",
				OrderConfirmTimeout: timeout,
			})

			order, err := uc.GetByID(ctx, userID, validOrderID)
			if err != nil {
				t.Fatalf("status %s: unexpected error: %v", status, err)
			}
			if order.CancellableUntil != nil {
				t.Errorf("status %s: expected CancellableUntil to be nil, got %v", status, *order.CancellableUntil)
			}
		}
	})
}

func TestOrderUseCase_List(t *testing.T) {
	ctx := context.Background()
	userID := "11111111-1111-1111-1111-111111111111"
	now := time.Now().UTC()
	timeout := 30 * time.Minute

	t.Run("invalid bucket returns ValidationError", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			ShippingFeeVND:      "0",
			OrderConfirmTimeout: timeout,
		})

		_, err := uc.List(ctx, userID, domain.OrderStatusBucket("invalid_bucket"))
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError, got %v", err)
		}
		if _, ok := valErr.Fields["status"]; !ok {
			t.Errorf("expected status field error, got %+v", valErr.Fields)
		}
	})

	t.Run("empty bucket defaults to all", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{listOrders: []domain.Order{}}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			ShippingFeeVND:      "0",
			OrderConfirmTimeout: timeout,
		})

		_, err := uc.List(ctx, userID, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if fakeRepo.lastListBucket != domain.OrderStatusBucketAll {
			t.Errorf("expected bucket %s, got %s", domain.OrderStatusBucketAll, fakeRepo.lastListBucket)
		}
	})

	t.Run("valid bucket passes through", func(t *testing.T) {
		buckets := []domain.OrderStatusBucket{
			domain.OrderStatusBucketAll,
			domain.OrderStatusBucketPending,
			domain.OrderStatusBucketPickup,
			domain.OrderStatusBucketDelivery,
			domain.OrderStatusBucketDelivered,
			domain.OrderStatusBucketReturns,
			domain.OrderStatusBucketCancelled,
		}

		for _, b := range buckets {
			fakeRepo := &fakeOrderRepo{listOrders: []domain.Order{}}
			uc := orderuc.New(orderuc.Dependencies{
				Order:               fakeRepo,
				ShippingFeeVND:      "0",
				OrderConfirmTimeout: timeout,
			})

			_, err := uc.List(ctx, userID, b)
			if err != nil {
				t.Fatalf("bucket %s: unexpected error: %v", b, err)
			}
			if fakeRepo.lastListBucket != b {
				t.Errorf("expected bucket %s, got %s", b, fakeRepo.lastListBucket)
			}
		}
	})

	t.Run("orders populate CancellableUntil based on status", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{
			listOrders: []domain.Order{
				{
					ID:        "order-1",
					UserID:    userID,
					Status:    domain.OrderStatusPendingConfirmation,
					CreatedAt: now,
				},
				{
					ID:        "order-2",
					UserID:    userID,
					Status:    domain.OrderStatusConfirmed,
					CreatedAt: now,
				},
			},
		}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			ShippingFeeVND:      "0",
			OrderConfirmTimeout: timeout,
		})

		orders, err := uc.List(ctx, userID, domain.OrderStatusBucketAll)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(orders) != 2 {
			t.Fatalf("expected 2 orders, got %d", len(orders))
		}

		if orders[0].CancellableUntil == nil {
			t.Errorf("order-1: expected CancellableUntil to be populated")
		} else {
			expected := now.Add(timeout)
			if !orders[0].CancellableUntil.Equal(expected) {
				t.Errorf("order-1: expected CancellableUntil %v, got %v", expected, *orders[0].CancellableUntil)
			}
		}

		if orders[1].CancellableUntil != nil {
			t.Errorf("order-2: expected CancellableUntil to be nil, got %v", *orders[1].CancellableUntil)
		}
	})
}

func TestOrderUseCase_Stats(t *testing.T) {
	ctx := context.Background()
	userID := "11111111-1111-1111-1111-111111111111"

	t.Run("success returns OrderStats", func(t *testing.T) {
		expectedStats := domain.OrderStats{
			PendingConfirmation: 2,
			AwaitingPickup:      5,
			AwaitingDelivery:    1,
			AwaitingReview:      3,
		}
		fakeRepo := &fakeOrderRepo{stats: expectedStats}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			ShippingFeeVND:      "0",
			OrderConfirmTimeout: 30 * time.Minute,
		})

		stats, err := uc.Stats(ctx, userID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if fakeRepo.lastStatsUser != userID {
			t.Errorf("expected userID %s, got %s", userID, fakeRepo.lastStatsUser)
		}
		if stats != expectedStats {
			t.Errorf("expected stats %+v, got %+v", expectedStats, stats)
		}
	})

	t.Run("repo error propagates", func(t *testing.T) {
		customErr := errors.New("db error")
		fakeRepo := &fakeOrderRepo{statsErr: customErr}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			ShippingFeeVND:      "0",
			OrderConfirmTimeout: 30 * time.Minute,
		})

		_, err := uc.Stats(ctx, userID)
		if !errors.Is(err, customErr) {
			t.Errorf("expected error %v, got %v", customErr, err)
		}
	})
}

func TestOrderUseCase_Cancel(t *testing.T) {
	ctx := context.Background()
	userID := "11111111-1111-1111-1111-111111111111"
	validOrderID := "22222222-2222-2222-2222-222222222222"
	now := time.Now().UTC()

	t.Run("invalid order UUID returns ErrOrderNotFound", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		invalidIDs := []string{"", "invalid-uuid", "123", "   "}
		for _, id := range invalidIDs {
			_, err := uc.Cancel(ctx, userID, id)
			if !errors.Is(err, domain.ErrOrderNotFound) {
				t.Errorf("id %q: expected ErrOrderNotFound, got %v", id, err)
			}
		}
	})

	t.Run("order not found or not owned returns ErrOrderNotFound", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{cancelErr: domain.ErrOrderNotFound}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		_, err := uc.Cancel(ctx, userID, validOrderID)
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
		if fakeRepo.lastCancelID != validOrderID || fakeRepo.lastUserID != userID {
			t.Errorf("expected repo called with user %s, order %s; got user %s, order %s", userID, validOrderID, fakeRepo.lastUserID, fakeRepo.lastCancelID)
		}
	})

	t.Run("cancel pending_confirmation returns cancelled order", func(t *testing.T) {
		cancelledOrder := &domain.Order{
			ID:          validOrderID,
			UserID:      userID,
			Status:      domain.OrderStatusCancelled,
			CancelledAt: &now,
			Items: []domain.OrderItem{
				{
					ID:        "item-1",
					VariantID: "33333333-3333-3333-3333-333333333333",
					Quantity:  2,
				},
			},
		}
		fakeRepo := &fakeOrderRepo{cancelOrder: cancelledOrder}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		res, err := uc.Cancel(ctx, userID, validOrderID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Status != domain.OrderStatusCancelled {
			t.Errorf("expected status cancelled, got %s", res.Status)
		}
		if res.CancelledAt == nil {
			t.Errorf("expected CancelledAt to be set")
		}
	})

	t.Run("cancel confirmed returns cancelled order", func(t *testing.T) {
		cancelledOrder := &domain.Order{
			ID:          validOrderID,
			UserID:      userID,
			Status:      domain.OrderStatusCancelled,
			CancelledAt: &now,
		}
		fakeRepo := &fakeOrderRepo{cancelOrder: cancelledOrder}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		res, err := uc.Cancel(ctx, userID, validOrderID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Status != domain.OrderStatusCancelled {
			t.Errorf("expected status cancelled, got %s", res.Status)
		}
	})

	t.Run("cancel preparing returns cancel_requested order", func(t *testing.T) {
		cancelRequestedOrder := &domain.Order{
			ID:     validOrderID,
			UserID: userID,
			Status: domain.OrderStatusCancelRequested,
		}
		fakeRepo := &fakeOrderRepo{cancelOrder: cancelRequestedOrder}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		res, err := uc.Cancel(ctx, userID, validOrderID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Status != domain.OrderStatusCancelRequested {
			t.Errorf("expected status cancel_requested, got %s", res.Status)
		}
	})

	t.Run("cancel non-cancellable statuses returns ErrOrderNotCancellable", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{cancelErr: domain.ErrOrderNotCancellable}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		_, err := uc.Cancel(ctx, userID, validOrderID)
		if !errors.Is(err, domain.ErrOrderNotCancellable) {
			t.Errorf("expected ErrOrderNotCancellable, got %v", err)
		}
	})
}

func TestOrderUseCase_UndoCancel(t *testing.T) {
	ctx := context.Background()
	userID := "11111111-1111-1111-1111-111111111111"
	validOrderID := "22222222-2222-2222-2222-222222222222"

	t.Run("invalid order UUID returns ErrOrderNotFound", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		invalidIDs := []string{"", "invalid-uuid", "123", "   "}
		for _, id := range invalidIDs {
			_, err := uc.UndoCancel(ctx, userID, id)
			if !errors.Is(err, domain.ErrOrderNotFound) {
				t.Errorf("id %q: expected ErrOrderNotFound, got %v", id, err)
			}
		}
	})

	t.Run("order not found or not owned returns ErrOrderNotFound", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{undoErr: domain.ErrOrderNotFound}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		_, err := uc.UndoCancel(ctx, userID, validOrderID)
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
	})

	t.Run("undo cancel on cancel_requested returns preparing order", func(t *testing.T) {
		preparingOrder := &domain.Order{
			ID:     validOrderID,
			UserID: userID,
			Status: domain.OrderStatusPreparing,
		}
		fakeRepo := &fakeOrderRepo{undoOrder: preparingOrder}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		res, err := uc.UndoCancel(ctx, userID, validOrderID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Status != domain.OrderStatusPreparing {
			t.Errorf("expected status preparing, got %s", res.Status)
		}
		if fakeRepo.lastUndoID != validOrderID || fakeRepo.lastUserID != userID {
			t.Errorf("expected repo called with user %s, order %s; got user %s, order %s", userID, validOrderID, fakeRepo.lastUserID, fakeRepo.lastUndoID)
		}
	})

	t.Run("undo cancel on other statuses returns ErrOrderNotCancelRequested", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{undoErr: domain.ErrOrderNotCancelRequested}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		_, err := uc.UndoCancel(ctx, userID, validOrderID)
		if !errors.Is(err, domain.ErrOrderNotCancelRequested) {
			t.Errorf("expected ErrOrderNotCancelRequested, got %v", err)
		}
	})
}

func TestOrderUseCase_AutoConfirmDue(t *testing.T) {
	ctx := context.Background()
	cutoff := time.Now().UTC().Add(-30 * time.Minute)

	t.Run("success delegates cutoff to repo", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		err := uc.AutoConfirmDue(ctx, cutoff)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !fakeRepo.lastAutoConfirmCutoff.Equal(cutoff) {
			t.Errorf("expected cutoff %v, got %v", cutoff, fakeRepo.lastAutoConfirmCutoff)
		}
	})

	t.Run("error from repo propagates", func(t *testing.T) {
		customErr := errors.New("db error")
		fakeRepo := &fakeOrderRepo{autoConfirmErr: customErr}
		uc := orderuc.New(orderuc.Dependencies{
			Order: fakeRepo,
		})

		err := uc.AutoConfirmDue(ctx, cutoff)
		if !errors.Is(err, customErr) {
			t.Errorf("expected error %v, got %v", customErr, err)
		}
	})
}

func TestOrderUseCase_AdminList(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC()

	t.Run("invalid status returns ValidationError", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		invalidStatuses := []string{"invalid_status", "foo", "PENDING_CONFIRMATION", "123"}
		for _, status := range invalidStatuses {
			_, err := uc.AdminList(ctx, status)
			var valErr *domain.ValidationError
			if !errors.As(err, &valErr) {
				t.Fatalf("status %q: expected ValidationError, got %v", status, err)
			}
			if msg, ok := valErr.Fields["status"]; !ok || msg != "Trạng thái đơn hàng không hợp lệ" {
				t.Errorf("status %q: expected status error message 'Trạng thái đơn hàng không hợp lệ', got %+v", status, valErr.Fields)
			}
		}
	})

	t.Run("empty status passes nil to repo and returns orders without CancellableUntil", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{
			adminListOrders: []domain.Order{
				{
					ID:         "11111111-1111-1111-1111-111111111111",
					BuyerEmail: "user@example.com",
					Status:     domain.OrderStatusPendingConfirmation,
					CreatedAt:  now,
				},
				{
					ID:         "22222222-2222-2222-2222-222222222222",
					BuyerEmail: "user2@example.com",
					Status:     domain.OrderStatusConfirmed,
					CreatedAt:  now,
				},
			},
		}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			OrderConfirmTimeout: 30 * time.Minute,
		})

		orders, err := uc.AdminList(ctx, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if fakeRepo.lastAdminStatuses != nil {
			t.Errorf("expected nil statuses, got %+v", fakeRepo.lastAdminStatuses)
		}
		if len(orders) != 2 {
			t.Fatalf("expected 2 orders, got %d", len(orders))
		}
		for i, o := range orders {
			if o.CancellableUntil != nil {
				t.Errorf("orders[%d]: expected CancellableUntil to be nil for admin list, got %v", i, *o.CancellableUntil)
			}
		}
	})

	t.Run("valid status passes slice to repo", func(t *testing.T) {
		validStatuses := []domain.OrderStatus{
			domain.OrderStatusPendingConfirmation,
			domain.OrderStatusConfirmed,
			domain.OrderStatusPreparing,
			domain.OrderStatusCancelRequested,
			domain.OrderStatusShipped,
			domain.OrderStatusDelivered,
			domain.OrderStatusCancelled,
			domain.OrderStatusReturned,
		}

		for _, status := range validStatuses {
			fakeRepo := &fakeOrderRepo{
				adminListOrders: []domain.Order{
					{
						ID:         "11111111-1111-1111-1111-111111111111",
						BuyerEmail: "user@example.com",
						Status:     status,
						CreatedAt:  now,
					},
				},
			}
			uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

			orders, err := uc.AdminList(ctx, string(status))
			if err != nil {
				t.Fatalf("status %s: unexpected error: %v", status, err)
			}
			if len(fakeRepo.lastAdminStatuses) != 1 || fakeRepo.lastAdminStatuses[0] != string(status) {
				t.Errorf("expected statuses [%s], got %+v", status, fakeRepo.lastAdminStatuses)
			}
			if len(orders) != 1 {
				t.Fatalf("expected 1 order, got %d", len(orders))
			}
			if orders[0].CancellableUntil != nil {
				t.Errorf("expected CancellableUntil to be nil, got %v", *orders[0].CancellableUntil)
			}
		}
	})

	t.Run("nil orders from repo returns empty slice", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{adminListOrders: nil}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		orders, err := uc.AdminList(ctx, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if orders == nil {
			t.Errorf("expected non-nil empty slice, got nil")
		}
		if len(orders) != 0 {
			t.Errorf("expected 0 orders, got %d", len(orders))
		}
	})

	t.Run("repo error propagates", func(t *testing.T) {
		customErr := errors.New("db query error")
		fakeRepo := &fakeOrderRepo{adminListErr: customErr}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		_, err := uc.AdminList(ctx, "")
		if !errors.Is(err, customErr) {
			t.Errorf("expected error %v, got %v", customErr, err)
		}
	})
}

func TestOrderUseCase_AdminGetByID(t *testing.T) {
	ctx := context.Background()
	validOrderID := "22222222-2222-2222-2222-222222222222"
	now := time.Now().UTC()

	t.Run("invalid UUID returns ErrOrderNotFound", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		invalidIDs := []string{"", "   ", "not-a-uuid", "123"}
		for _, id := range invalidIDs {
			_, err := uc.AdminGetByID(ctx, id)
			if !errors.Is(err, domain.ErrOrderNotFound) {
				t.Errorf("id %q: expected ErrOrderNotFound, got %v", id, err)
			}
		}
	})

	t.Run("repo returns ErrOrderNotFound", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{adminGetByIDErr: domain.ErrOrderNotFound}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		_, err := uc.AdminGetByID(ctx, validOrderID)
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
		if fakeRepo.lastAdminGetID != validOrderID {
			t.Errorf("expected repo called with order ID %s, got %s", validOrderID, fakeRepo.lastAdminGetID)
		}
	})

	t.Run("valid UUID returns order without setting CancellableUntil", func(t *testing.T) {
		expectedOrder := &domain.Order{
			ID:          validOrderID,
			UserID:      "11111111-1111-1111-1111-111111111111",
			BuyerEmail:  "buyer@example.com",
			Status:      domain.OrderStatusPendingConfirmation,
			CreatedAt:   now,
			SubtotalVND: "500000",
			TotalVND:    "500000",
		}
		fakeRepo := &fakeOrderRepo{adminGetByIDOrder: expectedOrder}
		uc := orderuc.New(orderuc.Dependencies{
			Order:               fakeRepo,
			OrderConfirmTimeout: 30 * time.Minute,
		})

		order, err := uc.AdminGetByID(ctx, validOrderID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if order == nil {
			t.Fatal("expected order, got nil")
		}
		if order.ID != validOrderID {
			t.Errorf("expected ID %s, got %s", validOrderID, order.ID)
		}
		if order.BuyerEmail != "buyer@example.com" {
			t.Errorf("expected buyer email buyer@example.com, got %s", order.BuyerEmail)
		}
		if order.CancellableUntil != nil {
			t.Errorf("expected CancellableUntil to be nil for admin get, got %v", *order.CancellableUntil)
		}
	})

	t.Run("repo error propagates", func(t *testing.T) {
		customErr := errors.New("db error")
		fakeRepo := &fakeOrderRepo{adminGetByIDErr: customErr}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		_, err := uc.AdminGetByID(ctx, validOrderID)
		if !errors.Is(err, customErr) {
			t.Errorf("expected error %v, got %v", customErr, err)
		}
	})
}

func TestOrderUseCase_AdminTransition(t *testing.T) {
	ctx := context.Background()
	validOrderID := "22222222-2222-2222-2222-222222222222"
	now := time.Now().UTC()

	t.Run("invalid UUID returns ErrOrderNotFound", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		invalidIDs := []string{"", "   ", "not-a-uuid", "123"}
		for _, id := range invalidIDs {
			_, err := uc.AdminTransition(ctx, id, domain.OrderAdminActionConfirmPreparing)
			if !errors.Is(err, domain.ErrOrderNotFound) {
				t.Errorf("id %q: expected ErrOrderNotFound, got %v", id, err)
			}
		}
	})

	t.Run("invalid action returns ValidationError", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		invalidActions := []domain.OrderAdminAction{
			"",
			"invalid_action",
			"cancel",
			"SHIP",
		}
		for _, action := range invalidActions {
			_, err := uc.AdminTransition(ctx, validOrderID, action)
			var valErr *domain.ValidationError
			if !errors.As(err, &valErr) {
				t.Fatalf("action %q: expected ValidationError, got %v", action, err)
			}
			if msg, ok := valErr.Fields["action"]; !ok || msg != "Thao tác không hợp lệ" {
				t.Errorf("action %q: expected action error message 'Thao tác không hợp lệ', got %+v", action, valErr.Fields)
			}
		}
	})

	t.Run("valid actions delegate to repo and return order without CancellableUntil", func(t *testing.T) {
		actions := []struct {
			action domain.OrderAdminAction
			status domain.OrderStatus
		}{
			{domain.OrderAdminActionConfirmPreparing, domain.OrderStatusPreparing},
			{domain.OrderAdminActionShip, domain.OrderStatusShipped},
			{domain.OrderAdminActionDeliver, domain.OrderStatusDelivered},
			{domain.OrderAdminActionApproveCancel, domain.OrderStatusCancelled},
			{domain.OrderAdminActionDeclineCancel, domain.OrderStatusPreparing},
		}

		for _, tc := range actions {
			repoOrder := &domain.Order{
				ID:         validOrderID,
				BuyerEmail: "buyer@example.com",
				Status:     tc.status,
				CreatedAt:  now,
			}
			fakeRepo := &fakeOrderRepo{adminTransitionOrder: repoOrder}
			uc := orderuc.New(orderuc.Dependencies{
				Order:               fakeRepo,
				OrderConfirmTimeout: 30 * time.Minute,
			})

			res, err := uc.AdminTransition(ctx, validOrderID, tc.action)
			if err != nil {
				t.Fatalf("action %s: unexpected error: %v", tc.action, err)
			}
			if fakeRepo.lastAdminTransitionID != validOrderID {
				t.Errorf("action %s: expected orderID %s, got %s", tc.action, validOrderID, fakeRepo.lastAdminTransitionID)
			}
			if fakeRepo.lastAdminAction != tc.action {
				t.Errorf("action %s: expected action %s, got %s", tc.action, tc.action, fakeRepo.lastAdminAction)
			}
			if res == nil || res.Status != tc.status {
				t.Errorf("action %s: expected status %s, got %+v", tc.action, tc.status, res)
			}
			if res.CancellableUntil != nil {
				t.Errorf("action %s: expected CancellableUntil to be nil, got %v", tc.action, *res.CancellableUntil)
			}
		}
	})

	t.Run("repo returns ErrOrderActionNotAllowed", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{adminTransitionErr: domain.ErrOrderActionNotAllowed}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		_, err := uc.AdminTransition(ctx, validOrderID, domain.OrderAdminActionShip)
		if !errors.Is(err, domain.ErrOrderActionNotAllowed) {
			t.Errorf("expected ErrOrderActionNotAllowed, got %v", err)
		}
	})

	t.Run("repo returns ErrOrderNotFound", func(t *testing.T) {
		fakeRepo := &fakeOrderRepo{adminTransitionErr: domain.ErrOrderNotFound}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		_, err := uc.AdminTransition(ctx, validOrderID, domain.OrderAdminActionShip)
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
	})

	t.Run("repo error propagates", func(t *testing.T) {
		customErr := errors.New("db error")
		fakeRepo := &fakeOrderRepo{adminTransitionErr: customErr}
		uc := orderuc.New(orderuc.Dependencies{Order: fakeRepo})

		_, err := uc.AdminTransition(ctx, validOrderID, domain.OrderAdminActionShip)
		if !errors.Is(err, customErr) {
			t.Errorf("expected error %v, got %v", customErr, err)
		}
	})
}



