package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type UserRepository struct {
	q *sqlc.Queries
}

func NewUserRepository(pool Querier) *UserRepository {
	return &UserRepository{q: sqlc.New(pool)}
}

func (r *UserRepository) Create(ctx context.Context, email, passwordHash, role string) (*domain.User, error) {
	if role == "" {
		role = domain.RoleCustomer
	}
	u, err := r.q.CreateUser(ctx, sqlc.CreateUserParams{
		Email:        email,
		PasswordHash: passwordHash,
		Role:         role,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, domain.ErrEmailInUse
		}
		return nil, err
	}
	return toDomainUser(u.ID, u.Email, u.PasswordHash, u.Role, u.Status, u.LockedAt, u.LockReason, u.CreatedAt, u.UpdatedAt), nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	u, err := r.q.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainUser(u.ID, u.Email, u.PasswordHash, u.Role, u.Status, u.LockedAt, u.LockReason, u.CreatedAt, u.UpdatedAt), nil
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (*domain.User, error) {
	u, err := r.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainUser(u.ID, u.Email, u.PasswordHash, u.Role, u.Status, u.LockedAt, u.LockReason, u.CreatedAt, u.UpdatedAt), nil
}

func (r *UserRepository) CountByRole(ctx context.Context, role string) (int64, error) {
	return r.q.CountUsersByRole(ctx, role)
}

func toDomainUser(id, email, passwordHash, role, status string, lockedAt pgtype.Timestamptz, lockReason pgtype.Text, createdAt, updatedAt time.Time) *domain.User {
	user := &domain.User{
		ID:           id,
		Email:        email,
		PasswordHash: passwordHash,
		Role:         role,
		Status:       status,
		CreatedAt:    createdAt,
		UpdatedAt:    updatedAt,
	}
	if lockedAt.Valid {
		t := lockedAt.Time
		user.LockedAt = &t
	}
	if lockReason.Valid {
		r := lockReason.String
		user.LockReason = &r
	}
	return user
}
