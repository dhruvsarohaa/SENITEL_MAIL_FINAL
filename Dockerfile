# ==============================================================================
# SentinelMail Production Multi-Stage Container
# ==============================================================================

# --- Stage 1: Build & Package ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native compilation
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package manifests
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies required for vite build)
RUN npm ci

# Copy project files
COPY . .

# Build the frontend with Nitro SSR production preset
ENV NODE_ENV=production
RUN npm run build

# --- Stage 2: Production Runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV NITRO_PORT=3000

# Install curl for healthcheck and tzdata for accurate UTC forensic timestamps
RUN apk add --no-cache curl tzdata

# Create dedicated non-root security group and user
RUN addgroup -g 1001 -S sentinel && adduser -u 1001 -S sentinel -G sentinel

# Copy built application and dependencies
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./

# Set correct ownership
RUN chown -R sentinel:sentinel /app

USER sentinel

# Expose ports: 3001 (API Server) and 3000 (Frontend Web)
EXPOSE 3001 3000

# Health check probe against API health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Default command: launches backend API
CMD ["node", "--import", "tsx", "server/index.ts"]
