package repository_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository"
)

func TestOrderRepository_InvalidUUIDHandling(t *testing.T) {
	repo := repository.NewOrderRepository(nil)
	ctx := context.Background()

	t.Run("GetByID returns ErrOrderNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.GetByID(ctx, "invalid-user", "invalid-order")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}

		_, err = repo.GetByID(ctx, "11111111-1111-1111-1111-111111111111", "invalid-order")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
	})

	t.Run("ListByUser returns empty slice for invalid user UUID", func(t *testing.T) {
		orders, err := repo.ListByUser(ctx, "invalid-user", domain.OrderStatusBucketAll)
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		if len(orders) != 0 {
			t.Errorf("expected empty orders slice, got %d", len(orders))
		}
	})

	t.Run("StatsByUser returns zero stats for invalid user UUID", func(t *testing.T) {
		stats, err := repo.StatsByUser(ctx, "invalid-user")
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		if stats != (domain.OrderStats{}) {
			t.Errorf("expected zero stats, got %+v", stats)
		}
	})

	t.Run("Cancel returns ErrOrderNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.Cancel(ctx, "invalid-user", "invalid-order")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}

		_, err = repo.Cancel(ctx, "11111111-1111-1111-1111-111111111111", "invalid-order")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}

		_, err = repo.Cancel(ctx, "invalid-user", "22222222-2222-2222-2222-222222222222")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
	})

	t.Run("UndoCancelRequest returns ErrOrderNotFound for invalid UUID", func(t *testing.T) {
		_, err := repo.UndoCancelRequest(ctx, "invalid-user", "invalid-order")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}

		_, err = repo.UndoCancelRequest(ctx, "11111111-1111-1111-1111-111111111111", "invalid-order")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}

		_, err = repo.UndoCancelRequest(ctx, "invalid-user", "22222222-2222-2222-2222-222222222222")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Errorf("expected ErrOrderNotFound, got %v", err)
		}
	})
}

type fakeOrderDB struct {
	execErr  error
	lastSQL  string
	lastArgs []any
}

func (f *fakeOrderDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.lastSQL = sql
	f.lastArgs = args
	return pgconn.NewCommandTag("UPDATE 1"), f.execErr
}

func (f *fakeOrderDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	f.lastSQL = sql
	f.lastArgs = args
	if f.execErr != nil {
		return nil, f.execErr
	}
	return nil, errors.New("not implemented")
}

func (f *fakeOrderDB) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	return nil
}

func (f *fakeOrderDB) Begin(_ context.Context) (pgx.Tx, error) {
	return nil, errors.New("not implemented")
}

func TestOrderRepository_AutoConfirmDue(t *testing.T) {
	ctx := context.Background()
	cutoff := time.Now().UTC().Add(-30 * time.Minute)

	t.Run("successful execution delegates to query", func(t *testing.T) {
		db := &fakeOrderDB{}
		repo := repository.NewOrderRepository(db)

		err := repo.AutoConfirmDue(ctx, cutoff)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(db.lastArgs) != 1 {
			t.Fatalf("expected 1 arg passed to Exec, got %d", len(db.lastArgs))
		}
		argTime, ok := db.lastArgs[0].(time.Time)
		if !ok {
			t.Fatalf("expected arg to be time.Time, got %T", db.lastArgs[0])
		}
		if !argTime.Equal(cutoff) {
			t.Errorf("expected cutoff %v, got %v", cutoff, argTime)
		}
	})

	t.Run("propagates error from exec", func(t *testing.T) {
		customErr := errors.New("exec error")
		db := &fakeOrderDB{execErr: customErr}
		repo := repository.NewOrderRepository(db)

		err := repo.AutoConfirmDue(ctx, cutoff)
		if !errors.Is(err, customErr) {
			t.Errorf("expected error %v, got %v", customErr, err)
		}
	})

	t.Run("AutoConfirmDueReturning propagates error and passes cutoff", func(t *testing.T) {
		customErr := errors.New("query error")
		db := &fakeOrderDB{execErr: customErr}
		repo := repository.NewOrderRepository(db)

		_, err := repo.AutoConfirmDueReturning(ctx, cutoff)
		if !errors.Is(err, customErr) {
			t.Errorf("expected error %v, got %v", customErr, err)
		}
		if len(db.lastArgs) != 1 {
			t.Fatalf("expected 1 arg passed to Query, got %d", len(db.lastArgs))
		}
	})
}

