# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.58.2-jammy AS deps
WORKDIR /app

COPY package*.json ./
# Skip browser download — the base image has Chromium pre-installed
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.58.2-jammy AS builder
WORKDIR /app

COPY package*.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

COPY . .
ENV NODE_ENV=production
RUN npm run build

# ─── Stage 3: Production runner ───────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.58.2-jammy AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Use pre-installed browsers from the Playwright base image
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Standalone Next.js output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Copy full node_modules so external packages (playwright-extra, stealth plugin)
# and their transitive deps (is-plain-object etc.) are available at runtime
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/tools ./tools
RUN mkdir -p /app/skills

EXPOSE 3000
CMD ["node", "server.js"]
