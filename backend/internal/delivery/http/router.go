package http

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/security/jwt"
	authuc "commerce-backend/internal/usecase/auth"
	cartuc "commerce-backend/internal/usecase/cart"
	cataloguc "commerce-backend/internal/usecase/catalog"
)

type Dependencies struct {
	UseCase      *authuc.UseCase
	Catalog      *cataloguc.UseCase
	Cart         *cartuc.UseCase
	JWT          *jwt.Manager
	RefreshTTL   time.Duration
	CookieSecure bool
	Logger       *slog.Logger
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
	api.GET("/brands", catalogHandler.ListBrands)
	products := api.Group("/products")
	{
		products.GET("", catalogHandler.ListProducts)
		products.GET("/featured", catalogHandler.ListFeaturedProducts)
		products.GET("/:id", catalogHandler.GetProduct)
	}

	cartHandler := newCartHandler(deps.Cart)
	cart := api.Group("/cart")
	cart.Use(guard.AuthRequired)
	{
		cart.GET("", cartHandler.Get)
		cart.POST("/items", cartHandler.AddItem)
		cart.PUT("/items/:itemId", cartHandler.SetQuantity)
		cart.PATCH("/items/:itemId/selection", cartHandler.SetSelection)
		cart.PUT("/selection", cartHandler.SetAllSelection)
		cart.DELETE("/items/:itemId", cartHandler.RemoveItem)
	}

	adminCatalogHandler := newAdminCatalogHandler(deps.Catalog)
	admin := api.Group("/admin")
	admin.Use(guard.AuthRequired, guard.RequireAdmin())
	{
		adminCategories := admin.Group("/categories")
		{
			adminCategories.GET("", adminCatalogHandler.ListCategories)
			adminCategories.POST("", adminCatalogHandler.CreateCategory)
			adminCategories.PUT("/:id", adminCatalogHandler.UpdateCategory)
			adminCategories.DELETE("/:id", adminCatalogHandler.DeleteCategory)
		}
		adminProducts := admin.Group("/products")
		{
			adminProducts.GET("", adminCatalogHandler.ListProducts)
			adminProducts.GET("/:id", adminCatalogHandler.GetProduct)
			adminProducts.POST("", adminCatalogHandler.CreateProduct)
			adminProducts.PUT("/:id", adminCatalogHandler.UpdateProduct)
			adminProducts.DELETE("/:id", adminCatalogHandler.DeleteProduct)
		}
	}
}
