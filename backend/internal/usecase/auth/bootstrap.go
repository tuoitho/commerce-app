package auth

import (
	"context"
	"errors"
	"strings"

	"commerce-backend/internal/domain"
)

func (uc *UseCase) BootstrapAdmin(ctx context.Context, email, password string) error {
	email = strings.TrimSpace(email)
	password = strings.TrimSpace(password)
	if email == "" || password == "" {
		return nil
	}

	count, err := uc.repos.Users.CountByRole(ctx, domain.RoleAdmin)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	existing, err := uc.repos.Users.GetByEmail(ctx, email)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return err
	}
	if existing != nil {
		return nil
	}

	passwordHash, err := uc.hashPassword(password)
	if err != nil {
		return err
	}

	_, err = uc.repos.Users.Create(ctx, email, passwordHash, domain.RoleAdmin)
	if err != nil && !errors.Is(err, domain.ErrEmailInUse) {
		return err
	}

	return nil
}
