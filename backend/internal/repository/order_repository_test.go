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

func (f *fakeOrderDB) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
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
}