func TestOrderRepository_MomoMethodGuards(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewOrderRepository(nil)

	t.Run("CreateWithPaymentMethod rejects invalid paymentMethod", func(t *testing.T) {
		_, err := repo.CreateWithPaymentMethod(ctx, "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", []domain.OrderLineInput{
			{VariantID: "33333333-3333-3333-3333-333333333333", Quantity: 1, ProductName: "Phone", UnitPriceVND: "1000000"},
		}, "0", "bank_transfer")
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) || valErr.Fields["paymentMethod"] == "" {
			t.Fatalf("expected ValidationError for paymentMethod, got %v", err)
		}
	})

	t.Run("SetPaymentFailed rejects invalid UUID", func(t *testing.T) {
		err := repo.SetPaymentFailed(ctx, "not-a-uuid")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Fatalf("expected ErrOrderNotFound, got %v", err)
		}
	})

	t.Run("ResetPaymentPending rejects invalid UUIDs", func(t *testing.T) {
		_, err := repo.ResetPaymentPending(ctx, "bad", "bad")
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Fatalf("expected ErrOrderNotFound, got %v", err)
		}
	})

	t.Run("ApplyMomoCallback rejects invalid order UUID", func(t *testing.T) {
		_, _, err := repo.ApplyMomoCallback(ctx, "bad", "", "100000", "123", 0)
		if !errors.Is(err, domain.ErrMomoInvalidCallback) {
			t.Fatalf("expected ErrMomoInvalidCallback for IPN, got %v", err)
		}
		_, _, err = repo.ApplyMomoCallback(ctx, "bad", "11111111-1111-1111-1111-111111111111", "100000", "123", 0)
		if !errors.Is(err, domain.ErrOrderNotFound) {
			t.Fatalf("expected ErrOrderNotFound for user return, got %v", err)
		}
	})
}

func TestOrderRepository_CheckoutAndFulfillmentGuards(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewOrderRepository(nil)
	validUser := "11111111-1111-1111-1111-111111111111"
	validAddr := "22222222-2222-2222-2222-222222222222"
	validOrder := "33333333-3333-3333-3333-333333333333"

	t.Run("QuoteCheckout validates UUIDs and deliveryMethod", func(t *testing.T) {
		if _, err := repo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{UserID: "bad", AddressID: validAddr}); !errors.Is(err, domain.ErrNotFound) {
			t.Fatalf("expected ErrNotFound, got %v", err)
		}
		if _, err := repo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{UserID: validUser, AddressID: "bad"}); !errors.Is(err, domain.ErrAddressNotFound) {
			t.Fatalf("expected ErrAddressNotFound, got %v", err)
		}
		_, err := repo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
			UserID:         validUser,
			AddressID:      validAddr,
			DeliveryMethod: domain.DeliveryMethod("drone"),
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) || valErr.Fields["deliveryMethod"] == "" {
			t.Fatalf("expected ValidationError for deliveryMethod, got %v", err)
		}
	})

	t.Run("CreateCheckoutOrder validates paymentMethod, deliveryMethod, and lines", func(t *testing.T) {
		_, err := repo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
			UserID:        validUser,
			AddressID:     validAddr,
			PaymentMethod: "crypto",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) || valErr.Fields["paymentMethod"] == "" {
			t.Fatalf("expected ValidationError for paymentMethod, got %v", err)
		}

		_, err = repo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
			UserID:         validUser,
			AddressID:      validAddr,
			PaymentMethod:  domain.PaymentMethodCOD,
			DeliveryMethod: domain.DeliveryMethod("drone"),
		})
		valErr = nil
		if !errors.As(err, &valErr) || valErr.Fields["deliveryMethod"] == "" {
			t.Fatalf("expected ValidationError for deliveryMethod, got %v", err)
		}

		_, err = repo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
			UserID:         validUser,
			AddressID:      validAddr,
			PaymentMethod:  domain.PaymentMethodCOD,
			DeliveryMethod: domain.DeliveryMethodStandard,
			Lines:          nil,
		})
		if !errors.Is(err, domain.ErrCartEmpty) {
			t.Fatalf("expected ErrCartEmpty, got %v", err)
		}
	})

	t.Run("ShipOrder validates UUID, carrier, and trackingCode", func(t *testing.T) {
		if _, err := repo.ShipOrder(ctx, "bad", "GHN", "GHN123"); !errors.Is(err, domain.ErrOrderNotFound) {
			t.Fatalf("expected ErrOrderNotFound, got %v", err)
		}
		_, err := repo.ShipOrder(ctx, validOrder, "   ", "ab")
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError, got %v", err)
		}
		if valErr.Fields["carrier"] == "" || valErr.Fields["trackingCode"] == "" {
			t.Fatalf("expected both carrier and trackingCode errors, got %+v", valErr.Fields)
		}
		_, err = repo.ShipOrder(ctx, validOrder, "GHN", "BAD CODE!")
		valErr = nil
		if !errors.As(err, &valErr) || valErr.Fields["trackingCode"] == "" {
			t.Fatalf("expected trackingCode format error, got %v", err)
		}
	})

	t.Run("BuyAgain validates UUIDs", func(t *testing.T) {
		if _, err := repo.BuyAgain(ctx, "bad", validOrder); !errors.Is(err, domain.ErrOrderNotFound) {
			t.Fatalf("expected ErrOrderNotFound, got %v", err)
		}
		if _, err := repo.BuyAgain(ctx, validUser, "bad"); !errors.Is(err, domain.ErrOrderNotFound) {
			t.Fatalf("expected ErrOrderNotFound, got %v", err)
		}
	})
}

