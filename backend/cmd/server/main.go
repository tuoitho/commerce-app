package main

import (
	"context"
	"os"

	"commerce-backend/internal/config"
	"commerce-backend/internal/logger"
)

func main() {
	bootLogger := logger.NewBootstrapLogger()

	cfg, err := config.Load()
	if err != nil {
		bootLogger.Error("failed to load configuration",
			"category", "config_load",
			"error", err.Error(),
		)
		os.Exit(1)
	}

	appLogger := logger.New(cfg)

	ctx := context.Background()
	app, cleanup, err := initializeApp(ctx, cfg, appLogger)
	if err != nil {
		appLogger.Error("failed to initialize application graph",
			"category", "app_init",
			"error", err.Error(),
		)
		os.Exit(1)
	}
	defer cleanup()

	if err := app.Run(ctx); err != nil {
		appLogger.Error("application run error",
			"category", "app_runtime",
			"error", err.Error(),
		)
		os.Exit(1)
	}
}
