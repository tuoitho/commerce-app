DB_URL ?= postgres://commerce:commerce@localhost:5432/commerce?sslmode=disable
MIGRATE = migrate -source "file://db/migrations" -database "$(DB_URL)"

.PHONY: db-up db-down db-drop gen run test vet

db-up:
	$(MIGRATE) up

db-down:
	$(MIGRATE) down 1

db-drop:
	$(MIGRATE) drop

gen:
	sqlc generate

run:
	go run ./cmd/server

test:
	go test ./...

vet:
	go vet ./...