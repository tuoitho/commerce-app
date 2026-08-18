DB_URL ?= postgres://commerce:commerce@localhost:5432/commerce?sslmode=disable
-include .env
export APP_ENV HTTP_PORT DB_URL JWT_ACCESS_SECRET ACCESS_TOKEN_TTL REFRESH_TOKEN_TTL COOKIE_SECURE ADMIN_BOOTSTRAP_EMAIL ADMIN_BOOTSTRAP_PASSWORD LOG_LEVEL

MIGRATE = migrate -source "file://db/migrations" -database "$(DB_URL)"

.PHONY: db-up db-down db-drop seed gen wire run test test-integration vet


db-up:
	$(MIGRATE) up

db-down:
	$(MIGRATE) down 1

db-drop:
	$(MIGRATE) drop

seed:
	psql "$(DB_URL)" -f db/seed/catalog.sql

gen:
	sqlc generate

wire:
	wire ./cmd/server


run:
	go run ./cmd/server

test:
	go test ./...

test-integration:
	go test -tags=integration ./internal/repository -count=1 -timeout=5m

vet:
	go vet ./...
