package repository

import (
	"context"
	"crypto/hmac"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type passwordResetDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type PasswordResetRepository struct {
	db passwordResetDB
	q  *sqlc.Queries
}

func NewPasswordResetRepository(db passwordResetDB) *PasswordResetRepository {
	return &PasswordResetRepository{
		db: db,
		q:  sqlc.New(db),
	}
}

var _ domain.PasswordResetRepository = (*PasswordResetRepository)(nil)

func (r *PasswordResetRepository) CreateChallenge(ctx context.Context, input domain.CreatePasswordResetInput) (*domain.CreatePasswordResetResult, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)

	if err := q.AcquireEmailPasswordResetLock(ctx, input.Email); err != nil {
		return nil, err
	}

	recentCount, err := q.CountRecentPasswordResetOTPsByEmail(ctx, sqlc.CountRecentPasswordResetOTPsByEmailParams{
		Email:     input.Email,
		CreatedAt: input.WindowStart,
	})
	if err != nil {
		return nil, err
	}
	if recentCount >= int64(input.MaxRequests) {
		return nil, domain.ErrOTPRateLimited
	}

	var userUUID pgtype.UUID
	var otpHash pgtype.Text
	var recipientEmail string
	shouldSend := false

	user, err := q.GetUserByEmail(ctx, input.Email)
	if err == nil {
		if user.Status == domain.UserStatusActive {
			parsedID, parseErr := uuid.Parse(user.ID)
			if parseErr != nil {
				return nil, parseErr
			}
			userUUID = pgtype.UUID{Bytes: parsedID, Valid: true}
			otpHash = pgtype.Text{String: input.OTPHash, Valid: true}
			recipientEmail = user.Email
			shouldSend = true

			if err := q.InvalidateUserPasswordResetOTPs(ctx, userUUID); err != nil {
				return nil, err
			}
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	row, err := q.CreatePasswordResetOTP(ctx, sqlc.CreatePasswordResetOTPParams{
		Email:     input.Email,
		ExpiresAt: input.ExpiresAt,
		UserID:    userUUID,
		OtpHash:   otpHash,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &domain.CreatePasswordResetResult{
		RecordID:       row.ID,
		RecipientEmail: recipientEmail,
		ShouldSend:     shouldSend,
	}, nil
}

func (r *PasswordResetRepository) DeleteChallenge(ctx context.Context, id string) error {
	return r.q.DeletePasswordResetOTPByID(ctx, id)
}

func (r *PasswordResetRepository) VerifyAndResetPassword(ctx context.Context, input domain.VerifyPasswordResetInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)

	row, err := q.GetLatestPasswordResetOTPForUpdate(ctx, input.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrInvalidOrExpiredOTP
		}
		return err
	}

	if row.ConsumedAt.Valid || !row.UserID.Valid || !row.OtpHash.Valid || int(row.Attempts) >= input.MaxAttempts {
		return domain.ErrInvalidOrExpiredOTP
	}

	recordFailure := func() error {
		if _, incErr := q.IncrementPasswordResetOTPAttempt(ctx, sqlc.IncrementPasswordResetOTPAttemptParams{
			ID:       row.ID,
			Attempts: int16(input.MaxAttempts),
		}); incErr != nil && !errors.Is(incErr, pgx.ErrNoRows) {
			return incErr
		}
		if commitErr := tx.Commit(ctx); commitErr != nil {
			return commitErr
		}
		return domain.ErrInvalidOrExpiredOTP
	}

	if !row.ExpiresAt.After(input.Now) {
		return recordFailure()
	}

	userID := uuid.UUID(row.UserID.Bytes).String()
	user, err := q.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return recordFailure()
		}
		return err
	}
	if user.Status != domain.UserStatusActive {
		return recordFailure()
	}

	if !hmac.Equal([]byte(input.ExpectedOTPHash), []byte(row.OtpHash.String)) {
		return recordFailure()
	}

	if _, err := q.UpdateUserPassword(ctx, sqlc.UpdateUserPasswordParams{
		ID:           user.ID,
		PasswordHash: input.NewPasswordHash,
	}); err != nil {
		return err
	}

	if err := q.ConsumePasswordResetOTP(ctx, row.ID); err != nil {
		return err
	}
	if err := q.InvalidateUserPasswordResetOTPs(ctx, row.UserID); err != nil {
		return err
	}
	if err := q.RevokeRefreshTokensByUserID(ctx, user.ID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
