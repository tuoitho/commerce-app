package repository_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository"
)

func TestVoucherRepository_InvalidUUIDGuards(t *testing.T) {
	repo := repository.NewVoucherRepository(nil)
	ctx := context.Background()

	if _, err := repo.GetAdminByID(ctx, "not-a-uuid"); !errors.Is(err, domain.ErrVoucherNotFound) {
		t.Fatalf("GetAdminByID err = %v, want ErrVoucherNotFound", err)
	}
	if _, err := repo.Update(ctx, "not-a-uuid", domain.SaveVoucherInput{}); !errors.Is(err, domain.ErrVoucherNotFound) {
		t.Fatalf("Update err = %v, want ErrVoucherNotFound", err)
	}
	if err := repo.Delete(ctx, "not-a-uuid"); !errors.Is(err, domain.ErrVoucherNotFound) {
		t.Fatalf("Delete err = %v, want ErrVoucherNotFound", err)
	}

	avail, err := repo.ListAvailableForUser(ctx, "not-a-uuid", time.Now().UTC())
	if err != nil {
		t.Fatalf("ListAvailableForUser unexpected err = %v", err)
	}
	if len(avail) != 0 {
		t.Fatalf("ListAvailableForUser len = %d, want 0", len(avail))
	}
}
