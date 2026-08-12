package http

import (
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/security/jwt"
	authuc "commerce-backend/internal/usecase/auth"
	cataloguc "commerce-backend/internal/usecase/catalog"
)

type Dependencies struct {
	UseCase      *authuc.UseCase
	Catalog      *cataloguc.UseCase
	JWT          *jwt.Manager
	RefreshTTL   time.Duration
	CookieSecure bool
}

func NewRouter(router *gin.Engine, deps Dependencies) {
	api := router.Group("/api/v1")

	authHandler := newAuthHandler(deps.UseCase, deps.RefreshTTL, deps.CookieSecure)
	guard := newGuard(deps.JWT)

	auth := api.Group("/auth")
	{
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
		auth.POST("/refresh", authHandler.Refresh)
		auth.POST("/logout", authHandler.Logout)
		auth.GET("/me", guard.AuthRequired, authHandler.Me)
	}

	catalogHandler := newCatalogHandler(deps.Catalog)
	api.GET("/categories", catalogHandler.ListCategories)
	products := api.Group("/products")
	{
		products.GET("", catalogHandler.ListProducts)
		products.GET("/:id", catalogHandler.GetProduct)
	}
}
