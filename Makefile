.PHONY: backend frontend frontend-admin admin db-up seed compose-up compose-down run test build

## Start infrastructure services (PostgreSQL and MinIO).
compose-up:
	docker compose -f deployment/docker-compose.yml up -d

## Stop infrastructure services.
compose-down:
	docker compose -f deployment/docker-compose.yml down

## Apply database migrations against the local backend DB.
db-up:
	$(MAKE) -C backend db-up

## Load idempotent sample catalog data after migrations.
seed:
	$(MAKE) -C backend seed

## Start backend server for local development (backend on :8080).
backend:
	$(MAKE) -C backend run

## Start frontend server for local development (frontend on :5173).
frontend:
	$(MAKE) -C frontend run

## Start admin frontend server for local development (admin on :5174).
frontend-admin:
	$(MAKE) -C frontend-admin run

## Alias to run the admin frontend server.
admin: frontend-admin

## Run backend and frontend tests.
test:
	$(MAKE) -C backend test
	$(MAKE) -C frontend test
	$(MAKE) -C frontend-admin test

## Build backend binary and frontend production bundles.
build:
	$(MAKE) -C backend gen
	cd frontend && npm run build
	cd frontend-admin && npm run build

all: backend frontend frontend-admin
