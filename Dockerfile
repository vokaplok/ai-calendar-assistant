# Use Node.js 18 for better compatibility  
FROM node:18-slim

# Install necessary packages
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json* ./

# Clear cache and install dependencies with fallback
RUN npm cache clean --force && \
    (npm ci || npm install)

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove devDependencies to reduce size
RUN npm prune --production || true

# Expose the port the app runs on
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/telegram/health || exit 1

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs aical

# Change ownership of app directory
RUN chown -R aical:nodejs /app
USER aical

# Start the application
CMD ["npm", "run", "start:prod"]