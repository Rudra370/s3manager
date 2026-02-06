#!/bin/bash
# S3 Manager - Quick Database Reset Script
# Resets database without restarting containers (much faster than full reset)

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

# Check if containers are running
if ! $DOCKER_COMPOSE ps | grep -q "s3manager-postgres"; then
    log_error "PostgreSQL container is not running"
    log_info "Start services first with: make dev"
    exit 1
fi

log_warning "This will DELETE all data in the database!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    log_info "Reset cancelled"
    exit 0
fi

log_info "Resetting database..."

# Drop and recreate schema
$DOCKER_COMPOSE exec -T postgres psql -U s3manager -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO s3manager; GRANT ALL ON SCHEMA public TO public;" 2>/dev/null || {
    log_error "Failed to reset database schema"
    exit 1
}

log_success "Database schema reset"

# Run migrations
log_info "Running migrations..."
$DOCKER_COMPOSE exec -T s3manager alembic upgrade head

log_success "Database reset complete!"
log_info "You may need to re-run the setup wizard at http://localhost:3012"
