#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker and Docker Compose are installed
check_docker() {
    print_info "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_success "Docker is installed"
}

# Ask for port number
ask_port() {
    echo ""
    DEFAULT_PORT=3012
    read -p "Enter the port number to run the application on [$DEFAULT_PORT]: " PORT
    PORT=${PORT:-$DEFAULT_PORT}
    
    # Validate port number
    if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
        print_error "Invalid port number. Using default port $DEFAULT_PORT"
        PORT=$DEFAULT_PORT
    fi
    
    # Check if port is already in use
    if ss -tuln 2>/dev/null | grep -q ":$PORT " || netstat -tuln 2>/dev/null | grep -q ":$PORT "; then
        print_warning "Port $PORT might be in use."
        read -p "Continue anyway? (y/N): " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            ask_port
            return
        fi
    fi
    
    print_info "Using port: $PORT"
}

# Generate secret key
generate_secret() {
    SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)
    print_info "Generated secret key"
}

# Create .env file (preserve existing test credentials)
create_env_file() {
    print_info "Setting up .env file..."
    
    # Check if .env already exists
    if [ -f .env ]; then
        print_info ".env file already exists, preserving existing configuration..."
        # Update only PORT and SECRET_KEY, preserve everything else
        # Create a backup first
        cp .env .env.backup
        
        # Update or add PORT
        if grep -q "^PORT=" .env; then
            sed -i "s/^PORT=.*/PORT=$PORT/" .env
        else
            echo "PORT=$PORT" >> .env
        fi
        
        # Update or add SECRET_KEY
        if grep -q "^SECRET_KEY=" .env; then
            sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env
        else
            echo "SECRET_KEY=$SECRET_KEY" >> .env
        fi
        
        rm -f .env.backup
        print_success ".env file updated (existing configuration preserved)"
    else
        # Create new .env file with basic settings
        cat > .env << EOF
# Application Settings
PORT=$PORT
SECRET_KEY=$SECRET_KEY
EOF
        print_success ".env file created"
    fi
}

# Build frontend
build_frontend() {
    print_info "Building frontend..."
    
    cd frontend
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_info "Installing npm dependencies..."
        npm install
    fi
    
    # Build the frontend
    npm run build
    
    cd ..
    print_success "Frontend built successfully"
}

# Create data directory for SQLite
create_data_dir() {
    print_info "Creating data directory..."
    mkdir -p data
    print_success "Data directory created (SQLite database will be stored here)"
}

# Copy frontend build to backend static folder
copy_static_files() {
    print_info "Copying frontend build to backend..."
    mkdir -p backend/app/static
    cp -r frontend/dist/* backend/app/static/ 2>/dev/null || true
    print_success "Static files copied"
}

# Start Docker Compose services
start_services() {
    print_info "Starting Docker Compose services..."
    
    # Stop any existing containers
    docker-compose down 2>/dev/null || true
    
    # Build and start services
    docker-compose up --build -d
    
    print_success "Services started successfully"
}

# Wait for services to be ready
wait_for_services() {
    print_info "Waiting for services to be ready..."
    
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf http://localhost:$PORT/api/health > /dev/null 2>&1; then
            print_success "Application is ready!"
            return 0
        fi
        
        print_info "Waiting for application... (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "Application failed to start within expected time"
    print_info "Check logs with: docker-compose logs"
    return 1
}

# Display success message
show_success_message() {
    echo ""
    echo "========================================"
    print_success "S3 Manager deployed successfully!"
    echo "========================================"
    echo ""
    echo -e "${GREEN}Access the application at:${NC} http://localhost:$PORT"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo "  - View logs:     docker-compose logs -f"
    echo "  - Stop services: docker-compose down"
    echo "  - Restart:       docker-compose restart"
    echo ""
    echo -e "${YELLOW}Important:${NC}"
    echo "  - Database is persisted in ./data directory"
    echo "  - First time setup will prompt you to create an admin account"
    echo ""
}

# Main deployment function
main() {
    echo "========================================"
    echo "  S3 Manager Deployment Script"
    echo "========================================"
    echo ""
    
    # Check prerequisites
    check_docker
    
    # Ask for configuration
    ask_port
    generate_secret
    
    # Create environment
    create_env_file
    create_data_dir
    
    # Build frontend
    build_frontend
    
    # Copy static files
    copy_static_files
    
    # Start services
    start_services
    
    # Wait for services
    if wait_for_services; then
        show_success_message
    else
        print_error "Deployment completed but application may not be fully ready"
        print_info "Check status with: docker-compose ps"
    fi
}

# Run main function
main "$@"
