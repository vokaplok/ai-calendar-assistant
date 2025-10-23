# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm prune --production

# Expose the port the app runs on
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/telegram/health || exit 1

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S aical -u 1001

# Change ownership of app directory
RUN chown -R aical:nodejs /app
USER aical

# Start the application
CMD ["npm", "run", "start:prod"]