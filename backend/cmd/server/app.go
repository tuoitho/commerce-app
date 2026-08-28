package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"commerce-backend/internal/config"
	delivery "commerce-backend/internal/delivery/http"
	"commerce-backend/internal/repository"
	"commerce-backend/internal/security"
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
	"commerce-backend/internal/storage"
)

type App struct {
	Config   *config.Config
	Logger   *slog.Logger
	Pool     *pgxpool.Pool
	Server   *http.Server
	AuthUC   *authuc.UseCase
	OrderUC  *orderuc.UseCase
	ReviewUC *reviewuc.UseCase
	Storage  storage.Storage
}

func (a *App) Run(ctx context.Context) error {
	if err := a.Pool.Ping(ctx); err != nil {
		a.Logger.Error("database ping failed", "category", "db_ping")
		return fmt.Errorf("ping database: %w", err)
	}

	if a.Storage != nil {
		if err := a.Storage.EnsureBucket(ctx); err != nil {
			a.Logger.Warn("ensure minio bucket failed", "category", "minio_bucket", "error", err)
		}
	}

	if a.Config.AdminBootstrapEmail != "" && a.Config.AdminBootstrapPassword != "" {
		if err := a.AuthUC.BootstrapAdmin(ctx, a.Config.AdminBootstrapEmail, a.Config.AdminBootstrapPassword); err != nil {
			a.Logger.Error("bootstrap admin failed", "category", "bootstrap_admin")
			return fmt.Errorf("bootstrap admin: %w", err)
		}
	}

	if a.OrderUC != nil {
		go func() {
			ticker := time.NewTicker(time.Minute)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					cutoff := time.Now().Add(-a.Config.OrderConfirmTimeout)
					if err := a.OrderUC.AutoConfirmDue(ctx, cutoff); err != nil {
						a.Logger.Error("auto confirm due orders failed", "category", "auto_confirm", "error", err)
					}
				}
			}
		}()
	}

	if a.ReviewUC != nil {
		go func() {
			ticker := time.NewTicker(a.Config.MinIOReconcilerInterval)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					if err := a.ReviewUC.Reconcile(ctx); err != nil {
						a.Logger.Warn("reconcile unreferenced review media failed", "category", "reconcile", "error", err)
					}
				}
			}
		}()
	}

	a.Logger.Info("server listening", "addr", a.Server.Addr)
	if err := a.Server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("serve: %w", err)
	}

	return nil
}

func providePgxPool(ctx context.Context, cfg *config.Config) (*pgxpool.Pool, func(), error) {
	pool, err := pgxpool.New(ctx, cfg.DBURL)
	if err != nil {
		return nil, nil, fmt.Errorf("create pgx pool: %w", err)
	}
	cleanup := func() {
		pool.Close()
	}
	return pool, cleanup, nil
}

func provideUserRepository(pool *pgxpool.Pool) *repository.UserRepository {
	return repository.NewUserRepository(pool)
}

func provideSessionRepository(pool *pgxpool.Pool) *repository.SessionRepository {
	return repository.NewSessionRepository(pool)
}

func provideCatalogRepository(pool *pgxpool.Pool) *repository.CatalogRepository {
	return repository.NewCatalogRepository(pool)
}

func provideCartRepository(pool *pgxpool.Pool) *repository.CartRepository {
	return repository.NewCartRepository(pool)
}

func provideAreaRepository() (*repository.AreaRepository, error) {
	return repository.NewAreaRepository()
}

func provideAddressRepository(pool *pgxpool.Pool, areaRepo *repository.AreaRepository) *repository.AddressRepository {
	return repository.NewAddressRepository(pool, areaRepo)
}

func provideOrderRepository(pool *pgxpool.Pool) *repository.OrderRepository {
	return repository.NewOrderRepository(pool)
}

func provideReturnRepository(pool *pgxpool.Pool) *repository.ReturnRepository {
	return repository.NewReturnRepository(pool)
}

func provideFavoriteRepository(pool *pgxpool.Pool) *repository.FavoriteRepository {
	return repository.NewFavoriteRepository(pool)
}

func provideReviewRepository(pool *pgxpool.Pool) *repository.ReviewRepository {
	return repository.NewReviewRepository(pool)
}

func provideMediaStorage(cfg *config.Config, log *slog.Logger) (storage.Storage, error) {
	return storage.NewMinIOStorage(cfg, log)
}

