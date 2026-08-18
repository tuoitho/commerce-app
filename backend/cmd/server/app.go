package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"commerce-backend/internal/config"
	delivery "commerce-backend/internal/delivery/http"
	"commerce-backend/internal/repository"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
	authuc "commerce-backend/internal/usecase/auth"
	cartuc "commerce-backend/internal/usecase/cart"
	cataloguc "commerce-backend/internal/usecase/catalog"
)

type App struct {
	Config *config.Config
	Logger *slog.Logger
	Pool   *pgxpool.Pool
	Server *http.Server
	AuthUC *authuc.UseCase
}

func (a *App) Run(ctx context.Context) error {
	if err := a.Pool.Ping(ctx); err != nil {
		a.Logger.Error("database ping failed", "category", "db_ping")
		return fmt.Errorf("ping database: %w", err)
	}

	if a.Config.AdminBootstrapEmail != "" && a.Config.AdminBootstrapPassword != "" {
		if err := a.AuthUC.BootstrapAdmin(ctx, a.Config.AdminBootstrapEmail, a.Config.AdminBootstrapPassword); err != nil {
			a.Logger.Error("bootstrap admin failed", "category", "bootstrap_admin")
			return fmt.Errorf("bootstrap admin: %w", err)
		}
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

func provideCartUseCase(repo *repository.CartRepository) *cartuc.UseCase {
	return cartuc.New(cartuc.Dependencies{Cart: repo})
}

func provideGinRouter(cfg *config.Config, log *slog.Logger, authUC *authuc.UseCase, catalogUC *cataloguc.UseCase, cartUC *cartuc.UseCase, jwtMgr *jwt.Manager) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	router := gin.New()
	router.Use(delivery.LoggingMiddleware(log), delivery.RecoveryMiddleware(log))
	delivery.NewRouter(router, delivery.Dependencies{
		UseCase:      authUC,
		Catalog:      catalogUC,
		Cart:         cartUC,
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

func provideApp(cfg *config.Config, log *slog.Logger, pool *pgxpool.Pool, srv *http.Server, authUC *authuc.UseCase) *App {
	return &App{
		Config: cfg,
		Logger: log,
		Pool:   pool,
		Server: srv,
		AuthUC: authUC,
	}
}
