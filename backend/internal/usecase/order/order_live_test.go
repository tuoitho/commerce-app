package order_test

import (
	"context"
	"testing"
	"time"

	"commerce-backend/internal/domain"
	orderuc "commerce-backend/internal/usecase/order"
)

type countingQuotaObserver struct{ calls int }

func (o *countingQuotaObserver) LiveQuotaChanged(context.Context) { o.calls++ }

func TestOrderUseCase_NotifiesLiveQuotaObserver(t *testing.T) {
	const (
		userID  = "11111111-1111-1111-1111-111111111111"
		orderID = "33333333-3333-3333-3333-333333333333"
	)
	lines := []domain.OrderLineInput{{VariantID: "44444444-4444-4444-4444-444444444444", Quantity: 1, UnitPriceVND: "900000"}}
	setup := func(repo *fakeOrderRepo) (*orderuc.UseCase, *countingQuotaObserver) {
		observer := &countingQuotaObserver{}
		uc := orderuc.New(orderuc.Dependencies{Order: repo, LiveQuota: observer, OrderConfirmTimeout: 30 * time.Minute})
		return uc, observer
	}
	ctx := context.Background()

	t.Run("after an order is placed", func(t *testing.T) {
		uc, observer := setup(&fakeOrderRepo{createdOrder: &domain.Order{ID: orderID, Status: domain.OrderStatusPendingConfirmation}})
		if _, err := uc.Create(ctx, userID, "22222222-2222-2222-2222-222222222222", lines); err != nil {
			t.Fatal(err)
		}
		if observer.calls != 1 {
			t.Fatalf("calls = %d, want 1", observer.calls)
		}
	})

	t.Run("not when placing fails", func(t *testing.T) {
		uc, observer := setup(&fakeOrderRepo{createErr: &domain.LiveQuotaExceededError{ProductName: "Phone", Remaining: 1}})
		if _, err := uc.Create(ctx, userID, "22222222-2222-2222-2222-222222222222", lines); err == nil {
			t.Fatal("want error")
		}
		if observer.calls != 0 {
			t.Fatalf("calls = %d, want 0", observer.calls)
		}
	})

	t.Run("after a cancellation, not after a cancel request", func(t *testing.T) {
		uc, observer := setup(&fakeOrderRepo{cancelOrder: &domain.Order{ID: orderID, Status: domain.OrderStatusCancelled}})
		if _, err := uc.Cancel(ctx, userID, orderID); err != nil {
			t.Fatal(err)
		}
		if observer.calls != 1 {
			t.Fatalf("calls = %d, want 1", observer.calls)
		}

		uc, observer = setup(&fakeOrderRepo{cancelOrder: &domain.Order{ID: orderID, Status: domain.OrderStatusCancelRequested}})
		if _, err := uc.Cancel(ctx, userID, orderID); err != nil {
			t.Fatal(err)
		}
		if observer.calls != 0 {
			t.Fatalf("calls = %d, want 0 for a cancel request", observer.calls)
		}
	})

	t.Run("after an approved cancellation only", func(t *testing.T) {
		uc, observer := setup(&fakeOrderRepo{adminTransitionOrder: &domain.Order{ID: orderID, Status: domain.OrderStatusCancelled}})
		if _, err := uc.AdminTransition(ctx, orderID, domain.OrderAdminActionApproveCancel); err != nil {
			t.Fatal(err)
		}
		if observer.calls != 1 {
			t.Fatalf("calls = %d, want 1", observer.calls)
		}

		uc, observer = setup(&fakeOrderRepo{adminTransitionOrder: &domain.Order{ID: orderID, Status: domain.OrderStatusShipped}})
		if _, err := uc.AdminTransition(ctx, orderID, domain.OrderAdminActionShip); err != nil {
			t.Fatal(err)
		}
		if observer.calls != 0 {
			t.Fatalf("calls = %d, want 0", observer.calls)
		}
	})

	t.Run("works without an observer", func(t *testing.T) {
		uc := orderuc.New(orderuc.Dependencies{Order: &fakeOrderRepo{createdOrder: &domain.Order{ID: orderID}}})
		if _, err := uc.Create(ctx, userID, "22222222-2222-2222-2222-222222222222", lines); err != nil {
			t.Fatal(err)
		}
	})
}
