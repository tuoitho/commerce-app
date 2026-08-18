package catalog_test

import (
	"commerce-backend/internal/domain"
	cataloguc "commerce-backend/internal/usecase/catalog"
	"commerce-backend/internal/usecase/catalog/fakerepos"
	"context"
	"errors"
	"testing"
)

func TestAdminCategories_CreateTrimsName(t *testing.T) {
	repo := fakerepos.NewCatalog()
	uc := cataloguc.New(cataloguc.Dependencies{Catalog: repo})
	got, err := uc.CreateCategory(context.Background(), "  Điện thoại  ")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Điện thoại" {
		t.Fatalf("name=%q", got.Name)
	}
}
func TestAdminCategories_RejectsBlankName(t *testing.T) {
	repo := fakerepos.NewCatalog()
	uc := cataloguc.New(cataloguc.Dependencies{Catalog: repo})
	_, err := uc.CreateCategory(context.Background(), " \t ")
	var ve *domain.ValidationError
	if !errors.As(err, &ve) || ve.Fields["name"] == "" {
		t.Fatalf("expected name validation, got %v", err)
	}
}
func TestAdminCategories_RenameValidatesIDAndTrims(t *testing.T) {
	repo := fakerepos.NewCatalog()
	repo.AddCategory(domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Old"})
	uc := cataloguc.New(cataloguc.Dependencies{Catalog: repo})
	got, err := uc.RenameCategory(context.Background(), "11111111-1111-1111-1111-111111111111", " New ")
	if err != nil || got.Name != "New" {
		t.Fatalf("got=%+v err=%v", got, err)
	}
	_, err = uc.RenameCategory(context.Background(), "bad", "x")
	if !errors.Is(err, domain.ErrInvalidCategoryID) {
		t.Fatalf("expected invalid category id, got %v", err)
	}
}
func TestAdminCategories_DeleteRejectsUsed(t *testing.T) {
	repo := fakerepos.NewCatalog()
	id := "11111111-1111-1111-1111-111111111111"
	repo.AddCategory(domain.Category{ID: id, Name: "Old"})
	repo.AddProduct(domain.Product{ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", Category: domain.Category{ID: id, Name: "Old"}, Price: "1", Currency: "VND"})
	uc := cataloguc.New(cataloguc.Dependencies{Catalog: repo})
	if _, err := uc.DeleteCategory(context.Background(), id); !errors.Is(err, domain.ErrCategoryInUse) {
		t.Fatalf("got %v", err)
	}
}
