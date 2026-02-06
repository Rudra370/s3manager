#!/bin/bash
# S3 Manager - Quick Test Script
# Runs E2E tests without full Docker reset (faster for development)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Detect docker compose command
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif docker-compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    log_error "Docker Compose not found"
    exit 1
fi

# Check if services are running
if ! $DOCKER_COMPOSE ps | grep -q "s3manager"; then
    log_warning "Services not running. Starting them..."
    $DOCKER_COMPOSE up -d
    sleep 10
fi

# Quick database reset (truncate instead of drop/create)
log_info "Quick database reset..."
$DOCKER_COMPOSE exec -T postgres psql -U s3manager -c "
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE ' || r.tablename || ' CASCADE';
    END LOOP;
END \$\$;
" 2>/dev/null || {
    log_error "Failed to truncate database"
    exit 1
}

log_success "Database truncated"

# Run migrations to ensure schema is up to date
$DOCKER_COMPOSE exec -T s3manager alembic upgrade head > /dev/null 2>&1 || true

# Run smoke test first
log_info "Running smoke test..."
if curl -sf http://localhost:3012/api/health > /dev/null 2>&1; then
    log_success "API is healthy"
else
    log_error "API is not responding"
    exit 1
fi

# Run E2E tests
echo ""
log_info "Running E2E tests..."
cd e2e
python3 test_runner.py "$@"
