# 🐳 Docker Compose Setup for AI Calendar Assistant

## Quick Start

```bash
# 1. Initial setup
./compose.sh setup

# 2. Edit your API keys
nano .env

# 3. Start the application
./compose.sh start

# 4. Check if it's running
./compose.sh status
```

## 📋 Available Commands

### Setup Commands
```bash
./compose.sh setup          # Initial setup (creates .env from template)
./compose.sh env             # Show environment configuration
```

### Application Commands
```bash
./compose.sh start           # Start the application
./compose.sh dev             # Start in development mode
./compose.sh stop            # Stop the application
./compose.sh restart         # Restart the application
./compose.sh build           # Rebuild Docker images
./compose.sh update          # Update and restart
```

### Monitoring Commands
```bash
./compose.sh status          # Show container status and health
./compose.sh logs            # Show all logs
./compose.sh logs aical      # Show only app logs
./compose.sh health          # Perform health check
```

### Maintenance Commands
```bash
./compose.sh shell           # Open shell in container
./compose.sh clean           # Clean up Docker resources
```

## 🔧 Configuration

### Required Environment Variables

Edit the `.env` file with your actual API keys:

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-openai-key

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your-actual-bot-token
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Google Calendar OAuth Configuration
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:3002/oauth/google/callback

# Calendar Configuration (optional)
DEFAULT_TIMEZONE=Asia/Jerusalem
GOOGLE_CALENDAR_DEFAULT_ID=primary
```

### Directory Structure

The compose setup creates these directories:
```
./logs/     # Application logs
./data/     # Persistent data storage
```

## 🏥 Health Monitoring

The application includes built-in health checks:

- **Automatic**: Docker checks health every 30 seconds
- **Manual**: `./compose.sh health`
- **Endpoint**: http://localhost:3002/telegram/health

Health check statuses:
- ✅ **healthy** - Application is working correctly
- ⚠️ **unhealthy** - Application is not responding
- 🔄 **starting** - Application is still starting up

## 🐛 Development Mode

For development with hot reload:

```bash
# Start in development mode
./compose.sh dev

# This enables:
# - Hot reload when source files change
# - Debug port on localhost:9229
# - Development logging
```

## 📊 Monitoring Logs

View logs in real-time:

```bash
# All logs
./compose.sh logs

# Only application logs
./compose.sh logs aical

# Follow logs (like tail -f)
./compose.sh logs -f

# Last 100 lines
./compose.sh logs --tail=100
```

## 🛠️ Troubleshooting

### Common Issues

1. **Container won't start**
   ```bash
   ./compose.sh status    # Check status
   ./compose.sh logs      # Check logs
   ./compose.sh env       # Verify environment
   ```

2. **API keys not working**
   ```bash
   ./compose.sh env       # Check if keys are set
   nano .env              # Edit keys
   ./compose.sh restart   # Restart to apply changes
   ```

3. **Port already in use**
   ```bash
   # Stop any existing containers
   ./compose.sh stop
   
   # Or check what's using port 3002
   lsof -i :3002
   ```

4. **Memory or disk issues**
   ```bash
   ./compose.sh clean     # Clean up Docker resources
   docker system df       # Check disk usage
   ```

### Debug Mode

To debug the application:

```bash
# Start in development mode
./compose.sh dev

# Connect debugger to localhost:9229
# View debug logs
./compose.sh logs -f aical
```

### Health Check Failed

If health checks are failing:

```bash
# Check detailed status
./compose.sh status

# Test health endpoint manually
curl http://localhost:3002/telegram/health

# Check application logs
./compose.sh logs aical

# Restart if needed
./compose.sh restart
```

## 🔄 Updates and Maintenance

### Regular Updates
```bash
./compose.sh update      # Rebuild and restart
```

### Complete Reset
```bash
./compose.sh clean       # Clean everything
./compose.sh build       # Rebuild from scratch
./compose.sh start       # Start fresh
```

### Backup Important Data
```bash
# Backup logs and data
tar -czf backup-$(date +%Y%m%d).tar.gz logs/ data/ .env

# Restore (if needed)
tar -xzf backup-YYYYMMDD.tar.gz
```

## 🌐 Network and Ports

- **Application**: http://localhost:3002
- **Health Check**: http://localhost:3002/telegram/health
- **Google OAuth Callback**: http://localhost:3002/oauth/google/callback
- **Debug Port** (dev mode): localhost:9229

## 📈 Production Considerations

For production deployment:

1. **Use production compose file**: `docker-compose.yml` (not dev)
2. **Set secure environment variables**
3. **Use proper secrets management**
4. **Set up log rotation**
5. **Monitor resource usage**
6. **Use reverse proxy (nginx/traefik)**
7. **Set up automated backups**

## 🆘 Getting Help

If you encounter issues:

1. Check the logs: `./compose.sh logs`
2. Verify configuration: `./compose.sh env`
3. Test health endpoint: `./compose.sh health`
4. Try a clean restart: `./compose.sh clean && ./compose.sh start`

The script provides colored output and helpful error messages to guide you through any issues.