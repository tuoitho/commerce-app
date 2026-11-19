package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"commerce-backend/internal/domain"
)

var otpSixDigitsRegex = regexp.MustCompile(`^[0-9]{6}$`)

type ForgotPasswordResult struct {
	CooldownSeconds int
}

type ResetPasswordInput struct {
	Email       string
	OTP         string
	NewPassword string
}

func (uc *UseCase) ForgotPassword(ctx context.Context, rawEmail string) (*ForgotPasswordResult, error) {
	email := strings.TrimSpace(rawEmail)
	if !isValidPlainEmail(email) {
		return nil, domain.NewValidationError(map[string]string{
			"email": "Địa chỉ email không hợp lệ",
		})
	}
	if uc.repos.PasswordResets == nil || uc.mailer == nil || uc.otpHMACSecret == "" {
		return nil, errors.New("password recovery is not configured")
	}

	emailLower := strings.ToLower(email)
	otp, err := generateSixDigitOTP()
	if err != nil {
		return nil, err
	}
	otpHash := hashPasswordResetOTP(emailLower, otp, uc.otpHMACSecret)
	now := time.Now()

	res, err := uc.repos.PasswordResets.CreateChallenge(ctx, domain.CreatePasswordResetInput{
		Email:       emailLower,
		OTPHash:     otpHash,
		ExpiresAt:   now.Add(uc.passwordResetOTPTTL),
		WindowStart: now.Add(-domain.PasswordResetRateLimitWindow),
		MaxRequests: domain.PasswordResetMaxRequestsPerWindow,
	})
	if err != nil {
		return nil, err
	}

	if res.ShouldSend {
		if sendErr := uc.mailer.SendPasswordResetOTP(ctx, res.RecipientEmail, otp, uc.passwordResetOTPTTL); sendErr != nil {
			rollbackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			if delErr := uc.repos.PasswordResets.DeleteChallenge(rollbackCtx, res.RecordID); delErr != nil {
				uc.logger.Error("failed to rollback password reset challenge after smtp failure", "record_id", res.RecordID, "error", delErr.Error())
			}
			return nil, domain.ErrEmailDeliveryFailed
		}
	}

	return &ForgotPasswordResult{
		CooldownSeconds: domain.PasswordResetCooldownSeconds,
	}, nil
}

func (uc *UseCase) ResetPassword(ctx context.Context, input ResetPasswordInput) error {
	email := strings.TrimSpace(input.Email)
	otp := strings.TrimSpace(input.OTP)
	fields := map[string]string{}

	if !isValidPlainEmail(email) {
		fields["email"] = "Địa chỉ email không hợp lệ"
	}
	if !otpSixDigitsRegex.MatchString(otp) {
		fields["otp"] = "Mã OTP phải gồm đúng 6 chữ số"
	}
	if len(input.NewPassword) < domain.MinPasswordBytes || len(input.NewPassword) > domain.MaxPasswordBytes {
		fields["newPassword"] = "Mật khẩu mới phải từ 8 đến 72 ký tự"
	}
	if len(fields) > 0 {
		return domain.NewValidationError(fields)
	}
	if uc.repos.PasswordResets == nil || uc.otpHMACSecret == "" {
		return errors.New("password recovery is not configured")
	}

	newPasswordHash, err := uc.hashPassword(input.NewPassword)
	if err != nil {
		return err
	}

	emailLower := strings.ToLower(email)
	expectedHash := hashPasswordResetOTP(emailLower, otp, uc.otpHMACSecret)

	return uc.repos.PasswordResets.VerifyAndResetPassword(ctx, domain.VerifyPasswordResetInput{
		Email:           emailLower,
		ExpectedOTPHash: expectedHash,
		NewPasswordHash: newPasswordHash,
		MaxAttempts:     domain.PasswordResetMaxAttempts,
		Now:             time.Now(),
	})
}

func isValidPlainEmail(email string) bool {
	if email == "" || !strings.Contains(email, "@") {
		return false
	}
	addr, err := mail.ParseAddress(email)
	if err != nil {
		return false
	}
	return strings.EqualFold(addr.Address, email)
}

func generateSixDigitOTP() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func hashPasswordResetOTP(emailLower, otp, secret string) string {
	keySum := sha256.Sum256([]byte("password-reset-otp:" + secret))
	mac := hmac.New(sha256.New, keySum[:])
	mac.Write([]byte(emailLower))
	mac.Write([]byte(":"))
	mac.Write([]byte(otp))
	return hex.EncodeToString(mac.Sum(nil))
}
