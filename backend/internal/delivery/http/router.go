package http

import (
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/security/jwt"
	authuc "commerce-backend/internal/usecase/auth"
)

type Dependencies struct {
	UseCase      *authuc.UseCase
	JWT          *jwt.Manager
	RefreshTTL   time.Duration
	CookieSecure bool
}

func NewRouter(router *gin.Engine, deps Dependencies) {
	api := router.Group("/api/v1")

	handler := newAuthHandler(deps.UseCase, deps.RefreshTTL, deps.CookieSecure)
	guard := newGuard(deps.JWT)

	auth := api.Group("/auth")
	{
		auth.POST("/register", handler.Register)
		auth.POST("/login", handler.Login)
		auth.POST("/refresh", handler.Refresh)
		auth.POST("/logout", handler.Logout)
		auth.GET("/me", guard.AuthRequired, handler.Me)
	}
}