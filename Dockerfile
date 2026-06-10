# World Cup 2026 prediction app — single self-contained container.
# Multi-stage: deps → build (Next standalone + bundled seed) → slim runner
# with a standalone Prisma CLI for boot-time migrations.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npm run build \
 && npx esbuild prisma/seed.ts --bundle --platform=node --format=cjs \
      --outfile=seed.cjs --external:@prisma/client --log-level=error

# standalone Prisma CLI (migrate deploy at boot) with all of its own deps
FROM node:22-alpine AS tools
WORKDIR /tools
RUN npm init -y >/dev/null 2>&1 && npm install prisma@6 --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/seed.cjs ./seed.cjs
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/data ./src/data
COPY --from=tools /tools/node_modules ./tools/node_modules
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["./docker-entrypoint.sh"]
