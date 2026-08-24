package favorite

import (
	"context"
	"regexp"

	"commerce-backend/internal/domain"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Dependencies struct {
	Favorite domain.FavoriteRepository
}

type UseCase struct {
	favorite domain.FavoriteRepository
}

func New(deps Dependencies) *UseCase {
	return &UseCase{
		favorite: deps.Favorite,
	}
}

func (uc *UseCase) List(ctx context.Context, userID string) ([]domain.FavoriteProduct, error) {
	if err := validateUUID(userID, "userId"); err != nil {
		return nil, err
	}
	items, err := uc.favorite.List(ctx, userID)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []domain.FavoriteProduct{}
	}
	return items, nil
}

func (uc *UseCase) Add(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
	if err := validateUUIDs(map[string]string{"userId": userID, "productId": productID}); err != nil {
		return nil, err
	}
	items, err := uc.favorite.Add(ctx, userID, productID)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []domain.FavoriteProduct{}
	}
	return items, nil
}

func (uc *UseCase) Remove(ctx context.Context, userID, productID string) ([]domain.FavoriteProduct, error) {
	if err := validateUUIDs(map[string]string{"userId": userID, "productId": productID}); err != nil {
		return nil, err
	}
	items, err := uc.favorite.Remove(ctx, userID, productID)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []domain.FavoriteProduct{}
	}
	return items, nil
}

func validateUUID(id, field string) error {
	if !uuidPattern.MatchString(id) {
		return domain.NewValidationError(map[string]string{field: "must be a valid UUID"})
	}
	return nil
}

func validateUUIDs(values map[string]string) error {
	fields := make(map[string]string)
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
