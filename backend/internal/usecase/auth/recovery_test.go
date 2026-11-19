package auth

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"testing"
	"time"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/usecase/auth/fakerepos"
)

type recoveryTestEnv struct {
	uc       *UseCase
	users    *fakerepos.Users
	sessions *fakerepos.Sessions
	resets   *fakerepos.PasswordResets
	mailer   *fakerepos.FakeMailer
	logBuf   *bytes.Buffer
}

func newRecoveryTestEnv(t *testing.T) *recoveryTestEnv {
	t.Helper()
	users := fakerepos.NewUsers()
	sessions := fakerepos.NewSessions(users)
	resets := fakerepos.NewPasswordResets(users, sessions)
	mailer := fakerepos.NewFakeMailer()
	var logBuf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	uc := New(Dependencies{
		Repos: Repositories{
			Users:          users,
			Sessions:       sessions,
			PasswordResets: resets,
		},
		JWT:                 jwt.NewManager(testSecret, "commerce-backend"),
		Mailer:              mailer,
		AccessTTL:           15 * time.Minute,
		RefreshTTL:          24 * time.Hour,
		PasswordResetOTPTTL: 10 * time.Minute,
		OTPHMACSecret:       testSecret,
		HashPassword:        hashPassword,
		CheckPassword:       checkPassword,
		GenerateRefreshToken: func() (security.RefreshTokenPair, error) {
			return security.GenerateRefreshToken()
		},
		Logger: log,
	})

	return &recoveryTestEnv{
		uc:       uc,
		users:    users,
		sessions: sessions,
		resets:   resets,
		mailer:   mailer,
		logBuf:   &logBuf,
	}
}

func TestForgotPassword_InvalidEmailValidation(t *testing.T) {
	env := newRecoveryTestEnv(t)
	for _, bad := range []string{"", "   ", "not-an-email", "Alice <alice@example.com>"} {
		_, err := env.uc.ForgotPassword(context.Background(), bad)
		var ve *domain.ValidationError
		if !errors.As(err, &ve) || ve.Fields["email"] == "" {
			t.Fatalf("email %q: expected ValidationError with fields.email, got %v", bad, err)
		}
	}
}

func TestForgotPassword_ActiveUserSendsSixDigitOTPAndStoresHashOnly(t *testing.T) {
	env := newRecoveryTestEnv(t)
	registerUser(t, env.uc, "customer@example.com")

	res, err := env.uc.ForgotPassword(context.Background(), "  Customer@example.com  ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.CooldownSeconds != 60 {
		t.Fatalf("CooldownSeconds = %d, want 60", res.CooldownSeconds)
	}
	if env.mailer.SentCount() != 1 {
		t.Fatalf("expected 1 email sent, got %d", env.mailer.SentCount())
	}
	sent := env.mailer.Sent[0]
	if sent.To != "customer@example.com" {
		t.Errorf("recipient = %q, want customer@example.com", sent.To)
	}
	if !regexp.MustCompile(`^[0-9]{6}$`).MatchString(sent.OTP) {
		t.Errorf("expected 6-digit OTP, got %q", sent.OTP)
	}
	if sent.TTL != 10*time.Minute {
		t.Errorf("TTL = %v, want 10m", sent.TTL)
	}

	rec := env.resets.LatestRecord("customer@example.com")
	if rec == nil || rec.OTPHash == nil {
		t.Fatal("expected stored OTP record with hash")
	}
	if *rec.OTPHash == sent.OTP || strings.Contains(*rec.OTPHash, sent.OTP) {
		t.Fatal("OTP hash must not store plaintext OTP")
	}
	if strings.Contains(env.logBuf.String(), sent.OTP) || strings.Contains(env.logBuf.String(), testSecret) {
		t.Fatalf("OTP or HMAC secret leaked to slog: %s", env.logBuf.String())
	}
}

