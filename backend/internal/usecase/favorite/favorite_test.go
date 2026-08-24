package favorite

import (
	"context"
	"errors"
	"testing"
	"time"

	"commerce-backend/internal/domain"
)

type fakeFavoriteRepo struct {
	favorites     map[string]map[string]time.Time
	addErr        error
	listErr       error
	removeErr     error
	getErr        error
	eligibleProds map[string]bool
}

func newFakeFavoriteRepo() *fakeFavoriteRepo {
	return &fakeFavoriteRepo{
		favorites:     make(map[string]map[string]time.Time),
		eligibleProds: make(map[string]bool),
	}
}

func (f *fakeFavoriteRepo) AddFavorite(ctx context.Context, userID, productID string) error {
	if f.addErr != nil {
		return f.addErr
	}
	if !f.eligibleProds[productID] {
		return domain.ErrProductNotFound
	}
	if f.favorites[userID] == nil {
		f.favorites[userID] = make(map[string]time.Time)
	}
	if _, ok := f.favorites[userID][productID]; !ok {
		f.favorites[userID][productID] = time.Now()
	}
	return nil
}

func (f *fakeFavoriteRepo) RemoveFavorite(ctx context.Context, userID, productID string) error {
	if f.removeErr != nil {
		return f.removeErr
	}
	if f.favorites[userID] != nil {
		delete(f.favorites[userID], productID)
	}
	return nil
}

func (f *fakeFavoriteRepo) GetFavoriteProductIDs(ctx context.Context, userID string, productIDs []string) ([]string, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	userFavs := f.favorites[userID]
	if userFavs == nil {
		return []string{}, nil
	}
	var out []string
	for _, pid := range productIDs {
		if _, ok := userFavs[pid]; ok {
			out = append(out, pid)
		}
	}
	return out, nil
}

func (f *fakeFavoriteRepo) ListFavorites(ctx context.Context, userID string, page, limit int) (domain.PaginatedFavorites, error) {
	if f.listErr != nil {
		return domain.PaginatedFavorites{}, f.listErr
	}
	userFavs := f.favorites[userID]
	total := len(userFavs)
	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	items := make([]domain.FavoriteProductSummary, 0)
	for pid, t := range userFavs {
		items = append(items, domain.FavoriteProductSummary{
			ID:          pid,
			Name:        "Product " + pid,
			Active:      true,
			InStock:     true,
			Price:       "100000",
			Currency:    "VND",
			FavoritedAt: t,
		})
	}

	return domain.PaginatedFavorites{
		Items: items,
		Pagination: domain.FavoritePagination{
			Page:       page,
			Limit:      limit,
			Total:      total,
			TotalPages: totalPages,
			HasNext:    page < totalPages,
			HasPrev:    page > 1,
		},
	}, nil
}

func TestFavoriteUseCase_ListFavorites_Validation(t *testing.T) {
	repo := newFakeFavoriteRepo()
	uc := New(Dependencies{Favorites: repo})
	ctx := context.Background()

	validUser := "11111111-1111-1111-1111-111111111111"

	// Invalid User ID
	_, err := uc.ListFavorites(ctx, "invalid-uuid", 1, 12)
	var valErr *domain.ValidationError
	if !errors.As(err, &valErr) || valErr.Fields["user_id"] == "" {
		t.Fatalf("expected validation error on user_id, got %v", err)
	}

	// Invalid Page (< 1) and Invalid Limit (!= 12)
	_, err = uc.ListFavorites(ctx, validUser, 0, 13)
	if !errors.As(err, &valErr) {
		t.Fatalf("expected validation error, got %v", err)
	}
	if valErr.Fields["page"] == "" {
		t.Errorf("expected validation error on page")
	}
	if valErr.Fields["limit"] == "" {
		t.Errorf("expected validation error on limit")
	}

	// Valid parameters
	res, err := uc.ListFavorites(ctx, validUser, 1, 12)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Pagination.Page != 1 || res.Pagination.Limit != 12 {
		t.Errorf("pagination mismatch: %+v", res.Pagination)
	}
}

func TestFavoriteUseCase_AddFavorite(t *testing.T) {
	repo := newFakeFavoriteRepo()
	uc := New(Dependencies{Favorites: repo})
	ctx := context.Background()

	validUser := "11111111-1111-1111-1111-111111111111"
	activeProd := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	inactiveProd := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

	repo.eligibleProds[activeProd] = true
	repo.eligibleProds[inactiveProd] = false

	// Invalid product UUID
	err := uc.AddFavorite(ctx, validUser, "not-a-uuid")
	var valErr *domain.ValidationError
	if !errors.As(err, &valErr) || valErr.Fields["productId"] == "" {
		t.Fatalf("expected validation error on productId, got %v", err)
	}

	// Inactive / missing product
	err = uc.AddFavorite(ctx, validUser, inactiveProd)
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("expected ErrProductNotFound for inactive product, got %v", err)
	}

	// Active product
	err = uc.AddFavorite(ctx, validUser, activeProd)
	if err != nil {
		t.Fatalf("expected success on active product add, got %v", err)
	}

	// Idempotent duplicate add
	err = uc.AddFavorite(ctx, validUser, activeProd)
	if err != nil {
		t.Fatalf("expected success on duplicate add, got %v", err)
	}
}

func TestFavoriteUseCase_RemoveFavorite(t *testing.T) {
	repo := newFakeFavoriteRepo()
	uc := New(Dependencies{Favorites: repo})
	ctx := context.Background()

	validUser := "11111111-1111-1111-1111-111111111111"
	prod1 := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

	repo.eligibleProds[prod1] = true
	_ = repo.AddFavorite(ctx, validUser, prod1)

	// Invalid product UUID
	err := uc.RemoveFavorite(ctx, validUser, "not-a-uuid")
	var valErr *domain.ValidationError
	if !errors.As(err, &valErr) || valErr.Fields["productId"] == "" {
		t.Fatalf("expected validation error on productId, got %v", err)
	}

	// Remove existing favorite
	err = uc.RemoveFavorite(ctx, validUser, prod1)
	if err != nil {
		t.Fatalf("expected success on remove, got %v", err)
	}

	// Idempotent remove non-existent favorite
	err = uc.RemoveFavorite(ctx, validUser, prod1)
	if err != nil {
		t.Fatalf("expected success on duplicate remove, got %v", err)
	}
}

func TestFavoriteUseCase_GetFavoriteProductIDs(t *testing.T) {
	repo := newFakeFavoriteRepo()
	uc := New(Dependencies{Favorites: repo})
	ctx := context.Background()

	validUser := "11111111-1111-1111-1111-111111111111"
	prod1 := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	prod2 := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

	repo.eligibleProds[prod1] = true
	_ = repo.AddFavorite(ctx, validUser, prod1)

	ids, err := uc.GetFavoriteProductIDs(ctx, validUser, []string{prod1, prod2})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ids) != 1 || ids[0] != prod1 {
		t.Fatalf("expected [prod1], got %v", ids)
	}
}
