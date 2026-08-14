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
	c.JSON(http.StatusCreated, toSessionResponse(sess))
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
	c.JSON(http.StatusOK, toSessionResponse(sess))
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
	c.JSON(http.StatusOK, toSessionResponse(sess))
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
	c.JSON(http.StatusOK, gin.H{"user": user})
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
