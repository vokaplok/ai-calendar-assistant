#!/bin/bash

# Docker management script for AI Calendar Assistant

case "$1" in
  "build")
    echo "Building Docker image..."
    docker build -t ai-calendar-assistant .
    ;;
  "run")
    echo "Running AI Calendar Assistant container..."
    docker run -d \
      --name ai-calendar-assistant \
      -p 3002:3002 \
      --env-file .env \
      --restart unless-stopped \
      ai-calendar-assistant
    echo "Container started. Check logs with: docker logs ai-calendar-assistant"
    ;;
  "stop")
    echo "Stopping AI Calendar Assistant container..."
    docker stop ai-calendar-assistant
    docker rm ai-calendar-assistant
    ;;
  "logs")
    docker logs -f ai-calendar-assistant
    ;;
  "restart")
    echo "Restarting AI Calendar Assistant..."
    docker stop ai-calendar-assistant 2>/dev/null
    docker rm ai-calendar-assistant 2>/dev/null
    docker run -d \
      --name ai-calendar-assistant \
      -p 3002:3002 \
      --env-file .env \
      --restart unless-stopped \
      ai-calendar-assistant
    echo "Container restarted. Check logs with: docker logs ai-calendar-assistant"
    ;;
  "compose")
    echo "Using Docker Compose..."
    docker-compose up -d
    ;;
  "compose-down")
    echo "Stopping Docker Compose services..."
    docker-compose down
    ;;
  *)
    echo "Usage: $0 {build|run|stop|logs|restart|compose|compose-down}"
    echo ""
    echo "Commands:"
    echo "  build          - Build the Docker image"
    echo "  run            - Run the container"
    echo "  stop           - Stop and remove the container"
    echo "  logs           - Show container logs"
    echo "  restart        - Restart the container"
    echo "  compose        - Start using docker-compose"
    echo "  compose-down   - Stop docker-compose services"
    echo ""
    echo "Before running, make sure to:"
    echo "1. Copy .env.example to .env"
    echo "2. Fill in your API keys in .env file"
    exit 1
    ;;
esac