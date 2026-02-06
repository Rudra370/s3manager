#!/bin/bash
# S3 Manager - Smart Log Viewer
# Shows logs with optional filtering

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Detect docker compose command
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif docker-compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${RED}Docker Compose not found${NC}"
    exit 1
fi

# Show help if no arguments
if [ $# -eq 0 ]; then
    echo -e "${CYAN}S3 Manager - Log Viewer${NC}"
    echo ""
    echo "Usage: logs.sh [service] [options]"
    echo ""
    echo -e "${BLUE}Services:${NC}"
    echo "  all       - Show all service logs (default)"
    echo "  backend   - Show backend/API logs only"
    echo "  celery    - Show Celery worker logs only"
    echo "  db        - Show PostgreSQL logs only"
    echo "  redis     - Show Redis logs only"
    echo ""
    echo -e "${BLUE}Options:${NC}"
    echo "  -f, --follow   - Follow log output (default)"
    echo "  -n N           - Show last N lines (default: 100)"
    echo "  --tail         - Same as -f"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  logs.sh              # Follow all logs"
    echo "  logs.sh backend      # Follow backend logs"
    echo "  logs.sh db -n 50     # Show last 50 DB lines"
    echo ""
    exit 0
fi

SERVICE="$1"
shift

# Map service names to docker-compose service names
case "$SERVICE" in
    all)
        SERVICE=""
        ;;
    backend|api|s3manager)
        SERVICE="s3manager"
        ;;
    celery|worker)
        SERVICE="celery"
        ;;
    db|postgres|database)
        SERVICE="postgres"
        ;;
    redis|cache)
        SERVICE="redis"
        ;;
esac

# Default options
FOLLOW=true
LINES=100

# Parse options
while [ $# -gt 0 ]; do
    case "$1" in
        -f|--follow|--tail)
            FOLLOW=true
            shift
            ;;
        -n)
            LINES="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Build command
CMD="$DOCKER_COMPOSE logs"

if [ "$FOLLOW" = true ]; then
    CMD="$CMD -f"
fi

CMD="$CMD --tail=$LINES"

if [ -n "$SERVICE" ]; then
    CMD="$CMD $SERVICE"
fi

echo -e "${BLUE}Showing logs...${NC} (Press Ctrl+C to exit)"
echo ""
$CMD
