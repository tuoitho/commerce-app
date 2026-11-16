package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type accountDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type AccountRepository struct {
	db accountDB
	q  *sqlc.Queries
}

func NewAccountRepository(db accountDB) *AccountRepository {
	return &AccountRepository{
		db: db,
		q:  sqlc.New(db),
	}
}

var _ domain.AccountRepository = (*AccountRepository)(nil)

func nullablePgText(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: *v, Valid: true}
}

func (r *AccountRepository) GetByID(ctx context.Context, userID string) (*domain.User, error) {
	u, err := r.q.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainUser(u.ID, u.Email, u.PasswordHash, u.Role, u.Status, u.LockedAt, u.LockReason, u.DisplayName, u.Phone, u.AvatarKey, u.CreatedAt, u.UpdatedAt), nil
}

func (r *AccountRepository) UpdateProfile(ctx context.Context, userID string, displayName, phone *string) (*domain.User, error) {
	u, err := r.q.UpdateUserProfile(ctx, sqlc.UpdateUserProfileParams{
		ID:          userID,
		DisplayName: nullablePgText(displayName),
		Phone:       nullablePgText(phone),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return toDomainUser(u.ID, u.Email, u.PasswordHash, u.Role, u.Status, u.LockedAt, u.LockReason, u.DisplayName, u.Phone, u.AvatarKey, u.CreatedAt, u.UpdatedAt), nil
}

func (r *AccountRepository) UpdateAvatar(ctx context.Context, userID string, avatarKey *string) (*domain.User, *string, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)
	prevRaw, err := q.GetUserAvatarKeyForUpdate(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, domain.ErrNotFound
		}
		return nil, nil, err
	}

	u, err := q.UpdateUserAvatar(ctx, sqlc.UpdateUserAvatarParams{
		ID:        userID,
		AvatarKey: nullablePgText(avatarKey),
	})
	if err != nil {
		return nil, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	return toDomainUser(u.ID, u.Email, u.PasswordHash, u.Role, u.Status, u.LockedAt, u.LockReason, u.DisplayName, u.Phone, u.AvatarKey, u.CreatedAt, u.UpdatedAt), pgTextToPtr(prevRaw), nil
}

func (r *AccountRepository) ChangePasswordAndRotateSession(ctx context.Context, userID, passwordHash, newTokenHash string, expiresAt time.Time) (*domain.User, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)
	u, err := q.UpdateUserPassword(ctx, sqlc.UpdateUserPasswordParams{
		ID:           userID,
		PasswordHash: passwordHash,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	if err := q.RevokeRefreshTokensByUserID(ctx, userID); err != nil {
		return nil, err
	}

	if _, err := q.CreateRefreshToken(ctx, sqlc.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: newTokenHash,
		ExpiresAt: expiresAt,
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return toDomainUser(u.ID, u.Email, u.PasswordHash, u.Role, u.Status, u.LockedAt, u.LockReason, u.DisplayName, u.Phone, u.AvatarKey, u.CreatedAt, u.UpdatedAt), nil
}
