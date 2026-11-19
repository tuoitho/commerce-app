package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	authuc "commerce-backend/internal/usecase/auth"
)

const (
	refreshCookieName = "refresh_token"
	refreshCookiePath = "/api/v1/auth"
)

type authHandler struct {
	uc         *authuc.UseCase
	refreshTTL time.Duration
	secure     bool
	sameSite   http.SameSite
}

func newAuthHandler(uc *authuc.UseCase, refreshTTL time.Duration, cookieSecure bool) *authHandler {
	return &authHandler{uc: uc, refreshTTL: refreshTTL, secure: cookieSecure, sameSite: http.SameSiteLaxMode}
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type sessionResponse struct {
	User        domain.UserPublic `json:"user"`
	AccessToken string            `json:"accessToken"`
}

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

type forgotPasswordResponse struct {
	CooldownSeconds int `json:"cooldownSeconds"`
}

type resetPasswordRequest struct {
	Email       string `json:"email"`
	OTP         string `json:"otp"`
	NewPassword string `json:"newPassword"`
}

type resetPasswordResponse struct {
	Reset bool `json:"reset"`
}

func (h *authHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "invalid JSON body"}))
		return
	}
	sess, err := h.uc.Register(c, req.Email, req.Password)
	if err != nil {
		writeError(c, err)
		return
	}
	h.setRefreshCookie(c, sess.RefreshToken)
	writeSuccess(c, http.StatusCreated, "Đăng ký tài khoản thành công", toSessionResponse(sess))
}

func (h *authHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "invalid JSON body"}))
		return
	}
	sess, err := h.uc.Login(c, req.Email, req.Password)
	if err != nil {
		writeError(c, err)
		return
	}
	h.setRefreshCookie(c, sess.RefreshToken)
	writeSuccess(c, http.StatusOK, "Đăng nhập thành công", toSessionResponse(sess))
}

func (h *authHandler) Refresh(c *gin.Context) {
	refreshToken, err := c.Cookie(refreshCookieName)
	if err != nil {
		writeError(c, domain.ErrInvalidToken)
		return
	}
	sess, err := h.uc.Refresh(c, refreshToken)
	if err != nil {
		writeError(c, err)
		return
	}
	h.setRefreshCookie(c, sess.RefreshToken)
	writeSuccess(c, http.StatusOK, "", toSessionResponse(sess))
}

func (h *authHandler) Logout(c *gin.Context) {
	refreshToken, _ := c.Cookie(refreshCookieName)
	_ = h.uc.Logout(c, refreshToken)
	h.clearRefreshCookie(c)
	c.Status(http.StatusNoContent)
}

func (h *authHandler) Me(c *gin.Context) {
	user, err := h.uc.Me(c, callerUserID(c))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "", user)
}

func (h *authHandler) ForgotPassword(c *gin.Context) {
	var req forgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "invalid JSON body"}))
		return
	}
	res, err := h.uc.ForgotPassword(c.Request.Context(), req.Email)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Nếu email tồn tại trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi.", forgotPasswordResponse{
		CooldownSeconds: res.CooldownSeconds,
	})
}

func (h *authHandler) ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "invalid JSON body"}))
		return
	}
	err := h.uc.ResetPassword(c.Request.Context(), authuc.ResetPasswordInput{
		Email:       req.Email,
		OTP:         req.OTP,
		NewPassword: req.NewPassword,
	})
	if err != nil {
		writeError(c, err)
		return
	}
	h.clearRefreshCookie(c)
	writeSuccess(c, http.StatusOK, "Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.", resetPasswordResponse{
		Reset: true,
	})
}

func (h *authHandler) setRefreshCookie(c *gin.Context, token string) {
	c.SetSameSite(h.sameSite)
	c.SetCookie(refreshCookieName, token, int(h.refreshTTL.Seconds()), refreshCookiePath, "", h.secure, true)
}

func (h *authHandler) clearRefreshCookie(c *gin.Context) {
	c.SetSameSite(h.sameSite)
	c.SetCookie(refreshCookieName, "", -1, refreshCookiePath, "", h.secure, true)
}

func toSessionResponse(sess *authuc.Session) sessionResponse {
	return sessionResponse{
		User:        sess.User,
		AccessToken: sess.AccessToken,
	}
}
