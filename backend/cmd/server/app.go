package main

import (
	"context"
	"fmt"
	"log"
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

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DBURL)
	if err != nil {
		return fmt.Errorf("create pgx pool: %w", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler: newHandler(cfg, pool),
	}

	log.Printf("server listening on %s", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("serve: %w", err)
	}

	return nil
}

func newHandler(cfg *config.Config, pool *pgxpool.Pool) http.Handler {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	userRepo := repository.NewUserRepository(pool)
	sessionRepo := repository.NewSessionRepository(pool)
	catalogRepo := repository.NewCatalogRepository(pool)
	cartRepo := repository.NewCartRepository(pool)

	jwtManager := jwt.NewManager(cfg.JWTSecret, "commerce-backend")
	authUC := authuc.New(authuc.Dependencies{
		Repos:                authuc.Repositories{Users: userRepo, Sessions: sessionRepo},
		JWT:                  jwtManager,
		AccessTTL:            cfg.AccessTokenTTL,
		RefreshTTL:           cfg.RefreshTokenTTL,
		HashPassword:         security.HashPassword,
		CheckPassword:        security.CheckPassword,
		GenerateRefreshToken: security.GenerateRefreshToken,
	})
	catalogUC := cataloguc.New(cataloguc.Dependencies{Catalog: catalogRepo})
	cartUC := cartuc.New(cartuc.Dependencies{Cart: cartRepo})

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	delivery.NewRouter(router, delivery.Dependencies{
		UseCase:      authUC,
		Catalog:      catalogUC,
		Cart:         cartUC,
		JWT:          jwtManager,
		RefreshTTL:   cfg.RefreshTokenTTL,
		CookieSecure: cfg.CookieSecure,
	})

	return router
}
