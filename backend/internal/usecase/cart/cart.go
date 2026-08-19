package cart

import (
	"context"
	"errors"
	"regexp"

	"commerce-backend/internal/domain"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Dependencies struct {
	Cart           domain.CartRepository
	ShippingFeeVND domain.MoneyVND
}
type UseCase struct {
	cart           domain.CartRepository
	shippingFeeVND domain.MoneyVND
}

func New(deps Dependencies) *UseCase {
	return &UseCase{
		cart:           deps.Cart,
		shippingFeeVND: deps.ShippingFeeVND,
	}
}

func (uc *UseCase) enrich(cart *domain.Cart) *domain.Cart {
	if cart == nil {
		return nil
	}
	cart.ShippingFeeVND = uc.shippingFeeVND
	return cart
}

func (uc *UseCase) Get(ctx context.Context, userID string) (*domain.Cart, error) {
	if err := validateUUID(userID, "user_id"); err != nil {
		return nil, err
	}
	cart, err := uc.cart.Get(ctx, userID)
	return uc.enrich(cart), err
}

func (uc *UseCase) AddVariant(ctx context.Context, userID, variantID string) (*domain.Cart, error) {
	if err := validateUUIDs(map[string]string{"user_id": userID, "variant_id": variantID}); err != nil {
		return nil, err
	}
	cart, err := uc.cart.AddVariant(ctx, userID, variantID)
	return uc.enrich(cart), mapMutationError(err, domain.ErrVariantNotFound)
}

func (uc *UseCase) SetQuantity(ctx context.Context, userID, itemID string, quantity int64) (*domain.Cart, error) {
	if err := validateUUIDs(map[string]string{"user_id": userID, "item_id": itemID}); err != nil {
		return nil, err
	}
	if quantity < 1 {
		return nil, domain.NewValidationError(map[string]string{"quantity": "must be at least 1"})
	}
	cart, err := uc.cart.SetQuantity(ctx, userID, itemID, quantity)
	return uc.enrich(cart), mapMutationError(err, domain.ErrCartItemNotFound)
}

func (uc *UseCase) SetSelected(ctx context.Context, userID, itemID string, selected bool) (*domain.Cart, error) {
	if err := validateUUIDs(map[string]string{"user_id": userID, "item_id": itemID}); err != nil {
		return nil, err
	}
	cart, err := uc.cart.SetSelected(ctx, userID, itemID, selected)
	return uc.enrich(cart), mapMutationError(err, domain.ErrCartItemNotFound)
}

func (uc *UseCase) SetAllSelected(ctx context.Context, userID string, selected bool) (*domain.Cart, error) {
	if err := validateUUID(userID, "user_id"); err != nil {
		return nil, err
	}
	cart, err := uc.cart.SetAllSelected(ctx, userID, selected)
	return uc.enrich(cart), mapMutationError(err, domain.ErrCartItemNotFound)
}

func (uc *UseCase) Remove(ctx context.Context, userID, itemID string) (*domain.Cart, error) {
	if err := validateUUIDs(map[string]string{"user_id": userID, "item_id": itemID}); err != nil {
		return nil, err
	}
	cart, err := uc.cart.Remove(ctx, userID, itemID)
	return uc.enrich(cart), mapMutationError(err, domain.ErrCartItemNotFound)
}


func validateUUID(id, field string) error {
	if !uuidPattern.MatchString(id) {
		return domain.NewValidationError(map[string]string{field: "must be a valid UUID"})
	}
	return nil
}

func validateUUIDs(values map[string]string) error {
	fields := map[string]string{}
	for field, value := range values {
		if !uuidPattern.MatchString(value) {
			fields[field] = "must be a valid UUID"
		}
	}
	if len(fields) > 0 {
		return domain.NewValidationError(fields)
	}
	return nil
}

func mapMutationError(err, notFound error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, domain.ErrNotFound) {
		return notFound
	}
	return err
}
