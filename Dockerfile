# Multi-stage Docker build for RoutineOS (Next.js 16 + React 19 + TypeScript + Tailwind v4 + Prisma 7)
# Offline-first PWA with IndexedDB, service worker, and no Vercel/GitHub Action cron scheduling.

FROM node:20-alpine AS base
WORKDIR /app

# ---- Stage 1: Install dependencies ----
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl curl
# Enable corepack + pnpm for fast installs
RUN corepack enable pnpm
COPY package.json pnpm-lockyard.yaml* ./
RUN --mount=type=cache,id=pnpm-cache pnpm install --frozen-lockfile

# ---- Stage 2: Build the application ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js 16 build with Turbopack disabled, static generation
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
RUN npx next build

# ---- Stage 3: Production image ----
FROM base AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Do NOT expose port here — let docker-compose or the orchestrator map it.
# The app listens on the port defined in next.config.js (default 3000).

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built files, node_modules, and preserved runtime assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lockyard.yaml* ./pnpm-lockyard.yaml*

# Set correct permissions for non-root user
RUN chown -R appuser:appgroup /app/.next /app/public /app/package.json /app/pnpm-lockyard.yaml*
USER appuser

# NOTE: The service worker (public/sw.js) and IndexedDB offline layer
# are client-side only. They are not bundled into the container —
# the PWA runs in the browser alongside this Next.js app.

# Default start command (override via docker-compose or runtime)
CMD ["node", "server.js"] || ["npx", "next", "start"]