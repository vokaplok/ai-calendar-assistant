# Docker Setup for AI Calendar Assistant

## Quick Start

1. **Setup Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env file with your actual API keys
   ```

2. **Build and Run**
   ```bash
   # Option 1: Using the convenience script
   ./docker-run.sh build
   ./docker-run.sh run
   
   # Option 2: Using Docker directly
   docker build -t ai-calendar-assistant .
   docker run -d --name ai-calendar-assistant -p 3002:3002 --env-file .env ai-calendar-assistant
   
   # Option 3: Using Docker Compose
   docker-compose up -d
   ```

3. **Check if it's running**
   ```bash
   # Check container status
   docker ps
   
   # View logs
   docker logs ai-calendar-assistant
   # or
   ./docker-run.sh logs
   ```

## Required Environment Variables

Make sure to set these in your `.env` file:

- `OPENAI_API_KEY` - Your OpenAI API key
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `TELEGRAM_WEBHOOK_SECRET` - Secret for webhook security
- `GOOGLE_OAUTH_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_OAUTH_CLIENT_SECRET` - Google OAuth client secret
- `GOOGLE_OAUTH_REDIRECT_URL` - OAuth redirect URL (default: http://localhost:3002/oauth/google/callback)

## Management Commands

```bash
# Build the image
./docker-run.sh build

# Run the container
./docker-run.sh run

# Stop the container
./docker-run.sh stop

# Restart the container
./docker-run.sh restart

# View logs
./docker-run.sh logs

# Using Docker Compose
./docker-run.sh compose
./docker-run.sh compose-down
```

## Troubleshooting

### Container won't start
- Check your .env file has all required variables
- Verify API keys are valid
- Check logs: `docker logs ai-calendar-assistant`

### Port already in use
- Stop any existing instances: `./docker-run.sh stop`
- Or change the port in docker-compose.yml

### Application not responding
- Check health status: `docker ps` (should show "healthy")
- View detailed logs: `./docker-run.sh logs`
- Test health endpoint: `curl http://localhost:3002/telegram/health`

## Health Check

The container includes a built-in health check that pings `/telegram/health` every 30 seconds. You can check the health status with:

```bash
docker ps  # Look for "healthy" status
curl http://localhost:3002/telegram/health
```

## Persistent Data

The docker-compose.yml includes volume mounts for:
- `./logs` - Application logs
- `./data` - Any persistent data

These directories will be created automatically and persist between container restarts.