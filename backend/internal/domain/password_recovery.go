package domain

import (
	"context"
	"time"
)

const (
	PasswordResetMaxRequestsPerWindow = 5
	PasswordResetRateLimitWindow      = 15 * time.Minute
	PasswordResetMaxAttempts          = 5
	PasswordResetCooldownSeconds      = 60
)

type Mailer interface {
	SendPasswordResetOTP(ctx context.Context, toEmail, otp string, ttl time.Duration) error
}

type PasswordResetOTPRecord struct {
	ID         string
	Email      string
	UserID     *string
	OTPHash    *string
	Attempts   int
	ExpiresAt  time.Time
	ConsumedAt *time.Time
	CreatedAt  time.Time
}

type CreatePasswordResetInput struct {
	Email       string
	OTPHash     string
	ExpiresAt   time.Time
	WindowStart time.Time
	MaxRequests int
}

type CreatePasswordResetResult struct {
	RecordID       string
	RecipientEmail string
	ShouldSend     bool
}

type VerifyPasswordResetInput struct {
	Email           string
	ExpectedOTPHash string
	NewPasswordHash string
	MaxAttempts     int
	Now             time.Time
}

type PasswordResetRepository interface {
	CreateChallenge(ctx context.Context, input CreatePasswordResetInput) (*CreatePasswordResetResult, error)
	DeleteChallenge(ctx context.Context, id string) error
	VerifyAndResetPassword(ctx context.Context, input VerifyPasswordResetInput) error
}
