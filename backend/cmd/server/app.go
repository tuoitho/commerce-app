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
	chatuc "commerce-backend/internal/usecase/chat"
	favoriteuc "commerce-backend/internal/usecase/favorite"
	orderuc "commerce-backend/internal/usecase/order"
	postuc "commerce-backend/internal/usecase/post"
	returnuc "commerce-backend/internal/usecase/returns"
	reviewuc "commerce-backend/internal/usecase/review"
	dashboarduc "commerce-backend/internal/usecase/dashboard"
	usermgmtuc "commerce-backend/internal/usecase/usermgmt"
	liveuc "commerce-backend/internal/usecase/live"
	"commerce-backend/internal/media/mediamtx"
	"commerce-backend/internal/delivery/livews"
	"commerce-backend/internal/delivery/ws"
	"commerce-backend/internal/storage/chatmedia"
	"commerce-backend/internal/storage/reviewmedia"
)

type App struct {
	Config     *config.Config
	Logger     *slog.Logger
	Pool       *pgxpool.Pool
	Server     *http.Server
	AuthUC     *authuc.UseCase
	OrderUC    *orderuc.UseCase
	PostUC     *postuc.UseCase
	MediaStore *reviewmedia.Store
	ChatMedia  *chatmedia.Store
	WSHub      *ws.Hub
	LiveHub    *livews.Hub
	LiveUC     *liveuc.UseCase
}

func (a *App) Run(ctx context.Context) error {
	if err := a.Pool.Ping(ctx); err != nil {
		a.Logger.Error("database ping failed", "category", "db_ping")
		return fmt.Errorf("ping database: %w", err)
	}

	if a.MediaStore != nil {
		if err := a.MediaStore.ValidateBucketPrivate(ctx); err != nil {
			a.Logger.Error("minio validation failed", "category", "storage_init", "error", err)
			return fmt.Errorf("validate minio bucket: %w", err)
		}
	}

	if a.ChatMedia != nil {
		if err := a.ChatMedia.ValidateBucketPrivate(ctx); err != nil {
			a.Logger.Error("chat minio validation failed", "category", "storage_init", "error", err)
			return fmt.Errorf("validate chat minio bucket: %w", err)
		}
	}

	if a.WSHub != nil {
		defer a.WSHub.Close()
	}

	if a.LiveHub != nil {
		defer a.LiveHub.Close()
		go a.LiveHub.Run(ctx)
	}

	if a.LiveUC != nil {
		go func() {
			ticker := time.NewTicker(a.Config.LiveSignalPollInterval)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					a.LiveUC.CheckSignal(ctx)
				}
			}
		}()
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

func provideReviewRepository(pool *pgxpool.Pool) *repository.ReviewRepository {
	return repository.NewReviewRepository(pool)
}

func provideReviewMediaStore(cfg *config.Config) (*reviewmedia.Store, error) {
	return reviewmedia.New(cfg)
}

