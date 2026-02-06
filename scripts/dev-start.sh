#!/bin/bash
# S3 Manager - Development Start Script
# Starts the development environment with proper checks

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

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker first."
    exit 1
fi

# Check for .env file
if [ ! -f ".env" ]; then
    log_warning ".env file not found"
    if [ -f ".env.example" ]; then
        log_info "Creating .env from .env.example..."
        cp .env.example .env
        log_success ".env file created. Please review and customize it."
    else
        log_error ".env.example not found. Cannot create .env file."
        exit 1
    fi
fi

# Determine mode
MODE="${1:-standard}"
if [ "$MODE" == "hot" ] || [ "$MODE" == "dev" ]; then
    log_info "Starting in HOT RELOAD mode (code changes auto-reload)..."
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.dev.yml"
else
    log_info "Starting in STANDARD mode..."
    COMPOSE_FILES="-f docker-compose.yml"
fi

# Check if frontend is built
if [ ! -d "backend/app/static/assets" ]; then
    log_warning "Frontend not built. Building now..."
    if [ -d "frontend" ]; then
        cd frontend
        if [ ! -d "node_modules" ]; then
            log_info "Installing npm dependencies..."
            npm install
        fi
        npm run build
        cd ..
        mkdir -p backend/app/static
        cp -r frontend/dist/* backend/app/static/
        log_success "Frontend built and copied"
    else
        log_warning "Frontend directory not found. Skipping frontend build."
    fi
fi

# Start services
log_info "Starting Docker services..."
docker-compose $COMPOSE_FILES up --build -d

# Wait for health checks
log_info "Waiting for services to be ready..."
sleep 5

MAX_ATTEMPTS=30
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:3012/api/health > /dev/null 2>&1; then
        log_success "Services are ready!"
        echo ""
        echo -e "${GREEN}=================================${NC}"
        echo -e "${GREEN}  S3 Manager is running!${NC}"
        echo -e "${GREEN}=================================${NC}"
        echo ""
        echo -e "  ${BLUE}App URL:${NC}     http://localhost:3012"
        echo -e "  ${BLUE}API Health:${NC}  http://localhost:3012/api/health"
        echo ""
        echo -e "  ${YELLOW}Useful commands:${NC}"
        echo -e "    ${GREEN}make logs${NC}        - View logs"
        echo -e "    ${GREEN}make stop${NC}        - Stop services"
        echo -e "    ${GREEN}make restart${NC}     - Restart services"
        echo ""
        exit 0
    fi
    
    echo -n "."
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
done

echo ""
log_error "Services failed to start within expected time"
log_info "Check logs with: make logs"
docker-compose $COMPOSE_FILES ps
exit 1
