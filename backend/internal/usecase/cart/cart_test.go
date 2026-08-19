package cart

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
)

const userID = "11111111-1111-1111-1111-111111111111"
const variantID = "22222222-2222-2222-2222-222222222222"
const itemID = "33333333-3333-3333-3333-333333333333"

type fakeRepo struct {
	gotUser, gotVariant, gotItem string
	gotQuantity                  int64
	gotSelected                  bool
	cart                         *domain.Cart
	err                          error
}

func (r *fakeRepo) Get(_ context.Context, user string) (*domain.Cart, error) {
	r.gotUser = user
	return r.cart, r.err
}
func (r *fakeRepo) AddVariant(_ context.Context, user, variant string) (*domain.Cart, error) {
	r.gotUser = user
	r.gotVariant = variant
	return r.cart, r.err
}
func (r *fakeRepo) SetQuantity(_ context.Context, user, item string, quantity int64) (*domain.Cart, error) {
	r.gotUser = user
	r.gotItem, r.gotQuantity = item, quantity
	return r.cart, r.err
}
func (r *fakeRepo) SetSelected(_ context.Context, user, item string, selected bool) (*domain.Cart, error) {
	r.gotUser = user
	r.gotItem, r.gotSelected = item, selected
	return r.cart, r.err
}
func (r *fakeRepo) SetAllSelected(_ context.Context, user string, selected bool) (*domain.Cart, error) {
	r.gotUser = user
	r.gotSelected = selected
	return r.cart, r.err
}
func (r *fakeRepo) Remove(_ context.Context, user, item string) (*domain.Cart, error) {
	r.gotUser = user
	r.gotItem = item
	return r.cart, r.err
}

func TestCartUseCaseValidatesUUIDsAndQuantityBeforeRepository(t *testing.T) {
	r := &fakeRepo{}
	uc := New(Dependencies{Cart: r})
	for name, call := range map[string]func() error{
		"user":     func() error { _, err := uc.Get(context.Background(), "not-uuid"); return err },
		"variant":  func() error { _, err := uc.AddVariant(context.Background(), userID, "not-uuid"); return err },
		"item":     func() error { _, err := uc.SetSelected(context.Background(), userID, "not-uuid", true); return err },
		"quantity": func() error { _, err := uc.SetQuantity(context.Background(), userID, itemID, 0); return err },
	} {
		t.Run(name, func(t *testing.T) {
			var validationErr *domain.ValidationError
			if !errors.As(call(), &validationErr) {
				t.Fatalf("error = %v", call())
			}
			if r.gotUser != "" {
				t.Fatal("repository called for invalid input")
			}
		})
	}
}

func TestCartUseCaseUsesCallerUserIDAndMapsOwnershipNeutralErrors(t *testing.T) {
	r := &fakeRepo{err: errors.Join(errors.New("repository detail"), domain.ErrNotFound)}
	uc := New(Dependencies{Cart: r})
	_, err := uc.Get(context.Background(), userID)
	if !errors.Is(err, domain.ErrNotFound) || r.gotUser != userID {
		t.Fatalf("get err=%v user=%q", err, r.gotUser)
	}
	_, err = uc.Remove(context.Background(), userID, itemID)
	if !errors.Is(err, domain.ErrCartItemNotFound) || r.gotUser != userID {
		t.Fatalf("err=%v user=%q", err, r.gotUser)
	}
}

func TestCartUseCaseDelegatesAllOperations(t *testing.T) {
	r := &fakeRepo{cart: &domain.Cart{SelectedTotalVND: "0"}}
	uc := New(Dependencies{Cart: r})
	if _, err := uc.Get(context.Background(), userID); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.AddVariant(context.Background(), userID, variantID); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.SetQuantity(context.Background(), userID, itemID, 2); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.SetSelected(context.Background(), userID, itemID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.SetAllSelected(context.Background(), userID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.Remove(context.Background(), userID, itemID); err != nil {
		t.Fatal(err)
	}
	if r.gotUser != userID || r.gotVariant != variantID || r.gotItem != itemID || r.gotQuantity != 2 || !r.gotSelected {
		t.Fatalf("arguments not preserved: %+v", r)
	}
}

func TestCartUseCaseMapsItemOwnershipErrorsForEveryItemMutation(t *testing.T) {
	for name, call := range map[string]func(*UseCase) error{
		"quantity": func(uc *UseCase) error { _, err := uc.SetQuantity(context.Background(), userID, itemID, 2); return err },
		"selection": func(uc *UseCase) error {
			_, err := uc.SetSelected(context.Background(), userID, itemID, true)
			return err
		},
		"all":    func(uc *UseCase) error { _, err := uc.SetAllSelected(context.Background(), userID, true); return err },
		"remove": func(uc *UseCase) error { _, err := uc.Remove(context.Background(), userID, itemID); return err },
	} {
		t.Run(name, func(t *testing.T) {
			uc := New(Dependencies{Cart: &fakeRepo{err: domain.ErrNotFound}})
			if !errors.Is(call(uc), domain.ErrCartItemNotFound) {
				t.Fatal("expected ownership-neutral item error")
			}
		})
	}
}

func TestCartUseCasePropagatesStableBusinessErrors(t *testing.T) {
	for _, sentinel := range []error{domain.ErrVariantUnavailable, domain.ErrOutOfStock, domain.ErrStockLimit, domain.ErrCartItemUnavailable} {
		for name, call := range map[string]func(*UseCase) error{
			"add":      func(uc *UseCase) error { _, err := uc.AddVariant(context.Background(), userID, variantID); return err },
			"quantity": func(uc *UseCase) error { _, err := uc.SetQuantity(context.Background(), userID, itemID, 2); return err },
			"selection": func(uc *UseCase) error {
				_, err := uc.SetSelected(context.Background(), userID, itemID, true)
				return err
			},
			"all":    func(uc *UseCase) error { _, err := uc.SetAllSelected(context.Background(), userID, true); return err },
			"remove": func(uc *UseCase) error { _, err := uc.Remove(context.Background(), userID, itemID); return err },
		} {
			t.Run(sentinel.Error()+"/"+name, func(t *testing.T) {
				uc := New(Dependencies{Cart: &fakeRepo{err: sentinel}})
				if !errors.Is(call(uc), sentinel) {
					t.Fatalf("error %v was not propagated", sentinel)
				}
			})
		}
	}
}

func TestCartUseCaseEnrichesCartWithShippingFee(t *testing.T) {
	wantFee := domain.MoneyVND("30000")
	r := &fakeRepo{cart: &domain.Cart{SelectedTotalVND: "100000"}}
	uc := New(Dependencies{Cart: r, ShippingFeeVND: wantFee})

	cart, err := uc.Get(context.Background(), userID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cart.ShippingFeeVND != wantFee {
		t.Fatalf("expected ShippingFeeVND %q, got %q", wantFee, cart.ShippingFeeVND)
	}

	cart, err = uc.AddVariant(context.Background(), userID, variantID)
	if err != nil || cart.ShippingFeeVND != wantFee {
		t.Fatalf("AddVariant: expected ShippingFeeVND %q, got %q", wantFee, cart.ShippingFeeVND)
	}
}

