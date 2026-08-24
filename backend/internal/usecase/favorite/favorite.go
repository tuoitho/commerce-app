package favorite

import (
	"context"
	"regexp"

	"commerce-backend/internal/domain"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Dependencies struct {
	Favorites domain.FavoriteRepository
}

type UseCase struct {
	favorites domain.FavoriteRepository
}

func New(deps Dependencies) *UseCase {
	return &UseCase{
		favorites: deps.Favorites,
	}
}

func (uc *UseCase) ListFavorites(ctx context.Context, userID string, page, limit int) (domain.PaginatedFavorites, error) {
	if err := validateUUID(userID, "user_id"); err != nil {
		return domain.PaginatedFavorites{}, err
	}
	fields := map[string]string{}
	if page < 1 {
		fields["page"] = "must be a positive integer"
	}
	if limit != 12 {
		fields["limit"] = "must be 12"
	}
	if len(fields) > 0 {
		return domain.PaginatedFavorites{}, domain.NewValidationError(fields)
	}

	return uc.favorites.ListFavorites(ctx, userID, page, limit)
}

func (uc *UseCase) AddFavorite(ctx context.Context, userID, productID string) error {
	if err := validateUUID(userID, "user_id"); err != nil {
		return err
	}
	if err := validateUUID(productID, "productId"); err != nil {
		return err
	}
	return uc.favorites.AddFavorite(ctx, userID, productID)
}

func (uc *UseCase) RemoveFavorite(ctx context.Context, userID, productID string) error {
	if err := validateUUID(userID, "user_id"); err != nil {
		return err
	}
	if err := validateUUID(productID, "productId"); err != nil {
		return err
	}
	return uc.favorites.RemoveFavorite(ctx, userID, productID)
}

func (uc *UseCase) GetFavoriteProductIDs(ctx context.Context, userID string, productIDs []string) ([]string, error) {
	if err := validateUUID(userID, "user_id"); err != nil {
		return nil, err
	}
	return uc.favorites.GetFavoriteProductIDs(ctx, userID, productIDs)
}

func validateUUID(id, field string) error {
	if !uuidPattern.MatchString(id) {
		return domain.NewValidationError(map[string]string{field: "must be a valid UUID"})
	}
	return nil
}
