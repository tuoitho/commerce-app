package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/usecase/auth"
	fakerepos "commerce-backend/internal/usecase/auth/fakerepos"
)

var enhancementSnapshotPath = filepath.Join("..", "..", "..", "..", ".dream", "specs", "commerce-platform-enhancements", "contract-snapshots.json")

const enhancementFeature = "commerce-platform-enhancements"

func newRecoveryTestRouter(t *testing.T) (*gin.Engine, *fakerepos.Users, *fakerepos.PasswordResets, *fakerepos.FakeMailer, *bytes.Buffer) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	users := fakerepos.NewUsers()
	sessions := fakerepos.NewSessions(users)
	resets := fakerepos.NewPasswordResets(users, sessions)
	mailer := fakerepos.NewFakeMailer()
	var logBuf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	manager := jwt.NewManager(testSecret, "commerce-backend")
	uc := auth.New(auth.Dependencies{
		Repos: auth.Repositories{
			Users:          users,
			Sessions:       sessions,
			PasswordResets: resets,
		},
		JWT:                 manager,
		Mailer:              mailer,
		AccessTTL:           15 * time.Minute,
		RefreshTTL:          24 * time.Hour,
		PasswordResetOTPTTL: 10 * time.Minute,
		OTPHMACSecret:       testSecret,
		HashPassword:        security.HashPassword,
		CheckPassword:       security.CheckPassword,
		GenerateRefreshToken: func() (security.RefreshTokenPair, error) {
			return security.GenerateRefreshToken()
		},
		Logger: log,
	})

	router := gin.New()
	router.Use(LoggingMiddleware(log), RecoveryMiddleware(log))
	NewRouter(router, Dependencies{
		UseCase:      uc,
		JWT:          manager,
		RefreshTTL:   24 * time.Hour,
		CookieSecure: false,
		Logger:       log,
	})
	return router, users, resets, mailer, &logBuf
}