func TestForgotPassword_AntiEnumerationUnknownAndLockedAccounts(t *testing.T) {
	env := newRecoveryTestEnv(t)
	sess, err := env.uc.Register(context.Background(), "locked@example.com", "password123")
	if err != nil {
		t.Fatal(err)
	}
	env.users.Lock(sess.User.ID)

	for _, email := range []string{"unknown@example.com", "locked@example.com"} {
		for i := 0; i < 5; i++ {
			res, err := env.uc.ForgotPassword(context.Background(), email)
			if err != nil {
				t.Fatalf("email %s req %d: unexpected error %v", email, i+1, err)
			}
			if res.CooldownSeconds != 60 {
				t.Fatalf("email %s req %d: CooldownSeconds = %d, want 60", email, i+1, res.CooldownSeconds)
			}
		}
		if env.mailer.SentCount() != 0 {
			t.Fatalf("mailer must not send for %s", email)
		}
		// 6th request within 15m hits rate limit identically to active accounts
		_, err := env.uc.ForgotPassword(context.Background(), email)
		if !errors.Is(err, domain.ErrOTPRateLimited) {
			t.Fatalf("email %s req 6: expected ErrOTPRateLimited, got %v", email, err)
		}
	}
}

func TestForgotPassword_RateLimitResetsAfter15Minutes(t *testing.T) {
	env := newRecoveryTestEnv(t)
	registerUser(t, env.uc, "rate@example.com")

	for i := 0; i < 5; i++ {
		if _, err := env.uc.ForgotPassword(context.Background(), "rate@example.com"); err != nil {
			t.Fatalf("req %d: %v", i+1, err)
		}
	}
	if _, err := env.uc.ForgotPassword(context.Background(), "rate@example.com"); !errors.Is(err, domain.ErrOTPRateLimited) {
		t.Fatalf("expected ErrOTPRateLimited, got %v", err)
	}

	env.resets.AgeAll("rate@example.com", 16*time.Minute)
	if _, err := env.uc.ForgotPassword(context.Background(), "rate@example.com"); err != nil {
		t.Fatalf("expected success after 15m window passes, got %v", err)
	}
}

func TestForgotPassword_SMTPFailureDeletesChallengeAndReturnsError(t *testing.T) {
	env := newRecoveryTestEnv(t)
	registerUser(t, env.uc, "smtpfail@example.com")
	env.mailer.NextErr = errors.New("smtp connection refused")

	_, err := env.uc.ForgotPassword(context.Background(), "smtpfail@example.com")
	if !errors.Is(err, domain.ErrEmailDeliveryFailed) {
		t.Fatalf("expected ErrEmailDeliveryFailed, got %v", err)
	}
	if rec := env.resets.LatestRecord("smtpfail@example.com"); rec != nil {
		t.Fatalf("failed SMTP delivery must roll back/delete OTP record so user quota is not consumed, got %+v", rec)
	}

	// Subsequent retry succeeds without losing quota
	env.mailer.NextErr = nil
	if _, err := env.uc.ForgotPassword(context.Background(), "smtpfail@example.com"); err != nil {
		t.Fatalf("expected retry to succeed, got %v", err)
	}
}

func TestResetPassword_Validation(t *testing.T) {
	env := newRecoveryTestEnv(t)

	cases := []struct {
		name      string
		in        ResetPasswordInput
		wantField string
	}{
		{"bad email", ResetPasswordInput{Email: "nope", OTP: "123456", NewPassword: "NewPassword123"}, "email"},
		{"short otp", ResetPasswordInput{Email: "a@example.com", OTP: "12345", NewPassword: "NewPassword123"}, "otp"},
		{"alpha otp", ResetPasswordInput{Email: "a@example.com", OTP: "12345a", NewPassword: "NewPassword123"}, "otp"},
		{"short password", ResetPasswordInput{Email: "a@example.com", OTP: "123456", NewPassword: "short"}, "newPassword"},
		{"too long password", ResetPasswordInput{Email: "a@example.com", OTP: "123456", NewPassword: strings.Repeat("a", 73)}, "newPassword"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := env.uc.ResetPassword(context.Background(), tc.in)
			var ve *domain.ValidationError
			if !errors.As(err, &ve) || ve.Fields[tc.wantField] == "" {
				t.Fatalf("expected ValidationError on %q, got %v", tc.wantField, err)
			}
		})
	}
}