func provideJWTManager(cfg *config.Config) *jwt.Manager {
	return jwt.NewManager(cfg.JWTSecret, "commerce-backend")
}

func provideAuthUseCase(userRepo *repository.UserRepository, sessionRepo *repository.SessionRepository, jwtMgr *jwt.Manager, cfg *config.Config) *authuc.UseCase {
	return authuc.New(authuc.Dependencies{
		Repos:                authuc.Repositories{Users: userRepo, Sessions: sessionRepo},
		JWT:                  jwtMgr,
		AccessTTL:            cfg.AccessTokenTTL,
		RefreshTTL:           cfg.RefreshTokenTTL,
		HashPassword:         security.HashPassword,
		CheckPassword:        security.CheckPassword,
		GenerateRefreshToken: security.GenerateRefreshToken,
	})
}

func provideCatalogUseCase(repo *repository.CatalogRepository) *cataloguc.UseCase {
	return cataloguc.New(cataloguc.Dependencies{Catalog: repo})
}

func provideCartUseCase(repo *repository.CartRepository, cfg *config.Config) *cartuc.UseCase {
	return cartuc.New(cartuc.Dependencies{
		Cart:           repo,
		ShippingFeeVND: cfg.ShippingFeeVND,
	})
}

func provideAreaUseCase(repo *repository.AreaRepository) *areauc.UseCase {
	return areauc.New(areauc.Dependencies{Area: repo})
}

func provideAddressUseCase(repo *repository.AddressRepository, areaRepo *repository.AreaRepository) *addressuc.UseCase {
	return addressuc.New(addressuc.Dependencies{
		Address: repo,
		Area:    areaRepo,
	})
}

func provideOrderUseCase(repo *repository.OrderRepository, cfg *config.Config) *orderuc.UseCase {
	return orderuc.New(orderuc.Dependencies{
		Order:               repo,
		ShippingFeeVND:      cfg.ShippingFeeVND,
		OrderConfirmTimeout: cfg.OrderConfirmTimeout,
	})
}

func provideReturnsUseCase(repo *repository.ReturnRepository) *returnsuc.UseCase {
	return returnsuc.New(returnsuc.Dependencies{Returns: repo})
}

func provideFavoriteUseCase(repo *repository.FavoriteRepository) *favoriteuc.UseCase {
	return favoriteuc.New(favoriteuc.Dependencies{Favorites: repo})
}

func provideReviewUseCase(repo *repository.ReviewRepository, store storage.Storage, log *slog.Logger, cfg *config.Config) *reviewuc.UseCase {
	return reviewuc.New(reviewuc.Dependencies{
		Reviews:     repo,
		Storage:     store,
		Logger:      log,
		GracePeriod: cfg.MinIOGracePeriod,
	})
}

func provideGinRouter(cfg *config.Config, log *slog.Logger, authUC *authuc.UseCase, catalogUC *cataloguc.UseCase, cartUC *cartuc.UseCase, areaUC *areauc.UseCase, addressUC *addressuc.UseCase, orderUC *orderuc.UseCase, returnsUC *returnsuc.UseCase, favoriteUC *favoriteuc.UseCase, reviewUC *reviewuc.UseCase, jwtMgr *jwt.Manager) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	router := gin.New()
	router.Use(delivery.LoggingMiddleware(log), delivery.RecoveryMiddleware(log))
	delivery.NewRouter(router, delivery.Dependencies{
		UseCase:      authUC,
		Catalog:      catalogUC,
		Cart:         cartUC,
		Area:         areaUC,
		Address:      addressUC,
		Order:        orderUC,
		Returns:      returnsUC,
		Favorites:    favoriteUC,
		Review:       reviewUC,
		JWT:          jwtMgr,
		RefreshTTL:   cfg.RefreshTokenTTL,
		CookieSecure: cfg.CookieSecure,
		Logger:       log,
	})
	return router
}

func provideHTTPServer(cfg *config.Config, router *gin.Engine) *http.Server {
	return &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler: router,
	}
}

func provideApp(cfg *config.Config, log *slog.Logger, pool *pgxpool.Pool, srv *http.Server, authUC *authuc.UseCase, orderUC *orderuc.UseCase, reviewUC *reviewuc.UseCase, store storage.Storage) *App {
	return &App{
		Config:   cfg,
		Logger:   log,
		Pool:     pool,
		Server:   srv,
		AuthUC:   authUC,
		OrderUC:  orderUC,
		ReviewUC: reviewUC,
		Storage:  store,
	}
}

