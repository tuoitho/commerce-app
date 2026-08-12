.PHONY: backend frontend db-up run test build

## Apply database migrations against the local backend DB.
db-up:
	$(MAKE) -C backend db-up

## Start both servers for local development (backend on :8080, frontend on :5173).
run:
	$(MAKE) -C backend run

## Run backend and frontend tests.
test:
	$(MAKE) -C backend test
	$(MAKE) -C frontend test

## Build backend binary and frontend production bundle.
build:
	$(MAKE) -C backend gen
	cd frontend && npm run build