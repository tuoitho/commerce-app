//go:build wireinject
// +build wireinject

package main

import (
	"context"
	"log/slog"

	"github.com/google/wire"

	"commerce-backend/internal/config"
)

var appProviderSet = wire.NewSet(
	providePgxPool,
	provideUserRepository,
	provideAccountRepository,
	provideSessionRepository,
	provideCatalogRepository,
	provideCartRepository,
	provideAreaRepository,
	provideAddressRepository,
	provideOrderRepository,
	provideReturnRepository,
	provideReviewRepository,
	provideReviewMediaStore,
	provideFavoriteRepository,
	provideJWTManager,
	provideAuthUseCase,
	provideAccountUseCase,
	provideCatalogUseCase,
	provideCartUseCase,
	provideAreaUseCase,
	provideAddressUseCase,
	provideOrderUseCase,
	provideReturnUseCase,
	provideReviewUseCase,
	provideFavoriteUseCase,
	provideChatRepository,
	provideChatMediaStore,
	provideWSHub,
	provideChatUseCase,
	providePostRepository,
	providePostUseCase,
	provideNotificationRepository,
	provideNotificationService,
	provideDashboardRepository,
	provideDashboardUseCase,
	provideUserAdminRepository,
	provideUserMgmtUseCase,
	provideLiveRepository,
	provideMediaServer,
	provideLiveHub,
	provideLiveUseCase,
	provideGinRouter,
	provideHTTPServer,
	provideApp,
)

func initializeApp(ctx context.Context, cfg *config.Config, log *slog.Logger) (*App, func(), error) {
	wire.Build(appProviderSet)
	return nil, nil, nil
}