func TestAuthRecoveryHandler_SnapshotsAndFlow(t *testing.T) {
	router, users, resets, mailer, logBuf := newRecoveryTestRouter(t)

	// Record unauthenticated_401 baseline for this feature's contract-snapshots.json
	unauthReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	unauthW := httptest.NewRecorder()
	router.ServeHTTP(unauthW, unauthReq)
	if unauthW.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated /auth/me, got %d", unauthW.Code)
	}
	assertOrRecordContractSnapshot(
		t,
		enhancementSnapshotPath,
		enhancementFeature,
		"unauthenticated_401",
		"API-AUTH-RECOVERY@1",
		"GET /api/v1/auth/me",
		nil,
		unauthW,
	)

	// Register an active customer and capture their refresh cookie
	regW, regCookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email":    "recovery@example.com",
		"password": "OldPassword123",
	})
	if regW.Code != http.StatusCreated {
		t.Fatalf("register status = %d, body = %s", regW.Code, regW.Body.String())
	}
	oldRefreshCookie := refreshCookie(regCookies)
	if oldRefreshCookie == nil {
		t.Fatal("expected refresh cookie after register")
	}

	// 1. Validation error on forgot-password
	badForgotBody := map[string]string{"email": "invalid-email"}
	wBadForgot, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/forgot-password", badForgotBody)
	if wBadForgot.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid email, got %d body=%s", wBadForgot.Code, wBadForgot.Body.String())
	}
	assertOrRecordContractSnapshot(
		t,
		enhancementSnapshotPath,
		enhancementFeature,
		"auth_forgot_password_validation_400",
		"API-AUTH-RECOVERY@1",
		"POST /api/v1/auth/forgot-password",
		badForgotBody,
		wBadForgot,
	)

	// 2. Forgot password success for active user
	forgotBody := map[string]string{"email": "recovery@example.com"}
	wForgot, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/forgot-password", forgotBody)
	if wForgot.Code != http.StatusOK {
		t.Fatalf("expected 200 on forgot-password, got %d body=%s", wForgot.Code, wForgot.Body.String())
	}
	assertOrRecordContractSnapshot(
		t,
		enhancementSnapshotPath,
		enhancementFeature,
		"auth_forgot_password_200",
		"API-AUTH-RECOVERY@1",
		"POST /api/v1/auth/forgot-password",
		forgotBody,
		wForgot,
	)

	otp := mailer.LastOTP()
	if len(otp) != 6 {
		t.Fatalf("expected 6-digit OTP sent to mailer, got %q", otp)
	}

	// 3. Anti-enumeration: unknown & locked email return identical 200 structure and message
	lockedRegW, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email":    "locked.recovery@example.com",
		"password": "OldPassword123",
	})
	if lockedRegW.Code != http.StatusCreated {
		t.Fatalf("register locked user status = %d", lockedRegW.Code)
	}
	lockedUser, err := users.GetByEmail(t.Context(), "locked.recovery@example.com")
	if err != nil {
		t.Fatal(err)
	}
	users.Lock(lockedUser.ID)

	for _, antiEnumEmail := range []string{"nonexistent@example.com", "locked.recovery@example.com"} {
		wAnti, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/forgot-password", map[string]string{"email": antiEnumEmail})
		if wAnti.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d", antiEnumEmail, wAnti.Code)
		}
		var env1, env2 struct {
			Message string `json:"message"`
			Data    struct {
				CooldownSeconds int `json:"cooldownSeconds"`
			} `json:"data"`
		}
		if err := json.Unmarshal(wForgot.Body.Bytes(), &env1); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(wAnti.Body.Bytes(), &env2); err != nil {
			t.Fatal(err)
		}
		if env1.Message != env2.Message || env1.Data.CooldownSeconds != env2.Data.CooldownSeconds {
			t.Fatalf("anti-enumeration response mismatch: active=%+v vs %s=%+v", env1, antiEnumEmail, env2)
		}
	}

	// 4. Rate limit on 6th request in 15m -> 429 otp_rate_limited
	rateBody := map[string]string{"email": "ratelimit@example.com"}
	for i := 0; i < 5; i++ {
		wRL, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/forgot-password", rateBody)
		if wRL.Code != http.StatusOK {
			t.Fatalf("rate limit warmup %d status = %d", i+1, wRL.Code)
		}
	}
	wRateLimited, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/forgot-password", rateBody)
	if wRateLimited.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 on 6th request, got %d body=%s", wRateLimited.Code, wRateLimited.Body.String())
	}
	var rateEnv ResponseEnvelope
	if err := json.Unmarshal(wRateLimited.Body.Bytes(), &rateEnv); err != nil {
		t.Fatal(err)
	}
	if rateEnv.Error == nil || rateEnv.Error.Code != "otp_rate_limited" {
		t.Fatalf("expected otp_rate_limited, got %+v", rateEnv.Error)
	}
	assertOrRecordContractSnapshot(
		t,
		enhancementSnapshotPath,
		enhancementFeature,
		"auth_forgot_password_rate_limited_429",
		"API-AUTH-RECOVERY@1",
		"POST /api/v1/auth/forgot-password",
		rateBody,
		wRateLimited,
	)

	// 5. SMTP delivery failure -> 502 email_delivery_failed
	mailer.NextErr = errors.New("smtp dial timeout")
	smtpErrBody := map[string]string{"email": "recovery@example.com"}
	wSMTPErr, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/forgot-password", smtpErrBody)
	if wSMTPErr.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 on SMTP failure, got %d body=%s", wSMTPErr.Code, wSMTPErr.Body.String())
	}
	var smtpEnv ResponseEnvelope
	if err := json.Unmarshal(wSMTPErr.Body.Bytes(), &smtpEnv); err != nil {
		t.Fatal(err)
	}
	if smtpEnv.Error == nil || smtpEnv.Error.Code != "email_delivery_failed" {
		t.Fatalf("expected email_delivery_failed, got %+v", smtpEnv.Error)
	}
	assertOrRecordContractSnapshot(
		t,
		enhancementSnapshotPath,
		enhancementFeature,
		"auth_forgot_password_smtp_error_502",
		"API-AUTH-RECOVERY@1",
		"POST /api/v1/auth/forgot-password",
		smtpErrBody,
		wSMTPErr,
	)
	mailer.NextErr = nil

	// Re-issue fresh OTP because the failed attempt invalidated otp before rollback
	wForgot2, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/forgot-password", forgotBody)
	if wForgot2.Code != http.StatusOK {
		t.Fatalf("re-forgot status = %d", wForgot2.Code)
	}
	otp = mailer.LastOTP()

	// 6. Reset password validation -> 400 validation_error
	badResetBody := map[string]string{
		"email":       "bad",
		"otp":         "12",
		"newPassword": "short",
	}
	wBadReset, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/reset-password", badResetBody)
	if wBadReset.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 validation_error, got %d", wBadReset.Code)
	}
	assertOrRecordContractSnapshot(
		t,
		enhancementSnapshotPath,
		enhancementFeature,
		"auth_reset_password_validation_400",
		"API-AUTH-RECOVERY@1",
		"POST /api/v1/auth/reset-password",
		badResetBody,
		wBadReset,
	)

	// 7. Wrong OTP -> 400 invalid_or_expired_otp
	wrongOTP := "000000"
	if otp == wrongOTP {
		wrongOTP = "999999"
	}
	wrongResetBody := map[string]string{
		"email":       "recovery@example.com",
		"otp":         wrongOTP,
		"newPassword": "NewPassword123@",
	}
	wWrongOTP, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/reset-password", wrongResetBody)
	if wWrongOTP.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 invalid_or_expired_otp, got %d body=%s", wWrongOTP.Code, wWrongOTP.Body.String())
	}
	var wrongEnv ResponseEnvelope
	if err := json.Unmarshal(wWrongOTP.Body.Bytes(), &wrongEnv); err != nil {
		t.Fatal(err)
	}
	if wrongEnv.Error == nil || wrongEnv.Error.Code != "invalid_or_expired_otp" {
		t.Fatalf("expected invalid_or_expired_otp, got %+v", wrongEnv.Error)
	}
	assertOrRecordContractSnapshot(
		t,
		enhancementSnapshotPath,
		enhancementFeature,
		"auth_reset_password_invalid_otp_400",
		"API-AUTH-RECOVERY@1",
		"POST /api/v1/auth/reset-password",
		wrongResetBody,
		wWrongOTP,
	)

	// Exhaust remaining 4 attempts -> 5th wrong attempt locks out even the right OTP
	for i := 0; i < 4; i++ {
		wRetry, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/reset-password", wrongResetBody)
		if wRetry.Code != http.StatusBadRequest {
			t.Fatalf("wrong attempt %d status = %d", i+2, wRetry.Code)
		}
	}
	wAfterLockout, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/reset-password", map[string]string{
		"email":       "recovery@example.com",
		"otp":         otp,
		"newPassword": "NewPassword123@",
	})
	if wAfterLockout.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 after 5 wrong attempts, got %d", wAfterLockout.Code)
	}

	// Issue fresh OTP for successful reset
	resets.AgeAll("recovery@example.com", 20*time.Minute)
	wForgot3, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/forgot-password", forgotBody)
	if wForgot3.Code != http.StatusOK {
		t.Fatalf("forgot3 status = %d", wForgot3.Code)
	}
	otpValid := mailer.LastOTP()

	// 8. Reset password success -> 200, clears refresh cookie, revokes old sessions, allows login with new password
	validResetBody := map[string]string{
		"email":       "recovery@example.com",
		"otp":         otpValid,
		"newPassword": "NewPassword123@",
	}
	wResetOK, resetCookies := doRequest(t, router, http.MethodPost, "/api/v1/auth/reset-password", validResetBody, oldRefreshCookie)
	if wResetOK.Code != http.StatusOK {
		t.Fatalf("expected 200 on valid reset, got %d body=%s", wResetOK.Code, wResetOK.Body.String())
	}
	if ck := refreshCookie(resetCookies); ck == nil || ck.MaxAge >= 0 {
		t.Fatalf("expected cleared refresh cookie (MaxAge < 0), got %+v", ck)
	}
	assertOrRecordContractSnapshot(
		t,
		enhancementSnapshotPath,
		enhancementFeature,
		"auth_reset_password_200",
		"API-AUTH-RECOVERY@1",
		"POST /api/v1/auth/reset-password",
		validResetBody,
		wResetOK,
	)

	// Old refresh token is revoked
	wOldRefresh, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/refresh", nil, oldRefreshCookie)
	if wOldRefresh.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when refreshing old token after password reset, got %d", wOldRefresh.Code)
	}

	// Login works with newPassword, fails with old password
	wOldLogin, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email":    "recovery@example.com",
		"password": "OldPassword123",
	})
	if wOldLogin.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for old password, got %d", wOldLogin.Code)
	}
	wNewLogin, _ := doRequest(t, router, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email":    "recovery@example.com",
		"password": "NewPassword123@",
	})
	if wNewLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 for new password, got %d body=%s", wNewLogin.Code, wNewLogin.Body.String())
	}

	// Verify no OTP or secret leaked into HTTP logs
	logOut := logBuf.String()
	for _, s := range []string{otp, otpValid, testSecret, "NewPassword123@"} {
		if strings.Contains(logOut, s) {
			t.Fatalf("sensitive data %q leaked to HTTP logs: %s", s, logOut)
		}
	}
	_ = domain.ErrInvalidOrExpiredOTP
}
