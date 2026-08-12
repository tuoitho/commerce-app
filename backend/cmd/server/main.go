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
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DBURL)
	if err != nil {
		log.Fatalf("create pgx pool: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping database: %v", err)
	}

	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	userRepo := repository.NewUserRepository(pool)
	sessionRepo := repository.NewSessionRepository(pool)

	jwtManager := jwt.NewManager(cfg.JWTSecret, "commerce-backend")

	authUC := authuc.New(authuc.Dependencies{
		Repos:        authuc.Repositories{Users: userRepo, Sessions: sessionRepo},
		JWT:          jwtManager,
		AccessTTL:    cfg.AccessTokenTTL,
		RefreshTTL:   cfg.RefreshTokenTTL,
		HashPassword: security.HashPassword,
		CheckPassword: security.CheckPassword,
		GenerateRefreshToken: security.GenerateRefreshToken,
	})

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	delivery.NewRouter(router, delivery.Dependencies{
		UseCase:      authUC,
		JWT:          jwtManager,
		RefreshTTL:   cfg.RefreshTokenTTL,
		CookieSecure: cfg.CookieSecure,
	})

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler: router,
	}

	log.Printf("server listening on %s", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("serve: %v", err)
	}
}