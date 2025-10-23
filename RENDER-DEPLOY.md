# 🚀 Deploying to Render.com

## Quick Deploy

1. **Connect GitHub Repository**
   - Go to [Render.com](https://render.com)
   - Connect your GitHub account
   - Select this repository

2. **Configure Service**
   - Service Type: **Web Service**
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start:prod`
   - Health Check Path: `/telegram/health`

3. **Environment Variables**
   Add these in Render dashboard:
   ```
   NODE_ENV=production
   PORT=3002
   OPENAI_API_KEY=your_openai_key
   TELEGRAM_BOT_TOKEN=your_telegram_token
   TELEGRAM_WEBHOOK_SECRET=your_webhook_secret
   GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
   GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
   GOOGLE_OAUTH_REDIRECT_URL=https://your-app-name.onrender.com/oauth/google/callback
   DEFAULT_TIMEZONE=Asia/Jerusalem
   GOOGLE_CALENDAR_DEFAULT_ID=primary
   ```

## Alternative: One-Click Deploy

Use the `render.yaml` file for infrastructure-as-code deployment:

1. **Update render.yaml**
   ```bash
   # Edit the GOOGLE_OAUTH_REDIRECT_URL with your actual Render URL
   nano render.yaml
   ```

2. **Deploy**
   - Push to GitHub
   - Render will auto-detect the `render.yaml` and deploy

## Dockerfile Options

- **Dockerfile**: Standard Docker build (recommended)
- **Dockerfile.render**: Render-optimized version with better error handling

## Post-Deploy Setup

1. **OAuth Setup**
   - Visit: `https://your-app.onrender.com/oauth/google/start`
   - Complete Google Calendar authentication
   - Tokens will be saved automatically

2. **Test Health**
   - Visit: `https://your-app.onrender.com/telegram/health`
   - Should return: `{"status":"ok"}`

3. **Telegram Webhook** (optional)
   - Configure webhook URL in BotFather
   - URL: `https://your-app.onrender.com/telegram/webhook`

## Troubleshooting

### Build Fails
- Check logs in Render dashboard
- Verify package.json and package-lock.json are committed
- Try using `Dockerfile.render` instead

### Environment Variables
- Ensure all required variables are set in Render dashboard
- Check for typos in variable names
- Use the Render logs to see missing variables

### OAuth Issues
- Update `GOOGLE_OAUTH_REDIRECT_URL` to your actual Render URL
- Make sure Google OAuth app allows your Render domain

### Memory Issues
- Upgrade to a paid plan if hitting memory limits
- The free tier has limited resources

## Render-Specific Notes

- **Free Tier**: App sleeps after 15 minutes of inactivity
- **Custom Domain**: Available on paid plans
- **Persistent Storage**: Use Render Disks for the `./data` directory
- **Logs**: Available in Render dashboard and via CLI

## Monitoring

- **Health Check**: Built into the service
- **Logs**: Real-time in Render dashboard
- **Metrics**: CPU/Memory usage available in dashboard

The application is optimized for Render's deployment environment and should work out of the box with proper environment variable configuration.