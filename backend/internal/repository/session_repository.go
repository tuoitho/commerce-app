package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type SessionRepository struct {
	q *sqlc.Queries
}

func NewSessionRepository(pool Querier) *SessionRepository {
	return &SessionRepository{q: sqlc.New(pool)}
}

func (r *SessionRepository) CreateRefreshToken(ctx context.Context, userID, tokenHash string, expiresAt time.Time) (*domain.RefreshToken, error) {
	t, err := r.q.CreateRefreshToken(ctx, sqlc.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: tokenHash,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return nil, err
	}
	return toDomainRefreshToken(t), nil
}

func (r *SessionRepository) GetRefreshTokenByHash(ctx context.Context, tokenHash string) (*domain.RefreshToken, *domain.User, error) {
	row, err := r.q.GetRefreshTokenByHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, domain.ErrNotFound
		}
		return nil, nil, err
	}
	token := &domain.RefreshToken{
		ID:        row.ID,
		UserID:    row.UserID,
		TokenHash: row.TokenHash,
		ExpiresAt: row.ExpiresAt,
		CreatedAt: row.CreatedAt,
	}
	if row.RevokedAt.Valid {
		revoked := row.RevokedAt.Time
		token.RevokedAt = &revoked
	}
	user := &domain.User{
		ID:           row.UserID,
		Email:        row.Email,
		PasswordHash: row.PasswordHash,
		Role:         row.UserRole,
		Status:       row.UserStatus,
		CreatedAt:    row.UserCreatedAt,
		UpdatedAt:    row.UserUpdatedAt,
	}
	return token, user, nil
}

func (r *SessionRepository) RevokeRefreshTokenByID(ctx context.Context, id string) error {
	return r.q.RevokeRefreshTokenByID(ctx, id)
}

func (r *SessionRepository) RevokeRefreshTokensByUserID(ctx context.Context, userID string) error {
	return r.q.RevokeRefreshTokensByUserID(ctx, userID)
}

func toDomainRefreshToken(t sqlc.RefreshToken) *domain.RefreshToken {
	token := &domain.RefreshToken{
		ID:        t.ID,
		UserID:    t.UserID,
		TokenHash: t.TokenHash,
		ExpiresAt: t.ExpiresAt,
		CreatedAt: t.CreatedAt,
	}
	if t.RevokedAt.Valid {
		revoked := t.RevokedAt.Time
		token.RevokedAt = &revoked
	}
	return token
}
