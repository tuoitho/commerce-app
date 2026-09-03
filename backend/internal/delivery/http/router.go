package http

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/security/jwt"
	addressuc "commerce-backend/internal/usecase/address"
	areauc "commerce-backend/internal/usecase/area"
	authuc "commerce-backend/internal/usecase/auth"
	cartuc "commerce-backend/internal/usecase/cart"
	cataloguc "commerce-backend/internal/usecase/catalog"
	favoriteuc "commerce-backend/internal/usecase/favorite"
	orderuc "commerce-backend/internal/usecase/order"
	returnsuc "commerce-backend/internal/usecase/returns"
	reviewuc "commerce-backend/internal/usecase/review"
)

type Dependencies struct {
	UseCase      *authuc.UseCase
	Catalog      *cataloguc.UseCase
	Cart         *cartuc.UseCase
	Area         *areauc.UseCase
	Address      *addressuc.UseCase
	Order        *orderuc.UseCase
	Returns      *returnsuc.UseCase
	Favorites    *favoriteuc.UseCase
	Review       *reviewuc.UseCase
	JWT          *jwt.Manager
	RefreshTTL   time.Duration
	CookieSecure bool
	Logger       *slog.Logger
}

func NewRouter(router *gin.Engine, deps Dependencies) {
	reviewHandler := newReviewHandler(deps.Review)
	mediaHandler := newMediaHandler(deps.Review)

	// Public media proxy route
	router.GET("/media/reviews/:mediaId", mediaHandler.GetPublicMedia)

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

	catalogHandler := newCatalogHandler(deps.Catalog, deps.Favorites, deps.Review)
	api.GET("/categories", catalogHandler.ListCategories)
	api.GET("/brands", catalogHandler.ListBrands)
	products := api.Group("/products")
	products.Use(guard.OptionalCustomerAuth)
	{
		products.GET("", catalogHandler.ListProducts)
		products.GET("/featured", catalogHandler.ListFeaturedProducts)
		products.GET("/:id", catalogHandler.GetProduct)
		products.GET("/:id/reviews", reviewHandler.ListProductReviews)
	}

	reviews := api.Group("/reviews")
	reviews.Use(guard.RequireCustomerAuthForReviews)
	{
		reviews.GET("", reviewHandler.ListOwnedReviews)
		reviews.GET("/:reviewId", reviewHandler.GetOwnedReview)
		reviews.PUT("/:reviewId", reviewHandler.EditOwnedReview)
		reviews.PUT("/:reviewId/vote", reviewHandler.VoteReview)
		reviews.DELETE("/:reviewId/vote", reviewHandler.UnvoteReview)
	}

	favoriteHandler := newFavoriteHandler(deps.Favorites)
	favorites := api.Group("/favorites")
	favorites.Use(guard.RequireCustomerAuthForFavorites)
	{
		favorites.GET("", favoriteHandler.List)
		favorites.PUT("/:productId", favoriteHandler.Add)
		favorites.DELETE("/:productId", favoriteHandler.Remove)
	}

	areaHandler := newAreaHandler(deps.Area)
	api.GET("/provinces", areaHandler.ListProvinces)
	api.GET("/provinces/:code/wards", areaHandler.ListWards)

	addressHandler := newAddressHandler(deps.Address)
	addresses := api.Group("/addresses")
	addresses.Use(guard.AuthRequired)
	{
		addresses.GET("", addressHandler.List)
		addresses.POST("", addressHandler.Create)
		addresses.PUT("/:id", addressHandler.Update)
		addresses.PATCH("/:id/default", addressHandler.SetDefault)
		addresses.DELETE("/:id", addressHandler.Delete)
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

	orderHandler := newOrderHandler(deps.Order)
	returnHandler := newReturnHandler(deps.Returns)
	orders := api.Group("/orders")
	orders.Use(guard.AuthRequired)
	{
		orders.POST("", orderHandler.Create)
		orders.GET("/stats", orderHandler.Stats)
		orders.GET("", orderHandler.List)
		orders.GET("/:id", orderHandler.GetByID)
		orders.POST("/:id/cancel", orderHandler.Cancel)
		orders.POST("/:id/cancel/undo", orderHandler.UndoCancel)
		orders.POST("/:id/return-requests", returnHandler.Create)
		orders.GET("/:id/return-requests", returnHandler.ListByOrder)
		orders.POST("/:id/return-requests/:requestId/cancel", returnHandler.Cancel)
		orders.POST("/:id/items/:orderItemId/review", guard.RequireCustomerAuthForReviews, reviewHandler.Create)
	}

	adminCatalogHandler := newAdminCatalogHandler(deps.Catalog)
	adminOrderHandler := newAdminOrderHandler(deps.Order)
	adminReturnHandler := newAdminReturnHandler(deps.Returns)
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
		adminOrders := admin.Group("/orders")
		{
			adminOrders.GET("", adminOrderHandler.List)
			adminOrders.GET("/:id", adminOrderHandler.GetByID)
			adminOrders.POST("/:id/confirm-preparing", adminOrderHandler.ConfirmPreparing)
			adminOrders.POST("/:id/ship", adminOrderHandler.Ship)
			adminOrders.POST("/:id/deliver", adminOrderHandler.Deliver)
			adminOrders.POST("/:id/cancel/approve", adminOrderHandler.ApproveCancel)
			adminOrders.POST("/:id/cancel/decline", adminOrderHandler.DeclineCancel)
		}
		adminReturns := admin.Group("/return-requests")
		{
			adminReturns.GET("", adminReturnHandler.List)
			adminReturns.GET("/:id", adminReturnHandler.GetByID)
			adminReturns.POST("/:id/approve", adminReturnHandler.Approve)
			adminReturns.POST("/:id/reject", adminReturnHandler.Reject)
			adminReturns.POST("/:id/receive", adminReturnHandler.Receive)
			adminReturns.POST("/:id/refund", adminReturnHandler.RecordRefund)
		}
	}

	adminReviews := api.Group("/admin/reviews")
	adminReviews.Use(guard.AdminReviewAuthRequired, func(c *gin.Context) {
		if callerRole(c) != "admin" {
			respondError(c, 403, "forbidden", "Bạn không có quyền phản hồi đánh giá", nil)
			c.Abort()
			return
		}
		c.Next()
	})
	{
		adminReviews.GET("/stats", reviewHandler.GetAdminReviewStats)
		adminReviews.GET("", reviewHandler.ListAdminReviews)
		adminReviews.POST("/:reviewId/response", reviewHandler.CreateStoreResponse)
		adminReviews.PUT("/:reviewId/response", reviewHandler.UpdateStoreResponse)
	}
}
