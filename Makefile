# S3 Manager - Development Makefile
# Quick commands for common development tasks

# =============================================================================
# Configuration
# =============================================================================

# Default port (can be overridden: make dev PORT=3000)
PORT ?= 3012

# Detect docker compose command (docker-compose or docker compose)
DOCKER_COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

# Colors for output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m # No Color

# =============================================================================
# Development Commands
# =============================================================================

.PHONY: help
help: ## Show this help message
	@echo "$(BLUE)S3 Manager - Available Commands$(NC)"
	@echo "================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

.PHONY: dev
dev: ## Start development environment
	@echo "$(BLUE)Starting development environment...$(NC)"
	$(DOCKER_COMPOSE) -f docker-compose.yml up --build -d
	@echo "$(GREEN)✓ Services starting on http://localhost:$(PORT)$(NC)"
	@echo "$(YELLOW)  - View logs: make logs$(NC)"
	@echo "$(YELLOW)  - Stop: make stop$(NC)"

.PHONY: dev-hot
dev-hot: ## Start with hot reload (code changes auto-reload)
	@echo "$(BLUE)Starting development environment with hot reload...$(NC)"
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo "$(GREEN)✓ Services starting with hot reload on http://localhost:$(PORT)$(NC)"
	@echo "$(YELLOW)  - Code changes will auto-reload$(NC)"
	@echo "$(YELLOW)  - View logs: make logs$(NC)"

.PHONY: dev-build
dev-build: ## Build and start services (fresh build)
	@echo "$(BLUE)Building and starting services...$(NC)"
	$(DOCKER_COMPOSE) down
	$(DOCKER_COMPOSE) build --no-cache
	$(DOCKER_COMPOSE) up -d
	@echo "$(GREEN)✓ Services started$(NC)"

.PHONY: stop
stop: ## Stop all services
	@echo "$(BLUE)Stopping services...$(NC)"
	$(DOCKER_COMPOSE) down
	@echo "$(GREEN)✓ Services stopped$(NC)"

.PHONY: restart
restart: ## Restart all services
	@echo "$(BLUE)Restarting services...$(NC)"
	$(DOCKER_COMPOSE) restart
	@echo "$(GREEN)✓ Services restarted$(NC)"

.PHONY: logs
logs: ## View logs from all services
	$(DOCKER_COMPOSE) logs -f

.PHONY: logs-backend
logs-backend: ## View backend logs only
	$(DOCKER_COMPOSE) logs -f s3manager

.PHONY: logs-celery
logs-celery: ## View Celery worker logs only
	$(DOCKER_COMPOSE) logs -f celery

.PHONY: logs-db
logs-db: ## View database logs only
	$(DOCKER_COMPOSE) logs -f postgres

# =============================================================================
# Testing Commands
# =============================================================================

.PHONY: test
test: ## Run full E2E test suite
	@echo "$(BLUE)Running E2E tests...$(NC)"
	cd e2e && python3 test_runner.py

.PHONY: test-smoke
test-smoke: ## Run a quick smoke test (basic health check)
	@echo "$(BLUE)Running smoke tests...$(NC)"
	@echo "  - Checking API health..."
	@curl -sf http://localhost:$(PORT)/api/health >/dev/null && echo "$(GREEN)  ✓ API is healthy$(NC)" || (echo "$(RED)  ✗ API is not responding$(NC)" && exit 1)
	@echo "  - Checking frontend..."
	@curl -sf http://localhost:$(PORT) >/dev/null && echo "$(GREEN)  ✓ Frontend is serving$(NC)" || (echo "$(RED)  ✗ Frontend is not responding$(NC)" && exit 1)
	@echo "$(GREEN)✓ Smoke tests passed$(NC)"

.PHONY: test-quick
test-quick: ## Run E2E tests without full Docker reset (faster)
	@echo "$(YELLOW)Note: test-quick not yet implemented - running full test suite$(NC)"
	cd e2e && python3 test_runner.py

# =============================================================================
# Database Commands
# =============================================================================

.PHONY: db-reset
db-reset: ## Reset database (keeps containers running)
	@echo "$(BLUE)Resetting database...$(NC)"
	$(DOCKER_COMPOSE) exec -T postgres psql -U s3manager -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" || true
	$(DOCKER_COMPOSE) exec -T s3manager alembic upgrade head
	@echo "$(GREEN)✓ Database reset complete$(NC)"

.PHONY: db-migrate
db-migrate: ## Run database migrations
	@echo "$(BLUE)Running migrations...$(NC)"
	$(DOCKER_COMPOSE) exec s3manager alembic upgrade head
	@echo "$(GREEN)✓ Migrations complete$(NC)"

.PHONY: db-shell
db-shell: ## Open PostgreSQL shell
	$(DOCKER_COMPOSE) exec postgres psql -U s3manager

# =============================================================================
# Build Commands
# =============================================================================

.PHONY: build-frontend
build-frontend: ## Build frontend for production
	@echo "$(BLUE)Building frontend...$(NC)"
	cd frontend && npm install && npm run build
	@echo "$(GREEN)✓ Frontend built$(NC)"

.PHONY: copy-static
copy-static: ## Copy frontend build to backend static folder
	@echo "$(BLUE)Copying static files...$(NC)"
	mkdir -p backend/app/static
	cp -r frontend/dist/* backend/app/static/
	@echo "$(GREEN)✓ Static files copied$(NC)"

.PHONY: build-full
build-full: build-frontend copy-static ## Full build: frontend + static copy
	@echo "$(GREEN)✓ Full build complete$(NC)"

# =============================================================================
# Utility Commands
# =============================================================================

.PHONY: status
status: ## Check status of all services
	@echo "$(BLUE)Service Status:$(NC)"
	$(DOCKER_COMPOSE) ps

.PHONY: clean
clean: ## Clean up Docker containers, volumes, and node_modules
	@echo "$(YELLOW)Cleaning up...$(NC)"
	$(DOCKER_COMPOSE) down -v --remove-orphans
	docker system prune -f
	rm -rf frontend/node_modules frontend/dist
	rm -rf backend/app/static/*
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

.PHONY: setup
setup: ## Initial setup - install dependencies and build
	@echo "$(BLUE)Running initial setup...$(NC)"
	cd frontend && npm install
	$(MAKE) build-full
	@echo "$(GREEN)✓ Setup complete. Run 'make dev' to start.$(NC)"

.PHONY: shell-backend
shell-backend: ## Open shell in backend container
	$(DOCKER_COMPOSE) exec s3manager /bin/bash

.PHONY: shell-celery
shell-celery: ## Open shell in celery container
	$(DOCKER_COMPOSE) exec celery /bin/bash

# =============================================================================
# Release Commands
# =============================================================================

.PHONY: version
version: ## Show current version from git
	@echo "$(BLUE)Current version:$(NC)"
	@git describe --tags --always 2>/dev/null || echo "No tags found"

.PHONY: deploy
deploy: build-full ## Deploy (builds frontend and restarts services)
	@echo "$(BLUE)Deploying...$(NC)"
	$(DOCKER_COMPOSE) up -d --build
	@echo "$(GREEN)✓ Deployment complete$(NC)"