func TestResetPassword_AttemptLockoutAndSuccessRevokesAllSessions(t *testing.T) {
	env := newRecoveryTestEnv(t)
	s1, err := env.uc.Register(context.Background(), "user@example.com", "OldPassword1")
	if err != nil {
		t.Fatal(err)
	}
	s2, err := env.uc.Login(context.Background(), "user@example.com", "OldPassword1")
	if err != nil {
		t.Fatal(err)
	}
	if env.sessions.ActiveTokenCount(s1.User.ID) != 2 {
		t.Fatalf("expected 2 active refresh tokens, got %d", env.sessions.ActiveTokenCount(s1.User.ID))
	}

	// Issue OTP #1 and exhaust 5 wrong attempts
	if _, err := env.uc.ForgotPassword(context.Background(), "user@example.com"); err != nil {
		t.Fatal(err)
	}
	otp1 := env.mailer.LastOTP()
	wrongOTP := "000000"
	if otp1 == wrongOTP {
		wrongOTP = "999999"
	}
	for i := 0; i < 5; i++ {
		err := env.uc.ResetPassword(context.Background(), ResetPasswordInput{
			Email:       "user@example.com",
			OTP:         wrongOTP,
			NewPassword: "NewPassword123",
		})
		if !errors.Is(err, domain.ErrInvalidOrExpiredOTP) {
			t.Fatalf("attempt %d: expected ErrInvalidOrExpiredOTP, got %v", i+1, err)
		}
	}
	// Even right OTP fails on 6th try
	if err := env.uc.ResetPassword(context.Background(), ResetPasswordInput{
		Email:       "user@example.com",
		OTP:         otp1,
		NewPassword: "NewPassword123",
	}); !errors.Is(err, domain.ErrInvalidOrExpiredOTP) {
		t.Fatalf("expected ErrInvalidOrExpiredOTP after lockout, got %v", err)
	}

	// Issue OTP #2 and test expiration
	if _, err := env.uc.ForgotPassword(context.Background(), "user@example.com"); err != nil {
		t.Fatal(err)
	}
	otp2 := env.mailer.LastOTP()
	env.resets.ExpireLatest("user@example.com")
	if err := env.uc.ResetPassword(context.Background(), ResetPasswordInput{
		Email:       "user@example.com",
		OTP:         otp2,
		NewPassword: "NewPassword123",
	}); !errors.Is(err, domain.ErrInvalidOrExpiredOTP) {
		t.Fatalf("expected ErrInvalidOrExpiredOTP for expired OTP, got %v", err)
	}

	// Issue OTP #3 and succeed
	if _, err := env.uc.ForgotPassword(context.Background(), "user@example.com"); err != nil {
		t.Fatal(err)
	}
	otp3 := env.mailer.LastOTP()
	if err := env.uc.ResetPassword(context.Background(), ResetPasswordInput{
		Email:       "  USER@example.com ",
		OTP:         otp3,
		NewPassword: "NewPassword123",
	}); err != nil {
		t.Fatalf("expected reset success, got %v", err)
	}

	// All refresh tokens revoked
	if env.sessions.ActiveTokenCount(s1.User.ID) != 0 {
		t.Fatalf("expected 0 active tokens after reset, got %d", env.sessions.ActiveTokenCount(s1.User.ID))
	}
	if _, err := env.uc.Refresh(context.Background(), s1.RefreshToken); !errors.Is(err, domain.ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken for old session 1, got %v", err)
	}
	if _, err := env.uc.Refresh(context.Background(), s2.RefreshToken); !errors.Is(err, domain.ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken for old session 2, got %v", err)
	}

	// Old password fails, new password works
	if _, err := env.uc.Login(context.Background(), "user@example.com", "OldPassword1"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials for old password, got %v", err)
	}
	if _, err := env.uc.Login(context.Background(), "user@example.com", "NewPassword123"); err != nil {
		t.Fatalf("expected login with new password to succeed, got %v", err)
	}

	// Reusing otp3 fails
	if err := env.uc.ResetPassword(context.Background(), ResetPasswordInput{
		Email:       "user@example.com",
		OTP:         otp3,
		NewPassword: "AnotherPassword1",
	}); !errors.Is(err, domain.ErrInvalidOrExpiredOTP) {
		t.Fatalf("expected ErrInvalidOrExpiredOTP when reusing consumed OTP, got %v", err)
	}

	// Verify neither OTP nor secret leaked in slog
	logOut := env.logBuf.String()
	for _, secret := range []string{otp1, otp2, otp3, testSecret, "NewPassword123"} {
		if strings.Contains(logOut, secret) {
			t.Fatalf("sensitive value %q leaked to slog: %s", secret, logOut)
		}
	}
}

