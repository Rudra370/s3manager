#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Build frontend
build_frontend() {
    print_info "Building frontend..."
    
    cd frontend
    
    if [ ! -d "node_modules" ]; then
        print_info "Installing npm dependencies..."
        npm install
    fi
    
    npm run build
    cd ..
    
    print_success "Frontend built successfully"
}

# Copy static files to backend
copy_static_files() {
    print_info "Copying frontend build to backend..."
    mkdir -p backend/app/static
    cp -r frontend/dist/* backend/app/static/
    print_success "Static files copied"
}

# Restart Docker container
restart_container() {
    print_info "Restarting Docker container..."
    # Rebuild to pick up any new backend files, then restart
    docker-compose up -d --build
    print_success "Container restarted"
}

# Wait for application to be ready
wait_for_app() {
    print_info "Waiting for application to be ready..."
    
    # Get port from .env file
    PORT=$(grep -E '^PORT=' .env | cut -d= -f2 || echo "3012")
    
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf http://localhost:$PORT/api/health > /dev/null 2>&1; then
            print_success "Application is ready!"
            echo ""
            echo -e "${GREEN}Access URL:${NC} http://localhost:$PORT"
            return 0
        fi
        
        print_info "Waiting... (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "Application failed to start"
    return 1
}

# Main deployment function
main() {
    echo "========================================"
    echo "  S3 Manager - Deploy Changes"
    echo "========================================"
    echo ""
    
    check_docker
    build_frontend
    copy_static_files
    restart_container
    wait_for_app
    
    echo ""
    echo -e "${GREEN}Deployment completed!${NC}"
}

main "$@"
