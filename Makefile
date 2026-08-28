.PHONY: backend frontend frontend-admin admin db-up seed minio-up minio-down run test build

## Start MinIO object storage container and initialize private bucket.
minio-up:
	docker compose -f compose.minio.yml up -d

## Stop MinIO object storage container.
minio-down:
	docker compose -f compose.minio.yml down

## Apply database migrations against the local backend DB.
db-up:
	$(MAKE) -C backend db-up

## Load idempotent sample catalog data after migrations.
seed:
	$(MAKE) -C backend seed

## Start backend server for local development (backend on :18080).
backend:
	$(MAKE) -C backend run

## Start frontend server for local development (frontend on :15173).
frontend:
	$(MAKE) -C frontend run

## Start admin frontend server for local development (admin on :15174).
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
