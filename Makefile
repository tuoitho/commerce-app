.PHONY: backend frontend frontend-admin admin db-up seed run test build

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

## Build backend binary and frontend production bundle.
build:
	$(MAKE) -C backend gen
	cd frontend && npm run build
