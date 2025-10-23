#!/bin/bash

# Docker Compose management script for AI Calendar Assistant
# Usage: ./compose.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
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

# Check if .env file exists
check_env() {
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating from template..."
        cp .env.example .env
        print_warning "Please edit .env file with your API keys before running the application"
        return 1
    fi
    return 0
}

# Check if required API keys are set
check_api_keys() {
    if ! check_env; then
        return 1
    fi
    
    missing_keys=()
    
    # Check for placeholder values
    if grep -q "your_openai_api_key_here" .env; then
        missing_keys+=("OPENAI_API_KEY")
    fi
    
    if grep -q "your_telegram_bot_token_here" .env; then
        missing_keys+=("TELEGRAM_BOT_TOKEN")
    fi
    
    if [ ${#missing_keys[@]} -ne 0 ]; then
        print_error "Missing API keys: ${missing_keys[*]}"
        print_error "Please update .env file with your actual API keys"
        return 1
    fi
    
    return 0
}

case "$1" in
    "setup")
        print_status "Setting up AI Calendar Assistant..."
        check_env
        print_success "Setup completed. Please edit .env file with your API keys."
        ;;
        
    "build")
        print_status "Building Docker images..."
        docker-compose build --no-cache
        print_success "Build completed!"
        ;;
        
    "up"|"start")
        print_status "Starting AI Calendar Assistant..."
        if check_api_keys; then
            docker-compose up -d
            print_success "AI Calendar Assistant started!"
            print_status "Check status with: ./compose.sh status"
            print_status "View logs with: ./compose.sh logs"
        fi
        ;;
        
    "dev")
        print_status "Starting AI Calendar Assistant in development mode..."
        if check_api_keys; then
            docker-compose -f docker-compose.dev.yml up -d
            print_success "Development environment started!"
            print_status "Debug port available on: localhost:9229"
        fi
        ;;
        
    "down"|"stop")
        print_status "Stopping AI Calendar Assistant..."
        docker-compose down
        print_success "AI Calendar Assistant stopped!"
        ;;
        
    "restart")
        print_status "Restarting AI Calendar Assistant..."
        docker-compose down
        if check_api_keys; then
            docker-compose up -d
            print_success "AI Calendar Assistant restarted!"
        fi
        ;;
        
    "logs")
        shift
        print_status "Showing logs..."
        docker-compose logs -f "$@"
        ;;
        
    "status")
        print_status "Container status:"
        docker-compose ps
        echo
        print_status "Health check:"
        if curl -s -f http://localhost:3002/telegram/health > /dev/null 2>&1; then
            print_success "Application is healthy and responding"
        else
            print_warning "Application health check failed"
        fi
        ;;
        
    "shell")
        print_status "Opening shell in container..."
        docker-compose exec aical sh
        ;;
        
    "clean")
        print_status "Cleaning up Docker resources..."
        docker-compose down -v
        docker system prune -f
        print_success "Cleanup completed!"
        ;;
        
    "update")
        print_status "Updating application..."
        docker-compose down
        docker-compose build --no-cache
        if check_api_keys; then
            docker-compose up -d
            print_success "Application updated and restarted!"
        fi
        ;;
        
    "env")
        print_status "Environment configuration:"
        if [ -f .env ]; then
            echo "✅ .env file exists"
            echo "Environment variables:"
            grep -E '^[A-Z_]+=' .env | sed 's/=.*/=***/' | sort
        else
            echo "❌ .env file missing"
        fi
        ;;
        
    "health")
        print_status "Performing health check..."
        curl -s -f http://localhost:3002/telegram/health && print_success "Health check passed" || print_error "Health check failed"
        ;;
        
    *)
        echo "🚀 AI Calendar Assistant - Docker Compose Manager"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Setup Commands:"
        echo "  setup          - Initial setup (creates .env from template)"
        echo "  env            - Show environment configuration"
        echo ""
        echo "Application Commands:"
        echo "  build          - Build Docker images"
        echo "  up|start       - Start the application"
        echo "  dev            - Start in development mode"
        echo "  down|stop      - Stop the application"
        echo "  restart        - Restart the application"
        echo "  update         - Update and restart the application"
        echo ""
        echo "Monitoring Commands:"
        echo "  status         - Show container status and health"
        echo "  logs [service] - Show logs (optional: specify service)"
        echo "  health         - Perform health check"
        echo ""
        echo "Maintenance Commands:"
        echo "  shell          - Open shell in container"
        echo "  clean          - Clean up Docker resources"
        echo ""
        echo "Examples:"
        echo "  ./compose.sh setup     # Initial setup"
        echo "  ./compose.sh start     # Start application"
        echo "  ./compose.sh logs      # View all logs"
        echo "  ./compose.sh logs aical # View app logs only"
        echo ""
        echo "First time setup:"
        echo "  1. ./compose.sh setup"
        echo "  2. Edit .env file with your API keys"
        echo "  3. ./compose.sh start"
        echo ""
        exit 1
        ;;
esac