type contextCheckingPasswordResets struct {
	*fakerepos.PasswordResets
	deleteSeenNonCancelled bool
	deleteHadDeadline      bool
}

func (r *contextCheckingPasswordResets) DeleteChallenge(ctx context.Context, id string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.deleteSeenNonCancelled = true
	_, r.deleteHadDeadline = ctx.Deadline()
	return r.PasswordResets.DeleteChallenge(ctx, id)
}

type cancelingMailer struct {
	cancel context.CancelFunc
	err    error
}

func (m *cancelingMailer) SendPasswordResetOTP(ctx context.Context, toEmail, otp string, ttl time.Duration) error {
	m.cancel()
	return m.err
}

func TestForgotPassword_ContextCancelDuringSMTPStillDeletesChallenge(t *testing.T) {
	env := newRecoveryTestEnv(t)
	registerUser(t, env.uc, "cancel@example.com")

	ctx, cancel := context.WithCancel(context.Background())
	checkedResets := &contextCheckingPasswordResets{PasswordResets: env.resets}
	uc := New(Dependencies{
		Repos: Repositories{
			Users:          env.users,
			Sessions:       env.sessions,
			PasswordResets: checkedResets,
		},
		JWT:                 jwt.NewManager(testSecret, "commerce-backend"),
		Mailer:              &cancelingMailer{cancel: cancel, err: errors.New("smtp failed after client cancel")},
		AccessTTL:           15 * time.Minute,
		RefreshTTL:          24 * time.Hour,
		PasswordResetOTPTTL: 10 * time.Minute,
		OTPHMACSecret:       testSecret,
		HashPassword:        hashPassword,
		CheckPassword:       checkPassword,
		GenerateRefreshToken: func() (security.RefreshTokenPair, error) {
			return security.GenerateRefreshToken()
		},
		Logger: slog.New(slog.NewJSONHandler(env.logBuf, &slog.HandlerOptions{Level: slog.LevelDebug})),
	})

	_, err := uc.ForgotPassword(ctx, "cancel@example.com")
	if !errors.Is(err, domain.ErrEmailDeliveryFailed) {
		t.Fatalf("expected ErrEmailDeliveryFailed, got %v", err)
	}
	if !checkedResets.deleteSeenNonCancelled {
		t.Fatal("expected DeleteChallenge rollback to receive a non-cancelled context")
	}
	if !checkedResets.deleteHadDeadline {
		t.Fatal("expected DeleteChallenge rollback context to have a bounded deadline")
	}
	if rec := env.resets.LatestRecord("cancel@example.com"); rec != nil {
		t.Fatalf("expected failed OTP challenge to be deleted even when caller ctx is cancelled, got %+v", rec)
	}

	// Subsequent retry with a fresh context succeeds without consuming rate-limit quota.
	if _, err := env.uc.ForgotPassword(context.Background(), "cancel@example.com"); err != nil {
		t.Fatalf("expected retry to succeed, got %v", err)
	}
}
