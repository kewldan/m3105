.PHONY: dev infra api web build test lint typecheck up down logs

infra: ## start local Postgres + Valkey in Docker
	docker compose -f docker-compose.dev.yml up -d

api: ## run the Go API locally (reads apps/api/.env)
	cd apps/api && set -a && [ -f .env ] && . ./.env; set +a; go run ./cmd/api

web: ## run the Next.js dev server
	bun run --filter web dev

test: ## run Go tests (integration test downloads an embedded Postgres once)
	cd apps/api && go test ./...

lint: ## biome + go vet
	bun run lint
	cd apps/api && go vet ./...

typecheck:
	bun run --filter web typecheck

build: ## production images
	docker compose build

up: ## start production stack (needs .env)
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100