func provideFavoriteRepository(pool *pgxpool.Pool) *repository.FavoriteRepository {
	return repository.NewFavoriteRepository(pool)
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

func provideOrderUseCase(repo *repository.OrderRepository, returnRepo *repository.ReturnRepository, reviewRepo *repository.ReviewRepository, liveUC *liveuc.UseCase, cfg *config.Config) *orderuc.UseCase {
	return orderuc.New(orderuc.Dependencies{
		Order:               repo,
		Return:              returnRepo,
		Review:              reviewRepo,
		ShippingFeeVND:      cfg.ShippingFeeVND,
		OrderConfirmTimeout: cfg.OrderConfirmTimeout,
		LiveQuota:           liveUC,
	})
}

func provideReturnUseCase(repo *repository.ReturnRepository) *returnuc.UseCase {
	return returnuc.New(returnuc.Dependencies{
		Return: repo,
	})
}

func provideReviewUseCase(repo *repository.ReviewRepository, mediaStore *reviewmedia.Store, catalogRepo *repository.CatalogRepository) *reviewuc.ReviewUseCase {
	return reviewuc.NewReviewUseCase(repo, mediaStore, catalogRepo)
}

func provideFavoriteUseCase(repo *repository.FavoriteRepository) *favoriteuc.UseCase {
	return favoriteuc.New(favoriteuc.Dependencies{
		Favorite: repo,
	})
}

func provideChatRepository(pool *pgxpool.Pool) *repository.ChatRepository {
	return repository.NewChatRepository(pool)
}

func provideChatMediaStore(cfg *config.Config) (*chatmedia.Store, error) {
	return chatmedia.New(cfg)
}

func provideWSHub(repo *repository.ChatRepository, log *slog.Logger) *ws.Hub {
	return ws.NewHub(repo, log)
}

func provideChatUseCase(repo *repository.ChatRepository, mediaStore *chatmedia.Store, hub *ws.Hub) *chatuc.UseCase {
	return chatuc.New(repo, mediaStore, chatuc.WithBroadcaster(hub))
}

func providePostRepository(pool *pgxpool.Pool) *repository.PostRepository {
	return repository.NewPostRepository(pool)
}

func providePostUseCase(
	repo *repository.PostRepository,
	catalogRepo *repository.CatalogRepository,
	mediaStore *chatmedia.Store,
	hub *ws.Hub,
) *postuc.UseCase {
	return postuc.New(repo, catalogRepo, mediaStore, postuc.WithBroadcaster(hub))
}

func provideDashboardRepository(pool *pgxpool.Pool) *repository.DashboardRepository {
	return repository.NewDashboardRepository(pool)
}

func provideDashboardUseCase(repo *repository.DashboardRepository) *dashboarduc.UseCase {
	return dashboarduc.New(dashboarduc.Dependencies{
		Repo: repo,
	})
}

func provideUserAdminRepository(pool *pgxpool.Pool) *repository.UserAdminRepository {
	return repository.NewUserAdminRepository(pool)
}

func provideUserMgmtUseCase(repo *repository.UserAdminRepository) *usermgmtuc.UseCase {
	return usermgmtuc.New(usermgmtuc.Dependencies{Repo: repo})
}

func provideLiveRepository(pool *pgxpool.Pool) *repository.LiveRepository {
	return repository.NewLiveRepository(pool)
}

func provideMediaServer(cfg *config.Config) *mediamtx.Client {
	return mediamtx.New(cfg.MediaMTXAPIURL)
}

func provideLiveHub(repo *repository.LiveRepository, log *slog.Logger) *livews.Hub {
	return livews.NewHub(repo, log)
}

func provideLiveUseCase(repo *repository.LiveRepository, media *mediamtx.Client, hub *livews.Hub, cfg *config.Config, log *slog.Logger) *liveuc.UseCase {
	return liveuc.New(liveuc.Dependencies{
		Repo:            repo,
		Media:           media,
		Broadcaster:     hub,
		Logger:          log,
		SignalTimeout:   cfg.LiveSignalTimeout,
		WebRTCPublicURL: cfg.MediaMTXWebRTCPublicURL,
		HLSPublicURL:    cfg.MediaMTXHLSPublicURL,
	})
}

func provideGinRouter(
	cfg *config.Config,
	log *slog.Logger,
	authUC *authuc.UseCase,
	catalogUC *cataloguc.UseCase,
	cartUC *cartuc.UseCase,
	areaUC *areauc.UseCase,
	addressUC *addressuc.UseCase,
	orderUC *orderuc.UseCase,
	returnUC *returnuc.UseCase,
	reviewUC *reviewuc.ReviewUseCase,
	favoriteUC *favoriteuc.UseCase,
	chatUC *chatuc.UseCase,
	postUC *postuc.UseCase,
	dashboardUC *dashboarduc.UseCase,
	userMgmtUC *usermgmtuc.UseCase,
	liveUC *liveuc.UseCase,
	liveHub *livews.Hub,
	wsHub *ws.Hub,
	jwtMgr *jwt.Manager,
) *gin.Engine {
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
		Return:       returnUC,
		Review:       reviewUC,
		Favorite:     favoriteUC,
		Dashboard:    dashboardUC,
		UserMgmt:     userMgmtUC,
		Chat:         chatUC,
		Post:         postUC,
		Live:         liveUC,
		LiveHub:      liveHub,
		WSHub:        wsHub,
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

func provideApp(
	cfg *config.Config,
	log *slog.Logger,
	pool *pgxpool.Pool,
	srv *http.Server,
	authUC *authuc.UseCase,
	orderUC *orderuc.UseCase,
	postUC *postuc.UseCase,
	mediaStore *reviewmedia.Store,
	chatMedia *chatmedia.Store,
	wsHub *ws.Hub,
	liveHub *livews.Hub,
	liveUC *liveuc.UseCase,
) *App {
	return &App{
		Config:     cfg,
		Logger:     log,
		Pool:       pool,
		Server:     srv,
		AuthUC:     authUC,
		OrderUC:    orderUC,
		PostUC:     postUC,
		MediaStore: mediaStore,
		ChatMedia:  chatMedia,
		WSHub:      wsHub,
		LiveHub:    liveHub,
		LiveUC:     liveUC,
	}
}
